//! Agent runtime configuration.
//!
//! FreeRemoteDesk is BYO-infrastructure: each user deploys their own
//! signaling Worker (on their Cloudflare account) and their own PWA
//! (on their Vercel account). The agent needs to know the URL of the
//! signaling Worker to talk to.
//!
//! Config is stored as JSON in the OS-standard app-config directory:
//!   Windows: %APPDATA%\FreeRemoteDesk\config.json
//!   macOS:   ~/Library/Application Support/FreeRemoteDesk/config.json
//!   Linux:   ~/.config/FreeRemoteDesk/config.json
//!
//! First-run: no config → agent shows the setup wizard in the WebView.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const CONFIG_FILENAME: &str = "config.json";

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AgentConfig {
    /// Full URL of the user's signaling Worker (e.g. `wss://freeremotedesk-signaling.someuser.workers.dev`).
    /// `None` means the agent has never been configured — trigger setup wizard.
    pub signaling_url: Option<String>,

    /// URL of the user's PWA deployment (e.g. `https://myremotedesk.vercel.app`).
    /// Shown as a hint to the user ("Type your pairing code at: ...").
    pub pwa_url: Option<String>,

    /// Persistent per-install identifier. Regenerated only on user request.
    /// Used as the WebAuthn user handle when we get to Phase 3.
    pub agent_id: String,
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("app_config_dir: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("create config dir: {e}"))?;
    Ok(dir.join(CONFIG_FILENAME))
}

fn load_from_disk(path: &PathBuf) -> AgentConfig {
    fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str::<AgentConfig>(&s).ok())
        .unwrap_or_default()
}

fn ensure_agent_id(cfg: &mut AgentConfig) {
    if cfg.agent_id.is_empty() {
        cfg.agent_id = format!("agent_{}", uuid_hex());
    }
}

/// 32-char hex identifier from OS RNG. Wraps `getrandom` behind a small helper
/// so callers don't need to depend on the crate directly.
fn uuid_hex() -> String {
    let mut buf = [0u8; 16];
    getrandom::getrandom(&mut buf).expect("OS RNG failed");
    buf.iter().map(|b| format!("{:02x}", b)).collect()
}

fn save(path: &PathBuf, cfg: &AgentConfig) -> Result<(), String> {
    let json = serde_json::to_string_pretty(cfg).map_err(|e| format!("serialize: {e}"))?;
    fs::write(path, json).map_err(|e| format!("write config: {e}"))
}

#[tauri::command]
pub fn get_config(app: AppHandle) -> Result<AgentConfig, String> {
    let path = config_path(&app)?;
    let mut cfg = load_from_disk(&path);
    let originally_had_id = !cfg.agent_id.is_empty();
    ensure_agent_id(&mut cfg);
    // Persist the freshly-minted agent_id on first launch.
    if !originally_had_id {
        save(&path, &cfg)?;
    }
    Ok(cfg)
}

#[tauri::command]
pub fn set_config(app: AppHandle, config: AgentConfig) -> Result<AgentConfig, String> {
    let path = config_path(&app)?;
    let mut cfg = config;
    ensure_agent_id(&mut cfg);
    // Normalize URL inputs: trim, strip trailing slash.
    if let Some(url) = cfg.signaling_url.as_mut() {
        *url = url.trim().trim_end_matches('/').to_string();
        if url.is_empty() {
            cfg.signaling_url = None;
        }
    }
    if let Some(url) = cfg.pwa_url.as_mut() {
        *url = url.trim().trim_end_matches('/').to_string();
        if url.is_empty() {
            cfg.pwa_url = None;
        }
    }
    save(&path, &cfg)?;
    Ok(cfg)
}
