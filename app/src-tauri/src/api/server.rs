use std::collections::BTreeMap;

use axum::{extract::{ws::{CloseFrame}, Path, Query, State, WebSocketUpgrade}, response::Response, routing::get, Router};
use futures_util::FutureExt;
use log::error;
use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{ipc::Channel, AppHandle, Emitter, Manager};
use tokio::{net::TcpListener, sync::oneshot::{self, Sender}, task::{AbortHandle, JoinHandle}};
use tokio_tungstenite::tungstenite::protocol::frame::coding::CloseCode;
use uuid::Uuid;

use crate::{api::{ws::{ClientWSConnection, ServerWSEvent}, ApiVersion}, app::state::AppStateMutex};

#[derive(Debug, Clone, Deserialize, Serialize)]
struct V2ConnectQuery {
    game: String,
}

pub struct WSServer {
    abort_handle: AbortHandle,
    pending_connections: BTreeMap<Uuid, Sender<WSConnectResponse>>,
    connections: BTreeMap<Uuid, ClientWSConnection>
}

impl WSServer {
    pub fn new(abort_handle: AbortHandle) -> Self {
        Self {
            abort_handle,
            pending_connections: BTreeMap::new(),
            connections: BTreeMap::new()
        }
    }

    pub fn stop(self) {
        self.abort_handle.abort()
    }

    pub fn get_conn(&self, id: Uuid) -> Option<&ClientWSConnection> {
        self.connections.get(&id)
    }

    pub fn get_conn_mut(&mut self, id: Uuid) -> Option<&mut ClientWSConnection> {
        self.connections.get_mut(&id)
    }

    fn add_pending(&mut self, id: Uuid, tx: Sender<WSConnectResponse>) {
        if let Some(_) = self.pending_connections.insert(id, tx) {
            error!(target: "ws", "UUID collision on {id} for pending_connections :(");
        }
    }

    fn take_pending(&mut self, id: Uuid) -> Option<Sender<WSConnectResponse>> {
        self.pending_connections.remove(&id)
    }

    fn take_conn(&mut self, id: Uuid) -> Option<ClientWSConnection> {
        self.connections.remove(&id)
    }

    pub async fn connect(&mut self, conn: ClientWSConnection) {
        let id = *conn.id();
        if let Some(mut existing) = self.connections.insert(id, conn) {
            let _ = existing.disconnect_with(
                Some(CloseCode::Protocol.into()), 
                Some("New connection for this game came in; dropping old connection (yours)".into())
            ).await;
        }
        self.connections.get_mut(&id).unwrap().lifecycle().await;
    }
}

pub async fn create_server(app: AppHandle, port: u16) -> anyhow::Result<WSServer> {
    let router = Router::new()
        .route("/", get(v1_legacy))
        .route("/v2/{game}", get(v2_game_in_path))
        .route("/v2", get(v2_game_in_query))
        .with_state(app.clone());

    let addr = ("127.0.0.1", port);
    let listener = TcpListener::bind(addr).await?;
    let server_future = axum::serve(listener, router).into_future();
    let abort_handle = tokio::spawn(server_future).abort_handle();
    Ok(WSServer::new(abort_handle))
}

async fn v1_legacy(
    ws: WebSocketUpgrade,
    State(app): State<AppHandle>,
) -> Response {
    try_upgrade(ws, app, ApiVersion::V1).await
}

async fn v2_game_in_path(
    ws: WebSocketUpgrade,
    State(app): State<AppHandle>,
    Path(game): Path<String>
) -> Response {
    try_upgrade(ws, app, ApiVersion::V2(game)).await
}

async fn v2_game_in_query(
    ws: WebSocketUpgrade,
    State(app): State<AppHandle>,
    Query(params): Query<V2ConnectQuery>
) -> Response {
    try_upgrade(ws, app, ApiVersion::V2(params.game)).await
}

#[derive(Debug, Clone, Serialize)]
struct TryConnectPayload {
    id: Uuid,
    #[serde(flatten)]
    version: ApiVersion,
}

enum WSConnectResponse {
    Accept(Channel<ServerWSEvent>),
    Deny(Option<String>),
}

async fn try_upgrade(ws: WebSocketUpgrade, app: AppHandle, version: ApiVersion) -> Response {
    let (tx, rx) = oneshot::channel::<WSConnectResponse>();
    let id = Uuid::new_v4();
    let app_handle = app.clone();
    let state_mutex = app_handle.state::<AppStateMutex>();
    let mut state = state_mutex.lock().await;
    state.server.as_mut().expect("should have server").add_pending(id, tx);
    drop(state);
    drop(state_mutex);
    // send evt to f/e to approve/deny
    let _ = app.emit("ws-try-connect", TryConnectPayload { id, version: version.clone() });
    let Ok(resp) = rx.await else {
        error!("ws approval oneshot channel recv error: sender dropped without sending (id {id})"); // TODO
        return Response::builder().status(500).body("erm".into()).unwrap();
    };
    let channel = match resp {
        WSConnectResponse::Accept(channel) => channel,
        WSConnectResponse::Deny(msg) => {
            return Response::builder().status(400).body(msg.unwrap_or_default().into()).unwrap();
        }
    };
    ws.on_upgrade(async move |socket| {
        let conn = ClientWSConnection::new(id, socket, version, channel);
        let state_mutex = app.state::<AppStateMutex>();
        let mut state = state_mutex.lock().await;
        let server = state.server.as_mut().expect("server not running");
        server.connect(conn).await;
    })
}

#[tauri::command]
pub async fn ws_accept(app: AppHandle, id: Uuid, channel: Channel<ServerWSEvent>) -> Result<(), String> {
    let state_mutex = app.state::<AppStateMutex>();
    let mut state = state_mutex.lock().await;
    let server = state.server.as_mut().ok_or("ws_accept: server not running".to_owned())?;
    let tx = server.take_pending(id).ok_or(format!("ws_accept: no pending connection found for id {id}"))?;
    tx.send(WSConnectResponse::Accept(channel)).ok().expect(&format!("ws_accept: double send on oneshot (id {id})"));
    Ok(())
}

#[tauri::command]
pub async fn ws_deny(app: AppHandle, id: Uuid, reason: Option<String>) -> Result<(), String> {
    let state_mutex = app.state::<AppStateMutex>();
    let mut state = state_mutex.lock().await;
    let server = state.server.as_mut().ok_or("ws_deny: server not running".to_owned())?;
    let tx = server.take_pending(id).ok_or(format!("ws_deny: no pending connection found for id {id}"))?;
    tx.send(WSConnectResponse::Deny(reason)).ok().expect(&format!("ws_deny: double send on oneshot (id {id})"));
    Ok(())
}

#[tauri::command]
pub async fn ws_close(app: AppHandle, id: Uuid, code: Option<u16>, reason: Option<String>) -> Result<(), String> {
    let state_mutex = app.state::<AppStateMutex>();
    let mut state = state_mutex.lock().await;
    let server = state.server.as_mut().ok_or("ws_close: server not running".to_owned())?;
    let mut conn = server.take_conn(id).ok_or(format!("ws_close: no connection found for id {id}"))?;
    conn.disconnect_with(code, reason).await.map_err(|e| e.to_string())
}
