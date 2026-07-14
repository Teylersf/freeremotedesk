/**
 * Signaling protocol messages exchanged between peers via the Cloudflare
 * Worker relay. Content is opaque to the server; all messages are just
 * JSON-serialized and forwarded to the other peer in the room.
 *
 * Kept in sync manually with `agent/src/protocol.ts` for MVP. Extract to
 * a shared package when we grow.
 */

export type SignalMessage =
  | { t: "welcome"; peerId: "host" | "client"; others: string[] }
  | { t: "ready"; peerId: "host" | "client" }
  | { t: "peer-gone"; peerId: string }
  | { t: "sdp"; kind: "offer" | "answer"; sdp: string }
  | { t: "ice"; candidate: RTCIceCandidateInit | null };

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
