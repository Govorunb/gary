use std::path::PathBuf;

use log::{debug, info};
use tauri::{AppHandle, Emitter, Manager, State};
use anyhow::Result;
use uuid::Uuid;
use tauri_plugin_opener::OpenerExt;

use crate::app::state::{AppStateMutex};


#[tauri::command]
pub async fn is_server_running(app: AppHandle) -> Result<bool, ()> {
    let state_mutex = app.state::<AppStateMutex>();
    let state = state_mutex.lock().await;
    let is_running = state.is_server_running();
    debug!("WebView request: Server is {}running", if is_running {""} else {"not "});
    Ok(is_running)
}

#[tauri::command]
pub async fn server_state(app: AppHandle) -> Option<Vec<Uuid>> {
    info!("WebView requested server state");
    let state_mutex = app.state::<AppStateMutex>();
    let state = state_mutex.lock().await;
    state.server.as_ref().map(|s| s.connections())
}

#[tauri::command]
pub async fn start_server(app: AppHandle, port: u16) -> Result<(), String> {
    info!("WebView requested to start server");
    let state_mutex = app.state::<AppStateMutex>();
    let mut state = state_mutex.lock().await;
    if state.is_server_running() {
        return Err("Server already running".into());
    }
    
    state.start_server(port).await?;
    info!("Server started on port {port}");
    let _ = app.emit("server-started", port);
    Ok(())
}

#[tauri::command]
pub async fn stop_server(app: AppHandle) -> Result<(), String> {
    info!("WebView requested to stop server");
    let state_mutex = app.state::<AppStateMutex>();
    let mut state = state_mutex.lock().await;
    if state.stop_server().await.is_ok() {
        info!("Server stopped");
        let _ = app.emit("server-stopped", ());
        Ok(())
    } else {
        Err("Server not running".to_string())
    }
}

#[tauri::command]
pub fn open_logs_folder(app: AppHandle) -> Result<(), String> {
    let path: PathBuf = app.path().app_log_dir()
        .map_err(|e| e.to_string())?;
    app.opener()
        .open_path(path.to_str().unwrap(), None::<&str>)
        .map_err(|e| e.to_string())
}
