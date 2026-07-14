import { useState } from "react";
import { listSavedHosts, markConnected, type SavedHost } from "../savedHosts";
import { PeerClient } from "../webrtc/client";
import { SavedHostsList } from "./SavedHostsList";

type Props = {
  signalingUrl: string;
  onConnected: (client: PeerClient, mode: "pair" | "reconnect") => void;
  onOpenSettings: () => void;
};

export function ConnectView({ signalingUrl, onConnected, onOpenSettings }: Props) {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedHosts, setSavedHosts] = useState<SavedHost[]>(() => listSavedHosts());

  const canSubmit = code.trim().length === 6 && !busy;

  function refresh() {
    setSavedHosts(listSavedHosts());
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setStatus("Connecting…");
    const client = new PeerClient({
      code: code.trim().toLowerCase(),
      signalingUrl,
    });
    try {
      await client.connect();
      onConnected(client, "pair");
    } catch (err) {
      client.close();
      setStatus(err instanceof Error ? err.message : "Connection failed");
      setBusy(false);
    }
  }

  async function reconnectTo(host: SavedHost) {
    setBusy(true);
    setStatus(`Connecting to ${host.hostName}…`);
    const client = new PeerClient({
      code: `host-${host.hostId}`,
      signalingUrl,
      auth: { clientId: host.clientId, secret: host.secret },
    });
    // Wait for auth result before proceeding.
    const authed = new Promise<boolean>((resolve) => {
      client.on("onAuthResult", (ok) => resolve(ok));
      setTimeout(() => resolve(false), 10000);
    });
    try {
      await client.connect();
      const ok = await authed;
      if (!ok) {
        setStatus(`Auth failed for ${host.hostName}`);
        client.close();
        setBusy(false);
        return;
      }
      markConnected(host.hostId);
      onConnected(client, "reconnect");
    } catch (err) {
      client.close();
      setStatus(err instanceof Error ? err.message : "Connection failed");
      setBusy(false);
    }
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.header}>
        <h1 style={{ margin: 0 }}>FreeRemoteDesk</h1>
        <p className="muted" style={{ marginTop: "0.25rem" }}>
          {savedHosts.length > 0
            ? "Tap a saved host to reconnect, or add a new one."
            : "Enter the 6-character pairing code from your host."}
        </p>
      </div>

      <SavedHostsList hosts={savedHosts} onConnect={reconnectTo} onRefresh={refresh} />

      <form onSubmit={submitCode} style={styles.form}>
        {savedHosts.length > 0 && <div style={styles.sectionLabel}>Pair a new host</div>}
        <input
          maxLength={6}
          placeholder="x7k2q9"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/[^a-z0-9]/gi, "").slice(0, 6))}
          inputMode="text"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
        <button type="submit" disabled={!canSubmit}>
          {busy ? "Connecting…" : "Connect"}
        </button>
      </form>

      {status && <div className="muted">{status}</div>}

      <button type="button" onClick={onOpenSettings} style={styles.link}>
        Change signaling server
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    maxWidth: 420,
    margin: "3rem auto",
    padding: "2rem",
    background: "#171717",
    border: "1px solid #2a2a2a",
    borderRadius: 12,
    display: "flex",
    flexDirection: "column",
    gap: "1.2rem",
  },
  header: {},
  form: { display: "flex", flexDirection: "column", gap: "0.8rem" },
  sectionLabel: {
    opacity: 0.5,
    fontSize: "0.7rem",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  link: {
    background: "transparent",
    border: 0,
    color: "#888",
    cursor: "pointer",
    fontSize: "0.75rem",
    textDecoration: "underline",
    padding: 0,
  },
};
