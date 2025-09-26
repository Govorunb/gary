use std::collections::{BTreeMap, BTreeSet};

use axum::extract::ws::WebSocket;

use super::ws::ClientWSConnection;

use crate::api::v1::spec::{Action, ActionsForceMsg};

#[derive(Debug, PartialEq)]
pub struct Game {
    name: String,
    connection: Option<ClientWSConnection>,
    actions: BTreeMap<String, Action>,
    seen_actions: BTreeSet<String>,
    pending_actions: Vec<Action>,
    v1_pending_forces: Vec<ActionsForceMsg>,
}

impl Game {
    pub fn new(name: String, connection: Option<ClientWSConnection>) -> Self {
        Self {
            name,
            connection,
            actions: Default::default(),
            seen_actions: Default::default(),
            pending_actions: Default::default(),
            v1_pending_forces: Default::default(),
        }
    }

    pub fn register_actions(actions: &[Action]) {

    }

    pub fn unregister_actions(action_names: &[&str]) {

    }

    pub fn name(&self) -> Option<&str> {
        return Some(&self.name);
    }
}
