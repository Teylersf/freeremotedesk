# Security Model

## Threat model

We assume:
- The signaling server is **honest-but-curious** (we run it, but the design must survive if it's compromised).
- The network is fully adversarial (Dolev-Yao) — every packet may be observed, dropped, or modified.
- The user's paired devices are trusted. If your laptop is stolen and unlocked, an attacker has your remote desktop. We rely on OS-level device auth (passkey + biometric) for that boundary.

## Guarantees

| Property | How |
|---|---|
| Confidentiality (video, input) | WebRTC DTLS-SRTP — mandatory, E2E. Signaling server sees SDP but no keys or content. |
| Integrity | DTLS-SRTP MAC per packet. |
| Authenticity | WebAuthn ceremony at pair time binds a device credential to a specific host agent. Each session is a fresh WebAuthn assertion challenge. |
| Replay resistance | Nonces in every session-init; short-lived WebRTC session keys negotiated per connection. |
| Signaling-server compromise | Attacker can DoS pairing but cannot decrypt sessions, forge new pairings (WebAuthn stops them), or impersonate paired devices. |

## What we DON'T guarantee

- **Endpoint compromise.** If your host machine is owned, we cannot help. Screen capture at OS level is the whole product.
- **Metadata privacy.** Signaling server sees which agent IDs talk to which client IDs and when. It never sees content.
- **Anonymity.** IPs are visible during ICE gathering (necessary for P2P). If you need to hide your home IP from the peer, use a TURN-only mode (implementable in Phase 4).

## Auth flow (details)

### Pair time (one-shot)

1. Host agent generates ed25519 keypair on install. Public key registered locally.
2. Host agent requests pairing code from signaling. Gets `x7k2q9`, valid 60s.
3. User reads code to their PWA client (or scans QR).
4. PWA POSTs `pair.claim` with the code + PWA's WebAuthn credential creation options.
5. Signaling matches, opens a bidirectional channel between the two.
6. WebAuthn ceremony: user's browser prompts for biometric/PIN, creates credential bound to `freeremotedesk.com` (rpId).
7. PWA sends credential ID + attestation to agent via signaling.
8. Agent verifies attestation, stores credential ID.
9. Both sides can now negotiate WebRTC.

### Session time (every subsequent connect)

1. PWA presents `credentialId` to signaling.
2. Signaling forwards challenge to host agent (which must be online for connection).
3. Host agent generates a per-session nonce, sends via signaling to PWA.
4. PWA does WebAuthn `get()` — user biometric unlocks the credential, signs the nonce.
5. Assertion sent to signaling, forwarded to agent.
6. Agent verifies assertion against stored credential public key.
7. WebRTC negotiation proceeds.

## Rate limiting

- **Pairing code guesses**: 5 per IP per minute; global 1000 per minute (any IP)
- **Session inits**: 60 per credential per hour (prevents runaway loops)
- **WebSocket connections**: 20 concurrent per IP

Enforced at the CF Worker layer via `env.RATE_LIMITER` binding (Cloudflare Rate Limiting API).

## Dependencies audited before Phase 4

- `webrtc-rs` (host agent WebRTC) — check for CVEs before shipping installers
- `@simplewebauthn/*` — signed by well-known author, active maintenance
- `scap` / `windows-capture` — screen capture crates; verify no telemetry
- Any Cloudflare Worker deps must be pinned

## AGPL / license implications

Since we're NOT forking RustDesk anymore, we're not bound by AGPL. Recommended: **Apache-2.0** for permissive reuse, or **MIT** if simpler is preferred. Decide before public release.
