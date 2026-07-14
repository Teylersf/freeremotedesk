# FreeRemoteDesk automated setup — PowerShell version.
# Runs steps 1–4 of AGENTS.md end-to-end. Reads CLI output to extract URLs.
#
# Prereqs: node >=20, pnpm >=9, gh, and auth'd wrangler + vercel + gh CLIs.
# See AGENTS.md for details.

$ErrorActionPreference = "Stop"

function Step($msg) { Write-Host "`n▶ $msg" -ForegroundColor Cyan }
function Green($msg) { Write-Host "  $msg" -ForegroundColor Green }
function Red($msg) { Write-Host $msg -ForegroundColor Red }

$repoRoot = Split-Path -Parent $PSScriptRoot

# ---------- Prereq checks ----------
Step "Checking prerequisites"
foreach ($cmd in @("node", "pnpm", "gh")) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
    Red "Missing: $cmd — install and re-run. See AGENTS.md."
    exit 1
  }
}
Green "node    $(node --version)"
Green "pnpm    $(pnpm --version)"
Green "gh      $((gh --version | Select-Object -First 1))"

gh auth status *>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
  Red "gh not authenticated. Run: gh auth login"
  exit 1
}

# ---------- Install deps ----------
Step "Installing workspace dependencies"
Set-Location $repoRoot
pnpm install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { Red "pnpm install failed"; exit 1 }

# ---------- Signaling deploy ----------
Step "Deploying signaling Worker to Cloudflare"
Set-Location "$repoRoot\signaling"

$whoami = & npx --yes wrangler whoami 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host "wrangler is not logged in — opening browser." -ForegroundColor Cyan
  npx --yes wrangler login
  if ($LASTEXITCODE -ne 0) { Red "wrangler login failed"; exit 1 }
}

$deployOut = & npx --yes wrangler deploy 2>&1 | Out-String
Write-Host $deployOut
if ($LASTEXITCODE -ne 0) { Red "wrangler deploy failed"; exit 1 }

$signalingUrl = ([regex]::Matches($deployOut, 'https://[a-z0-9._-]+workers\.dev') | Select-Object -First 1).Value
if (-not $signalingUrl) {
  Red "Could not extract signaling URL from wrangler output."
  exit 1
}
Green "Signaling URL: $signalingUrl"

Start-Sleep -Seconds 3
try {
  $health = Invoke-RestMethod -Uri "$signalingUrl/health" -TimeoutSec 10
  if ($health.service -ne "freeremotedesk-signaling") { throw "unexpected response" }
  Green "Health check passed."
} catch {
  Red "Signaling health check failed: $_"
  exit 1
}

# ---------- PWA deploy ----------
Step "Deploying PWA to Vercel"
Set-Location "$repoRoot\pwa"

$vercelWho = & npx --yes vercel whoami 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host "vercel is not logged in — opening browser." -ForegroundColor Cyan
  npx --yes vercel login
  if ($LASTEXITCODE -ne 0) { Red "vercel login failed"; exit 1 }
}

# Set env var (ignore already-exists error, remove + re-add if so)
$signalingUrl | & npx --yes vercel env add VITE_SIGNALING_URL production 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Host "  VITE_SIGNALING_URL exists — removing + re-adding" -ForegroundColor Cyan
  & npx --yes vercel env rm VITE_SIGNALING_URL production --yes 2>&1 | Out-Null
  $signalingUrl | & npx --yes vercel env add VITE_SIGNALING_URL production 2>&1 | Out-Null
}

$vercelOut = & npx --yes vercel deploy --prod --yes 2>&1 | Out-String
Write-Host $vercelOut
if ($LASTEXITCODE -ne 0) { Red "vercel deploy failed"; exit 1 }

$pwaUrl = ([regex]::Matches($vercelOut, 'https://[a-z0-9.-]+vercel\.app') | Select-Object -Last 1).Value
if (-not $pwaUrl) {
  Red "Could not extract PWA URL from vercel output."
  exit 1
}
Green "PWA URL: $pwaUrl"

# ---------- Download agent installer ----------
Step "Downloading the host agent installer"
$dl = "$env:USERPROFILE\Downloads"
if (-not (Test-Path $dl)) { New-Item -ItemType Directory -Path $dl | Out-Null }

$pattern = "*_x64_en-US.msi"
& gh release download --repo Teylersf/freeremotedesk --pattern $pattern --dir $dl --clobber
if ($LASTEXITCODE -ne 0) { Red "gh release download failed"; exit 1 }

$installer = Get-ChildItem "$dl\FreeRemoteDesk_*_x64_en-US.msi" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($installer) {
  Green "Downloaded: $($installer.FullName)"
}

# ---------- Summary ----------
Step "Setup complete"
Green "Signaling URL:   $signalingUrl"
Green "PWA URL:         $pwaUrl"
if ($installer) { Green "Agent installer: $($installer.FullName)" }

Write-Host @"

Next steps:
  1. Run the installer: $($installer.FullName)
  2. Launch FreeRemoteDesk from your Start menu.
  3. First-run wizard asks for:
       Signaling URL: $signalingUrl
       PWA URL:       $pwaUrl
  4. Click Start session → pick a screen → get a 6-char code.
  5. Open $pwaUrl on your phone → enter the code → connect.
"@ -ForegroundColor Cyan
