# FreeRemoteDesk

Reach your home dev machine from any browser. Zero servers you run. Zero monthly cost. You own the whole stack.

## Setup — pick your path

### 🤖 Path A: Hand this repo to your AI agent (recommended for vibe coders)

Open your AI coding tool (Claude Code, Cursor, Aider, Codex, Continue — anything with a terminal) and paste one line:

> **"Set up FreeRemoteDesk for me. Read AGENTS.md at https://github.com/Teylersf/freeremotedesk/blob/main/AGENTS.md and follow it exactly."**

Your agent will:
- Check you have `node`, `pnpm`, `gh` installed (install if missing)
- Prompt you to log into `gh`, `wrangler`, and `vercel` (three one-time browser sign-ins)
- Deploy the signaling Worker to your Cloudflare account
- Deploy the PWA to your Vercel account with the right env var
- Download the host installer for your OS
- Hand you the two URLs to paste into the agent's first-run wizard

**Total user work:** three CLI logins + one installer double-click + copy-paste two URLs.

### 🖱️ Path B: Two Deploy Buttons + one download (no AI needed)

1. Deploy signaling to your Cloudflare: [![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Teylersf/freeremotedesk)
2. Deploy PWA to your Vercel: [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Teylersf/freeremotedesk&root-directory=pwa&env=VITE_SIGNALING_URL&envDescription=Cloudflare%20signaling%20URL%20from%20step%201&project-name=freeremotedesk&repository-name=freeremotedesk-pwa)
3. Download the [latest release](https://github.com/Teylersf/freeremotedesk/releases/latest), install, paste the two URLs into the wizard.

Full walkthrough: [`docs/DEPLOY.md`](docs/DEPLOY.md).

### 🧑‍💻 Path C: Run the setup script yourself

If you have the CLIs installed and don't want to click through UIs:

```bash
git clone https://github.com/Teylersf/freeremotedesk
cd freeremotedesk
bash scripts/setup.sh      # macOS/Linux
# or
pwsh scripts/setup.ps1     # Windows
```

The script does everything Path A does, minus the AI narration.

---

## Why

- **No middleman.** Signaling on your Cloudflare, PWA on your Vercel. Nobody (including us) sits between your devices.
- **No monthly bill.** Free tiers cover a personal instance easily. You pay $0.
- **No app store.** The PWA installs from any browser onto phone/tablet/desktop.
- **Direct P2P over WebRTC.** Video and input flow between your two devices; signaling is <1 KB per session.
- **Passkey-secured saved hosts** *(v0.2.0, coming next)* — biometric reconnect without typing codes.

## Repo layout

| Path | What |
|---|---|
| `agent/` | Tauri v2 + Rust host agent — WebView does WebRTC + `getDisplayMedia`, Rust does OS input injection via `enigo` |
| `pwa/` | React + Vite PWA — the browser viewer |
| `signaling/` | Cloudflare Workers Durable Object relay |
| `scripts/setup.{sh,ps1}` | One-shot automated deploy |
| `AGENTS.md` | Structured instructions for AI agents doing setup on your behalf |
| `docs/` | Architecture, deploy, protocol, security, development |

## Local development

Three terminals from repo root:

```powershell
pnpm dev:signaling   # Miniflare on :8787
pnpm dev:pwa         # Vite on :5173
pnpm dev:agent       # Tauri window
```

Both wizards accept `http://localhost:8787` as the signaling URL.

Smoke test signaling: `pnpm --filter @freeremotedesk/signaling smoke`.

Full setup: [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md).

## Architecture (30-second version)

The agent is a Tauri app whose WebView calls `navigator.mediaDevices.getDisplayMedia()` and standard browser WebRTC — no custom video codec, no native capture layer. The PWA client uses the same WebRTC APIs. Signaling is a Cloudflare Worker + one Durable Object per pairing code — it relays SDP/ICE, video is E2E encrypted by DTLS-SRTP and never touches signaling infrastructure. Input events return over a WebRTC DataChannel and get injected on the host via Rust `enigo`.

Full design + rationale: [`ARCHITECTURE.md`](ARCHITECTURE.md).

## Status

**v0.1.0 shipped** — Phase 1 MVP + BYO-infra pivot + Phase 4 packaging complete. CI green on Windows/macOS/Linux. Installers on the [releases page](https://github.com/Teylersf/freeremotedesk/releases).

**v0.2.0 planned** — WebAuthn/passkey saved hosts, biometric reconnect, session PIN as fallback.

## License

Apache-2.0 (pending — will be locked in before v0.2.0).
