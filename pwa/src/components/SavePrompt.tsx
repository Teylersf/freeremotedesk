import { useState } from "react";
import { defaultDeviceName, generateClientId, generateSecret, saveHost } from "../savedHosts";
import type { PeerClient } from "../webrtc/client";
import type { ControlMessage } from "../webrtc/protocol";

type Props = {
  client: PeerClient;
  onSaved: (hostName: string) => void;
  onDismiss: () => void;
};

/**
 * Post-pair modal: "Save this connection for one-tap reconnect?"
 *
 * The user names their device, we generate a client_id + shared secret,
 * exchange it via the WebRTC control channel, and on host confirmation we
 * write the record to localStorage.
 */
export function SavePrompt({ client, onSaved, onDismiss }: Props) {
  const [deviceName, setDeviceName] = useState(defaultDeviceName());
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!deviceName.trim() || busy) return;
    setBusy(true);
    setStatus("Requesting host to save…");

    const clientId = generateClientId();
    const secret = generateSecret();

    // Wait up to 5s for a pair.save.ok / pair.save.fail reply.
    const responsePromise = new Promise<
      { ok: true; hostId: string; hostName: string } | { ok: false; reason: string }
    >((resolve) => {
      const handler = (msg: ControlMessage) => {
        if (msg.t === "pair.save.ok") {
          resolve({ ok: true, hostId: msg.hostId, hostName: msg.hostName });
        } else if (msg.t === "pair.save.fail") {
          resolve({ ok: false, reason: msg.reason ?? "host rejected pair.save" });
        }
      };
      client.on("onControlMessage", handler);
      setTimeout(
        () => resolve({ ok: false, reason: "host did not respond within 5s" }),
        5000,
      );
    });

    const sent = client.sendControl({
      t: "pair.save",
      clientId,
      deviceName: deviceName.trim(),
      secret,
    });
    if (!sent) {
      setStatus("Control channel not open yet — try again in a second.");
      setBusy(false);
      return;
    }

    const res = await responsePromise;
    if (!res.ok) {
      setStatus(`Failed: ${res.reason}`);
      setBusy(false);
      return;
    }

    saveHost({
      hostId: res.hostId,
      hostName: res.hostName,
      clientId,
      secret,
      addedAt: Date.now(),
      lastConnectedAt: Date.now(),
    });
    onSaved(res.hostName);
  }

  return (
    <div style={styles.backdrop} onClick={onDismiss}>
      <div style={styles.card} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: "1.05rem", fontWeight: 600 }}>Save this host?</div>
        <div style={styles.help}>
          Next time you open this PWA, you'll see this host in a list and can
          reconnect with one tap — no code needed.
        </div>
        <label style={styles.label}>
          <span style={styles.hint}>What should this device be called?</span>
          <input
            value={deviceName}
            onChange={(e) => setDeviceName(e.target.value)}
            placeholder="e.g. My iPhone"
            style={styles.input}
            autoFocus
          />
        </label>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            onClick={save}
            disabled={busy}
            style={{ ...styles.btn, ...styles.primary }}
          >
            {busy ? "Saving…" : "Save"}
          </button>
          <button onClick={onDismiss} style={styles.btn}>
            Not now
          </button>
        </div>
        {status && <div style={styles.status}>{status}</div>}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.6)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "1rem",
    zIndex: 100,
  },
  card: {
    maxWidth: 420,
    width: "100%",
    background: "#171717",
    border: "1px solid #2a2a2a",
    borderRadius: 10,
    padding: "1.4rem",
    display: "flex",
    flexDirection: "column",
    gap: "0.9rem",
    color: "#f5f5f5",
    fontFamily: "system-ui, sans-serif",
  },
  help: { opacity: 0.7, fontSize: "0.85rem", lineHeight: 1.4 },
  label: { display: "flex", flexDirection: "column", gap: "0.3rem", fontSize: "0.85rem" },
  hint: { opacity: 0.6, fontSize: "0.75rem" },
  input: {
    background: "#0a0a0a",
    color: "#f5f5f5",
    border: "1px solid #2a2a2a",
    padding: "0.5rem 0.7rem",
    borderRadius: 6,
    fontSize: "0.9rem",
    outline: "none",
  },
  btn: {
    background: "#2a2a2a",
    color: "#f5f5f5",
    border: "1px solid #3a3a3a",
    padding: "0.5rem 1rem",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: "0.9rem",
  },
  primary: {
    background: "#4ade80",
    color: "#000",
    borderColor: "#4ade80",
    fontWeight: 600,
  },
  status: { opacity: 0.7, fontSize: "0.8rem", color: "#fca5a5" },
};
