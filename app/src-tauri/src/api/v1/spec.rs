use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Action {
    pub name: String,
    pub description: String,
    #[serde(default)]
    pub schema: String,
}


#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "command", content = "data")]
pub enum GameCommand {
    #[serde(rename = "startup")]
    Hello,
    #[serde(rename = "context")]
    Context {
        message: String,
        silent: bool,
    },
    #[serde(rename = "actions/register")]
    ActionsRegister {
        actions: Vec<Action>,
    },
    #[serde(rename = "actions/unregister")]
    ActionsUnregister {
        action_names: Vec<String>,
    },
    #[serde(rename = "actions/force")]
    ActionsForce(ActionsForceMsg),
    #[serde(rename = "action/result")]
    ActionResult {
        id: String,
        success: bool,
        message: Option<String>,
    },
    #[serde(rename = "shutdown/ready")]
    ShutdownReady,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ActionsForceMsg {
    state: Option<String>,
    query: String,
    ephemeral_context: Option<bool>,
    action_names: Vec<String>,
    // main_thread: bool, // undocumented
}

fn gen_uuid() -> String {uuid::Uuid::new_v4().into()}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "command", content = "data")]
pub enum NeuroCommand {
    #[serde(rename = "action")]
    Action(ActionMsg),
    #[serde(rename = "actions/reregister_all")]
    ActionsReregisterall,
    #[serde(rename = "shutdown/graceful")]
    ShutdownGraceful {
        wants_shutdown: bool,
    },
    #[serde(rename = "shutdown/immediate")]
    ShutdownImmediate,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ActionMsg {
    #[serde(default = "gen_uuid")]
    id: String,
    name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    data: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct GameMessage {
    #[serde(flatten)]
    pub command: GameCommand,
    pub game: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct NeuroMessage {
    #[serde(flatten)]
    pub command: NeuroCommand,
}
