import { useState } from "react";
import { PeerClient } from "../webrtc/client";

type Props = {
  signalingUrl: string;
  onConnected: (client: PeerClient) => void;
  onOpenSettings: () => void;
};

export function ConnectView({ signalingUrl, onConnected, onOpenSettings }: Props) {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canSubmit = code.trim().length === 6 && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setStatus("Connecting…");
    const client = new PeerClient(code.trim().toLowerCase(), signalingUrl);
    try {
      await client.connect();
      onConnected(client);
    } catch (err) {
      client.close();
      setStatus(err instanceof Error ? err.message : "Connection failed");
      setBusy(false);
    }
  }

  return (
    <form className="panel" onSubmit={submit}>
      <div>
        <h1 style={{ margin: 0 }}>FreeRemoteDesk</h1>
        <p className="muted" style={{ marginTop: "0.25rem" }}>
          Enter the 6-character pairing code from your host machine.
        </p>
      </div>

      <input
        autoFocus
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

      {status && <div className="muted">{status}</div>}

      <button
        type="button"
        onClick={onOpenSettings}
        style={{
          background: "transparent",
          border: 0,
          color: "#888",
          cursor: "pointer",
          fontSize: "0.75rem",
          textDecoration: "underline",
          padding: 0,
        }}
      >
        Change signaling server
      </button>
    </form>
  );
}
