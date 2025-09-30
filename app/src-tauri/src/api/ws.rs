use futures_util::{future::Either, pin_mut, stream::{Peekable, SplitSink, SplitStream}, FutureExt, SinkExt, Stream, StreamExt, TryStreamExt};
use log::error;
use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{ipc::Channel, AppHandle};
use tauri_plugin_log::log::{debug, trace, warn};
use tokio::{io::Sink, sync::oneshot::{self, Receiver, Sender}};
use tokio_tungstenite::tungstenite::protocol::frame::coding::CloseCode;
use uuid::{Timestamp, Uuid};
use axum::extract::ws::{CloseFrame, Message, WebSocket};
use anyhow::Result;

use crate::api::ApiVersion;


pub struct ClientWSConnection {
    id: Uuid,
    rx: SplitStream<WebSocket>,
    channel: Channel<ServerWSEvent>,
}

impl std::fmt::Debug for ClientWSConnection {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ClientWSConnection")
         .field("id", &self.id)
         .field("rx", &self.rx)
         .field("channel", &format_args!("Channel(id:{})", &self.channel.id()))
         .finish()
    }
}

impl ClientWSConnection {
    pub fn new(id: Uuid, rx: SplitStream<WebSocket>, channel: Channel<ServerWSEvent>) -> Self {
        Self {
            id,
            rx,
            channel,
        }
    }

    pub fn id(&self) -> &Uuid {
        &self.id
    }

    pub async fn lifecycle(&mut self) -> Result<(), String> {
        while let Some(Ok(raw_msg)) = self.rx.next().await {
            match raw_msg {
                Message::Binary(_) => {
                    return Err("Received binary message".into())
                },
                Message::Ping(_) | Message::Pong(_) => {}, // ignore
                Message::Close(close_frame) => {
                    let (code, reason) = match close_frame {
                        None => (1000, None),
                        Some(CloseFrame{code, reason}) => (code, Some(reason.to_string())),
                    };
                    self.channel.send(ServerWSEvent::ClientDisconnected { code, reason }).map_err(|e| e.to_string())?;
                    break
                },
                Message::Text(txt) => {
                    match self.channel.send(ServerWSEvent::Message { text: txt.to_string() }) {
                        Ok(()) => trace!("relayed WS Text msg: {txt}"),
                        Err(e) => error!("failed to relay WS Text msg: {}", e.to_string()),
                    }
                },
            }
        }
        Ok(())
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
f/e sends back command w/ channel in params
server ws events go through the channel (recv, client disconnect)
f/e events (send, close) go through commands
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
    ProtocolError(String),
}

#[test]
fn does_this_even_serialize() {
    let kinds: Vec<ServerWSEvent> = vec![
        ServerWSEvent::Connected,
        ServerWSEvent::Message { text: "AAAA".into() },
        ServerWSEvent::ClientDisconnected { code: 1006, reason: None },
        ServerWSEvent::ClientDisconnected { code: 3000, reason: Some("SOME".into()) },
        ServerWSEvent::ProtocolError("client sent binary frame".to_owned())
    ];
    println!("{:#?}", serde_json::to_value(&kinds).expect("should be able to serialize"));
}
