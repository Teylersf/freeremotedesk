/**
 * Signaling protocol messages. Must stay in sync with pwa/src/webrtc/protocol.ts
 * until we extract a shared package.
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

export type InputEvent =
  | { t: "m"; x: number; y: number }
  | { t: "mb"; b: 0 | 1 | 2; d: boolean }
  | { t: "w"; dx: number; dy: number }
  | { t: "k"; code: string; d: boolean; mods: number }
  | { t: "tap"; x: number; y: number };
