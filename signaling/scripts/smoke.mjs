/**
 * Smoke test: verifies the SessionRoom Durable Object correctly relays
 * messages between two WebSocket peers (host + client).
 *
 * Usage: node signaling/scripts/smoke.mjs
 * Assumes wrangler dev is running on http://127.0.0.1:8787
 */

const BASE = process.env.SIGNALING_WS ?? "ws://127.0.0.1:8787";
const CODE = `smoke-${Date.now()}`;

class BufferedWs {
  constructor(url, role) {
    this.role = role;
    this.buf = [];
    this.waiters = [];
    this.ws = new WebSocket(url);
    this.ws.addEventListener("message", (evt) => {
      const raw = typeof evt.data === "string" ? evt.data : "";
      try {
        const msg = JSON.parse(raw);
        this.buf.push(msg);
        for (const w of this.waiters.splice(0)) w.tryResolve();
      } catch {
        /* ignore */
      }
    });
    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener("open", () => resolve(this), { once: true });
      this.ws.addEventListener("error", (e) => reject(new Error(`${role} ws error: ${e.message ?? e}`)), {
        once: true,
      });
    });
  }
  send(msg) {
    this.ws.send(JSON.stringify(msg));
  }
  close() {
    try {
      this.ws.close();
    } catch {
      /* ignore */
    }
  }
  await(predicate, timeoutMs = 3000) {
    return new Promise((resolve, reject) => {
      let done = false;
      const tryResolve = () => {
        if (done) return;
        const idx = this.buf.findIndex(predicate);
        if (idx >= 0) {
          done = true;
          const [msg] = this.buf.splice(idx, 1);
          clearTimeout(timer);
          resolve(msg);
        }
      };
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        reject(
          new Error(
            `${this.role} timeout waiting for message; buffer: ${JSON.stringify(this.buf)}`,
          ),
        );
      }, timeoutMs);
      this.waiters.push({ tryResolve });
      tryResolve();
    });
  }
}

let failures = 0;
function check(name, cond, detail = "") {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    console.log(`  ✗ ${name} ${detail}`);
    failures++;
  }
}

console.log(`smoke test against ${BASE} in room "${CODE}"`);

const host = await new BufferedWs(`${BASE}/ws/${CODE}`, "host").ready;
const hostWelcome = await host.await((m) => m.t === "welcome");
check("host got welcome", true);
check("host role is 'host'", hostWelcome.peerId === "host");

const client = await new BufferedWs(`${BASE}/ws/${CODE}`, "client").ready;
const clientWelcome = await client.await((m) => m.t === "welcome");
check("client got welcome", true);
check("client role is 'client'", clientWelcome.peerId === "client");
check("client sees host", Array.isArray(clientWelcome.others) && clientWelcome.others.includes("host"));

const hostReady = await host.await((m) => m.t === "ready");
check("host got ready", hostReady.peerId === "client");
const clientReady = await client.await((m) => m.t === "ready");
check("client got ready", clientReady.peerId === "host");

// Relay: host sends SDP-shape message; client should receive verbatim.
const fakeSdp = { t: "sdp", kind: "offer", sdp: "v=0\r\no=- 42 42 IN IP4 0.0.0.0\r\n" };
host.send(fakeSdp);
const relayed = await client.await((m) => m.t === "sdp");
check("client received SDP relay", relayed.kind === "offer");
check("SDP payload verbatim", relayed.sdp === fakeSdp.sdp);

// Relay in the other direction.
const fakeIce = { t: "ice", candidate: { candidate: "candidate:1 1 UDP 2113667327 192.168.0.1 54321 typ host", sdpMLineIndex: 0, sdpMid: "0" } };
client.send(fakeIce);
const relayedIce = await host.await((m) => m.t === "ice");
check("host received ICE relay", relayedIce.candidate?.sdpMLineIndex === 0);

// Close host → client should get `peer-gone`.
host.close();
const gone = await client.await((m) => m.t === "peer-gone");
check("client got peer-gone after host closed", gone.peerId === "host");

client.close();

if (failures > 0) {
  console.log(`\n${failures} FAILED`);
  process.exit(1);
} else {
  console.log(`\nall good (${9 - failures}/9 checks)`);
  process.exit(0);
}
