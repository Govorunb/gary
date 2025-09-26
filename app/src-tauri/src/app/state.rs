use std::collections::{BTreeMap, HashMap};

use axum::extract::ws::WebSocket;
use tauri::AppHandle;
use tokio::{sync::Mutex, task::AbortHandle};
use uuid::Uuid;

use crate::api::{registry::Registry, v1::ws::ClientWSConnection};

#[derive(Debug)]
pub struct App {
    // TODO: app state in f/end
    // (obv still need some state here, like server handle)
    // it is just such unfettered ASS to manage
    app_handle: AppHandle,
    // pub config: Config,
    // pub registry: Registry,
    pub server_handle: Option<ServerHandle>,
}

#[derive(Debug)]
pub struct ServerHandle {
    abort_handle: AbortHandle,
    connections: BTreeMap<Uuid, ClientWSConnection>
}

impl ServerHandle {
    pub fn new(abort_handle: AbortHandle) -> Self {
        Self {
            abort_handle,
            connections: Default::default()
        }
    }
}

pub type AppStateMutex = Mutex<App>;

impl App {
    pub fn new(app_handle: AppHandle) -> Self {
        Self {
            app_handle,
            // registry: Registry::new(),
            // config: Default::default(),
            server_handle: None,
        }
    }

    pub fn is_server_running(&self) -> bool {
        self.server_handle.is_some()
    }

    pub fn start_server(&mut self) {

    }

    pub fn stop_server(&mut self) -> Result<(), ()> {
        if let Some(handle) = &self.server_handle {
            handle.abort_handle.abort();
            self.server_handle = None;
            Ok(())
        } else {
            Err(())
        }
    }
}
