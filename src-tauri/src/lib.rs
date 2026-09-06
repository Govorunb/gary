#![allow(unused_imports)]
#![allow(dead_code)]

use tauri::Manager;
use tauri_plugin_log::{log::LevelFilter, RotationStrategy, Target, TargetKind};

mod api;
mod app;
use app::state::{App, AppStateMutex};
use app::commands::{is_server_running, server_state, start_server, stop_server, open_logs_folder, restart};
use api::server::{ws_accept, ws_deny, ws_send, ws_close};
use app::log::{gary_log, prepare_launch_log};
use app::safe_mode::{is_safe_mode, SafeMode};
use app::window_menu::show_window_menu;


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(
            tauri::plugin::Builder::<_, ()>::new("launch-log-rotation")
                .setup(|app, _| Ok(prepare_launch_log(app)?))
                .build(),
        )
        .setup(|app| {
            let window = app.get_webview_window("main").expect("main window is configured");
            #[cfg(target_os = "linux")]
            {
                use gtk::prelude::*;

                // GTK needs client-side decorations to draw a shadow. Keep its titlebar
                // hidden because the webview provides one, and configure it before showing.
                let gtk_window = window.gtk_window()?;
                let titlebar = gtk::Box::new(gtk::Orientation::Horizontal, 0);
                titlebar.set_no_show_all(true);
                gtk_window.set_titlebar(Some(&titlebar));
                gtk_window.set_decorated(true);
                window.set_background_color(Some(tauri::window::Color(0, 0, 0, 0)))?;
                let css = gtk::CssProvider::new();
                css.load_from_data(b"
                    window.gary { background-color: transparent; }
                    window.gary decoration { border-radius: 12px; }
                    window.gary.maximized decoration,
                    window.gary.fullscreen decoration { border-radius: 0; }
                ")?;
                gtk_window.style_context().add_class("gary");
                gtk::StyleContext::add_provider_for_screen(
                    &gtk::prelude::WidgetExt::screen(&gtk_window).expect("window has a screen"),
                    &css,
                    gtk::STYLE_PROVIDER_PRIORITY_APPLICATION,
                );
            }
            app.manage(SafeMode(app::safe_mode::requested()));
            app.manage(AppStateMutex::new(App::new(app.handle().clone())));
            app.handle().plugin(tauri_plugin_updater::Builder::new().build()).unwrap();
            window.show()?;
            Ok(())
        })
        .plugin(tauri_plugin_log::Builder::new()
            .rotation_strategy(RotationStrategy::KeepSome(5))
            .max_file_size(100_000_000)
            .level(LevelFilter::Trace)
            // filtering out tungstenite/other random rust libs that spam logs
            .filter(|md| ["gary", "webview", "tauri_plugin_"].iter().any(|t| md.target().starts_with(t)))
            .targets([
                Target::new(TargetKind::Stdout),
                Target::new(TargetKind::LogDir { file_name: None }),
            ])
            .build())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            is_server_running, server_state, start_server, stop_server,
            ws_accept, ws_deny, ws_send, ws_close,
            gary_log, open_logs_folder, restart, is_safe_mode, show_window_menu
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
