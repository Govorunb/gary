use futures_util::{future::Either, pin_mut, stream::{Peekable, SplitSink, SplitStream}, FutureExt, SinkExt, Stream, StreamExt};
use log::error;
use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::ipc::Channel;
use tauri_plugin_log::log::{debug, trace, warn};
use tokio::{io::Sink, sync::oneshot::{self, Receiver, Sender}};
use uuid::{Timestamp, Uuid};
use axum::extract::ws::{CloseFrame, Message, WebSocket};
use anyhow::Result;

use crate::api::ApiVersion;


pub struct ClientWSConnection {
    id: Uuid,
    version: ApiVersion,
    ws: WebSocket,
    web_events: Channel<ServerWSEvent>,
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

impl ClientWSConnection {
    pub fn new(id: Uuid, ws: WebSocket, version: ApiVersion, channel: Channel<ServerWSEvent>) -> Self {
        Self {
            id,
            version,
            ws,
            web_events: channel,
        }
    }

    pub fn id(&self) -> &Uuid {
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

    pub async fn send_raw(&mut self, msg: &str) -> Result<(), axum::Error> {
        trace!(target: "ws", "Send: {msg}");
        self.ws.send(Message::text(msg)).await
    }

    pub async fn recv_raw(&mut self) -> Option<Message> {
        let strm = self.ws.by_ref().filter_map(async move |msg| msg.ok());
        pin_mut!(strm);
        strm.next().await
    }

    pub async fn lifecycle(&mut self) {
        while let Some(raw_msg) = self.recv_raw().await {
            match raw_msg {
                Message::Binary(_) => todo!("error - close & report to app"),
                Message::Ping(_) | Message::Pong(_) => {}, // ignore
                Message::Close(close_frame) => {
                    let (code, reason) = match close_frame {
                        None => (1006u16, None),
                        Some(CloseFrame{code, reason}) => (code, Some(reason.to_string())),
                    };
                    let _ = self.client_disconnected(code, reason).await;
                    break
                },
                Message::Text(txt) => {
                    match self.web_events.send(ServerWSEvent::Message { text: txt.to_string() }) {
                        Ok(()) => trace!("relayed WS Text msg: {txt}"),
                        Err(e) => error!("failed to relay WS Text msg: {}", e.to_string()),
                    }
                },
            }
        }
    }

    async fn client_disconnected(&mut self, code: u16, reason: Option<String>) -> Result<()> {
        self.web_events.send(ServerWSEvent::ClientDisconnected {code, reason})?;
        Ok(())
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

    pub fn msg_stream(&mut self) -> impl Stream<Item = String> {
        self.ws.by_ref().filter_map(async |raw_msg| Self::raw_to_txt(raw_msg))
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

/* TODO
on conn, event to f/e
f/e sends back command w/ Channel in params
the channel represents the connection
*/
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ServerWSEvent {
    #[serde(rename = "connected")]
    Connected, // channel is established on accept, so upgrade has an event
    #[serde(rename = "message")]
    Message { text: String },
    #[serde(rename = "clientDisconnected")]
    ClientDisconnected {
        code: u16,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        reason: Option<String>,
    },
}

#[test]
fn does_this_even_serialize() {
    let kinds: Vec<ServerWSEvent> = vec![
        ServerWSEvent::Connected,
        ServerWSEvent::Message { text: "AAAA".into() },
        ServerWSEvent::ClientDisconnected { code: 1006, reason: None },
        ServerWSEvent::ClientDisconnected { code: 3000, reason: Some("SOME".into()) },
    ];
    println!("{:#?}", serde_json::to_value(&kinds).expect("should be able to serialize"));
}
