/**
 * Input capture — mouse, keyboard, wheel, touch — serialized as JSON events
 * over the "input" DataChannel to the host agent.
 *
 * Coordinates are normalized to [0, 1] × [0, 1] over the video element's
 * displayed area so the host can map to its screen resolution without
 * knowing the client's viewport.
 */

export type InputEvent =
  | { t: "m"; x: number; y: number }
  | { t: "mb"; b: 0 | 1 | 2; d: boolean }
  | { t: "w"; dx: number; dy: number }
  | { t: "k"; code: string; d: boolean; mods: number }
  | { t: "tap"; x: number; y: number };

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

function normalize(e: MouseEvent | TouchEvent, target: HTMLElement): { x: number; y: number } {
  const rect = target.getBoundingClientRect();
  const clientX = "touches" in e ? (e.touches[0]?.clientX ?? 0) : e.clientX;
  const clientY = "touches" in e ? (e.touches[0]?.clientY ?? 0) : e.clientY;
  const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
  return { x, y };
}

export function attachInput(
  el: HTMLElement,
  send: (msg: InputEvent) => void,
  opts: { captureKeyboard?: boolean } = {},
): () => void {
  const onMouseMove = (e: MouseEvent) => {
    const { x, y } = normalize(e, el);
    send({ t: "m", x, y });
  };
  const onMouseDown = (e: MouseEvent) => {
    const { x, y } = normalize(e, el);
    send({ t: "m", x, y });
    send({ t: "mb", b: (e.button === 0 ? 0 : e.button === 1 ? 1 : 2) as 0 | 1 | 2, d: true });
    e.preventDefault();
  };
  const onMouseUp = (e: MouseEvent) => {
    send({ t: "mb", b: (e.button === 0 ? 0 : e.button === 1 ? 1 : 2) as 0 | 1 | 2, d: false });
    e.preventDefault();
  };
  const onWheel = (e: WheelEvent) => {
    send({ t: "w", dx: e.deltaX, dy: e.deltaY });
    e.preventDefault();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && e.ctrlKey) return; // reserved: exit session
    send({ t: "k", code: e.code, d: true, mods: modsOf(e) });
    e.preventDefault();
  };
  const onKeyUp = (e: KeyboardEvent) => {
    send({ t: "k", code: e.code, d: false, mods: modsOf(e) });
    e.preventDefault();
  };
  const onContextMenu = (e: MouseEvent) => e.preventDefault();
  const onTouchStart = (e: TouchEvent) => {
    const { x, y } = normalize(e, el);
    send({ t: "tap", x, y });
  };

  el.addEventListener("mousemove", onMouseMove);
  el.addEventListener("mousedown", onMouseDown);
  el.addEventListener("mouseup", onMouseUp);
  el.addEventListener("wheel", onWheel, { passive: false });
  el.addEventListener("contextmenu", onContextMenu);
  el.addEventListener("touchstart", onTouchStart, { passive: true });
  if (opts.captureKeyboard) {
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
  }

  return () => {
    el.removeEventListener("mousemove", onMouseMove);
    el.removeEventListener("mousedown", onMouseDown);
    el.removeEventListener("mouseup", onMouseUp);
    el.removeEventListener("wheel", onWheel);
    el.removeEventListener("contextmenu", onContextMenu);
    el.removeEventListener("touchstart", onTouchStart);
    if (opts.captureKeyboard) {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    }
  };
}
