use std::fmt::Display;

pub mod v1;
pub mod registry;
pub mod server;

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
        });
        Ok(())
    }
}
