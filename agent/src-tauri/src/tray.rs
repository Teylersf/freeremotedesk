//! System tray icon and menu.
//!
//! Runs the agent as a background app: closing the window hides it (rather
//! than exiting), reachable from the tray. Right-click menu offers Show /
//! Start session / Quit.

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, WindowEvent,
};

pub fn install(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;

    let _tray = TrayIconBuilder::with_id("main")
        .icon(app.default_window_icon().cloned().expect("default icon"))
        .icon_as_template(false)
        .tooltip("FreeRemoteDesk")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_window(app),
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_window(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

fn show_window(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}

/// Hide instead of closing when the user hits the window's X button.
pub fn intercept_close(app: &AppHandle, event: &WindowEvent) {
    if let WindowEvent::CloseRequested { api, .. } = event {
        if let Some(win) = app.get_webview_window("main") {
            let _ = win.hide();
        }
        api.prevent_close();
    }
}
