#![feature(if_let_guard)]

use tauri::Manager;
use tauri_plugin_log::{log::LevelFilter, RotationStrategy, Target, TargetKind};

mod api;
mod app;
use app::state::App;
use app::commands::*;
use tokio::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            app.manage(Mutex::new(App::new(app.handle().clone())));
            Ok(())
        })
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_log::Builder::new()
            .rotation_strategy(RotationStrategy::KeepSome(5))
            .level(LevelFilter::Trace)
            .target(Target::new(TargetKind::LogDir { file_name: Some("ws".to_owned()) })
                .filter(|md| md.target() == "ws"))
            .build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_websocket::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            is_server_running, start_server, stop_server,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
