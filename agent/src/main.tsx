import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { HostPeer } from "./webrtc/host";
import { SetupWizard } from "./SetupWizard";
import type { InputEvent } from "./protocol";
import type { AgentConfig, TrustedClientSummary } from "./types";

type UiState =
  | { kind: "loading" }
  | { kind: "setup"; current: AgentConfig }
  | { kind: "idle"; config: AgentConfig; trusted: TrustedClientSummary[] }
  | { kind: "listening"; config: AgentConfig; trusted: TrustedClientSummary[]; pairCode: string | null; sessionState: string | null }
  | { kind: "incoming"; config: AgentConfig; trusted: TrustedClientSummary[]; clientId: string; clientName: string }
  | { kind: "error"; config: AgentConfig | null; message: string };

function useHostName(): string {
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
    // Request notification permission opportunistically.
    void ensureNotificationPermission();
    return () => {
      persistentPeerRef.current?.close();
      pairPeerRef.current?.close();
    };
  }, []);

  async function ensureNotificationPermission() {
    try {
      const granted = await isPermissionGranted();
      if (!granted) await requestPermission();
    } catch { /* ignore — notifications are best-effort */ }
  }

  async function bootstrap() {
    try {
      const config = await invoke<AgentConfig>("get_config");
      if (!config.signaling_url) {
        setState({ kind: "setup", current: config });
        return;
      }
      const trusted = await invoke<TrustedClientSummary[]>("list_trusted_clients");

      // Auto-listen if we have any trusted clients — user doesn't need to click.
      // We open the WS but do NOT capture the screen yet; capture happens on
      // acceptIncoming() (a user click) when a client tries to connect.
      if (trusted.length > 0) {
        await autoStartListening(config, trusted);
        return;
      }
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
    try { return await invoke<TrustedClientSummary[]>("list_trusted_clients"); }
    catch { return []; }
  }

  /** Open the persistent WS without capturing screen — auto-called on boot. */
  async function autoStartListening(
    config: AgentConfig,
    trusted: TrustedClientSummary[],
  ) {
    try {
      const persistent = wireHostPeerHandlers(
        new HostPeer({
          code: `host-${config.agent_id}`,
          signalingUrl: config.signaling_url!,
          mode: "persistent",
          hostId: config.agent_id,
          hostName,
        }),
        config,
        trusted,
      );
      persistentPeerRef.current = persistent;
      await persistent.connect();

      setState({
        kind: "listening",
        config,
        trusted,
        pairCode: null,
        sessionState: null,
      });
    } catch (err) {
      // If signaling URL is unreachable, fall back to idle.
      setState({
        kind: "idle",
        config,
        trusted,
      });
      console.warn("auto-listen failed:", err);
    }
  }

  function wireHostPeerHandlers(
    peer: HostPeer,
    config: AgentConfig,
    trusted: TrustedClientSummary[],
  ): HostPeer {
    peer.on("onInput", onRemoteInput);

    peer.on("onStateChange", (s) =>
      setState((prev) =>
        prev.kind === "listening" ? { ...prev, sessionState: s } : prev,
      ),
    );

    peer.on("onSessionEnded", async () => {
      const fresh = await refreshTrusted();
      setState((prev) =>
        prev.kind === "listening" || prev.kind === "incoming"
          ? { kind: "listening", config, trusted: fresh, pairCode: null, sessionState: null }
          : prev,
      );
    });

    peer.on("onIncomingAuth", async (clientId) => {
      const fresh = await refreshTrusted();
      const client = fresh.find((c) => c.client_id === clientId);
      const clientName = client?.name ?? "A trusted device";

      // Fire OS notification + focus window.
      try {
        await sendNotification({
          title: "FreeRemoteDesk",
          body: `${clientName} is trying to reconnect — click to accept.`,
        });
      } catch { /* best effort */ }
      try { await invoke("focus_window"); } catch { /* best effort */ }

      setState({ kind: "incoming", config, trusted: fresh, clientId, clientName });
    });

    peer.on("onError", (err) =>
      setState({ kind: "error", config, message: err.message }),
    );

    peer.on("onClose", (reason) => {
      persistentPeerRef.current = null;
      setState({ kind: "idle", config, trusted });
      if (reason) console.log("persistent host closed:", reason);
    });

    return peer;
  }

  /** User-gesture handler: called when user clicks "Start listening" on the
   *  idle screen. Captures the screen up-front for the case where they want
   *  to start listening BEFORE any trusted client exists yet. */
  async function manuallyStartListening(config: AgentConfig) {
    try {
      const persistent = wireHostPeerHandlers(
        new HostPeer({
          code: `host-${config.agent_id}`,
          signalingUrl: config.signaling_url!,
          mode: "persistent",
          hostId: config.agent_id,
          hostName,
        }),
        config,
        [],
      );
      persistentPeerRef.current = persistent;
      await persistent.captureScreen();
      await persistent.connect();
      const trusted = await refreshTrusted();
      setState({
        kind: "listening",
        config,
        trusted,
        pairCode: null,
        sessionState: null,
      });
    } catch (err) {
      setState({
        kind: "error",
        config,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /** User clicks Accept on the incoming-auth prompt. */
  async function acceptIncoming() {
    const peer = persistentPeerRef.current;
    if (!peer) return;
    try {
      await peer.acceptIncoming();     // captureScreen + auth.ok + WebRTC
      setState((prev) =>
        prev.kind === "incoming"
          ? { kind: "listening", config: prev.config, trusted: prev.trusted, pairCode: null, sessionState: "connecting" }
          : prev,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // If user cancelled the screen picker, go back to listening.
      if (msg.includes("Permission denied") || msg.includes("NotAllowed")) {
        peer.rejectIncoming("user cancelled screen selection");
        setState((prev) =>
          prev.kind === "incoming"
            ? { kind: "listening", config: prev.config, trusted: prev.trusted, pairCode: null, sessionState: null }
            : prev,
        );
        return;
      }
      setState((prev) => ({
        kind: "error",
        config: prev.kind !== "loading" && "config" in prev && prev.config ? prev.config : null,
        message: msg,
      }));
    }
  }

  function declineIncoming() {
    const peer = persistentPeerRef.current;
    if (!peer) return;
    peer.rejectIncoming("declined by user");
    setState((prev) =>
      prev.kind === "incoming"
        ? { kind: "listening", config: prev.config, trusted: prev.trusted, pairCode: null, sessionState: null }
        : prev,
    );
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

      // If persistent peer already captured, reuse. Otherwise capture now.
      const persistent = persistentPeerRef.current;
      if (persistent) {
        // TypeScript is unhappy about private access; use bracket notation for hack.
        const persistentStream = (persistent as unknown as { stream: MediaStream | null }).stream;
        if (persistentStream) {
          // Share the same stream instance.
          (pair as unknown as { stream: MediaStream }).stream = persistentStream;
        } else {
          await pair.captureScreen();
        }
      } else {
        await pair.captureScreen();
      }
      await pair.connect();

      pair.on("onInput", onRemoteInput);
      pair.on("onClose", async () => {
        pairPeerRef.current = null;
        const trusted = await refreshTrusted();
        setState((prev) =>
          prev.kind === "listening" ? { ...prev, pairCode: null, trusted } : prev,
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
    setState((prev) =>
      prev.kind === "listening" ? { ...prev, trusted } : prev,
    );
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
        <SetupWizard current={state.current} onSaved={() => bootstrap()} />
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

  if (state.kind === "incoming") {
    return (
      <Layout>
        <h1 style={{ margin: 0 }}>FreeRemoteDesk</h1>
        <div style={styles.incomingCard}>
          <div style={styles.incomingTitle}>Incoming connection</div>
          <div style={styles.incomingSub}>
            <b>{state.clientName}</b> wants to reconnect.
          </div>
          <div style={styles.incomingSub}>
            You'll be asked to pick a screen or window to share.
          </div>
          <div style={{ display: "flex", gap: "0.6rem", marginTop: "0.4rem" }}>
            <button onClick={acceptIncoming} style={styles.primary}>Accept</button>
            <button onClick={declineIncoming}>Decline</button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <h1 style={{ margin: 0 }}>FreeRemoteDesk</h1>

      {state.kind === "idle" && (
        <>
          <button onClick={() => manuallyStartListening(state.config)} style={styles.primary}>
            Start listening
          </button>
          <div style={styles.hint}>
            You'll pick which screen to share. Then trusted devices can
            reconnect anytime — you'll get a prompt each time.
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
                : `Listening · ${state.trusted.length} trusted device${state.trusted.length === 1 ? "" : "s"}`}
            </span>
          </div>

          {state.trusted.length > 0 && (
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
    width: 8, height: 8, borderRadius: "50%",
    background: "#4ade80", boxShadow: "0 0 8px #4ade80",
  },
  list: {
    display: "flex", flexDirection: "column", gap: "0.4rem",
    width: "100%", maxWidth: 360,
    background: "#171717", border: "1px solid #2a2a2a",
    borderRadius: 6, padding: "0.6rem",
  },
  listTitle: { opacity: 0.5, fontSize: "0.75rem", textTransform: "uppercase" },
  listRow: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "0.3rem 0",
  },
  linkBtn: {
    background: "transparent", border: 0, color: "#888",
    cursor: "pointer", fontSize: "0.85rem", textDecoration: "underline",
    padding: 0,
  },
  incomingCard: {
    display: "flex", flexDirection: "column", gap: "0.7rem",
    background: "#171717", border: "1px solid #4ade80",
    borderRadius: 10, padding: "1.4rem",
    maxWidth: 400, width: "100%",
    boxShadow: "0 0 24px rgba(74, 222, 128, 0.35)",
  },
  incomingTitle: {
    color: "#4ade80", fontSize: "0.75rem",
    textTransform: "uppercase", letterSpacing: "0.05em",
  },
  incomingSub: { fontSize: "0.95rem", lineHeight: 1.5, opacity: 0.85 },
};

const root = document.getElementById("root");
if (!root) throw new Error("#root missing");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
