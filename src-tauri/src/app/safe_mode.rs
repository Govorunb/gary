use std::ffi::OsString;

use device_query::{DeviceQuery, DeviceState, Keycode};
use tauri::State;

pub struct SafeMode(pub bool);

pub fn requested() -> bool {
    has_safe_mode_arg(&std::env::args_os().collect::<Vec<_>>()) || launch_chord_held()
}

fn has_safe_mode_arg(args: &[OsString]) -> bool {
    args.iter().any(|arg| arg == "--safe-mode")
}

fn launch_chord_held() -> bool {
    #[cfg(target_os = "linux")]
    if std::env::var_os("WAYLAND_DISPLAY").is_some() {
        return false;
    }

    let Some(device) = DeviceState::checked_new() else {
        return false;
    };
    let keys = device.get_keys();
    keys.contains(&Keycode::Escape) && keys.contains(&Keycode::F1)
}

#[tauri::command]
pub fn is_safe_mode(safe_mode: State<'_, SafeMode>) -> bool {
    safe_mode.0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_safe_mode_arg() {
        assert!(has_safe_mode_arg(&["gary".into(), "--safe-mode".into()]));
        assert!(!has_safe_mode_arg(&[
            "gary".into(),
            "--safe-mode=false".into(),
        ]));
    }
}
