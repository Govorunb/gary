use std::{collections::BTreeMap, time::Duration};
use anyhow::Result;
use axum::extract::ws::WebSocket;
use futures_util::StreamExt;
use tokio::time::timeout;

use crate::api::{v1::{self, ws::ClientWSConnection}, ApiVersion};
type GameV1 = v1::game::Game;
// type GameV2 = v2::game::Game;

#[derive(Debug, Default)]
pub struct Registry {
    games: BTreeMap<String, Game>,
    llm: (), // TODO
}

unsafe impl Send for Registry {}
unsafe impl Sync for Registry {}



#[non_exhaustive]
#[derive(Debug, PartialEq)]
pub enum Game {
    V1(GameV1),
    //V2(GameV2),
}

impl Game {
    pub fn name(&self) -> Option<&str> {
        match self {
            Game::V1(v1_game) => v1_game.name(),
            //Game::V2(v2_game) => Some(v2_game.name()),
        }
    }
}


impl Registry {
    pub fn new() -> Self {
        Self {
            games: Default::default(),
            llm: (),
        }
    }

    pub async fn connect(&mut self, socket: WebSocket, version: ApiVersion) -> Result<()> {
        let mut connection = ClientWSConnection::new(socket);
        let game = match version {
            ApiVersion::V1 => {
                if let Ok(Some(first_msg)) = timeout(Duration::from_secs(10), connection.recv()).await {
                    let game_name = first_msg.game;
                    Game::V1(GameV1::new(game_name, Some(connection)))
                } else {
                    return Err(anyhow::Error::msg("buh"));
                }
            },
            _ => return Err(anyhow::Error::msg(format!("Unhandled version {version:?}")))
        };
        let name = game.name();
        Ok(())
    }
}