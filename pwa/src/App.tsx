import { useEffect, useState } from "react";
import { ConnectView } from "./components/ConnectView";
import { SavePrompt } from "./components/SavePrompt";
import { SessionView } from "./components/SessionView";
import { SetupScreen } from "./components/SetupScreen";
import { clearSignalingUrl, getSignalingUrl } from "./config";
import { Landing } from "./landing/Landing";
import { consumeTrustParamFromUrl } from "./savedHosts";
import type { PeerClient } from "./webrtc/client";

type AppState =
  | { kind: "landing" }
  | { kind: "setup" }
  | { kind: "connect"; signalingUrl: string }
  | { kind: "session"; client: PeerClient; mode: "pair" | "reconnect"; savePromptDismissed: boolean };

function initialState(): AppState {
  const path = typeof window !== "undefined" ? window.location.pathname : "/";
  if (!path.startsWith("/connect")) return { kind: "landing" };
  // If the user opened a bookmarked trust URL, decode + persist the record.
  // consumeTrustParamFromUrl also strips the ?trust=… from the visible URL.
  consumeTrustParamFromUrl();
  const url = getSignalingUrl();
  return url ? { kind: "connect", signalingUrl: url } : { kind: "setup" };
}

export default function App() {
  const [state, setState] = useState<AppState>(initialState);

  // Handle browser back/forward so /connect vs / stays in sync with state.
  useEffect(() => {
    const onPop = () => setState(initialState());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  if (state.kind === "landing") {
    return <Landing />;
  }

  if (state.kind === "setup") {
    return (
      <SetupScreen
        onSaved={(url) => setState({ kind: "connect", signalingUrl: url })}
      />
    );
  }

  if (state.kind === "session") {
    const showSavePrompt = state.mode === "pair" && !state.savePromptDismissed;
    return (
      <>
        <SessionView
          client={state.client}
          onExit={() => {
            const url = getSignalingUrl();
            setState(url ? { kind: "connect", signalingUrl: url } : { kind: "setup" });
          }}
        />
        {showSavePrompt && (
          <SavePrompt
            client={state.client}
            onSaved={() =>
              setState((prev) =>
                prev.kind === "session" ? { ...prev, savePromptDismissed: true } : prev,
              )
            }
            onDismiss={() =>
              setState((prev) =>
                prev.kind === "session" ? { ...prev, savePromptDismissed: true } : prev,
              )
            }
          />
        )}
      </>
    );
  }

  return (
    <ConnectView
      signalingUrl={state.signalingUrl}
      onConnected={(client, mode) =>
        setState({ kind: "session", client, mode, savePromptDismissed: false })
      }
      onOpenSettings={() => {
        clearSignalingUrl();
        setState({ kind: "setup" });
      }}
    />
  );
}
