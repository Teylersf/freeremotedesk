# FreeRemoteDesk

Reach your home dev machine from anywhere. In your browser. On your phone. Free forever, because **you** run the whole stack on your own free-tier accounts.

## Why

- **No middleman.** Signaling runs on your Cloudflare Workers. PWA hosted on your Vercel. Nobody (including us) sits between your devices.
- **No monthly bill.** Cloudflare + Vercel free tiers easily cover a personal remote-desktop use case. You pay $0.
- **No app store.** The client is a PWA — install it from your browser onto your phone/tablet/desktop.
- **P2P over WebRTC.** Video and input flow directly between your host and viewer. Signaling is <1 KB per session.
- **Passkey-secured** *(Phase 3, not yet shipped)*. Biometric-gated reconnect to your paired hosts.

## Deploy your own instance

Two clicks + one download.

### 1. Deploy signaling to your Cloudflare account

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Teylersf/freeremotedesk)

This deploys the `signaling/` Worker to your Cloudflare account. Note the URL it gives you (looks like `https://freeremotedesk-signaling.<your-name>.workers.dev`).

### 2. Deploy the PWA to your Vercel account

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Teylersf/freeremotedesk&root-directory=pwa&env=VITE_SIGNALING_URL&envDescription=Your%20Cloudflare%20signaling%20URL%20from%20step%201&envLink=https://github.com/Teylersf/freeremotedesk/blob/main/docs/DEPLOY.md&project-name=freeremotedesk&repository-name=freeremotedesk-pwa)

Vercel will ask for `VITE_SIGNALING_URL` — paste the URL from step 1.

### 3. Install the agent on the machine you want to reach

Download the installer for your OS from the [latest release](https://github.com/Teylersf/freeremotedesk/releases/latest) and run it.

On first launch it asks for your signaling URL (from step 1) and optionally your PWA URL (from step 2). Then it generates a 6-character code — enter that on your PWA to connect.

Full step-by-step: [`docs/DEPLOY.md`](docs/DEPLOY.md).

## Repo layout

| Path | What |
|---|---|
| `agent/` | Tauri + Rust host agent — WebView does WebRTC + `getDisplayMedia`, Rust does input injection via `enigo` |
| `pwa/` | React + Vite + PWA client — the browser viewer |
| `signaling/` | Cloudflare Workers SDP/ICE relay via a Durable Object |
| `docs/` | Architecture, protocol, security, deploy, development |

## Development (running locally without deploying)

Three terminals from repo root:

```powershell
pnpm dev:signaling   # Miniflare on :8787
pnpm dev:pwa         # Vite on :5173
pnpm dev:agent       # Tauri window
```

Agent's setup wizard: put `http://localhost:8787` as the signaling URL.
PWA's setup screen: same.

Smoke test the signaling relay: `pnpm --filter @freeremotedesk/signaling smoke` (needs `pnpm dev:signaling` running).

Full dev setup: [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md).

## Architecture in one paragraph

The agent is a Tauri v2 app whose WebView uses `navigator.mediaDevices.getDisplayMedia()` for capture and standard browser WebRTC for the peer connection. That skips building a native video codec pipeline (which is what makes a full RustDesk fork a multi-month project). The client is a plain PWA using the exact same WebRTC APIs. Signaling is a Cloudflare Worker with a Durable Object per pairing code — the Worker relays SDP/ICE, video content is E2E encrypted by DTLS-SRTP and never touches the signaling infrastructure. Input events return over a WebRTC DataChannel and get injected on the host by Rust `enigo`.

Full design rationale: [`ARCHITECTURE.md`](ARCHITECTURE.md).

## Status

**Phase 1 MVP complete** (WebRTC pipe works, input injection works, BYO-infra pivot done).
**Phase 3 (WebAuthn) and Phase 4 (installers, tray) in progress.**

## License

Apache-2.0 (pending — will be locked in before first public release).
