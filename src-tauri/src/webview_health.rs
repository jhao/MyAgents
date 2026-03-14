//! WebView health monitoring via frontend heartbeat.
//!
//! The frontend sends `invoke('webview_heartbeat')` every 10 seconds.
//! A background monitor checks if heartbeats are stale (>30s) and reloads
//! the WebView page when the content process has crashed (white screen).

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering::Relaxed};
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Manager, State};

/// Shared heartbeat timestamp — `Arc` allows sharing between Tauri managed state and the monitor.
pub struct WebviewHealthState {
    last_heartbeat: Arc<AtomicU64>,
}

impl WebviewHealthState {
    pub fn new() -> Self {
        Self {
            last_heartbeat: Arc::new(AtomicU64::new(0)),
        }
    }

    /// Get a clone of the heartbeat tracker for the background monitor.
    pub fn tracker(&self) -> Arc<AtomicU64> {
        self.last_heartbeat.clone()
    }
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

/// Called by the frontend every 10 seconds to signal the WebView is alive.
#[tauri::command]
pub fn webview_heartbeat(state: State<'_, WebviewHealthState>) {
    state.last_heartbeat.store(now_secs(), Relaxed);
}

/// Background monitor that detects stale heartbeats and reloads the WebView.
///
/// Follows the same pattern as `sidecar::monitor_global_sidecar`:
/// async loop + sleep + check + shutdown flag.
pub async fn monitor_webview_health(
    app_handle: AppHandle,
    heartbeat: Arc<AtomicU64>,
    shutdown: Arc<AtomicBool>,
) {
    const CHECK_INTERVAL_SECS: u64 = 10;
    const STALE_THRESHOLD_SECS: u64 = 30;
    const GRACE_PERIOD_SECS: u64 = 30;
    const MAX_RELOAD_ATTEMPTS: u32 = 3;

    let mut reload_count: u32 = 0;
    let mut consecutive_stale: u32 = 0;
    // Tracks the last time we triggered a reload (for post-reload grace period)
    let mut last_reload_time: u64 = now_secs(); // treat startup as a "reload"

    // Platform-specific app origin for navigate()
    let app_origin: &str = if cfg!(debug_assertions) {
        "http://localhost:5173"
    } else if cfg!(target_os = "windows") {
        "https://tauri.localhost"
    } else {
        "tauri://localhost"
    };

    log::info!("[webview-health] Monitor started (grace={}s, stale={}s, origin={})",
        GRACE_PERIOD_SECS, STALE_THRESHOLD_SECS, app_origin);

    loop {
        tokio::time::sleep(Duration::from_secs(CHECK_INTERVAL_SECS)).await;

        if shutdown.load(Relaxed) {
            log::info!("[webview-health] Monitor stopping (app shutdown)");
            break;
        }

        let last_hb = heartbeat.load(Relaxed);
        let now = now_secs();

        // Grace period after startup or reload — give the page time to boot
        if now.saturating_sub(last_reload_time) < GRACE_PERIOD_SECS {
            continue;
        }

        // Check if heartbeat is fresh
        if last_hb > 0 && now.saturating_sub(last_hb) <= STALE_THRESHOLD_SECS {
            // Heartbeat is fresh — reset counters
            if reload_count > 0 {
                log::info!("[webview-health] Heartbeat recovered after {} reload(s)", reload_count);
                reload_count = 0;
            }
            consecutive_stale = 0;
            continue;
        }

        // Heartbeat is stale — require 2+ consecutive stale checks before acting.
        // This prevents false positives after system suspend/resume:
        // the first check after wake sees a stale timestamp, but the frontend
        // timer fires within 10s, making the second check pass.
        consecutive_stale += 1;
        if consecutive_stale < 2 {
            continue;
        }

        // Check if window is visible (hidden-to-tray windows don't run JS)
        let window = match app_handle.get_webview_window("main") {
            Some(w) => w,
            None => continue,
        };

        let is_visible = window.is_visible().unwrap_or(false);
        if !is_visible {
            consecutive_stale = 0; // Reset — stale is expected when hidden
            continue;
        }

        // Stop retrying after too many failures
        if reload_count >= MAX_RELOAD_ATTEMPTS {
            log::error!(
                "[webview-health] Gave up after {} reload attempts — WebView may be permanently broken",
                MAX_RELOAD_ATTEMPTS
            );
            // Keep monitoring — if heartbeat recovers (user manually reloads), reset counter
            continue;
        }

        reload_count += 1;
        consecutive_stale = 0;
        log::warn!(
            "[webview-health] Heartbeat stale (last={}s ago), reloading WebView (attempt {}/{})",
            now.saturating_sub(last_hb),
            reload_count,
            MAX_RELOAD_ATTEMPTS,
        );

        if let Ok(url) = app_origin.parse() {
            let _ = window.navigate(url);
        }

        // Reset heartbeat + record reload time for grace period
        heartbeat.store(0, Relaxed);
        last_reload_time = now;
    }
}
