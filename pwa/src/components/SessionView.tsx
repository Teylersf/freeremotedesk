import { useEffect, useRef, useState } from "react";
import type { PeerClient } from "../webrtc/client";
import { attachInput } from "../webrtc/input";

type Props = { client: PeerClient; onExit: () => void };

/**
 * Full-screen remote-desktop viewport.
 *
 * Attaches the host's video track to a <video> element and forwards
 * pointer/keyboard events over the "input" DataChannel.
 */
export function SessionView({ client, onExit }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const inputChannelRef = useRef<RTCDataChannel | null>(null);
  const [state, setState] = useState<string>("connecting");

  useEffect(() => {
    client.on("onTrack", (stream) => {
      const v = videoRef.current;
      if (v) v.srcObject = stream;
    });
    client.on("onDataChannel", (label, channel) => {
      if (label === "input") inputChannelRef.current = channel;
    });
    client.on("onStateChange", (s) => setState(s));
    client.on("onClose", () => onExit());

    return () => {
      client.close();
    };
  }, [client, onExit]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    return attachInput(
      v,
      (msg) => {
        const ch = inputChannelRef.current;
        if (ch && ch.readyState === "open") ch.send(JSON.stringify(msg));
      },
      { captureKeyboard: true },
    );
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && e.ctrlKey) {
        e.preventDefault();
        onExit();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onExit]);

  return (
    <>
      <video ref={videoRef} className="remote-canvas" autoPlay playsInline muted={false} />
      {state !== "connected" && state !== "completed" && (
        <div
          style={{
            position: "fixed",
            top: 8,
            left: 8,
            padding: "4px 8px",
            background: "rgba(0,0,0,0.6)",
            color: "#fff",
            borderRadius: 4,
            fontSize: 12,
            fontFamily: "ui-monospace, monospace",
          }}
        >
          {state} (ctrl+esc to exit)
        </div>
      )}
    </>
  );
}
