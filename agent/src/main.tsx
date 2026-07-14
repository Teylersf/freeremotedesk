import { StrictMode, useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { HostPeer } from "./webrtc/host";
import { SetupWizard } from "./SetupWizard";
import type { InputEvent } from "./protocol";
import type { AgentConfig, TrustedClientSummary } from "./types";

type UiState =
  | { kind: "loading" }
  | { kind: "setup"; current: AgentConfig }
  | { kind: "idle"; config: AgentConfig; trusted: TrustedClientSummary[] }
  | { kind: "listening"; config: AgentConfig; pairCode: string | null; sessionState: string | null; trusted: TrustedClientSummary[] }
  | { kind: "error"; config: AgentConfig | null; message: string };

function useHostName(): string {
  // Basic guess. In v0.2.x we'll let the user override in Settings.
  return "My computer";
}

function App() {
  const [state, setState] = useState<UiState>({ kind: "loading" });
  const persistentPeerRef = useRef<HostPeer | null>(null);
  const pairPeerRef = useRef<HostPeer | null>(null);
  const hostName = useHostName();

  useEffect(() => {
    document.title = "FreeRemoteDesk Agent";
    void bootstrap();
    return () => {
      persistentPeerRef.current?.close();
      pairPeerRef.current?.close();
    };
  }, []);

  async function bootstrap() {
    try {
      const config = await invoke<AgentConfig>("get_config");
      if (!config.signaling_url) {
        setState({ kind: "setup", current: config });
        return;
      }
      const trusted = await invoke<TrustedClientSummary[]>("list_trusted_clients");
      setState({ kind: "idle", config, trusted });
    } catch (err) {
      setState({
        kind: "error",
        config: null,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function refreshTrusted(): Promise<TrustedClientSummary[]> {
    try {
      return await invoke<TrustedClientSummary[]>("list_trusted_clients");
    } catch {
      return [];
    }
  }

  /** Start the persistent "server" mode — captures screen once, listens
   *  for trusted-device reconnects, and also can accept ad-hoc pairing codes. */
  async function startListening(config: AgentConfig) {
    try {
      const persistent = new HostPeer({
        code: `host-${config.agent_id}`,
        signalingUrl: config.signaling_url!,
        mode: "persistent",
        hostId: config.agent_id,
        hostName,
      });
      persistentPeerRef.current = persistent;

      // Capture screen once — user gesture is required and this click IS one.
      await persistent.captureScreen();
      await persistent.connect();

      persistent.on("onInput", onRemoteInput);
      persistent.on("onStateChange", (s) =>
        setState((prev) =>
          prev.kind === "listening" ? { ...prev, sessionState: s } : prev,
        ),
      );
      persistent.on("onSessionEnded", () => {
        setState((prev) =>
          prev.kind === "listening" ? { ...prev, sessionState: null } : prev,
        );
      });
      persistent.on("onClientAuthed", async () => {
        const trusted = await refreshTrusted();
        setState((prev) => (prev.kind === "listening" ? { ...prev, trusted } : prev));
      });
      persistent.on("onError", (err) =>
        setState({ kind: "error", config, message: err.message }),
      );
      persistent.on("onClose", (reason) => {
        persistentPeerRef.current = null;
        setState({
          kind: "idle",
          config,
          trusted: [],
        });
        if (reason) console.log("persistent host closed:", reason);
      });

      const trusted = await refreshTrusted();
      setState({
        kind: "listening",
        config,
        pairCode: null,
        sessionState: null,
        trusted,
      });
    } catch (err) {
      setState({
        kind: "error",
        config,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function startPairCode(config: AgentConfig) {
    try {
      const code = await invoke<string>("request_pairing_code");
      const pair = new HostPeer({
        code,
        signalingUrl: config.signaling_url!,
        mode: "pair",
        hostId: config.agent_id,
        hostName,
      });
      pairPeerRef.current = pair;

      // We don't need to captureScreen() again if a persistent peer already did.
      // But if we're in idle mode (no listening), capture now.
      if (!persistentPeerRef.current) {
        await pair.captureScreen();
      }
      await pair.connect();

      pair.on("onInput", onRemoteInput);
      pair.on("onClose", async () => {
        pairPeerRef.current = null;
        const trusted = await refreshTrusted();
        setState((prev) =>
          prev.kind === "listening"
            ? { ...prev, pairCode: null, trusted }
            : prev,
        );
      });
      pair.on("onError", (err) =>
        setState({ kind: "error", config, message: err.message }),
      );

      setState((prev) =>
        prev.kind === "listening" ? { ...prev, pairCode: code } : prev,
      );
    } catch (err) {
      setState({
        kind: "error",
        config,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function revoke(clientId: string) {
    await invoke("revoke_trusted_client", { clientId });
    const trusted = await refreshTrusted();
    setState((prev) => (prev.kind === "listening" ? { ...prev, trusted } : prev));
  }

  function openSettings() {
    const currentConfig =
      "config" in state && state.config
        ? state.config
        : { signaling_url: null, pwa_url: null, agent_id: "", trusted_clients: {} };
    persistentPeerRef.current?.close();
    pairPeerRef.current?.close();
    setState({ kind: "setup", current: currentConfig });
  }

  function stopEverything(config: AgentConfig) {
    persistentPeerRef.current?.close();
    pairPeerRef.current?.close();
    persistentPeerRef.current = null;
    pairPeerRef.current = null;
    setState({ kind: "idle", config, trusted: [] });
  }

  // ---------- Render ----------

  if (state.kind === "loading") {
    return <Layout><div style={{ opacity: 0.5 }}>Loading…</div></Layout>;
  }

  if (state.kind === "setup") {
    return (
      <Layout>
        <SetupWizard current={state.current} onSaved={(cfg) => bootstrap()} />
      </Layout>
    );
  }

  if (state.kind === "error") {
    return (
      <Layout>
        <h1 style={{ margin: 0 }}>FreeRemoteDesk</h1>
        <div style={{ color: "#ef4444", maxWidth: 380, textAlign: "center" }}>
          {state.message}
        </div>
        <button onClick={bootstrap}>Reload</button>
      </Layout>
    );
  }

  return (
    <Layout>
      <h1 style={{ margin: 0 }}>FreeRemoteDesk</h1>

      {state.kind === "idle" && (
        <>
          <button onClick={() => startListening(state.config)} style={styles.primary}>
            Start listening
          </button>
          <div style={styles.hint}>
            You'll pick which screen to share. Then trusted devices can
            reconnect anytime with no code.
          </div>
        </>
      )}

      {state.kind === "listening" && (
        <>
          <div style={styles.statusRow}>
            <div style={styles.dot} />
            <span>
              {state.sessionState
                ? `Session · ${state.sessionState}`
                : "Listening"}
            </span>
          </div>

          {state.trusted.length > 0 ? (
            <div style={styles.list}>
              <div style={styles.listTitle}>Trusted devices</div>
              {state.trusted.map((tc) => (
                <div key={tc.client_id} style={styles.listRow}>
                  <span>{tc.name}</span>
                  <button style={styles.linkBtn} onClick={() => revoke(tc.client_id)}>
                    Revoke
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div style={styles.hint}>No trusted devices yet.</div>
          )}

          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            {state.pairCode ? (
              <CodeDisplay code={state.pairCode} />
            ) : (
              <button onClick={() => startPairCode(state.config)}>
                Add a new device
              </button>
            )}
          </div>

          {state.config.pwa_url && (
            <div style={{ ...styles.hint, opacity: 0.5 }}>
              PWA: {state.config.pwa_url}
            </div>
          )}

          <button onClick={() => stopEverything(state.config)} style={styles.linkBtn}>
            Stop listening
          </button>
        </>
      )}

      <button onClick={openSettings} style={{ ...styles.linkBtn, marginTop: "0.5rem" }}>
        Settings
      </button>
    </Layout>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: "system-ui, sans-serif",
        background: "#0a0a0a",
        color: "#f5f5f5",
        minHeight: "100vh",
        padding: "2rem",
        display: "flex",
        flexDirection: "column",
        gap: "1.2rem",
        alignItems: "center",
        justifyContent: "flex-start",
      }}
    >
      {children}
    </div>
  );
}

function CodeDisplay({ code }: { code: string }) {
  return (
    <div
      style={{
        fontFamily: "ui-monospace, monospace",
        fontSize: "2.4rem",
        letterSpacing: "0.3em",
        background: "#171717",
        padding: "0.8rem 1.6rem",
        borderRadius: 8,
        border: "1px solid #2a2a2a",
        userSelect: "all",
      }}
    >
      {code}
    </div>
  );
}

function onRemoteInput(evt: InputEvent) {
  invoke("inject_input", { event: evt }).catch((e) => {
    console.warn("inject_input failed", e);
  });
}

const styles: Record<string, React.CSSProperties> = {
  primary: {
    background: "#4ade80",
    color: "#000",
    border: 0,
    padding: "0.9rem 1.8rem",
    borderRadius: 6,
    fontSize: "1rem",
    fontWeight: 600,
    cursor: "pointer",
  },
  hint: { opacity: 0.6, fontSize: "0.9rem", textAlign: "center" },
  statusRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    background: "#171717",
    border: "1px solid #2a2a2a",
    padding: "0.5rem 0.9rem",
    borderRadius: 6,
    fontSize: "0.9rem",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: "#4ade80",
    boxShadow: "0 0 8px #4ade80",
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: "0.4rem",
    width: "100%",
    maxWidth: 360,
    background: "#171717",
    border: "1px solid #2a2a2a",
    borderRadius: 6,
    padding: "0.6rem",
  },
  listTitle: { opacity: 0.5, fontSize: "0.75rem", textTransform: "uppercase" },
  listRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0.3rem 0",
  },
  linkBtn: {
    background: "transparent",
    border: 0,
    color: "#888",
    cursor: "pointer",
    fontSize: "0.85rem",
    textDecoration: "underline",
    padding: 0,
  },
};

const root = document.getElementById("root");
if (!root) throw new Error("#root missing");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
