/**
 * HostPeer — the agent-side WebRTC peer.
 *
 * Two operating modes:
 *
 *   1. `pair` mode: opens WS to /ws/{pairing_code}. First-time pair with a
 *      new client. No pre-connect auth (the code IS the auth). After WebRTC
 *      connects, the client may send a `pair.save` control message to
 *      register itself as a trusted device.
 *
 *   2. `persistent` mode: opens WS to /ws/host-{agent_id} and stays open
 *      across sessions. New clients that already know our host_id + shared
 *      secret can reconnect at any time. Before starting WebRTC, the peer
 *      must send an `auth` signaling message with clientId + secret; the
 *      agent verifies via Tauri and replies auth.ok / auth.fail.
 */

import { invoke } from "@tauri-apps/api/core";
import {
  decode,
  decodeControl,
  encode,
  encodeControl,
  type ControlMessage,
  type InputEvent,
  type SignalMessage,
} from "../protocol";

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
];

export type HostPeerEvents = {
  onStateChange: (state: RTCIceConnectionState) => void;
  onInput: (evt: InputEvent) => void;
  onClose: (reason?: string) => void;
  onError: (err: Error) => void;
  onSessionEnded: () => void;   // fired in persistent mode when a client leaves — bus stays open
  onClientAuthed: () => void;   // fired in persistent mode when auth succeeds
};

export type HostPeerMode = "pair" | "persistent";

export type HostPeerOptions = {
  code: string;                 // pairing code (pair mode) or `host-{agent_id}` (persistent)
  signalingUrl: string;
  mode: HostPeerMode;
  hostId: string;               // agent_id — sent to client via pair.save.ok
  hostName: string;             // e.g., "Teyler's MacBook" — display name for the PWA
};

export function toWsUrl(userUrl: string): string {
  const trimmed = userUrl.trim().replace(/\/+$/, "");
  if (trimmed.startsWith("wss://") || trimmed.startsWith("ws://")) return trimmed;
  if (trimmed.startsWith("https://")) return `wss://${trimmed.slice("https://".length)}`;
  if (trimmed.startsWith("http://")) return `ws://${trimmed.slice("http://".length)}`;
  return `wss://${trimmed}`;
}

export class HostPeer {
  readonly opts: HostPeerOptions;
  private ws: WebSocket | null = null;
  private pc: RTCPeerConnection | null = null;
  private stream: MediaStream | null = null;
  private inputChannel: RTCDataChannel | null = null;
  private controlChannel: RTCDataChannel | null = null;
  private handlers: Partial<HostPeerEvents> = {};
  private authed = false;
  private closed = false;

  constructor(opts: HostPeerOptions) {
    this.opts = opts;
  }

  on<E extends keyof HostPeerEvents>(event: E, handler: HostPeerEvents[E]) {
    this.handlers[event] = handler;
  }

  /** Prompt user for a screen and start capture. Call before connect(). */
  async captureScreen(): Promise<void> {
    this.stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 30, max: 60 } },
      audio: true,
    });
    for (const track of this.stream.getVideoTracks()) {
      track.addEventListener("ended", () => this.close("user stopped sharing"));
    }
  }

  /** Open the WebSocket to signaling. In persistent mode, stays open across sessions. */
  async connect(): Promise<void> {
    if (this.closed) throw new Error("host closed");
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

  private async onSignal(msg: SignalMessage): Promise<void> {
    try {
      switch (msg.t) {
        case "welcome":
          if (msg.peerId !== "host") throw new Error(`unexpected role: ${msg.peerId}`);
          break;

        case "ready":
          // A new client just joined the room.
          if (this.opts.mode === "pair") {
            // Pair mode: no auth needed, start WebRTC immediately.
            await this.startWebRtc();
            await this.sendOffer();
          } else {
            // Persistent mode: wait for client's `auth` message before doing anything.
            this.authed = false;
          }
          break;

        case "auth":
          if (this.opts.mode !== "persistent") {
            this.sendSignal({ t: "auth.fail", reason: "not accepting auth in this mode" });
            return;
          }
          const ok = await invoke<boolean>("verify_trusted_client", {
            clientId: msg.clientId,
            secret: msg.secret,
          });
          if (ok) {
            this.authed = true;
            this.sendSignal({ t: "auth.ok" });
            this.handlers.onClientAuthed?.();
            await this.startWebRtc();
            await this.sendOffer();
          } else {
            this.sendSignal({ t: "auth.fail", reason: "unknown or invalid credential" });
          }
          break;

        case "sdp":
          if (!this.pc) return;
          if (msg.kind !== "answer") return;
          await this.pc.setRemoteDescription({ type: "answer", sdp: msg.sdp });
          break;

        case "ice":
          if (!this.pc || !msg.candidate) return;
          try {
            await this.pc.addIceCandidate(msg.candidate);
          } catch (e) {
            console.warn("addIceCandidate failed", e);
          }
          break;

        case "peer-gone":
          this.teardownSession("client left");
          if (this.opts.mode === "pair") {
            this.close("client left");
          } else {
            this.handlers.onSessionEnded?.();
          }
          break;
      }
    } catch (err) {
      this.handlers.onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  }

  private async startWebRtc(): Promise<void> {
    this.teardownSession("resetting");   // in case a previous session lingered

    this.pc = new RTCPeerConnection({
      iceServers: DEFAULT_ICE_SERVERS,
      bundlePolicy: "max-bundle",
    });

    this.inputChannel = this.pc.createDataChannel("input", { ordered: true });
    this.inputChannel.addEventListener("message", (evt) => {
      try {
        const data = typeof evt.data === "string" ? evt.data : "";
        const parsed = JSON.parse(data) as InputEvent;
        this.handlers.onInput?.(parsed);
      } catch { /* ignore */ }
    });

    this.controlChannel = this.pc.createDataChannel("control", { ordered: true });
    this.controlChannel.addEventListener("message", (evt) => {
      const msg = decodeControl(typeof evt.data === "string" ? evt.data : "");
      if (msg) void this.onControl(msg);
    });

    this.pc.addEventListener("icecandidate", (evt) => {
      this.sendSignal({ t: "ice", candidate: evt.candidate ? evt.candidate.toJSON() : null });
    });
    this.pc.addEventListener("iceconnectionstatechange", () => {
      const s = this.pc?.iceConnectionState;
      if (s) this.handlers.onStateChange?.(s);
    });

    // Ensure we have a stream — captureScreen() should have been called before connect()
    // for pair mode. In persistent mode, we capture lazily on the first authed session.
    if (!this.stream) {
      try {
        await this.captureScreen();
      } catch (err) {
        this.handlers.onError?.(
          err instanceof Error ? err : new Error("screen capture cancelled"),
        );
        throw err;
      }
    }
    for (const track of this.stream!.getTracks()) {
      this.pc.addTrack(track, this.stream!);
    }
  }

  private async sendOffer(): Promise<void> {
    if (!this.pc) return;
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    if (offer.sdp) this.sendSignal({ t: "sdp", kind: "offer", sdp: offer.sdp });
  }

  private async onControl(msg: ControlMessage): Promise<void> {
    if (msg.t !== "pair.save") return;
    try {
      await invoke("store_trusted_client", {
        clientId: msg.clientId,
        name: msg.deviceName,
        secret: msg.secret,
      });
      this.sendControl({
        t: "pair.save.ok",
        hostId: this.opts.hostId,
        hostName: this.opts.hostName,
      });
    } catch (err) {
      this.sendControl({
        t: "pair.save.fail",
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private sendSignal(msg: SignalMessage) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(encode(msg));
  }

  private sendControl(msg: ControlMessage) {
    const ch = this.controlChannel;
    if (!ch || ch.readyState !== "open") return;
    ch.send(encodeControl(msg));
  }

  private teardownSession(_reason: string) {
    try { this.inputChannel?.close(); } catch { /* ignore */ }
    try { this.controlChannel?.close(); } catch { /* ignore */ }
    try { this.pc?.close(); } catch { /* ignore */ }
    this.inputChannel = null;
    this.controlChannel = null;
    this.pc = null;
  }

  close(reason?: string): void {
    if (this.closed) return;
    this.closed = true;
    try { this.stream?.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
    this.teardownSession(reason ?? "closed");
    try { this.ws?.close(); } catch { /* ignore */ }
    this.handlers.onClose?.(reason);
  }
}
