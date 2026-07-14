# Development Setup

Everything you need to build and run FreeRemoteDesk locally. Windows-first (host machine is Windows), but the pwa + signaling parts work identically on macOS/Linux.

## Toolchain — what you need installed

| Tool | Version | Currently installed | Install command |
|---|---|---|---|
| Node.js | ≥ 20 | **22.19.0** ✓ | `winget install OpenJS.NodeJS.LTS` |
| pnpm | ≥ 9 | ✗ | `corepack enable; corepack prepare pnpm@9.12.0 --activate` |
| Rust (rustup) | stable | ✗ | `winget install --id Rustlang.Rustup` then `rustup default stable` |
| MSVC Build Tools | 2022, C++ workload | ✗ | `winget install --id Microsoft.VisualStudio.2022.BuildTools --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"` (~5 GB download, ~10 GB installed) |
| WebView2 Runtime | latest | ✓ (ships with Win11) | — |
| Wrangler CLI (for signaling deploy) | ≥ 3.90 | ✗ | Installed automatically via `pnpm install` |

Only **pnpm**, **Rust**, and **MSVC Build Tools** need action from you. Once they're on, everything else comes through `pnpm install`.

### Approve install commands, one at a time

Copy/paste in PowerShell (elevated for MSVC):

```powershell
# 1. pnpm — 10 seconds
corepack enable
corepack prepare pnpm@9.12.0 --activate

# 2. Rust — ~3 minutes download + install
winget install --id Rustlang.Rustup --silent --accept-package-agreements --accept-source-agreements
# Restart shell, then:
rustup default stable

# 3. MSVC Build Tools — ~15 minutes, needs admin
winget install --id Microsoft.VisualStudio.2022.BuildTools `
  --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended" `
  --accept-package-agreements --accept-source-agreements
```

## First install

Once toolchain is in place, from the repo root:

```powershell
pnpm install
```

This installs Node deps for `pwa/`, `signaling/`, and `agent/` in one shot (workspace-aware).

## Run the pieces

Each in its own terminal.

### PWA (browser client)

```powershell
pnpm dev:pwa
# → http://localhost:5173
```

Loads the pairing-code entry screen. In Phase 1 this connects to the agent over WebRTC.

### Signaling service (local Cloudflare Workers dev)

```powershell
pnpm dev:signaling
# → http://localhost:8787
```

Wrangler runs the Worker + Durable Objects locally with `miniflare`. No CF account needed for local dev. You'll need one for the eventual `wrangler deploy`.

### Host agent

```powershell
pnpm dev:agent
```

Runs Tauri dev — opens the agent window on your desktop. First run compiles ~200 Rust deps, takes 3–5 minutes. Subsequent runs incremental (<10 sec).

## Cloud services you'll need eventually

| Service | Free-tier limits | What we use it for |
|---|---|---|
| **Cloudflare** account | Workers 100k req/day; Durable Objects 1M req/mo; D1 5M reads/day | Signaling + auth store |
| **Vercel** account | 100 GB/mo bandwidth; unlimited static hosting | Serves the PWA at `freeremotedesk.com` |
| **Domain** `freeremotedesk.com` | You said you're buying this on Vercel — perfect | Root domain (Vercel), subdomain `signaling.freeremotedesk.com` (Cloudflare) |

For the DNS split: point the apex/naked domain at Vercel, then delegate the `signaling` subdomain to Cloudflare (they let you use their nameservers for a subset of records via CNAME-only setup if the apex is elsewhere).

## Deployment (Phase 2+)

```powershell
# PWA to Vercel
cd pwa; vercel deploy --prod

# Signaling to Cloudflare
cd signaling
wrangler login              # one-time
wrangler d1 create freeremotedesk-auth   # paste the returned id into wrangler.toml
wrangler deploy

# Agent installers
cd agent; pnpm tauri:build
# → agent/src-tauri/target/release/bundle/{msi,dmg,deb}
```

## Common friction points

- **Rust `cargo` not found after install** — restart the shell; rustup adds `~/.cargo/bin` to PATH on install but existing shells don't see it.
- **Tauri build fails with "link.exe not found"** — MSVC Build Tools installed without the C++ workload. Rerun the winget command exactly as above.
- **Wrangler prompts for browser login** — expected on first `wrangler login`. Approves a token stored in `~/.wrangler`.
- **PWA WebRTC fails in localhost without HTTPS** — Chrome allows `localhost` as secure context, so this works. For LAN testing across devices, you need HTTPS on the PWA — use `vite --https` or Cloudflare Tunnel for a quick public URL.

## Verify the scaffold before installs

You can inspect the whole shape now with any editor. Nothing has been run.
