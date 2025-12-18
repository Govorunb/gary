// essentially just ~~copied over~~ adapted from https://github.com/tauri-apps/plugins-workspace/blob/ce6835d50ff7800dcfb8508a98e9ee83771fb283/plugins/log/src/commands.rs#L12
// but with an added "target" arg

use std::collections::HashMap;

use log::RecordBuilder;
use serde_repr::{Deserialize_repr, Serialize_repr};

#[derive(Debug, Clone, Deserialize_repr, Serialize_repr)]
#[repr(u16)]
pub enum LogLevel {
    Verbose,
    Debug,
    Info,
    Success,
    Warn,
    Error,
    Fatal,
}

impl From<LogLevel> for log::Level {
    fn from(value: LogLevel) -> Self {
        match value {
            LogLevel::Verbose => Self::Trace,
            LogLevel::Debug => Self::Debug,
            LogLevel::Info | LogLevel::Success => Self::Info,
            LogLevel::Warn => Self::Warn,
            LogLevel::Error => Self::Error,
            LogLevel::Fatal => Self::Error,
        }
    }
}

impl From<log::Level> for LogLevel {
    fn from(value: log::Level) -> Self {
        match value {
            log::Level::Error => Self::Error,
            log::Level::Warn => Self::Warn,
            log::Level::Info => Self::Info,
            log::Level::Debug => Self::Debug,
            log::Level::Trace => Self::Verbose,
        }
    }
}

#[tauri::command]
pub fn gary_log(
    level: LogLevel,
    message: String,
    target: Option<&str>,
    location: Option<&str>,
    file: Option<&str>,
    line: Option<u32>,
    key_values: Option<HashMap<String, String>>,
) {
    let level = log::Level::from(level);

    let target = target.unwrap_or("webview");

    let target = if let Some(location) = location {
        format!("{target}:{location}")
    } else {
        target.to_string()
    };

    let mut builder = RecordBuilder::new();
    builder.level(level).target(&target).file(file).line(line);
    let key_values = key_values.unwrap_or_default();
    let mut kv = HashMap::new();
    for (k, v) in key_values.iter() {
        kv.insert(k.as_str(), v.as_str());
    }
    builder.key_values(&kv);

    log::logger().log(&builder.args(format_args!("{message}")).build());
}
