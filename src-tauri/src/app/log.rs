use std::{fmt::Arguments, fs};

use log::{Record, RecordBuilder};
use serde::{Deserialize, Serialize};
use serde_repr::Deserialize_repr;
use tauri::{Manager, Runtime};
use tauri_plugin_log::fern::FormatCallback;
use time::{OffsetDateTime, macros::format_description};

pub fn prepare_launch_log<R: Runtime>(app: &tauri::AppHandle<R>) -> anyhow::Result<()> {
    let log_dir = app.path().app_log_dir()?;
    let current = log_dir.join("Gary.log");

    if current.exists() {
        let metadata = current.metadata()?;
        let created_at = metadata.created().or_else(|_| metadata.modified())?;
        let timestamp = format_timestamp(created_at.into());
        fs::rename(current, log_dir.join(format!("Gary_{timestamp}.log")))?;
    }

    Ok(())
}

/// Stdout is read by people: the webview's JSON events only get their level, since they carry their own timestamp.
pub fn readable_line(out: FormatCallback, message: &Arguments, record: &Record) {
    if record.target() == WEBVIEW {
        return out.finish(format_args!("[{}] {message}", record.level()));
    }
    let now = OffsetDateTime::now_utc()
        .format(format_description!("[[[year]-[month]-[day]][[[hour]:[minute]:[second]]"))
        .expect("valid static timestamp format");
    out.finish(format_args!("{now}[{}][{}] {message}", record.target(), record.level()));
}

/// The log file is JSON Lines, one object per record with a `timestamp` (ms) and `level`.
/// The webview's records are already JSON events (`timestamp`, `event`, `data`) and only gain the level.
pub fn json_line(out: FormatCallback, message: &Arguments, record: &Record) {
    let level = record.level().as_str();
    let message = message.to_string();
    if record.target() == WEBVIEW && let Some(event) = message.strip_prefix('{') {
        return out.finish(format_args!("{{\"level\":\"{level}\",{event}"));
    }
    #[derive(Serialize)]
    struct Line<'a> { level: &'a str, timestamp: i128, target: &'a str, message: String }
    let line = Line {
        level,
        timestamp: OffsetDateTime::now_utc().unix_timestamp_nanos() / 1_000_000,
        target: record.target(),
        message,
    };
    out.finish(format_args!("{}", serde_json::to_string(&line).expect("strings serialize")));
}

fn format_timestamp(timestamp: OffsetDateTime) -> String {
    timestamp
        .format(format_description!(
            "[year]-[month]-[day]_[hour]-[minute]-[second]-[subsecond digits:3]"
        ))
        .expect("valid static timestamp format")
}

#[derive(Debug, Clone, Deserialize_repr)]
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

const WEBVIEW: &str = "webview";

#[derive(Deserialize)]
pub struct LogEntry {
    level: LogLevel,
    message: String,
}

/// Writes the webview's log. It arrives in batches: an IPC call costs about as much as handling a game message.
/// Sync, so batches run in order on the main thread and lines can't interleave.
#[tauri::command]
pub fn gary_log(entries: Vec<LogEntry>) {
    for LogEntry { level, message } in entries {
        log::logger().log(&RecordBuilder::new()
            .level(level.into())
            .target(WEBVIEW)
            .args(format_args!("{message}"))
            .build());
    }
}
