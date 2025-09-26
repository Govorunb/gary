use log::{debug, info, warn};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::{sync::{Mutex, RwLock}, task::AbortHandle};

use crate::{api, app::state::{AppStateMutex, ServerHandle}};


#[tauri::command]
pub async fn is_server_running(state: State<'_, AppStateMutex>) -> Result<bool, ()> {
    let is_running = state.lock().await.is_server_running();
    debug!("WebView request: Server is {}running", if is_running {""} else {"not "});
    Ok(is_running)
}

#[tauri::command]
pub async fn start_server(app: AppHandle, port: u16) -> Result<(), String> {
    let state_mutex = app.state::<AppStateMutex>();
    let mut state = state_mutex.lock().await;
    if let Some(_) = state.server_handle {
        return Err(format!("Server already running"));
    }
    
    let abort_handle = tokio::spawn(api::server::create_server(app.clone(), port, false)).abort_handle();
    state.server_handle = Some(ServerHandle::new(abort_handle));
    info!("Server started on port {port}");
    let _ = app.emit("server-started", port);
    Ok(())
}

#[tauri::command]
pub async fn stop_server(app: AppHandle) -> Result<(), String> {
    let state_mutex = app.state::<AppStateMutex>();
    let mut state = state_mutex.lock().await;
    if state.stop_server().is_ok() {
        info!("Server stopped");
        let _ = app.emit("server-stopped", ());
        Ok(())
    } else {
        Err("Server not running".to_string())
    }
}


// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}
