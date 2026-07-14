# Wire Protocol

## Signaling messages (JSON over WebSocket)

All messages are JSON envelopes: `{ "t": "<type>", ...fields }`.

### Client → Signaling

| `t` | Fields | When |
|---|---|---|
| `pair.new` | `{ agentPubKey }` | Host agent asks server for a fresh pairing code |
| `pair.claim` | `{ code }` | PWA client presents a pairing code to claim a host |
| `session.init` | `{ hostId, assertion }` (WebAuthn) | Paired client initiates a new session |
| `sdp.offer` | `{ peerId, sdp }` | WebRTC offer for the other peer |
| `sdp.answer` | `{ peerId, sdp }` | WebRTC answer for the other peer |
| `ice` | `{ peerId, candidate }` | Trickle ICE candidate for the other peer |
| `pong` | `{}` | Keepalive response |

### Signaling → Client

| `t` | Fields | Meaning |
|---|---|---|
| `pair.code` | `{ code, expiresAt }` | Reply to `pair.new` |
| `pair.claimed` | `{ peerId }` | Host is told a client has claimed the code |
| `session.ready` | `{ peerId }` | Other end is online; WebRTC negotiation can begin |
| `sdp.offer` / `sdp.answer` / `ice` | (relayed from peer) | Forwarded verbatim, encrypted-by-content by DTLS-SRTP |
| `error` | `{ code, message }` | Something went wrong |
| `ping` | `{}` | Keepalive |

Ping/pong every 25 s to survive load-balancer idle timeouts.

## Pairing code format

- 6 characters, alphabet `23456789abcdefghjkmnpqrstuvwxyz` (32 chars, excludes 0/1/i/l/o for legibility)
- ~30 bits of entropy — enough to resist online brute force (server rate-limits to 5 attempts/min per IP)
- Valid for 60 seconds after generation
- One-shot: consumed the moment a client claims it

## WebRTC channel layout

| Track / Channel | Purpose | Priority |
|---|---|---|
| `video` (RTP) | Screen frames | high |
| `audio` (RTP, optional) | Host audio | medium |
| `input` (DataChannel, ordered+reliable) | Mouse/keyboard events | high |
| `control` (DataChannel, ordered+reliable) | Cursor style, monitor list, resize | medium |
| `clipboard` (DataChannel, ordered+reliable) | Clipboard sync (phase 4+) | low |
| `files` (DataChannel, ordered+reliable) | File transfer chunks (phase 4+) | low |

## Input event schema (DataChannel)

Compact binary or JSON — leaning JSON for MVP simplicity, switch to binary if bandwidth-bound.

```
{ "t": "m", "x": 512, "y": 384 }              // mouse move (screen coords)
{ "t": "mb", "b": 0, "d": true }              // mouse button (0=left,1=middle,2=right; d=down)
{ "t": "w", "dx": 0, "dy": -120 }             // wheel
{ "t": "k", "code": "KeyA", "d": true }       // key event; codes = KeyboardEvent.code strings
{ "t": "tap", "x": 512, "y": 384 }            // touch tap (mobile PWA)
```

Server sends back control frames on `control` channel:
```
{ "t": "cursor", "kind": "text" }             // cursor style change
{ "t": "monitors", "list": [{id, w, h}] }    // monitor enumeration
{ "t": "resize", "w": 1920, "h": 1080 }       // active monitor resolution
```
