/**
 * PeerClient — the PWA-side WebRTC peer (the "viewer").
 *
 * Flow:
 *   1. Open WebSocket to signaling: /ws/{code}
 *   2. Receive `welcome` — we're the "client" (second joiner).
 *   3. Receive `ready` — the host peer is present.
 *   4. Receive host's SDP offer via signaling.
 *   5. Set remote description, create + send answer.
 *   6. Trickle ICE both directions.
 *   7. Host's `track` event fires → we expose MediaStream to the UI.
 *   8. Host's data channels arrive → we expose them for input, control, etc.
 */

import { toWsUrl } from "../config";
import { decode, encode, type SignalMessage } from "./protocol";

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
];

export type PeerClientEvents = {
  onTrack: (stream: MediaStream) => void;
  onDataChannel: (label: string, channel: RTCDataChannel) => void;
  onStateChange: (state: RTCIceConnectionState) => void;
  onClose: (reason?: string) => void;
  onError: (err: Error) => void;
};

export class PeerClient {
  readonly code: string;
  readonly signalingWsUrl: string;
  private pc: RTCPeerConnection;
  private ws: WebSocket | null = null;
  private handlers: Partial<PeerClientEvents> = {};
  private remoteStream: MediaStream | null = null;
  private closed = false;

  constructor(code: string, signalingUrl: string) {
    this.code = code;
    this.signalingWsUrl = toWsUrl(signalingUrl);
    this.pc = new RTCPeerConnection({
      iceServers: DEFAULT_ICE_SERVERS,
      bundlePolicy: "max-bundle",
    });

    this.pc.addEventListener("track", (evt) => {
      if (!this.remoteStream) {
        this.remoteStream = new MediaStream();
        this.handlers.onTrack?.(this.remoteStream);
      }
      this.remoteStream.addTrack(evt.track);
    });

    this.pc.addEventListener("datachannel", (evt) => {
      this.handlers.onDataChannel?.(evt.channel.label, evt.channel);
    });

    this.pc.addEventListener("icecandidate", (evt) => {
      this.send({ t: "ice", candidate: evt.candidate ? evt.candidate.toJSON() : null });
    });

    this.pc.addEventListener("iceconnectionstatechange", () => {
      this.handlers.onStateChange?.(this.pc.iceConnectionState);
      if (["failed", "closed"].includes(this.pc.iceConnectionState)) {
        this.handlers.onClose?.(this.pc.iceConnectionState);
      }
    });
  }

  on<E extends keyof PeerClientEvents>(event: E, handler: PeerClientEvents[E]) {
    this.handlers[event] = handler;
  }

  async connect(): Promise<void> {
    if (this.closed) throw new Error("client closed");
    const url = `${this.signalingWsUrl}/ws/${encodeURIComponent(this.code)}`;
    const ws = new WebSocket(url);
    this.ws = ws;

    await new Promise<void>((resolve, reject) => {
      const onOpen = () => {
        ws.removeEventListener("error", onError);
        resolve();
      };
      const onError = () => {
        ws.removeEventListener("open", onOpen);
        reject(new Error(`signaling ws failed at ${url}`));
      };
      ws.addEventListener("open", onOpen, { once: true });
      ws.addEventListener("error", onError, { once: true });
    });

    ws.addEventListener("message", (evt) => {
      const msg = decode(typeof evt.data === "string" ? evt.data : "");
      if (msg) void this.onSignal(msg);
    });

    ws.addEventListener("close", () => {
      if (!this.closed) this.handlers.onClose?.("signaling ws closed");
    });
  }

  private async onSignal(msg: SignalMessage): Promise<void> {
    try {
      switch (msg.t) {
        case "welcome":
          if (msg.peerId !== "client") {
            throw new Error(`unexpected peer role: ${msg.peerId}`);
          }
          break;
        case "ready":
          break;
        case "sdp":
          if (msg.kind !== "offer") return;
          await this.pc.setRemoteDescription({ type: "offer", sdp: msg.sdp });
          const answer = await this.pc.createAnswer();
          await this.pc.setLocalDescription(answer);
          if (answer.sdp) this.send({ t: "sdp", kind: "answer", sdp: answer.sdp });
          break;
        case "ice":
          if (msg.candidate) {
            try {
              await this.pc.addIceCandidate(msg.candidate);
            } catch (e) {
              console.warn("addIceCandidate failed", e);
            }
          }
          break;
        case "peer-gone":
          this.handlers.onClose?.("host left");
          this.close();
          break;
      }
    } catch (err) {
      this.handlers.onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  }

  private send(msg: SignalMessage) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(encode(msg));
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
    try {
      this.pc.close();
    } catch {
      /* ignore */
    }
  }
}
