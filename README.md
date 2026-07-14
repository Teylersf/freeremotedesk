# FreeRemoteDesk

A browser-first remote desktop for developers who want to reach their home dev machine from anywhere. Free, open, passkey-secured, zero server infrastructure.

## The pitch

- **PWA client** — installs on your phone, tablet, or laptop from the browser. No app-store install required.
- **Tauri host agent** — small tray app for Windows, macOS, Linux. This is what runs on your dev box.
- **Peer-to-peer over WebRTC** — video/input traffic goes directly between your devices. We never see it.
- **Zero-cost operation** — Cloudflare Workers handle the ~200 bytes of pairing signaling on their free tier. No servers to run.
- **Passkey-secured** — WebAuthn/biometrics as first-class auth; TOTP as fallback (Phase 3).

## Repo layout

| Path | What |
|---|---|
| `agent/` | Tauri + Rust host agent — WebView2 does WebRTC + `getDisplayMedia`, Rust does input injection via `enigo` |
| `pwa/` | React + Vite PWA client — served from `freeremotedesk.com` |
| `signaling/` | Cloudflare Workers SDP/ICE relay via Durable Objects |
| `docs/` | Architecture, protocol, security, dev-setup |

## Quickstart — try it locally

Three terminals. All commands from repo root.

```powershell
# 1. Signaling (Cloudflare Workers in Miniflare)
pnpm dev:signaling
#    → http://127.0.0.1:8787

# 2. PWA (the viewer)
pnpm dev:pwa
#    → http://localhost:5173

# 3. Agent (the host, opens a Tauri window)
pnpm dev:agent
#    (first run compiles ~250 Rust crates, ~4 min; subsequent runs are seconds)
```

Then:

1. In the **agent window** → click **Start session**. WebView2 will pop up its OS screen-picker; choose your screen or a window.
2. Copy the 6-char code shown on the agent.
3. In your browser at **http://localhost:5173** (or on your phone at `http://<your-lan-ip>:5173`) → type the code → **Connect**.
4. You should see your host screen. Move your mouse / type — events forward to the host via `enigo`.
5. `Ctrl+Esc` on the client exits the session.

Smoke test just the signaling path (no browsers/agent needed):

```powershell
node signaling/scripts/smoke.mjs
```

## Status

**Phase 1 MVP: complete.** WebRTC pipe works end-to-end: agent captures screen, PWA displays it, input events flow back and inject at OS level.

**Not yet built:** WebAuthn pairing (Phase 3), production deploy (Phase 2), installers + system tray (Phase 4). See `ARCHITECTURE.md` for the phase plan.

## Architecture in one paragraph

The agent is a Tauri v2 app whose WebView2 uses `navigator.mediaDevices.getDisplayMedia()` for capture and standard browser WebRTC for the peer connection. That means we skip building a native video codec pipeline (which is what makes a full RustDesk fork a 6-month project). The client is a plain PWA using the exact same WebRTC APIs. Signaling is a Cloudflare Worker with a Durable Object per pairing code — the Worker relays SDP/ICE, video content is E2E encrypted by DTLS-SRTP and never touches our infra. Input events return over a WebRTC DataChannel and get injected on the host by Rust `enigo`.

## License

TBD before public release. Likely Apache-2.0 (permissive, matches ecosystem).
