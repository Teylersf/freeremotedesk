import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { HostPeer } from "./webrtc/host";
import type { InputEvent } from "./protocol";

type UiState =
  | { kind: "idle" }
  | { kind: "code"; code: string }
  | { kind: "connecting"; code: string }
  | { kind: "connected"; code: string; peerState: string }
  | { kind: "error"; message: string };

function App() {
  const [state, setState] = useState<UiState>({ kind: "idle" });
  const peerRef = useRef<HostPeer | null>(null);

  useEffect(() => {
    document.title = "FreeRemoteDesk Agent";
    return () => {
      peerRef.current?.close();
    };
  }, []);

  async function startSession() {
    try {
      const code = await invoke<string>("request_pairing_code");
      setState({ kind: "code", code });

      const peer = new HostPeer(code);
      peerRef.current = peer;

      peer.on("onStateChange", (s) =>
        setState((prev) =>
          prev.kind === "connecting" || prev.kind === "connected"
            ? { kind: "connected", code, peerState: s }
            : prev,
        ),
      );
      peer.on("onInput", (evt) => onRemoteInput(evt));
      peer.on("onError", (err) => setState({ kind: "error", message: err.message }));
      peer.on("onClose", (reason) => {
        peerRef.current = null;
        setState({ kind: "error", message: reason ?? "session ended" });
      });

      // Ask the user to pick a screen. WebView2 will surface the OS picker.
      await peer.captureScreen();
      await peer.connect();
      setState({ kind: "connecting", code });
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  function reset() {
    peerRef.current?.close();
    peerRef.current = null;
    setState({ kind: "idle" });
  }

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
      <h1 style={{ margin: 0 }}>FreeRemoteDesk</h1>

      {state.kind === "idle" && (
        <>
          <button
            onClick={startSession}
            style={{
              background: "#4ade80",
              color: "#000",
              border: 0,
              padding: "0.9rem 1.8rem",
              borderRadius: 6,
              fontSize: "1rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Start session
          </button>
          <div style={{ opacity: 0.5, fontSize: "0.85rem", textAlign: "center" }}>
            Generates a one-time code. Enter it on freeremotedesk.com<br />from your other device.
          </div>
        </>
      )}

      {(state.kind === "code" || state.kind === "connecting" || state.kind === "connected") && (
        <>
          <CodeDisplay code={state.code} />
          <div style={{ opacity: 0.7, fontSize: "0.9rem" }}>
            {state.kind === "code" && "Waiting for client…"}
            {state.kind === "connecting" && "Client joined — establishing WebRTC…"}
            {state.kind === "connected" && `Connected · ${state.peerState}`}
          </div>
          <button onClick={reset}>End session</button>
        </>
      )}

      {state.kind === "error" && (
        <>
          <div style={{ color: "#ef4444" }}>Error: {state.message}</div>
          <button onClick={reset}>Try again</button>
        </>
      )}
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
  // Forward to Rust for OS-level input injection via enigo.
  // Fire-and-forget: dropped events are preferable to blocking input latency.
  invoke("inject_input", { event: evt }).catch((e) => {
    console.warn("inject_input failed", e);
  });
}

const root = document.getElementById("root");
if (!root) throw new Error("#root missing");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
