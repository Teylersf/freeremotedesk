/**
 * Runtime configuration for the PWA client.
 *
 * FreeRemoteDesk is BYO-infrastructure: the signaling URL is the user's own
 * Cloudflare Workers deployment. Three ways to set it, checked in order:
 *
 *   1. Build-time env var VITE_SIGNALING_URL (Vercel dashboard → Env Vars).
 *      This is the "one click deploy" path — user sets it once in Vercel.
 *   2. localStorage `signaling_url` — user typed it into the settings screen.
 *   3. If neither is set, the PWA shows the setup screen.
 */

const STORAGE_KEY = "signaling_url";

export function getSignalingUrl(): string | null {
  const envUrl = import.meta.env.VITE_SIGNALING_URL;
  if (envUrl && envUrl.trim()) return normalize(envUrl.trim());
  const stored = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
  if (stored && stored.trim()) return normalize(stored.trim());
  return null;
}

export function setSignalingUrl(url: string): void {
  const normalized = normalize(url.trim());
  localStorage.setItem(STORAGE_KEY, normalized);
}

export function clearSignalingUrl(): void {
  localStorage.removeItem(STORAGE_KEY);
}

function normalize(u: string): string {
  return u.replace(/\/+$/, "");
}

/** Convert https://foo → wss://foo, http://foo → ws://foo, ws(s):// verbatim. */
export function toWsUrl(u: string): string {
  const t = normalize(u);
  if (t.startsWith("wss://") || t.startsWith("ws://")) return t;
  if (t.startsWith("https://")) return `wss://${t.slice("https://".length)}`;
  if (t.startsWith("http://")) return `ws://${t.slice("http://".length)}`;
  return `wss://${t}`;
}

/** Convert ws(s):// URLs to http(s):// for the health check. */
export function toHttpUrl(u: string): string {
  const t = normalize(u);
  if (t.startsWith("wss://")) return `https://${t.slice("wss://".length)}`;
  if (t.startsWith("ws://")) return `http://${t.slice("ws://".length)}`;
  return t;
}
