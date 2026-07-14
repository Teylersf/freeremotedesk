import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { HostPeer } from "./webrtc/host";
import { SetupWizard } from "./SetupWizard";
import type { InputEvent } from "./protocol";
import type { AgentConfig } from "./types";

type UiState =
  | { kind: "loading" }
  | { kind: "setup"; current: AgentConfig }
  | { kind: "idle"; config: AgentConfig }
  | { kind: "code"; config: AgentConfig; code: string }
  | { kind: "connecting"; config: AgentConfig; code: string }
  | { kind: "connected"; config: AgentConfig; code: string; peerState: string }
  | { kind: "error"; config: AgentConfig; message: string };

function App() {
  const [state, setState] = useState<UiState>({ kind: "loading" });
  const peerRef = useRef<HostPeer | null>(null);

  useEffect(() => {
    document.title = "FreeRemoteDesk Agent";
    void bootstrap();
    return () => {
      peerRef.current?.close();
    };
  }, []);

  async function bootstrap() {
    try {
      const config = await invoke<AgentConfig>("get_config");
      if (!config.signaling_url) {
        setState({ kind: "setup", current: config });
      } else {
        setState({ kind: "idle", config });
      }
    } catch (err) {
      setState({
        kind: "error",
        config: { signaling_url: null, pwa_url: null, agent_id: "" },
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function startSession(config: AgentConfig) {
    if (!config.signaling_url) {
      setState({ kind: "setup", current: config });
      return;
    }
    try {
      const code = await invoke<string>("request_pairing_code");
      setState({ kind: "code", config, code });

      const peer = new HostPeer(code, config.signaling_url);
      peerRef.current = peer;

      peer.on("onStateChange", (s) =>
        setState((prev) =>
          prev.kind === "connecting" || prev.kind === "connected"
            ? { kind: "connected", config, code, peerState: s }
            : prev,
        ),
      );
      peer.on("onInput", (evt) => onRemoteInput(evt));
      peer.on("onError", (err) =>
        setState({ kind: "error", config, message: err.message }),
      );
      peer.on("onClose", (reason) => {
        peerRef.current = null;
        setState({ kind: "error", config, message: reason ?? "session ended" });
      });

      await peer.captureScreen();
      await peer.connect();
      setState({ kind: "connecting", config, code });
    } catch (err) {
      setState({
        kind: "error",
        config,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  function endSession(config: AgentConfig) {
    peerRef.current?.close();
    peerRef.current = null;
    setState({ kind: "idle", config });
  }

  function openSettings() {
    const currentConfig =
      "config" in state ? state.config : { signaling_url: null, pwa_url: null, agent_id: "" };
    setState({ kind: "setup", current: currentConfig });
  }

  if (state.kind === "loading") {
    return <Layout><div style={{ opacity: 0.5 }}>Loading…</div></Layout>;
  }

  if (state.kind === "setup") {
    return (
      <Layout>
        <SetupWizard current={state.current} onSaved={(cfg) => setState({ kind: "idle", config: cfg })} />
      </Layout>
    );
  }

  return (
    <Layout>
      <h1 style={{ margin: 0 }}>FreeRemoteDesk</h1>

      {state.kind === "idle" && (
        <>
          <button onClick={() => startSession(state.config)} style={styles.primary}>
            Start session
          </button>
          <div style={styles.hint}>
            {state.config.pwa_url ? (
              <>Enter the code at <b>{state.config.pwa_url}</b></>
            ) : (
              <>Enter the code on your PWA client</>
            )}
          </div>
        </>
      )}

      {(state.kind === "code" || state.kind === "connecting" || state.kind === "connected") && (
        <>
          <CodeDisplay code={state.code} />
          <div style={styles.hint}>
            {state.kind === "code" && "Waiting for client…"}
            {state.kind === "connecting" && "Client joined — establishing WebRTC…"}
            {state.kind === "connected" && `Connected · ${state.peerState}`}
          </div>
          {state.config.pwa_url && (
            <div style={{ ...styles.hint, opacity: 0.4 }}>
              PWA: {state.config.pwa_url}
            </div>
          )}
          <button onClick={() => endSession(state.config)}>End session</button>
        </>
      )}

      {state.kind === "error" && (
        <>
          <div style={styles.error}>Error: {state.message}</div>
          <button onClick={() => endSession(state.config)}>Back</button>
        </>
      )}

      <button
        onClick={openSettings}
        style={{ ...styles.link, marginTop: "1rem" }}
      >
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
        gap: "1.5rem",
        alignItems: "center",
        justifyContent: "center",
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
        fontSize: "3rem",
        letterSpacing: "0.3em",
        background: "#171717",
        padding: "1rem 2rem",
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
  error: { color: "#ef4444" },
  link: {
    background: "transparent",
    border: 0,
    color: "#888",
    cursor: "pointer",
    fontSize: "0.85rem",
    textDecoration: "underline",
  },
};

const root = document.getElementById("root");
if (!root) throw new Error("#root missing");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
