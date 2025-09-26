use futures_util::{pin_mut, stream::{Peekable, SplitSink, SplitStream}, SinkExt, Stream, StreamExt};
use log::error;
use serde_json::json;
use tauri::ipc::Channel;
use tauri_plugin_log::log::{debug, trace, warn};
use uuid::Uuid;
use axum::extract::ws::{CloseFrame, Message, WebSocket};
use anyhow::Result;

use crate::api::{v1::spec::{GameMessage, NeuroMessage}};


pub struct ClientWSConnection {
    id: String,
    // ws: Peekable<WebSocket>,
    ws: WebSocket,
    // web_events: Channel<ClientWSConnectionEvent>,
}

impl std::fmt::Debug for ClientWSConnection {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ClientWSConnection")
         .field("id", &self.id)
         .field("ws", &self.ws)
        //  .field("web_events", &format_args!("Channel(id:{})", &self.web_events.id()))
         .finish()
    }
}

/* TODO
on conn, event to f/e
f/e sends back command w/ Channel in params
the channel represents the connection


*/
enum ClientWSConnectionEvent {
    Connected, // channel is established on accept, so upgrade has an event
    Message(GameMessage),
    ClientDisconnected { msg: axum::extract::ws::CloseFrame },
}

impl ClientWSConnection {
    pub fn new(ws: WebSocket) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            // ws: ws.peekable(),
            ws,
        }
    }

    pub fn id(&self) -> &str {
        &self.id
    }

    pub async fn disconnect(&mut self) -> Result<(), axum::Error> {
        self.disconnect_with(None, None).await
    }

    pub async fn disconnect_with(&mut self, code: Option<u16>, reason: Option<String>) -> Result<(), axum::Error> {
        let code = code.unwrap_or(1000);
        let reason = reason.unwrap_or("Disconnected".to_owned());
        debug!("Closing connection {} with code {code} and reason '{}'", &self.id, &reason);
        let msg = Message::Close(Some(CloseFrame { code: code, reason: reason.into() }));
        self.ws.send(msg).await
    }

    pub async fn send(&mut self, msg: NeuroMessage) -> Result<(), axum::Error> {
        let json = json!(msg).to_string();
        self.send_raw(&json).await
    }
    pub async fn send_raw(&mut self, msg: &str) -> Result<(), axum::Error> {
        trace!(target: "ws", "Send: {msg}");
        self.ws.send(Message::text(msg)).await
    }

    pub async fn recv_rawest(&mut self) -> Option<Result<Message, axum::Error>> {
        self.ws.recv().await
    }

    pub async fn recv_raw(&mut self) -> Option<Message> {
        let strm = self.ws.by_ref().filter_map(async move |msg| msg.ok());
        pin_mut!(strm);
        strm.next().await
    }

    pub async fn recv_text(&mut self) -> Option<String> {
        loop {
            let Some(raw_msg) = self.ws.recv().await
                else { return None; };
            let Some(txt) = Self::raw_to_txt(raw_msg)
                else { continue };
            return Some(txt);
        }
    }

    /// Receive next protocol message, ignoring pings.
    pub async fn recv(&mut self) -> Option<GameMessage> {
        loop {
            let Some(raw_msg) = self.ws.recv().await
                else { return None; };
            let Some(txt) = Self::raw_to_txt(raw_msg)
                else { continue };
            let Some(msg) = Self::decode_txt(txt)
                else { continue };
            return Some(msg);
        }
    }

    fn raw_to_txt(raw_msg: Result<Message, axum::Error>) -> Option<String> {
        match raw_msg {
            Err(e) => {
                warn!(target: "ws", "WebSocket recv error: {e}");
                None
            },
            Ok(ws_msg) if let Ok(msg) = ws_msg.to_text().map(str::to_owned) => {
                trace!(target: "ws", "WebSocket recv: {msg}");
                Some(msg)
            }
            Ok(non_text_msg) => {
                trace!(target: "ws", "Ignoring ws message of type '{}'", match non_text_msg {
                    Message::Binary(_) => "binary",
                    Message::Ping(_) => "ping",
                    Message::Pong(_) => "pong",
                    Message::Close(_) => "close",
                    Message::Text(_) => unreachable!("received Message::Text but couldn't to_text() it"),
                });
                None
            },
        }
    }

    fn decode_txt(txt: String) -> Option<GameMessage> {
        match serde_json::from_str(&txt) {
            Ok(msg) => Some(msg),
            Err(e) => {
                error!(target: "ws", "Failed to deserialize game message: {e}\n{}", &txt);
                None
            }
        }
    }

    // pub fn ws_debug_stream(&mut self) -> impl Stream<Item = Result<Message, Error>> {
    //     self.ws.by_
    // }

    pub fn raw_msg_stream(&mut self) -> impl Stream<Item = String> {
        self.ws.by_ref().filter_map(async |raw_msg| Self::raw_to_txt(raw_msg))
    }

    pub fn msg_stream(&mut self) -> impl Stream<Item = GameMessage> {
        self.raw_msg_stream().filter_map(async |txt| Self::decode_txt(txt))
    }
}

impl PartialEq for ClientWSConnection {
    fn eq(&self, other: &Self) -> bool {
        self.id == other.id
    }
}

impl std::hash::Hash for ClientWSConnection {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        self.id.hash(state);
    }
}
