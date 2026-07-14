//! FreeRemoteDesk host agent — library crate.
//!
//! Splits into a `lib` so both the desktop binary (`main.rs`) and future
//! mobile targets (Android via `tauri-android`) can share the runtime.

mod config;
mod input;
mod pairing;

/// Entry point wired up by both `main.rs` and mobile shims.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|_app| {
            #[cfg(desktop)]
            {
                // System-tray setup will go here in Phase 4.
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            pairing::request_pairing_code,
            input::inject_input,
            config::get_config,
            config::set_config,
        ])
        .run(tauri::generate_context!())
        .expect("failed to launch FreeRemoteDesk agent");
}
