import { forgetHost, type SavedHost } from "../savedHosts";

type Props = {
  hosts: SavedHost[];
  onConnect: (host: SavedHost) => void;
  onRefresh: () => void;
};

export function SavedHostsList({ hosts, onConnect, onRefresh }: Props) {
  if (hosts.length === 0) return null;

  return (
    <div style={styles.wrap}>
      <div style={styles.title}>Your paired hosts</div>
      {hosts.map((h) => (
        <div key={h.hostId} style={styles.row}>
          <button
            style={styles.connect}
            onClick={() => onConnect(h)}
            title={`Reconnect to ${h.hostName}`}
          >
            <span style={styles.hostName}>{h.hostName}</span>
            <span style={styles.lastSeen}>
              {h.lastConnectedAt
                ? `last used ${formatAge(h.lastConnectedAt)}`
                : "not yet connected"}
            </span>
          </button>
          <button
            style={styles.forget}
            onClick={() => {
              if (confirm(`Forget "${h.hostName}"? You'll need to pair again with a code.`)) {
                forgetHost(h.hostId);
                onRefresh();
              }
            }}
            title="Forget this host"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

function formatAge(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    display: "flex",
    flexDirection: "column",
    gap: "0.4rem",
    padding: "0.6rem",
    background: "#171717",
    border: "1px solid #2a2a2a",
    borderRadius: 8,
    width: "100%",
  },
  title: {
    opacity: 0.5,
    fontSize: "0.7rem",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    marginBottom: "0.2rem",
  },
  row: { display: "flex", gap: "0.4rem", alignItems: "stretch" },
  connect: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    background: "#222",
    border: "1px solid #333",
    borderRadius: 6,
    padding: "0.6rem 0.8rem",
    color: "#f5f5f5",
    cursor: "pointer",
    fontSize: "0.9rem",
    textAlign: "left",
    lineHeight: 1.3,
  },
  hostName: { fontWeight: 500 },
  lastSeen: { opacity: 0.5, fontSize: "0.7rem", marginTop: "0.2rem" },
  forget: {
    background: "transparent",
    border: "1px solid #333",
    color: "#666",
    borderRadius: 6,
    padding: "0 0.7rem",
    cursor: "pointer",
    fontSize: "1rem",
  },
};
