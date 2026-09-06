//! The window has no native title bar, so right-clicking the app's own bar
//! asks the platform for the menu the native bar would have shown.

use tauri::Window;

#[tauri::command]
pub fn show_window_menu(window: Window) -> Result<(), String> {
    let handle = window.clone();
    window
        .run_on_main_thread(move || {
            if let Err(e) = platform::show(&handle) {
                log::warn!("Could not show the window menu: {e}");
            }
        })
        .map_err(|e| e.to_string())
}

#[cfg(target_os = "linux")]
mod platform {
    use gtk::prelude::*;
    use glib::translate::{ToGlibPtr, ToGlibPtrMut};
    use tauri::Window;

    /// GDK asks the compositor (or the X11 window manager) to show its window menu at the pointer.
    /// Both backends read the position and device from a button event, so one is synthesized.
    pub fn show(window: &Window) -> Result<(), String> {
        let gtk_window = window.gtk_window().map_err(|e| e.to_string())?;
        let gdk_window = gtk_window.window().ok_or("window is not realized")?;
        let pointer = gdk_window
            .display()
            .default_seat()
            .and_then(|seat| seat.pointer())
            .ok_or("no pointer device")?;
        let (_, x, y, _) = gdk_window.device_position(&pointer);
        let (root_x, root_y) = gdk_window.root_origin();

        let mut event = gdk::Event::new(gdk::EventType::ButtonPress);
        event.set_device(Some(&pointer));
        unsafe {
            let ptr: *mut gdk::ffi::GdkEvent = event.to_glib_none_mut().0;
            let raw = ptr as *mut gdk::ffi::GdkEventButton;
            (*raw).window = gdk_window.to_glib_full();
            (*raw).send_event = 1;
            (*raw).time = gdk::ffi::GDK_CURRENT_TIME as u32;
            (*raw).button = 3;
            (*raw).x = x as f64;
            (*raw).y = y as f64;
            (*raw).x_root = (root_x + x) as f64;
            (*raw).y_root = (root_y + y) as f64;
        }
        if gdk_window.show_window_menu(&mut event) {
            Ok(())
        } else {
            Err("the display backend has no window menu".into())
        }
    }
}

#[cfg(target_os = "windows")]
mod platform {
    use tauri::Window;
    use windows_sys::Win32::Foundation::POINT;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetCursorPos, GetSystemMenu, PostMessageW, TrackPopupMenu, TPM_LEFTBUTTON, TPM_RETURNCMD,
        TPM_RIGHTBUTTON, WM_SYSCOMMAND,
    };

    /// Shows the system menu at the cursor and forwards the chosen command to the window.
    pub fn show(window: &Window) -> Result<(), String> {
        let hwnd = window.hwnd().map_err(|e| e.to_string())?.0 as _;
        unsafe {
            let menu = GetSystemMenu(hwnd, 0);
            if menu.is_null() {
                return Err("no system menu".into());
            }
            let mut point = POINT { x: 0, y: 0 };
            GetCursorPos(&mut point);
            let command = TrackPopupMenu(
                menu,
                TPM_RETURNCMD | TPM_LEFTBUTTON | TPM_RIGHTBUTTON,
                point.x,
                point.y,
                0,
                hwnd,
                std::ptr::null(),
            );
            if command != 0 {
                PostMessageW(hwnd, WM_SYSCOMMAND, command as usize, 0);
            }
        }
        Ok(())
    }
}

#[cfg(not(any(target_os = "linux", target_os = "windows")))]
mod platform {
    use tauri::Window;

    pub fn show(_window: &Window) -> Result<(), String> {
        Err("not supported on this platform".into())
    }
}
