/**
 * FreeRemoteDesk signaling service.
 *
 * Cloudflare Worker that routes pairing codes + relays WebRTC signaling
 * (SDP offers/answers, ICE candidates) between a host agent and a PWA client.
 *
 * The Durable Object is the stateful piece — one instance per pairing/session
 * room, addressed by the pairing code (during pair phase) or the host ID
 * (during a live session).
 *
 * The Worker itself is stateless.
 */

export interface Env {
  SESSION: DurableObjectNamespace;
  AUTH_DB: D1Database;
  RATE_LIMITER: RateLimit;
  RP_ID: string;
  RP_NAME: string;
  RP_ORIGIN: string;
}

export default {
  async fetch(req: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === "/health") {
      return json({ ok: true, service: "freeremotedesk-signaling" });
    }

    // WebSocket entry points route to the Durable Object.
    if (url.pathname.startsWith("/ws/")) {
      const roomKey = url.pathname.slice("/ws/".length);
      if (!roomKey) return json({ error: "missing room" }, 400);
      const id = env.SESSION.idFromName(roomKey);
      const stub = env.SESSION.get(id);
      return stub.fetch(req);
    }

    // WebAuthn HTTP endpoints (registration/attestation ceremonies).
    // Stubs — implemented in Phase 3.
    if (url.pathname.startsWith("/webauthn/")) {
      return json({ error: "not implemented (Phase 3)" }, 501);
    }

    return json({ error: "not found" }, 404);
  },
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
    },
  });
}

/**
 * SessionRoom: one Durable Object instance per pairing code / active host ID.
 *
 * Holds up to two WebSocket peers (host agent + client) and relays messages
 * between them. Content is opaque — the DO never inspects SDP or ICE.
 */
export class SessionRoom implements DurableObject {
  private state: DurableObjectState;
  private peers = new Map<string, WebSocket>();

  constructor(state: DurableObjectState, _env: Env) {
    this.state = state;
  }

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get("upgrade") !== "websocket") {
      return new Response("expected websocket upgrade", { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    // Assign a peer ID based on join order. First joiner is "host", second is "client".
    const peerId = this.peers.size === 0 ? "host" : "client";
    if (this.peers.size >= 2) {
      server.close(1008, "room full");
      return new Response(null, { status: 101, webSocket: client });
    }

    server.accept();
    this.peers.set(peerId, server);

    server.addEventListener("message", (evt) => this.onMessage(peerId, evt));
    server.addEventListener("close", () => this.onClose(peerId));
    server.addEventListener("error", () => this.onClose(peerId));

    // Let the peer know who they are + who else is here.
    server.send(
      JSON.stringify({
        t: "welcome",
        peerId,
        others: Array.from(this.peers.keys()).filter((k) => k !== peerId),
      }),
    );

    // If both peers are now present, notify both that the room is ready.
    if (this.peers.size === 2) {
      for (const [id, ws] of this.peers) {
        ws.send(JSON.stringify({ t: "ready", peerId: id === "host" ? "client" : "host" }));
      }
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  private onMessage(fromPeerId: string, evt: MessageEvent) {
    // Relay to the other peer verbatim. All content is E2E encrypted at the
    // WebRTC layer; we're a dumb pipe.
    for (const [id, ws] of this.peers) {
      if (id === fromPeerId) continue;
      try {
        ws.send(typeof evt.data === "string" ? evt.data : new Uint8Array(evt.data as ArrayBuffer));
      } catch {
        this.onClose(id);
      }
    }
  }

  private onClose(peerId: string) {
    const ws = this.peers.get(peerId);
    if (ws) {
      try {
        ws.close();
      } catch {
        // ignore
      }
    }
    this.peers.delete(peerId);
    // Notify the surviving peer that their partner left.
    for (const [, other] of this.peers) {
      try {
        other.send(JSON.stringify({ t: "peer-gone", peerId }));
      } catch {
        // ignore
      }
    }
  }
}
