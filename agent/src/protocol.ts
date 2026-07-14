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
  | { t: "m"; x: number; y: number }              // absolute mouse move (normalized)
  | { t: "mr"; dx: number; dy: number }           // relative mouse move (pixels)
  | { t: "mb"; b: 0 | 1 | 2; d: boolean }         // mouse button
  | { t: "w"; dx: number; dy: number }            // wheel
  | { t: "k"; code: string; d: boolean; mods: number }  // keyboard
  | { t: "tap"; x: number; y: number };           // legacy
