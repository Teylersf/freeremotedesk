/**
 * HostPeer — the agent-side WebRTC peer (the "offerer", the machine being viewed).
 *
 * Flow:
 *   1. Rust generates pairing code.
 *   2. User clicks "Start" → we call getDisplayMedia() to capture the screen.
 *      Browser/WebView shows the standard screen-picker; user chooses monitor.
 *   3. Open WebSocket to signaling: /ws/{code}
 *   4. Receive `welcome` — we're the "host" (first joiner).
 *   5. Receive `ready` — the client has joined the room.
 *   6. Create offer, send via signaling.
 *   7. Receive answer, apply.
 *   8. Trickle ICE both directions.
 *   9. Data channel "input" receives events from the client (mouse/keyboard).
 */

import { decode, encode, type InputEvent, type SignalMessage } from "../protocol";

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
];

const SIGNALING_URL =
  (import.meta as ImportMeta).env?.VITE_SIGNALING_URL ?? "ws://localhost:8787";

export type HostPeerEvents = {
  onStateChange: (state: RTCIceConnectionState) => void;
  onInput: (evt: InputEvent) => void;
  onClose: (reason?: string) => void;
  onError: (err: Error) => void;
};

export class HostPeer {
  readonly code: string;
  private pc: RTCPeerConnection;
  private ws: WebSocket | null = null;
  private stream: MediaStream | null = null;
  private inputChannel: RTCDataChannel;
  private handlers: Partial<HostPeerEvents> = {};
  private clientReady = false;
  private closed = false;

  constructor(code: string) {
    this.code = code;
    this.pc = new RTCPeerConnection({
      iceServers: DEFAULT_ICE_SERVERS,
      bundlePolicy: "max-bundle",
    });

    // Pre-create the input DataChannel — must be created before setLocalDescription
    // so it's negotiated in the initial offer.
    this.inputChannel = this.pc.createDataChannel("input", { ordered: true });
    this.inputChannel.addEventListener("message", (evt) => {
      try {
        const data = typeof evt.data === "string" ? evt.data : "";
        const parsed = JSON.parse(data) as InputEvent;
        this.handlers.onInput?.(parsed);
      } catch {
        // ignore malformed input
      }
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

  on<E extends keyof HostPeerEvents>(event: E, handler: HostPeerEvents[E]) {
    this.handlers[event] = handler;
  }

  /** Prompt the user to pick a screen/window and start capture. */
  async captureScreen(): Promise<void> {
    // Video + audio (system audio, when available).
    this.stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 30, max: 60 } },
      audio: true,
    });
    for (const track of this.stream.getTracks()) {
      this.pc.addTrack(track, this.stream);
    }
    // If the user hits the "stop sharing" browser prompt, wind down cleanly.
    for (const track of this.stream.getVideoTracks()) {
      track.addEventListener("ended", () => this.close("user stopped sharing"));
    }
  }

  async connect(): Promise<void> {
    if (this.closed) throw new Error("host closed");
    const wsUrl = `${SIGNALING_URL}/ws/${encodeURIComponent(this.code)}`;
    const ws = new WebSocket(wsUrl);
    this.ws = ws;

    await new Promise<void>((resolve, reject) => {
      const onOpen = () => {
        ws.removeEventListener("error", onError);
        resolve();
      };
      const onError = () => {
        ws.removeEventListener("open", onOpen);
        reject(new Error(`signaling ws failed to open at ${wsUrl}`));
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
          if (msg.peerId !== "host") {
            throw new Error(`unexpected peer role: ${msg.peerId}`);
          }
          break;

        case "ready":
          // Client joined — start negotiation from our end (we're the offerer).
          this.clientReady = true;
          await this.sendOffer();
          break;

        case "sdp":
          if (msg.kind !== "answer") return;
          await this.pc.setRemoteDescription({ type: "answer", sdp: msg.sdp });
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
          this.close("client left");
          break;
      }
    } catch (err) {
      this.handlers.onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  }

  private async sendOffer(): Promise<void> {
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    if (offer.sdp) this.send({ t: "sdp", kind: "offer", sdp: offer.sdp });
  }

  private send(msg: SignalMessage) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(encode(msg));
  }

  isClientReady(): boolean {
    return this.clientReady;
  }

  close(reason?: string): void {
    if (this.closed) return;
    this.closed = true;
    try {
      this.stream?.getTracks().forEach((t) => t.stop());
    } catch {
      /* ignore */
    }
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
    this.handlers.onClose?.(reason);
  }
}
