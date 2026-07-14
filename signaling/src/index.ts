/**
 * FreeRemoteDesk signaling service.
 *
 * Cloudflare Worker that routes pairing codes + relays WebRTC signaling
 * (SDP offers/answers, ICE candidates) between a host agent and a PWA client.
 *
 * The Durable Object is the stateful piece — one instance per pairing/session
 * room, addressed by the pairing code. The Worker itself is stateless.
 *
 * Deployed by each end user to their own Cloudflare account (BYO infra).
 */

export interface Env {
  SESSION: DurableObjectNamespace;
  /** Optional comma-separated origin allow-list. Empty = any origin. */
  ALLOWED_ORIGINS?: string;
}

export default {
  async fetch(req: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === "OPTIONS") {
      return cors(new Response(null, { status: 204 }), req, env);
    }

    if (url.pathname === "/health") {
      return cors(json({ ok: true, service: "freeremotedesk-signaling" }), req, env);
    }

    // WebSocket entry: /ws/{roomKey}. RoomKey is the pairing code (during pair)
    // or the persistent host-id (during a session). We don't distinguish here;
    // the DO is just a two-peer relay identified by that string.
    if (url.pathname.startsWith("/ws/")) {
      const roomKey = url.pathname.slice("/ws/".length);
      if (!roomKey || roomKey.length > 128) return json({ error: "bad room" }, 400);
      const id = env.SESSION.idFromName(roomKey);
      const stub = env.SESSION.get(id);
      return stub.fetch(req);
    }

    return cors(json({ error: "not found" }, 404), req, env);
  },
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function cors(res: Response, req: Request, env: Env): Response {
  const origin = req.headers.get("Origin");
  const allowed = allowOrigin(origin, env);
  const h = new Headers(res.headers);
  if (allowed) h.set("access-control-allow-origin", allowed);
  h.set("access-control-allow-methods", "GET, POST, OPTIONS");
  h.set("access-control-allow-headers", "content-type");
  h.set("vary", "Origin");
  return new Response(res.body, { status: res.status, headers: h });
}

function allowOrigin(origin: string | null, env: Env): string | null {
  if (!origin) return "*";
  const list = (env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (list.length === 0) return origin; // no restriction — echo the origin
  return list.includes(origin) ? origin : null;
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

    if (this.peers.size >= 2) {
      server.close(1008, "room full");
      return new Response(null, { status: 101, webSocket: client });
    }

    const peerId = this.peers.size === 0 ? "host" : "client";
    server.accept();
    this.peers.set(peerId, server);

    server.addEventListener("message", (evt) => this.onMessage(peerId, evt));
    server.addEventListener("close", () => this.onClose(peerId));
    server.addEventListener("error", () => this.onClose(peerId));

    server.send(
      JSON.stringify({
        t: "welcome",
        peerId,
        others: Array.from(this.peers.keys()).filter((k) => k !== peerId),
      }),
    );

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
        /* ignore */
      }
    }
    this.peers.delete(peerId);
    for (const [, other] of this.peers) {
      try {
        other.send(JSON.stringify({ t: "peer-gone", peerId }));
      } catch {
        /* ignore */
      }
    }
  }
}
