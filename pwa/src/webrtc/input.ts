/**
 * Input capture — mouse, keyboard, wheel, touch — serialized as JSON events
 * over the "input" DataChannel to the host agent.
 *
 * Two modes:
 *  - Desktop: absolute mouse coords (normalized 0..1 over the video area),
 *    real keyboard events, wheel events, right-click on secondary button.
 *  - Mobile:  trackpad-style — single-finger drag sends relative deltas so
 *    the cursor moves like a laptop trackpad. Tap = click, two-finger tap =
 *    right-click, two-finger drag = scroll, long-press = drag (mouse down).
 *    On-screen keyboard opens via a hidden textarea that Toolbar toggles.
 */

export type InputEvent =
  | { t: "m"; x: number; y: number }              // absolute mouse move (normalized 0..1)
  | { t: "mr"; dx: number; dy: number }           // relative mouse move (raw pixels)
  | { t: "mb"; b: 0 | 1 | 2; d: boolean }         // mouse button down/up
  | { t: "w"; dx: number; dy: number }            // wheel (pixels)
  | { t: "k"; code: string; d: boolean; mods: number }  // keyboard event
  | { t: "tap"; x: number; y: number };           // legacy — kept for compat

const MOD_SHIFT = 1;
const MOD_CTRL = 2;
const MOD_ALT = 4;
const MOD_META = 8;

function modsOf(e: KeyboardEvent | MouseEvent): number {
  return (
    (e.shiftKey ? MOD_SHIFT : 0) |
    (e.ctrlKey ? MOD_CTRL : 0) |
    (e.altKey ? MOD_ALT : 0) |
    (e.metaKey ? MOD_META : 0)
  );
}

function normalizeMouse(e: MouseEvent, target: HTMLElement): { x: number; y: number } {
  const rect = target.getBoundingClientRect();
  const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
  return { x, y };
}

// ---------- Desktop (mouse + real keyboard) ----------

export function attachDesktopInput(
  el: HTMLElement,
  send: (msg: InputEvent) => void,
): () => void {
  const onMouseMove = (e: MouseEvent) => {
    const { x, y } = normalizeMouse(e, el);
    send({ t: "m", x, y });
  };
  const onMouseDown = (e: MouseEvent) => {
    const { x, y } = normalizeMouse(e, el);
    send({ t: "m", x, y });
    send({ t: "mb", b: btnCode(e.button), d: true });
    e.preventDefault();
  };
  const onMouseUp = (e: MouseEvent) => {
    send({ t: "mb", b: btnCode(e.button), d: false });
    e.preventDefault();
  };
  const onWheel = (e: WheelEvent) => {
    send({ t: "w", dx: e.deltaX, dy: e.deltaY });
    e.preventDefault();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && e.ctrlKey) return;      // reserved: exit session
    send({ t: "k", code: e.code, d: true, mods: modsOf(e) });
    e.preventDefault();
  };
  const onKeyUp = (e: KeyboardEvent) => {
    send({ t: "k", code: e.code, d: false, mods: modsOf(e) });
    e.preventDefault();
  };
  const onContextMenu = (e: MouseEvent) => e.preventDefault();

  el.addEventListener("mousemove", onMouseMove);
  el.addEventListener("mousedown", onMouseDown);
  el.addEventListener("mouseup", onMouseUp);
  el.addEventListener("wheel", onWheel, { passive: false });
  el.addEventListener("contextmenu", onContextMenu);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  return () => {
    el.removeEventListener("mousemove", onMouseMove);
    el.removeEventListener("mousedown", onMouseDown);
    el.removeEventListener("mouseup", onMouseUp);
    el.removeEventListener("wheel", onWheel);
    el.removeEventListener("contextmenu", onContextMenu);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
  };
}

// ---------- Mobile (touch as trackpad) ----------

const TAP_MAX_MOVE_PX = 8;
const TAP_MAX_MS = 250;
const LONG_PRESS_MS = 500;
const TRACKPAD_SENSITIVITY = 2.0;   // multiplier on raw touch delta

type TouchState = {
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  startedAt: number;
  moved: boolean;
  fingers: number;
  longPressTimer: number | null;
  dragging: boolean;      // true after long-press or two-finger drag started
};

export function attachTouchTrackpad(
  el: HTMLElement,
  send: (msg: InputEvent) => void,
): () => void {
  let state: TouchState | null = null;

  const onTouchStart = (e: TouchEvent) => {
    if (e.touches.length === 0) return;
    e.preventDefault();
    const t0 = e.touches[0]!;
    state = {
      startX: t0.clientX,
      startY: t0.clientY,
      lastX: t0.clientX,
      lastY: t0.clientY,
      startedAt: performance.now(),
      moved: false,
      fingers: e.touches.length,
      longPressTimer: null,
      dragging: false,
    };
    // Long-press → mouse down (start a drag)
    state.longPressTimer = window.setTimeout(() => {
      if (state && !state.moved) {
        send({ t: "mb", b: 0, d: true });
        state.dragging = true;
      }
    }, LONG_PRESS_MS);
  };

  const onTouchMove = (e: TouchEvent) => {
    if (!state || e.touches.length === 0) return;
    e.preventDefault();
    const t0 = e.touches[0]!;
    const dx = t0.clientX - state.lastX;
    const dy = t0.clientY - state.lastY;
    state.lastX = t0.clientX;
    state.lastY = t0.clientY;

    const totalMove = Math.hypot(t0.clientX - state.startX, t0.clientY - state.startY);
    if (totalMove > TAP_MAX_MOVE_PX) {
      state.moved = true;
      if (state.longPressTimer !== null) {
        clearTimeout(state.longPressTimer);
        state.longPressTimer = null;
      }
    }

    if (e.touches.length >= 2) {
      // Two-finger drag = wheel scroll (invert Y so it feels like natural scroll)
      send({ t: "w", dx: -dx * 2, dy: -dy * 2 });
    } else {
      // Single-finger drag = trackpad move (relative pixels, scaled)
      send({ t: "mr", dx: dx * TRACKPAD_SENSITIVITY, dy: dy * TRACKPAD_SENSITIVITY });
    }
  };

  const onTouchEnd = (e: TouchEvent) => {
    if (!state) return;
    e.preventDefault();

    if (state.longPressTimer !== null) {
      clearTimeout(state.longPressTimer);
      state.longPressTimer = null;
    }

    const duration = performance.now() - state.startedAt;

    if (state.dragging) {
      // End of long-press drag → release the button
      send({ t: "mb", b: 0, d: false });
    } else if (!state.moved && duration < TAP_MAX_MS) {
      // Quick tap: left-click (1 finger) or right-click (2 fingers)
      const button: 0 | 1 | 2 = state.fingers >= 2 ? 2 : 0;
      send({ t: "mb", b: button, d: true });
      send({ t: "mb", b: button, d: false });
    }

    state = null;
  };

  const onTouchCancel = () => {
    if (state?.longPressTimer !== null && state) {
      clearTimeout(state.longPressTimer);
    }
    if (state?.dragging) {
      send({ t: "mb", b: 0, d: false });
    }
    state = null;
  };

  const onContextMenu = (e: Event) => e.preventDefault();

  el.addEventListener("touchstart", onTouchStart, { passive: false });
  el.addEventListener("touchmove", onTouchMove, { passive: false });
  el.addEventListener("touchend", onTouchEnd, { passive: false });
  el.addEventListener("touchcancel", onTouchCancel, { passive: false });
  el.addEventListener("contextmenu", onContextMenu);

  return () => {
    el.removeEventListener("touchstart", onTouchStart);
    el.removeEventListener("touchmove", onTouchMove);
    el.removeEventListener("touchend", onTouchEnd);
    el.removeEventListener("touchcancel", onTouchCancel);
    el.removeEventListener("contextmenu", onContextMenu);
  };
}

// ---------- Mobile keyboard (hidden input trick) ----------

/**
 * Attach a hidden textarea so mobile browsers show their on-screen keyboard
 * when we call .focus() on it. Text input becomes a stream of key events.
 *
 * Returns { input, focus, blur, dispose }. The Toolbar calls `focus()` to
 * pop the keyboard, `blur()` to hide it.
 */
export function attachHiddenKeyboard(
  container: HTMLElement,
  send: (msg: InputEvent) => void,
): { focus: () => void; blur: () => void; dispose: () => void } {
  const ta = document.createElement("textarea");
  ta.autocapitalize = "off";
  ta.autocomplete = "off";
  ta.spellcheck = false;
  ta.setAttribute("autocorrect", "off");
  ta.style.position = "fixed";
  ta.style.top = "-9999px";
  ta.style.left = "-9999px";
  ta.style.width = "1px";
  ta.style.height = "1px";
  ta.style.opacity = "0";
  ta.style.pointerEvents = "none";
  ta.setAttribute("aria-hidden", "true");
  container.appendChild(ta);

  let lastValue = "";

  const flushDiff = () => {
    const now = ta.value;
    if (now === lastValue) return;

    // Case 1: backspace(s) — content got shorter
    if (now.length < lastValue.length) {
      const removed = lastValue.length - now.length;
      for (let i = 0; i < removed; i++) {
        send({ t: "k", code: "Backspace", d: true, mods: 0 });
        send({ t: "k", code: "Backspace", d: false, mods: 0 });
      }
    } else {
      // Case 2: characters added — send each new char as a key event
      const added = now.slice(lastValue.length);
      for (const ch of added) {
        if (ch === "\n") {
          send({ t: "k", code: "Enter", d: true, mods: 0 });
          send({ t: "k", code: "Enter", d: false, mods: 0 });
        } else {
          // Encode char as a special "Char:X" code the host recognizes.
          send({ t: "k", code: `Char:${ch}`, d: true, mods: 0 });
          send({ t: "k", code: `Char:${ch}`, d: false, mods: 0 });
        }
      }
    }
    lastValue = now;
  };

  const onInput = () => flushDiff();

  const onKeyDown = (e: KeyboardEvent) => {
    // Explicit key handling for anything that isn't a printable char.
    // Non-printable keys don't change value, so we catch them here.
    if (
      e.key === "Enter" ||
      e.key === "Backspace" ||
      e.key === "Tab" ||
      e.key.startsWith("Arrow")
    ) {
      // Let the value-diff logic handle Enter/Backspace (they change value);
      // Tab and Arrows we send explicitly.
      if (e.key === "Tab" || e.key.startsWith("Arrow")) {
        e.preventDefault();
        send({ t: "k", code: e.code || e.key, d: true, mods: modsOf(e) });
        send({ t: "k", code: e.code || e.key, d: false, mods: modsOf(e) });
      }
    }
  };

  ta.addEventListener("input", onInput);
  ta.addEventListener("keydown", onKeyDown);

  return {
    focus: () => {
      // Keep value non-empty so backspace works even when the "field" is empty
      ta.value = " ";
      lastValue = " ";
      ta.focus();
      // Move cursor to end
      ta.setSelectionRange(ta.value.length, ta.value.length);
    },
    blur: () => ta.blur(),
    dispose: () => {
      ta.removeEventListener("input", onInput);
      ta.removeEventListener("keydown", onKeyDown);
      ta.remove();
    },
  };
}

// ---------- Environment detection ----------

export function isTouchPrimary(): boolean {
  // Coarse pointer OR touch-only device.
  return (
    typeof window !== "undefined" &&
    (window.matchMedia?.("(pointer: coarse)").matches ?? false)
  );
}

function btnCode(button: number): 0 | 1 | 2 {
  return (button === 0 ? 0 : button === 1 ? 1 : 2) as 0 | 1 | 2;
}

// Convenience — synthesize a single key press (for the modifier toolbar buttons).
export function sendKeyPress(
  send: (msg: InputEvent) => void,
  code: string,
  mods = 0,
) {
  send({ t: "k", code, d: true, mods });
  send({ t: "k", code, d: false, mods });
}
