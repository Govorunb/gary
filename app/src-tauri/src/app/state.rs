use tauri::{AppHandle, Listener};
use tokio::sync::{Mutex, RwLock};

use crate::api::{server::WSServer};

pub struct App {
    app_handle: AppHandle,
    pub server: Option<WSServer>,
}

pub type AppStateMutex = Mutex<App>;

impl App {
    pub fn new(app_handle: AppHandle) -> Self {
        Self {
            app_handle,
            server: None,
        }
    }

    pub fn is_server_running(&self) -> bool {
        self.server.is_some()
    }

    pub async fn start_server(&mut self, port: u16) -> Result<(), String> {
        if self.server.is_some() {
            return Err("Server already running".into())
        }
        self.server = Some(crate::api::server::create_server(
            self.app_handle.clone(), port
        ).await.map_err(|e| e.to_string())?);
        Ok(())
    }

    pub async fn stop_server(&mut self) -> Result<(), ()> {
        let server_opt = self.server.take();
        if let Some(server) = server_opt {
            server.stop().await;
            self.server = None;
            Ok(())
        } else {
            Err(())
        }
    }

    pub fn server(&self) -> Option<&WSServer> {
        self.server.as_ref()
    }
    pub fn server_mut(&mut self) -> Option<&mut WSServer> {
        self.server.as_mut()
    }
}
