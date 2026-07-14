# Architecture

Decisions locked in during initial planning. This is the "why we picked X over Y" doc — reread before diverging.

## Non-goals

- Enterprise device management. This is not MeshCentral.
- Universal remote support like TeamViewer. Audience is "the machine's owner reaching their own machine."
- Windows-server / RDP-farm use cases.

## Constraints

- **Zero fixed monthly server cost.** Signaling on Cloudflare Workers free tier. TURN only on demand (pay-per-GB, rarely triggered).
- **PWA-first.** Client runs in the browser and installs to home screen — no app-store dependency.
- **Passkey-primary auth.** WebAuthn is the modern answer; TOTP is fallback for devices without biometrics.
- **Direct P2P by default.** Video/input never touches our infrastructure.

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Host agent runtime | **Tauri v2 + Rust** | Small binary (~5MB), excellent OS integration, best screen-capture crates (`scap`, `windows-capture`), WebRTC via `webrtc-rs` |
| Host agent UI shell | HTML/TS inside Tauri | Same UI everywhere; setup/status flows only — not the main product surface |
| Client | **React 18 + Vite + TypeScript** | Ubiquitous, huge WebRTC lib ecosystem, PWA support via `vite-plugin-pwa` |
| Client UI | Tailwind + shadcn/ui | Fast iteration, dark mode free, mobile-first defaults |
| Signaling | **Cloudflare Workers + Durable Objects** | Free tier covers 100k requests/day; DOs give us stateful pairing sessions without a database |
| Auth store | Cloudflare D1 (SQLite) | Free tier: 5M reads/day. Enough for auth records. |
| Auth | **WebAuthn via `@simplewebauthn`** primary, TOTP via `otplib` fallback | Passkeys = biometric unlock, no shared secrets, phishing-resistant |
| Package manager | pnpm workspaces | Fast, disk-efficient, first-class monorepo support |
| Transport | WebRTC (DTLS-SRTP for video, encrypted DataChannel for input) | Browser-native, E2E encrypted, direct P2P with STUN, fallback via TURN |
| STUN | Google's `stun.l.google.com:19302` | Free, public, reliable. Fallback list of ~4 servers. |
| TURN | Cloudflare Calls TURN | $0.05/GB pay-as-you-go — rarely triggered (only for symmetric-NAT ↔ symmetric-NAT) |

## Data flow

### Pairing (one-time per client device)

```
[Host agent]                [signaling]               [PWA client]
     │                          │                          │
     │─POST /pair/new─────────►│                          │
     │                          │                          │
     │◄─── {code: "x7k2q9"} ────│                          │
     │                          │                          │
     │  (host shows code + QR)  │                          │
     │                          │                          │
     │                          │◄──POST /pair/claim───────│
     │                          │   {code: "x7k2q9"}       │
     │                          │                          │
     │◄─────WebSocket: peer online (via Durable Object)──►│
     │                                                     │
     │◄──────────WebRTC SDP/ICE exchange──────────────────►│
     │                                                     │
     │                (WebAuthn ceremony — passkey created)│
     │                                                     │
     │◄════════════ direct WebRTC pipe ═══════════════════►│
```

After pairing:
- Client stores a device credential (WebAuthn credential ID + public key registered with agent)
- Agent stores the client's public key
- Future connections skip the code — client presents credential, agent verifies via WebAuthn assertion

### Session (repeat connection)

```
[PWA client]  ──POST /session/init {host-id, credential-id}──►  [signaling]
                                                                    │
                                                                    │─push notify──►  [Host agent]
                                                                    │
              ◄──WebRTC signaling relay (SDP/ICE, ~5 messages)────►
              
              ◄══════════ direct WebRTC pipe ═════════════════════►  [Host agent]
```

## What the signaling service actually does

- **Stateless** except for the pairing/session Durable Objects (auto-expire after 60s if not claimed).
- **Never sees session content.** Only relays SDP offers/answers and ICE candidates. All encrypted E2E by DTLS-SRTP.
- **Auth gate.** Verifies WebAuthn assertions before letting a client claim a host.
- **No user accounts by default.** Trust is per-device-pair, not per-user. (User accounts can layer on later for multi-device management.)

## What we DON'T need to build

- Custom NAT traversal — WebRTC does it
- Video codec — browser ships VP8/VP9/H.264/AV1 in every WebRTC stack
- Audio codec — Opus, ditto
- Encryption — DTLS-SRTP mandatory in WebRTC, we get it free
- TLS on the wire — CF handles for the signaling; WebRTC is E2E encrypted regardless

That's ~5 years of RustDesk engineering skipped, courtesy of leveraging browser primitives.

## Open questions (address before Phase 2)

- **TURN provider choice** — Cloudflare Calls vs. running our own coturn on the $5 Linode. Defer until we measure symmetric-NAT rate in the wild.
- **Persistent notifications when host is offline** — do we build a "wake host via mobile push" flow? Depends on whether users' home machines sleep.
- **Multi-monitor** — WebRTC screen share is single-track. Multi-monitor requires either multiple tracks or a per-monitor connect flow.
- **File transfer** — WebRTC DataChannels can do it; nice-to-have for Phase 4+.
- **Clipboard sync** — DataChannel, easy. Same phase as file transfer.
- **Input latency budget** — target <50 ms round-trip on LAN, <150 ms cross-continent. Measure with `RTCStatsReport.roundTripTime`.
