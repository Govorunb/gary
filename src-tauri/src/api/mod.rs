use std::fmt::Display;

use serde::ser::SerializeStruct;

pub mod server;
pub mod ws;

#[derive(Debug, Clone, PartialEq, Hash)]
pub enum ApiVersion {
    V1,
    /// game name
    V2(String),
}

impl Display for ApiVersion {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", match self {
            Self::V1 => "v1",
            Self::V2(_) => "v2"
        })?;
        Ok(())
    }
}

impl serde::Serialize for ApiVersion {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer {
            match self {
                Self::V1 => {
                    let mut s = serializer.serialize_struct("ApiVersion", 1)?;
                    s.serialize_field("version", "v1")?;
                    s.end()
                },
                Self::V2(game) => {
                    let mut s = serializer.serialize_struct("ApiVersion", 2)?;
                    s.serialize_field("version", "v2")?;
                    s.serialize_field("game", game)?;
                    s.end()
                }
            }
    }
}
