import { useState } from "react";
import {
  defaultDeviceName,
  generateClientId,
  generateSecret,
  makeTrustUrl,
  saveHost,
  type SavedHost,
} from "../savedHosts";
import type { PeerClient } from "../webrtc/client";
import type { ControlMessage } from "../webrtc/protocol";

type Props = {
  client: PeerClient;
  onSaved: (hostName: string) => void;
  onDismiss: () => void;
};

type Phase =
  | { kind: "form" }
  | { kind: "saving" }
  | { kind: "success"; entry: SavedHost; trustUrl: string }
  | { kind: "error"; reason: string };

/**
 * Post-pair modal: "Save this host?" → device-name entry → save →
 * "Here's your bookmark URL for extra durability."
 */
export function SavePrompt({ client, onSaved, onDismiss }: Props) {
  const [deviceName, setDeviceName] = useState(defaultDeviceName());
  const [phase, setPhase] = useState<Phase>({ kind: "form" });
  const [urlCopied, setUrlCopied] = useState(false);

  async function save() {
    if (!deviceName.trim()) return;
    setPhase({ kind: "saving" });

    const clientId = generateClientId();
    const secret = generateSecret();

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
      setPhase({ kind: "error", reason: "Control channel not open yet — wait a moment and try again." });
      return;
    }

    const res = await responsePromise;
    if (!res.ok) {
      setPhase({ kind: "error", reason: res.reason });
      return;
    }

    const entry: SavedHost = {
      hostId: res.hostId,
      hostName: res.hostName,
      clientId,
      secret,
      addedAt: Date.now(),
      lastConnectedAt: Date.now(),
    };
    saveHost(entry);
    const trustUrl = makeTrustUrl(entry, window.location.origin);
    setPhase({ kind: "success", entry, trustUrl });
  }

  async function copyTrustUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setUrlCopied(true);
      setTimeout(() => setUrlCopied(false), 2000);
    } catch { /* clipboard perms */ }
  }

  return (
    <div style={styles.backdrop} onClick={onDismiss}>
      <div style={styles.card} onClick={(e) => e.stopPropagation()}>
        {phase.kind === "form" && (
          <>
            <div style={styles.title}>Save this host?</div>
            <div style={styles.help}>
              Next time you open the PWA, this host shows up in a list —
              one tap to reconnect, no code needed.
            </div>
            <label style={styles.label}>
              <span style={styles.hint}>Device name (for your reference)</span>
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
                disabled={!deviceName.trim()}
                style={{ ...styles.btn, ...styles.primary }}
              >
                Save
              </button>
              <button onClick={onDismiss} style={styles.btn}>Not now</button>
            </div>
          </>
        )}

        {phase.kind === "saving" && (
          <div style={{ padding: "1rem 0", textAlign: "center", opacity: 0.7 }}>
            Saving…
          </div>
        )}

        {phase.kind === "success" && (
          <>
            <div style={styles.title}>✅ Saved</div>
            <div style={styles.help}>
              <b>{phase.entry.hostName}</b> is now in your paired-hosts list.
              You can reconnect anytime.
            </div>
            <div style={styles.help}>
              <b>Optional but recommended:</b> bookmark this URL. If your
              browser ever clears its storage, opening the bookmark restores
              access — no re-pairing needed.
            </div>
            <div style={styles.urlBox}>
              <input
                readOnly
                value={phase.trustUrl}
                onFocus={(e) => e.currentTarget.select()}
                style={styles.urlInput}
              />
              <button
                onClick={() => copyTrustUrl(phase.trustUrl)}
                style={styles.copyBtn}
              >
                {urlCopied ? "Copied ✓" : "Copy"}
              </button>
            </div>
            <div style={styles.hint}>
              Anyone with this URL gets access. Keep it private.
            </div>
            <button
              onClick={() => {
                onSaved(phase.entry.hostName);
              }}
              style={{ ...styles.btn, ...styles.primary }}
            >
              Done
            </button>
          </>
        )}

        {phase.kind === "error" && (
          <>
            <div style={styles.title}>Something went wrong</div>
            <div style={{ ...styles.help, color: "#fca5a5" }}>{phase.reason}</div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                onClick={() => setPhase({ kind: "form" })}
                style={{ ...styles.btn, ...styles.primary }}
              >
                Try again
              </button>
              <button onClick={onDismiss} style={styles.btn}>Close</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
    display: "flex", alignItems: "center", justifyContent: "center",
    padding: "1rem", zIndex: 100,
  },
  card: {
    maxWidth: 480, width: "100%",
    background: "#171717", border: "1px solid #2a2a2a", borderRadius: 10,
    padding: "1.4rem",
    display: "flex", flexDirection: "column", gap: "0.9rem",
    color: "#f5f5f5", fontFamily: "system-ui, sans-serif",
  },
  title: { fontSize: "1.05rem", fontWeight: 600 },
  help: { opacity: 0.75, fontSize: "0.9rem", lineHeight: 1.5 },
  label: { display: "flex", flexDirection: "column", gap: "0.3rem", fontSize: "0.85rem" },
  hint: { opacity: 0.55, fontSize: "0.75rem" },
  input: {
    background: "#0a0a0a", color: "#f5f5f5",
    border: "1px solid #2a2a2a", padding: "0.5rem 0.7rem", borderRadius: 6,
    fontSize: "0.9rem", outline: "none",
  },
  btn: {
    background: "#2a2a2a", color: "#f5f5f5",
    border: "1px solid #3a3a3a", padding: "0.5rem 1rem", borderRadius: 6,
    cursor: "pointer", fontSize: "0.9rem",
  },
  primary: {
    background: "#4ade80", color: "#000",
    borderColor: "#4ade80", fontWeight: 600,
  },
  urlBox: {
    display: "flex", gap: "0.4rem", alignItems: "stretch",
    background: "#0a0a0a", border: "1px solid #2a2a2a", borderRadius: 6,
    padding: "0.3rem",
  },
  urlInput: {
    flex: 1, background: "transparent", color: "#f5f5f5",
    border: 0, outline: "none", fontFamily: "ui-monospace, monospace",
    fontSize: "0.75rem", padding: "0.3rem",
    overflow: "hidden", textOverflow: "ellipsis",
  },
  copyBtn: {
    background: "#2a2a2a", color: "#f5f5f5",
    border: "1px solid #3a3a3a", borderRadius: 4,
    padding: "0.3rem 0.7rem", fontSize: "0.75rem", cursor: "pointer",
  },
};
