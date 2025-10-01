use std::{collections::BTreeMap, sync::Arc};

use axum::{extract::{ws::{CloseFrame, Message, WebSocket}, Path, Query, State, WebSocketUpgrade}, response::Response, routing::get, Router};
use futures_util::{stream::SplitSink, FutureExt, SinkExt, StreamExt};
use log::{debug, error, info, warn};
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
    connections: BTreeMap<Uuid, SplitSink<WebSocket, Message>>
}

impl WSServer {
    pub fn new(abort_handle: AbortHandle) -> Self {
        Self {
            abort_handle,
            pending_connections: BTreeMap::new(),
            connections: BTreeMap::new()
        }
    }

    pub async fn stop(self) {
        for (_, pend) in self.pending_connections {
            let _ = pend.send(WSConnectResponse::Deny(Some("Server shutting down".into())));
        }
        for (_, tx) in self.connections {
            let _ = Self::close_tx(tx, Some(1001), Some("Server shutting down".into())).await;
        }
        self.abort_handle.abort()
    }

    fn add_pending(&mut self, id: Uuid, tx: Sender<WSConnectResponse>) {
        if let Some(existing) = self.pending_connections.insert(id, tx) {
            existing.send(WSConnectResponse::Deny(Some("UUID collision; discarding existing (sorry)".to_owned())))
                .ok().expect("double send on oneshot in add_pending (UUID collision)");
            error!(target: "ws", "UUID collision on {id} for pending_connections, discarded existing");
        }
    }

    fn take_pending(&mut self, id: Uuid) -> Option<Sender<WSConnectResponse>> {
        self.pending_connections.remove(&id)
    }

    pub async fn close(&mut self, id: Uuid, code: Option<u16>, reason: Option<String>) -> Result<(), String> {
        let tx = self.connections.remove(&id).ok_or(format!("connection not found @ {id}"))?;
        Self::close_tx(tx, code, reason).await.map_err(|e| e.to_string())
    }

    async fn close_tx(mut tx: SplitSink<WebSocket, Message>, code: Option<u16>, reason: Option<String>) -> Result<(), axum::Error> {
        if code.is_none() && reason.is_none() {
            tx.send(Message::Close(None)).await
        } else {
            tx.send(Message::Close(Some(CloseFrame {
                code: code.unwrap_or(1000),
                reason: reason.map(|s| s.into()).unwrap_or("".into())
            }))).await
        }
    }

    pub async fn send(&mut self, id: Uuid, msg: String) -> Result<(), String> {
        let tx = self.connections.get_mut(&id).ok_or(format!("connection not found @ {id}"))?;
        tx.send(msg.into()).await.map_err(|e| e.to_string())
    }

    pub async fn insert(&mut self, id: Uuid, tx: SplitSink<WebSocket, Message>) {
        if let Some(existing) = self.connections.insert(id, tx) {
            warn!(target: "ws", "UUID collision @ {id}, dropping existing");
            let _ = Self::close_tx(existing,
                Some(CloseCode::Protocol.into()),
                Some("New incoming connection rolled the same UUID as yours... Sorry".into())
            ).await;
        }
    }

    pub fn connections(&self) -> Vec<Uuid> {
        self.connections.keys().cloned()
            .collect()
    }
}

pub async fn create_server(app: AppHandle, port: u16) -> Result<WSServer, String> {
    let router = Router::new()
        .route("/", get(v1_legacy))
        .route("/v2/{game}", get(v2_game_in_path))
        .route("/v2/{game}/", get(v2_game_in_path))
        .route("/v2", get(v2_game_in_query))
        .route("/v2/", get(v2_game_in_query))
        .with_state(app.clone());

    let addr = ("127.0.0.1", port);
    let listener_res = TcpListener::bind(addr).await;
    debug!("Bind result to {addr:?} - {}", if let Err(ref e) = listener_res { e.to_string() } else { "OK".to_owned() });
    let listener = listener_res.map_err(|e| e.to_string())?;
    let server_future = axum::serve(listener, router).into_future()
        .then(|_| async move { // result doesn't matter - it's never Ok (even if stopped gracefully, the task gets aborted anyway)
            let _ = app.clone().emit("server-stopped", ());
        });
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
    /* overview
    on conn, event to f/e
    f/e sends back 'accept' command w/ channel in params (or 'deny' w/ reason)
    server ws events go through the channel (e.g. recv, client disconnect)
    f/e events (send, close) go through commands
    */
    let (tx, rx) = oneshot::channel::<WSConnectResponse>();
    let id = Uuid::new_v4();
    let app_handle = app.clone();
    {
        let state_mutex = app_handle.state::<AppStateMutex>();
        let mut state = state_mutex.lock().await;
        state.server.as_mut().expect("should have server").add_pending(id, tx);
    }
    // send evt to frontend to approve/deny
    let _ = app.emit("ws-try-connect", TryConnectPayload { id, version });
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
        // not splitting would be nicer but the socket can't be owned by both the recv loop and the server (to address by id for send/close commands)
        // the ownership model...
        // yes yes technically this is the perfect use for Arc<Arc<BiLock<Mutex<RwxLock<Arc<UnLock<Cow<Polycule<Arc<()>>>>>>>>>>
        // but i think i'll just use the BiLock that's already there
        let (tx, rx) = socket.split();
        let mut conn = ClientWSConnection::new(id, rx, channel);
        {
            let state_mutex = app.state::<AppStateMutex>();
            let mut state = state_mutex.lock().await;
            let server = state.server.as_mut().expect("server should be running");
            server.insert(id, tx).await;
            info!("Sending server-state {:?}", server.connections());
            let _ = app.emit("server-state", server.connections());
        }
        debug!("awaiting lifecycle for conn {id}");
        let close_reason = match conn.lifecycle().await {
            Err(error) => Some(error),
            _ => None,
        };
        info!("conn {id} closed ({:?})", close_reason.clone().unwrap_or("normal closure".to_owned()));
        {
            let state_mutex = app.state::<AppStateMutex>();
            let mut state = state_mutex.lock().await;
            if let Some(server) = state.server.as_mut() {
                let _ = server.close(id, None, close_reason).await;
                let _ = app.emit("server-state", server.connections());
            }
        }
        let _ = app.emit("ws-closed", id);
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
    server.close(id, code, reason).await
}

#[tauri::command]
pub async fn ws_send(app: AppHandle, id: Uuid, text: String) -> Result<(), String> {
    let state_mutex = app.state::<AppStateMutex>();
    let mut state = state_mutex.lock().await;
    let server= state.server.as_mut().ok_or("ws_send: server not running".to_owned())?;
    server.send(id, text).await
}
