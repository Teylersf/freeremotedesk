import { useState } from "react";
import { ConnectView } from "./components/ConnectView";
import { SessionView } from "./components/SessionView";
import { SetupScreen } from "./components/SetupScreen";
import { clearSignalingUrl, getSignalingUrl } from "./config";
import type { PeerClient } from "./webrtc/client";

type AppState =
  | { kind: "setup" }
  | { kind: "connect"; signalingUrl: string }
  | { kind: "session"; client: PeerClient };

export default function App() {
  const [state, setState] = useState<AppState>(() => {
    const url = getSignalingUrl();
    return url ? { kind: "connect", signalingUrl: url } : { kind: "setup" };
  });

  if (state.kind === "setup") {
    return (
      <SetupScreen onSaved={(url) => setState({ kind: "connect", signalingUrl: url })} />
    );
  }

  if (state.kind === "session") {
    return (
      <SessionView
        client={state.client}
        onExit={() => {
          const url = getSignalingUrl();
          setState(url ? { kind: "connect", signalingUrl: url } : { kind: "setup" });
        }}
      />
    );
  }

  return (
    <ConnectView
      signalingUrl={state.signalingUrl}
      onConnected={(client) => setState({ kind: "session", client })}
      onOpenSettings={() => {
        clearSignalingUrl();
        setState({ kind: "setup" });
      }}
    />
  );
}
