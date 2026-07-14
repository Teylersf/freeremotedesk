/**
 * Signaling protocol messages exchanged between peers via the Cloudflare
 * Worker relay. Content is opaque to the server; all messages are just
 * JSON-serialized and forwarded to the other peer in the room.
 *
 * Kept in sync manually with `agent/src/protocol.ts`.
 */

export type SignalMessage =
  // Server → client (both roles) — room state.
  | { t: "welcome"; peerId: "host" | "client"; others: string[] }
  | { t: "ready"; peerId: "host" | "client" }
  | { t: "peer-gone"; peerId: string }

  // Peer ↔ peer — WebRTC negotiation.
  | { t: "sdp"; kind: "offer" | "answer"; sdp: string }
  | { t: "ice"; candidate: RTCIceCandidateInit | null }

  // Trusted-device auth (peer ↔ peer, before WebRTC starts on reconnect flow).
  | { t: "auth"; clientId: string; secret: string }
  | { t: "auth.ok" }
  | { t: "auth.fail"; reason?: string };

/** Messages on the "control" DataChannel (post-WebRTC). */
export type ControlMessage =
  | { t: "pair.save"; clientId: string; deviceName: string; secret: string }
  | { t: "pair.save.ok"; hostId: string; hostName: string }
  | { t: "pair.save.fail"; reason?: string };

export function encode(msg: SignalMessage): string {
  return JSON.stringify(msg);
}

export function decode(raw: string): SignalMessage | null {
  try {
    const parsed = JSON.parse(raw) as SignalMessage;
    if (typeof parsed !== "object" || parsed === null || !("t" in parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function encodeControl(msg: ControlMessage): string {
  return JSON.stringify(msg);
}

export function decodeControl(raw: string): ControlMessage | null {
  try {
    const parsed = JSON.parse(raw) as ControlMessage;
    if (typeof parsed !== "object" || parsed === null || !("t" in parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}
