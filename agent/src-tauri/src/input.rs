//! OS-level input injection.
//!
//! Receives normalized input events from the WebView (which received them
//! from the remote PWA client over the WebRTC DataChannel) and dispatches
//! them via `enigo` on Windows / macOS / Linux.

use enigo::{Axis, Button, Coordinate, Direction, Enigo, Key, Keyboard, Mouse, Settings};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;

static ENIGO: Mutex<Option<Enigo>> = Mutex::new(None);

fn with_enigo<F, R>(f: F) -> Result<R, String>
where
    F: FnOnce(&mut Enigo) -> Result<R, enigo::InputError>,
{
    let mut guard = ENIGO.lock().map_err(|e| format!("enigo lock: {e}"))?;
    if guard.is_none() {
        *guard = Some(Enigo::new(&Settings::default()).map_err(|e| format!("enigo init: {e}"))?);
    }
    let enigo = guard.as_mut().expect("just initialized");
    f(enigo).map_err(|e| format!("enigo: {e}"))
}

fn screen_size() -> Result<(i32, i32), String> {
    let enigo = Enigo::new(&Settings::default()).map_err(|e| format!("enigo init: {e}"))?;
    enigo
        .main_display()
        .map_err(|e| format!("main_display: {e}"))
}

/// Client-side input event. Fields mirror the DataChannel wire format used
/// by both the PWA and the agent webview.
#[derive(Debug, Deserialize, Serialize)]
#[serde(tag = "t")]
pub enum InputPayload {
    /// Absolute mouse move (normalized [0, 1]).
    #[serde(rename = "m")]
    Move { x: f64, y: f64 },
    /// Relative mouse move (raw pixels — mobile trackpad).
    #[serde(rename = "mr")]
    MoveRel { dx: f64, dy: f64 },
    /// Mouse button. `b`: 0=left, 1=middle, 2=right. `d`: true=down, false=up.
    #[serde(rename = "mb")]
    Button { b: u8, d: bool },
    /// Scroll wheel (raw pixel deltas from browser wheel event).
    #[serde(rename = "w")]
    Wheel { dx: f64, dy: f64 },
    /// Keyboard event. `code` is a `KeyboardEvent.code` string, or
    /// `Char:<c>` for an arbitrary character from mobile text input.
    #[serde(rename = "k")]
    Key { code: String, d: bool, mods: u8 },
    /// Touch tap (legacy — kept for older client versions).
    #[serde(rename = "tap")]
    Tap { x: f64, y: f64 },
}

#[tauri::command]
pub fn inject_input(event: InputPayload) -> Result<(), String> {
    match event {
        InputPayload::Move { x, y } => {
            let (w, h) = screen_size()?;
            let px = (x.clamp(0.0, 1.0) * w as f64) as i32;
            let py = (y.clamp(0.0, 1.0) * h as f64) as i32;
            with_enigo(|e| e.move_mouse(px, py, Coordinate::Abs))?;
        }
        InputPayload::MoveRel { dx, dy } => {
            with_enigo(|e| e.move_mouse(dx.round() as i32, dy.round() as i32, Coordinate::Rel))?;
        }
        InputPayload::Button { b, d } => {
            let button = match b {
                0 => Button::Left,
                1 => Button::Middle,
                _ => Button::Right,
            };
            let dir = if d { Direction::Press } else { Direction::Release };
            with_enigo(|e| e.button(button, dir))?;
        }
        InputPayload::Wheel { dx, dy } => {
            if dy != 0.0 {
                let ticks = (dy / 120.0).round() as i32;
                if ticks != 0 {
                    with_enigo(|e| e.scroll(-ticks, Axis::Vertical))?;
                } else if dy.abs() >= 1.0 {
                    // Small deltas (touch trackpad two-finger drag) still need to scroll.
                    let sign = if dy > 0.0 { -1 } else { 1 };
                    with_enigo(|e| e.scroll(sign, Axis::Vertical))?;
                }
            }
            if dx != 0.0 {
                let ticks = (dx / 120.0).round() as i32;
                if ticks != 0 {
                    with_enigo(|e| e.scroll(ticks, Axis::Horizontal))?;
                } else if dx.abs() >= 1.0 {
                    let sign = if dx > 0.0 { 1 } else { -1 };
                    with_enigo(|e| e.scroll(sign, Axis::Horizontal))?;
                }
            }
        }
        InputPayload::Key { code, d, mods: _ } => {
            let key = map_code(&code);
            let dir = if d { Direction::Press } else { Direction::Release };
            with_enigo(|e| e.key(key, dir))?;
        }
        InputPayload::Tap { x, y } => {
            let (w, h) = screen_size()?;
            let px = (x.clamp(0.0, 1.0) * w as f64) as i32;
            let py = (y.clamp(0.0, 1.0) * h as f64) as i32;
            with_enigo(|e| e.move_mouse(px, py, Coordinate::Abs))?;
            with_enigo(|e| e.button(Button::Left, Direction::Click))?;
        }
    }
    Ok(())
}

/// Map a subset of `KeyboardEvent.code` strings to enigo `Key`s.
///
/// Also handles `Char:<c>` codes emitted by the mobile hidden-keyboard flow,
/// where we can't rely on `code` (mobile IMEs don't fire real key events for
/// composed characters) — we send raw character values instead.
fn map_code(code: &str) -> Key {
    // Mobile IME character stream.
    if let Some(rest) = code.strip_prefix("Char:") {
        if let Some(ch) = rest.chars().next() {
            return Key::Unicode(ch);
        }
        return Key::Unicode(' ');
    }

    match code {
        "Enter" | "NumpadEnter" => Key::Return,
        "Backspace" => Key::Backspace,
        "Tab" => Key::Tab,
        "Space" => Key::Space,
        "Escape" => Key::Escape,
        "Delete" => Key::Delete,
        "ArrowUp" => Key::UpArrow,
        "ArrowDown" => Key::DownArrow,
        "ArrowLeft" => Key::LeftArrow,
        "ArrowRight" => Key::RightArrow,
        "Home" => Key::Home,
        "End" => Key::End,
        "PageUp" => Key::PageUp,
        "PageDown" => Key::PageDown,
        "ShiftLeft" | "ShiftRight" => Key::Shift,
        "ControlLeft" | "ControlRight" => Key::Control,
        "AltLeft" | "AltRight" => Key::Alt,
        "MetaLeft" | "MetaRight" => Key::Meta,
        "CapsLock" => Key::CapsLock,
        c if c.starts_with("F") && c[1..].parse::<u8>().is_ok() => {
            match c[1..].parse::<u8>().unwrap_or(1) {
                1 => Key::F1, 2 => Key::F2, 3 => Key::F3, 4 => Key::F4,
                5 => Key::F5, 6 => Key::F6, 7 => Key::F7, 8 => Key::F8,
                9 => Key::F9, 10 => Key::F10, 11 => Key::F11, 12 => Key::F12,
                _ => Key::F1,
            }
        }
        c if c.starts_with("Key") && c.len() == 4 => {
            let ch = c.chars().nth(3).unwrap_or('a').to_ascii_lowercase();
            Key::Unicode(ch)
        }
        c if c.starts_with("Digit") && c.len() == 6 => {
            let ch = c.chars().nth(5).unwrap_or('0');
            Key::Unicode(ch)
        }
        _ => Key::Unicode(' '),
    }
}
