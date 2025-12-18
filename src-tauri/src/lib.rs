#![feature(if_let_guard)]
#![allow(unused_imports)]
#![allow(dead_code)]

use tauri::Manager;
use tauri_plugin_log::{log::LevelFilter, RotationStrategy, Target, TargetKind};

mod api;
mod app;
use app::state::App;
use app::commands::{is_server_running, server_state, start_server, stop_server};
use api::server::{ws_accept, ws_deny, ws_send, ws_close};
use crate::app::log::gary_log;

use crate::app::state::AppStateMutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            app.manage(AppStateMutex::new(App::new(app.handle().clone())));
            app.handle().plugin(tauri_plugin_updater::Builder::new().build()).unwrap();
            Ok(())
        })
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_log::Builder::new()
            .rotation_strategy(RotationStrategy::KeepSome(5))
            .level(LevelFilter::Trace)
            .target(Target::new(TargetKind::LogDir { file_name: Some("tauri".to_owned()) })
                .filter(|md| md.target().starts_with("gary_tauri::")
                    || md.target().contains("tungstenite")))
            .build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_websocket::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            is_server_running, server_state, start_server, stop_server,
            ws_accept, ws_deny, ws_send, ws_close,
            gary_log,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
