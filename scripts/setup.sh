#!/usr/bin/env bash
# FreeRemoteDesk automated setup — bash version.
# Runs steps 1–4 of AGENTS.md end-to-end. Reads CLI output to extract URLs.
#
# Prereqs: node >=20, pnpm >=9, gh, and auth'd wrangler + vercel + gh CLIs.
# See AGENTS.md for details.

set -euo pipefail

cyan()  { printf "\033[36m%s\033[0m\n" "$*"; }
green() { printf "\033[32m%s\033[0m\n" "$*"; }
red()   { printf "\033[31m%s\033[0m\n" "$*" >&2; }
step()  { printf "\n\033[1;36m▶ %s\033[0m\n" "$*"; }

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# ---------- Prereq checks ----------
step "Checking prerequisites"
for cmd in node pnpm gh; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    red "Missing: $cmd — install and re-run. See AGENTS.md for install commands."
    exit 1
  fi
done
green "  node    $(node --version)"
green "  pnpm    $(pnpm --version)"
green "  gh      $(gh --version | head -1)"

# Check authentications up-front — fail fast if any missing.
gh auth status >/dev/null 2>&1 || {
  red "gh not authenticated. Run: gh auth login"
  exit 1
}

# ---------- Install deps ----------
step "Installing workspace dependencies"
cd "$REPO_ROOT"
pnpm install --frozen-lockfile

# ---------- Signaling deploy ----------
step "Deploying signaling Worker to Cloudflare"
cd "$REPO_ROOT/signaling"

# Confirm wrangler is logged in; if not, prompt inline.
if ! npx --yes wrangler whoami >/dev/null 2>&1; then
  cyan "wrangler is not logged in — opening browser."
  npx --yes wrangler login
fi

DEPLOY_OUT=$(npx --yes wrangler deploy 2>&1) || { red "wrangler deploy failed:"; echo "$DEPLOY_OUT" >&2; exit 1; }
echo "$DEPLOY_OUT"

SIGNALING_URL=$(printf "%s\n" "$DEPLOY_OUT" | grep -oE 'https://[a-z0-9._-]+workers\.dev' | head -1 || true)
if [[ -z "$SIGNALING_URL" ]]; then
  red "Could not extract signaling URL from wrangler output. See above and set SIGNALING_URL manually, then rerun."
  exit 1
fi
green "  Signaling URL: $SIGNALING_URL"

# Verify the deploy is actually reachable.
sleep 3
HEALTH=$(curl -sf "$SIGNALING_URL/health" || true)
if [[ "$HEALTH" != *"freeremotedesk-signaling"* ]]; then
  red "Signaling health check failed. Got: $HEALTH"
  red "The Worker deployed but isn't responding — check the Cloudflare dashboard."
  exit 1
fi
green "  Health check passed."

# ---------- PWA deploy ----------
step "Deploying PWA to Vercel"
cd "$REPO_ROOT/pwa"

if ! npx --yes vercel whoami >/dev/null 2>&1; then
  cyan "vercel is not logged in — opening browser."
  npx --yes vercel login
fi

# Set the env var. Ignore error if it already exists (we'll overwrite).
printf "%s" "$SIGNALING_URL" | npx --yes vercel env add VITE_SIGNALING_URL production 2>/dev/null || {
  cyan "  VITE_SIGNALING_URL exists — removing + re-adding with new value"
  npx --yes vercel env rm VITE_SIGNALING_URL production --yes >/dev/null 2>&1 || true
  printf "%s" "$SIGNALING_URL" | npx --yes vercel env add VITE_SIGNALING_URL production
}

VERCEL_OUT=$(npx --yes vercel deploy --prod --yes 2>&1) || { red "vercel deploy failed:"; echo "$VERCEL_OUT" >&2; exit 1; }
echo "$VERCEL_OUT"

PWA_URL=$(printf "%s\n" "$VERCEL_OUT" | grep -oE 'https://[a-z0-9.-]+vercel\.app' | tail -1 || true)
if [[ -z "$PWA_URL" ]]; then
  red "Could not extract PWA URL from vercel output. Set PWA_URL manually."
  exit 1
fi
green "  PWA URL: $PWA_URL"

# ---------- Download agent installer ----------
step "Downloading the host agent installer"
mkdir -p "$HOME/Downloads"
UNAME=$(uname -s)
ARCH=$(uname -m)
case "$UNAME" in
  Darwin)
    if [[ "$ARCH" == "arm64" ]]; then PATTERN="*_aarch64.dmg"; else PATTERN="*_x64.dmg"; fi
    ;;
  Linux)
    if command -v dpkg >/dev/null; then PATTERN="*_amd64.deb"; else PATTERN="*_amd64.AppImage"; fi
    ;;
  MINGW*|CYGWIN*|MSYS*)
    PATTERN="*_x64_en-US.msi"
    ;;
  *)
    red "Unsupported OS: $UNAME. Grab the installer manually from https://github.com/Teylersf/freeremotedesk/releases/latest"
    PATTERN=""
    ;;
esac

if [[ -n "$PATTERN" ]]; then
  gh release download --repo Teylersf/freeremotedesk --pattern "$PATTERN" --dir "$HOME/Downloads" --clobber
  INSTALLER=$(ls -t "$HOME/Downloads/"FreeRemoteDesk_*.* 2>/dev/null | head -1 || true)
  green "  Downloaded: $INSTALLER"
fi

# ---------- Summary ----------
step "Setup complete"
green "  Signaling URL:  $SIGNALING_URL"
green "  PWA URL:        $PWA_URL"
[[ -n "${INSTALLER:-}" ]] && green "  Agent installer: $INSTALLER"

cat <<EOF

$(cyan "Next steps:")
  1. Run the installer (open it from your Downloads folder).
  2. Launch FreeRemoteDesk from your app menu.
  3. First-run wizard asks for:
       Signaling URL:  ${SIGNALING_URL}
       PWA URL:        ${PWA_URL}
  4. Click Start session → pick a screen → get a 6-char code.
  5. Open ${PWA_URL} on your phone → enter the code → connect.

EOF
