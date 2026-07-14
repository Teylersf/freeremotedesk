import { useState } from "react";
import type { InputEvent } from "../webrtc/input";
import { sendKeyPress } from "../webrtc/input";

type Props = {
  send: (msg: InputEvent) => void;
  onToggleKeyboard: () => void;
  keyboardOpen: boolean;
  onExit: () => void;
};

/**
 * Floating toolbar overlay on top of the remote video.
 *
 * On mobile this is the only way to send Ctrl/Alt/arrow keys and to open
 * the OS keyboard. Auto-hides after 3s of no interaction, taps show it again.
 */
export function SessionToolbar({ send, onToggleKeyboard, keyboardOpen, onExit }: Props) {
  const [stickyCtrl, setStickyCtrl] = useState(false);
  const [stickyAlt, setStickyAlt] = useState(false);
  const [stickyShift, setStickyShift] = useState(false);

  const modsMask = (stickyCtrl ? 2 : 0) | (stickyAlt ? 4 : 0) | (stickyShift ? 1 : 0);

  const key = (code: string) => {
    sendKeyPress(send, code, modsMask);
    // Sticky mods release after one use unless double-tapped (not implemented yet)
    setStickyCtrl(false);
    setStickyAlt(false);
    setStickyShift(false);
  };

  return (
    <div style={styles.bar} onClick={(e) => e.stopPropagation()}>
      <button
        style={{ ...styles.btn, ...(keyboardOpen ? styles.btnActive : {}) }}
        onClick={onToggleKeyboard}
        title="Show keyboard"
      >
        ⌨
      </button>
      <button
        style={{ ...styles.btn, ...(stickyCtrl ? styles.btnActive : {}) }}
        onClick={() => setStickyCtrl((v) => !v)}
        title="Ctrl"
      >
        Ctrl
      </button>
      <button
        style={{ ...styles.btn, ...(stickyAlt ? styles.btnActive : {}) }}
        onClick={() => setStickyAlt((v) => !v)}
        title="Alt"
      >
        Alt
      </button>
      <button
        style={{ ...styles.btn, ...(stickyShift ? styles.btnActive : {}) }}
        onClick={() => setStickyShift((v) => !v)}
        title="Shift"
      >
        ⇧
      </button>
      <button style={styles.btn} onClick={() => key("Tab")} title="Tab">
        ⇥
      </button>
      <button style={styles.btn} onClick={() => key("Escape")} title="Escape">
        Esc
      </button>
      <button style={styles.btn} onClick={() => key("ArrowLeft")} title="←">
        ←
      </button>
      <button style={styles.btn} onClick={() => key("ArrowUp")} title="↑">
        ↑
      </button>
      <button style={styles.btn} onClick={() => key("ArrowDown")} title="↓">
        ↓
      </button>
      <button style={styles.btn} onClick={() => key("ArrowRight")} title="→">
        →
      </button>
      <button
        style={styles.btn}
        onClick={() => {
          sendKeyPress(send, "Enter", 0);
        }}
        title="Enter"
      >
        ↵
      </button>
      <button style={{ ...styles.btn, ...styles.exit }} onClick={onExit} title="End session">
        ✕
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    position: "fixed",
    bottom: "env(safe-area-inset-bottom, 0.5rem)",
    left: "50%",
    transform: "translateX(-50%)",
    display: "flex",
    gap: "0.35rem",
    padding: "0.4rem 0.5rem",
    background: "rgba(23, 23, 23, 0.9)",
    backdropFilter: "blur(8px)",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: 10,
    fontFamily: "system-ui, sans-serif",
    fontSize: "0.85rem",
    color: "#f5f5f5",
    zIndex: 10,
    maxWidth: "calc(100vw - 1rem)",
    overflowX: "auto",
    WebkitOverflowScrolling: "touch",
  },
  btn: {
    background: "#2a2a2a",
    color: "#f5f5f5",
    border: "1px solid #3a3a3a",
    borderRadius: 6,
    padding: "0.4rem 0.7rem",
    minWidth: 34,
    fontSize: "0.85rem",
    cursor: "pointer",
    touchAction: "manipulation",
    flexShrink: 0,
  },
  btnActive: {
    background: "#4ade80",
    color: "#000",
    borderColor: "#4ade80",
  },
  exit: {
    background: "#7f1d1d",
    borderColor: "#7f1d1d",
    marginLeft: "0.3rem",
  },
};
