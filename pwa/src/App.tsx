import { useState } from "react";
import { ConnectView } from "./components/ConnectView";
import { SessionView } from "./components/SessionView";
import type { PeerClient } from "./webrtc/client";

type AppState =
  | { kind: "connect" }
  | { kind: "session"; client: PeerClient };

export default function App() {
  const [state, setState] = useState<AppState>({ kind: "connect" });

  if (state.kind === "session") {
    return (
      <SessionView
        client={state.client}
        onExit={() => setState({ kind: "connect" })}
      />
    );
  }

  return <ConnectView onConnected={(client) => setState({ kind: "session", client })} />;
}
