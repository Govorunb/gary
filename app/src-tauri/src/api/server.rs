use axum::{extract::{Path, Query, State, WebSocketUpgrade}, response::Response, routing::get, Router};
use futures_util::FutureExt;
use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{AppHandle, Emitter, Manager};
use tokio::{net::TcpListener, sync::oneshot, task::JoinHandle};
use anyhow::{Result, Ok};

use crate::{api::{registry::Registry, v1::ws::ClientWSConnection, ApiVersion}, app::state::AppStateMutex};

#[derive(Debug, Clone, Deserialize, Serialize)]
struct V2ConnectQuery {
    game: String,
}

pub async fn create_server(app: AppHandle, port: u16, public: bool) -> Result<JoinHandle<Result<(), std::io::Error>>> {
    let router = Router::new()
        .route("/", get(v1_legacy))
        .route("/v2/{game}", get(v2_game_in_path))
        .route("/v2", get(v2_game_in_query))
        .with_state(app.clone());
        
    let addr = (if !public {"127.0.0.1"} else {"0.0.0.0"}, port);
    let listener = TcpListener::bind(addr).await?;
    Ok(tokio::spawn(axum::serve(listener, router).into_future()))
}

async fn v1_legacy(
    ws: WebSocketUpgrade,
    State(app): State<AppHandle>,
) -> Response {
    try_upgrade(ws, app, ApiVersion::V1)
}

async fn v2_game_in_path(
    ws: WebSocketUpgrade,
    State(app): State<AppHandle>,
    Path(game): Path<String>
) -> Response {
    try_upgrade(ws, app, ApiVersion::V2(game))
}

async fn v2_game_in_query(
    ws: WebSocketUpgrade,
    State(app): State<AppHandle>,
    Query(params): Query<V2ConnectQuery>
) -> Response {
    try_upgrade(ws, app, ApiVersion::V2(params.game))
}

fn try_upgrade(ws: WebSocketUpgrade, app: AppHandle, version: ApiVersion) -> Response {
    ws.on_upgrade(async move |socket| {
        let state_mutex = app.state::<AppStateMutex>();
        let mut state = state_mutex.lock().await;
        let mut conn = ClientWSConnection::new(socket);
        let server_handle = state.server_handle.as_mut().expect("connected without server handle");
        let game_name = match version.clone() {
            ApiVersion::V1 => {
                let Some(game_msg) = conn.recv().await
                else {return};
                game_msg.game
            },
            ApiVersion::V2(v2_name) => v2_name
        };
        app.emit("game_connected", json!({
            "version": format!("{}", version)
        }));
        
        // let registry = &mut state.registry;
        // registry.connect(socket, version).await.unwrap()
    })
}
