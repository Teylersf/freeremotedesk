/**
 * Saved-host store — localStorage for hosts the user has paired with.
 *
 * Also generates a bookmarkable "trust URL" that encodes the whole record.
 * If the user's browser clears localStorage (Safari ITP after 7 days, storage
 * pressure, "clear browsing data"), they can open the bookmarked URL to
 * restore the record — no re-pairing needed.
 *
 * Best-effort durability: we also ask the browser for `navigator.storage.persist()`
 * on first save, which grants durable-storage classification on Chrome for
 * engaged sites.
 */

const STORAGE_KEY = "freeremotedesk.saved_hosts.v1";

export type SavedHost = {
  hostId: string;
  hostName: string;
  clientId: string;
  secret: string;         // base64url — sent verbatim during auth
  addedAt: number;        // ms since epoch
  lastConnectedAt?: number;
};

export function listSavedHosts(): SavedHost[] {
  if (typeof localStorage === "undefined") return [];
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as SavedHost[];
    if (!Array.isArray(arr)) return [];
    return arr;
  } catch {
    return [];
  }
}

export function saveHost(entry: SavedHost): void {
  const list = listSavedHosts().filter((h) => h.hostId !== entry.hostId);
  list.unshift(entry);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  // Ask browser to make our storage durable (best effort, quiet on failure).
  void requestPersistentStorage();
}

export function forgetHost(hostId: string): void {
  const list = listSavedHosts().filter((h) => h.hostId !== hostId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function markConnected(hostId: string): void {
  const list = listSavedHosts();
  const idx = list.findIndex((h) => h.hostId === hostId);
  if (idx < 0) return;
  list[idx] = { ...list[idx]!, lastConnectedAt: Date.now() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

/** 32 random bytes as URL-safe base64. Used as a shared secret. */
export function generateSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

/** Random 16-char lowercase-hex client-id — used as the map key on the host. */
export function generateClientId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** A user-friendly default label for this device. */
export function defaultDeviceName(): string {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (/Android/i.test(ua)) return "Android device";
  if (/Mac OS X/i.test(ua)) return "Mac";
  if (/Windows/i.test(ua)) return "Windows PC";
  if (/Linux/i.test(ua)) return "Linux device";
  return "Browser";
}

// ---------- Trust URL (bookmark fallback) ----------

/**
 * Encode a saved host as a `?trust=…` query param. If the user bookmarks
 * the resulting URL, they can restore the record even if localStorage is
 * later cleared.
 */
export function makeTrustUrl(entry: SavedHost, baseUrl: string): string {
  const payload: SavedHost = {
    hostId: entry.hostId,
    hostName: entry.hostName,
    clientId: entry.clientId,
    secret: entry.secret,
    addedAt: entry.addedAt,
    lastConnectedAt: entry.lastConnectedAt,
  };
  const json = JSON.stringify(payload);
  const encoded = base64url(new TextEncoder().encode(json));
  const clean = baseUrl.replace(/\/+$/, "");
  return `${clean}/connect?trust=${encoded}`;
}

/**
 * Parse a `?trust=…` query param from the current URL. If present and valid,
 * save it to localStorage and return the restored host. Idempotent — safe to
 * call every load.
 */
export function consumeTrustParamFromUrl(): SavedHost | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("trust");
  if (!raw) return null;
  try {
    const bytes = base64urlDecode(raw);
    const json = new TextDecoder().decode(bytes);
    const entry = JSON.parse(json) as SavedHost;
    if (
      typeof entry.hostId === "string" &&
      typeof entry.clientId === "string" &&
      typeof entry.secret === "string"
    ) {
      // Only save if not already present.
      if (!listSavedHosts().some((h) => h.hostId === entry.hostId)) {
        saveHost(entry);
      }
      // Strip the trust param from the URL so it isn't visible after restore.
      params.delete("trust");
      const clean =
        window.location.pathname +
        (params.toString() ? `?${params.toString()}` : "") +
        window.location.hash;
      window.history.replaceState({}, "", clean);
      return entry;
    }
  } catch { /* ignore malformed */ }
  return null;
}

// ---------- Storage persistence ----------

async function requestPersistentStorage(): Promise<void> {
  try {
    if (navigator.storage && "persist" in navigator.storage) {
      await navigator.storage.persist();
    }
  } catch { /* ignore */ }
}

// ---------- base64url helpers ----------

function base64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(s: string): Uint8Array {
  const padLen = (4 - (s.length % 4)) % 4;
  const b64 = (s + "=".repeat(padLen)).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
