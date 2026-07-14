/**
 * Saved-host store — localStorage for hosts the user has paired with and
 * chosen to "trust for one-tap reconnect". Kept simple: no cross-device
 * sync, no encryption of the secret at rest (browser is the security
 * boundary; user's OS lockscreen is the trust anchor).
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

function base64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
