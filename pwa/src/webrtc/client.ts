/**
 * PeerClient — the PWA-side WebRTC peer (the "viewer").
 *
 * Two flows:
 *
 *   1. Pairing (code URL): user types a 6-char code, PWA opens /ws/{code}.
 *      Host is on the other end, no auth required, WebRTC starts immediately
 *      on "ready". After it connects, PWA can offer "save this host?" and
 *      exchange trusted-device credentials on the "control" DataChannel.
 *
 *   2. Reconnect (host URL): PWA opens /ws/host-{hostId} using saved
 *      credentials. Before WebRTC starts, PWA sends `auth` on the signaling
 *      WebSocket. Host verifies, replies auth.ok / auth.fail. On ok, WebRTC
 *      negotiation proceeds normally.
 */

import { toWsUrl } from "../config";
import {
  decode,
  decodeControl,
  encode,
  encodeControl,
  type ControlMessage,
  type SignalMessage,
} from "./protocol";

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
];

export type PeerClientEvents = {
  onTrack: (stream: MediaStream) => void;
  onDataChannel: (label: string, channel: RTCDataChannel) => void;
  onControlMessage: (msg: ControlMessage) => void;
  onStateChange: (state: RTCIceConnectionState) => void;
  onClose: (reason?: string) => void;
  onError: (err: Error) => void;
  onAuthResult: (ok: boolean, reason?: string) => void;
};

export type PeerClientOptions = {
  /** URL param — pairing code, or `host-{agent_id}` for reconnect. */
  code: string;
  signalingUrl: string;
  /** If provided, PWA will send this as `auth` before starting WebRTC. */
  auth?: { clientId: string; secret: string };
};

export class PeerClient {
  readonly opts: PeerClientOptions;
  private pc: RTCPeerConnection;
  private ws: WebSocket | null = null;
  private controlChannel: RTCDataChannel | null = null;
  private handlers: Partial<PeerClientEvents> = {};
  private remoteStream: MediaStream | null = null;
  private closed = false;

  constructor(opts: PeerClientOptions) {
    this.opts = opts;
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
      const ch = evt.channel;
      if (ch.label === "control") {
        this.controlChannel = ch;
        ch.addEventListener("message", (mEvt) => {
          const msg = decodeControl(typeof mEvt.data === "string" ? mEvt.data : "");
          if (msg) this.handlers.onControlMessage?.(msg);
        });
      }
      this.handlers.onDataChannel?.(ch.label, ch);
    });

    this.pc.addEventListener("icecandidate", (evt) => {
      this.sendSignal({ t: "ice", candidate: evt.candidate ? evt.candidate.toJSON() : null });
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
    const url = `${toWsUrl(this.opts.signalingUrl)}/ws/${encodeURIComponent(this.opts.code)}`;
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

  /** Send a control-channel message (e.g., pair.save). Requires control channel to be open. */
  sendControl(msg: ControlMessage): boolean {
    const ch = this.controlChannel;
    if (!ch || ch.readyState !== "open") return false;
    ch.send(encodeControl(msg));
    return true;
  }

  private async onSignal(msg: SignalMessage): Promise<void> {
    try {
      switch (msg.t) {
        case "welcome":
          if (msg.peerId !== "client") throw new Error(`unexpected role: ${msg.peerId}`);
          break;

        case "ready":
          // Host is present. If we have credentials (reconnect flow), send auth now.
          // Otherwise (pair flow), the host will start negotiation and we just wait
          // for the offer.
          if (this.opts.auth) {
            this.sendSignal({
              t: "auth",
              clientId: this.opts.auth.clientId,
              secret: this.opts.auth.secret,
            });
          }
          break;

        case "auth.ok":
          this.handlers.onAuthResult?.(true);
          break;

        case "auth.fail":
          this.handlers.onAuthResult?.(false, msg.reason);
          this.handlers.onError?.(new Error(msg.reason ?? "authentication failed"));
          this.close();
          break;

        case "sdp":
          if (msg.kind !== "offer") return;
          await this.pc.setRemoteDescription({ type: "offer", sdp: msg.sdp });
          const answer = await this.pc.createAnswer();
          await this.pc.setLocalDescription(answer);
          if (answer.sdp) this.sendSignal({ t: "sdp", kind: "answer", sdp: answer.sdp });
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

  private sendSignal(msg: SignalMessage) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(encode(msg));
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    try { this.ws?.close(); } catch { /* ignore */ }
    try { this.pc.close(); } catch { /* ignore */ }
  }
}
