//! FreeRemoteDesk host agent — library crate.

mod config;
mod input;
mod pairing;
mod tray;

use tauri::Manager;
use tauri_plugin_autostart::MacosLauncher;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .setup(|app| {
            #[cfg(desktop)]
            {
                tray::install(&app.handle())?;

                let args: Vec<String> = std::env::args().collect();
                if args.iter().any(|a| a == "--minimized") {
                    if let Some(win) = app.get_webview_window("main") {
                        let _ = win.hide();
                    }
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            tray::intercept_close(&window.app_handle(), event);
        })
        .invoke_handler(tauri::generate_handler![
            pairing::request_pairing_code,
            input::inject_input,
            config::get_config,
            config::set_config,
            config::list_trusted_clients,
            config::store_trusted_client,
            config::verify_trusted_client,
            config::revoke_trusted_client,
            focus_window,
        ])
        .run(tauri::generate_context!())
        .expect("failed to launch FreeRemoteDesk agent");
}

/// Bring the main window to the front + unhide + focus.
/// Used when a trusted client is trying to reconnect and we need the user
/// to grant screen capture permission (a user gesture on the click).
#[tauri::command]
fn focus_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
        let _ = win.set_always_on_top(true);
        let _ = win.set_always_on_top(false);
    }
    Ok(())
}
