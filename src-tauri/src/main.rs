#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{AppHandle, Emitter, LogicalPosition, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

mod native;
mod shortcuts;
mod storage_migration;

// Окно всегда одного размера, прозрачное и «сквозное» для мыши.
// Размером и анимацией острова управляет интерфейс (CSS).
const WIN_W: f64 = 860.0;

fn center_top(w: &WebviewWindow) -> Result<(), String> {
    let m = w
        .primary_monitor()
        .map_err(|e| e.to_string())?
        .ok_or("no monitor")?;
    let scale = m.scale_factor();
    let screen_w = m.size().width as f64 / scale;
    let screen_x = m.position().x as f64 / scale;
    let screen_y = m.position().y as f64 / scale;
    w.set_position(LogicalPosition::new(
        screen_x + (screen_w - WIN_W) / 2.0,
        screen_y,
    ))
    .map_err(|e| e.to_string())
}

/// true: окно ловит мышь (курсор над островом), false: клики проходят сквозь него.
#[tauri::command]
fn set_interactive(app: AppHandle, interactive: bool) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.set_ignore_cursor_events(!interactive);
    }
}

fn spawn_ok(program: &str, args: &[&str]) -> bool {
    let mut cmd = std::process::Command::new(program);
    cmd.args(args);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // без окна консоли
    }
    cmd.spawn().is_ok()
}

fn run_hidden(program: &str, args: &[&str]) {
    let _ = spawn_ok(program, args);
}

#[tauri::command]
fn open_explorer() {
    run_hidden("explorer.exe", &[]);
}

#[tauri::command]
fn open_uri(uri: String) {
    run_hidden("explorer.exe", &[uri.as_str()]);
}

/// Микшер громкости Windows.
#[tauri::command]
fn open_mixer() {
    if !spawn_ok("sndvol.exe", &[]) {
        run_hidden("explorer.exe", &["ms-settings:apps-volume"]);
    }
}

#[tauri::command]
fn system_action(action: String) {
    match action.as_str() {
        "lock" => run_hidden("rundll32.exe", &["user32.dll,LockWorkStation"]),
        "sleep" => run_hidden("rundll32.exe", &["powrprof.dll,SetSuspendState", "0,1,0"]),
        "restart" => run_hidden("shutdown", &["/r", "/t", "0"]),
        "shutdown" => run_hidden("shutdown", &["/s", "/t", "0"]),
        _ => {}
    }
}

#[tauri::command]
fn set_windows_dark(dark: bool) {
    let v = if dark { "0" } else { "1" };
    for name in ["AppsUseLightTheme", "SystemUsesLightTheme"] {
        run_hidden(
            "reg",
            &[
                "add",
                r"HKCU\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize",
                "/v", name, "/t", "REG_DWORD", "/d", v, "/f",
            ],
        );
    }
}

/* ---------- музыка и звук ---------- */

#[tauri::command]
async fn media_info(have: String) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || native::media_info(&have))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn media_control(action: String, seconds: Option<f64>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _ = native::media_control(&action, seconds.unwrap_or(0.0));
    })
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_volume(app: String) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || match native::get_volume(&app) {
        Ok((level, muted, found)) => serde_json::json!({ "level": level, "muted": muted, "found": found }),
        Err(_) => serde_json::json!({ "none": true }),
    })
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
async fn set_volume(level: f32, app: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _ = native::set_volume(level, &app);
    })
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
async fn set_mute(muted: bool, app: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _ = native::set_mute(muted, &app);
    })
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
async fn audio_device() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || native::audio_device().unwrap_or_default())
        .await
        .map_err(|e| e.to_string())
}

/* ---------- текст с экрана: выбор области и распознавание ---------- */

#[tauri::command]
async fn snip_start(app: AppHandle) -> Result<(), String> {
    if app.get_webview_window("snip").is_some() {
        return Ok(());
    }
    let monitor = app
        .primary_monitor()
        .map_err(|e| e.to_string())?
        .ok_or("no monitor")?;
    let win = WebviewWindowBuilder::new(&app, "snip", WebviewUrl::App("snip.html".into()))
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .shadow(false)
        .focused(true)
        .build()
        .map_err(|e| e.to_string())?;
    win.set_position(*monitor.position()).map_err(|e| e.to_string())?;
    win.set_size(*monitor.size()).map_err(|e| e.to_string())?;
    let _ = win.set_focus();
    Ok(())
}

#[tauri::command]
async fn snip_cancel(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("snip") {
        let _ = w.destroy();
    }
    let _ = app.emit("ocr-result", serde_json::json!({ "cancel": true }));
    Ok(())
}

/// x, y, w, h: в CSS-пикселях окна выбора (оно закрывает основной монитор), dpr: масштаб экрана.
#[tauri::command]
async fn snip_done(app: AppHandle, x: f64, y: f64, w: f64, h: f64, dpr: f64) -> Result<(), String> {
    let (mx, my) = match app.primary_monitor() {
        Ok(Some(m)) => (m.position().x, m.position().y),
        _ => (0, 0),
    };
    if let Some(win) = app.get_webview_window("snip") {
        let _ = win.destroy();
    }
    let handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        std::thread::sleep(std::time::Duration::from_millis(250)); // дать окну выбора исчезнуть
        let px = mx + (x * dpr).round() as i32;
        let py = my + (y * dpr).round() as i32;
        let pw = (w * dpr).round() as i32;
        let ph = (h * dpr).round() as i32;
        let payload = match native::ocr_region(px, py, pw, ph) {
            Ok(text) if !text.trim().is_empty() => {
                let text = text.trim().to_string();
                let _ = handle.clipboard().write_text(text.clone());
                serde_json::json!({ "ok": true, "text": text })
            }
            Ok(_) => serde_json::json!({ "ok": false, "error": "Текст не найден" }),
            Err(e) => serde_json::json!({ "ok": false, "error": e }),
        };
        let _ = handle.emit("ocr-result", payload);
    })
    .await
    .map_err(|e| e.to_string())
}

/* ---------- позиция курсора для интерфейса ---------- */

/// Опрашиваем позицию курсора (она нужна, даже когда окно сквозное)
/// и отправляем в интерфейс: x, y относительно окна и top: расстояние до верха экрана.
fn start_cursor_poll(app: AppHandle) {
    std::thread::spawn(move || {
        let mut last = (i64::MIN, i64::MIN);
        loop {
            std::thread::sleep(std::time::Duration::from_millis(16));
            let Ok(pos) = app.cursor_position() else { continue };
            let key = (pos.x as i64, pos.y as i64);
            if key == last {
                continue;
            }
            last = key;
            let Some(w) = app.get_webview_window("main") else { continue };
            let Ok(wp) = w.outer_position() else { continue };
            let scale = w.scale_factor().unwrap_or(1.0);
            let top = w
                .primary_monitor()
                .ok()
                .flatten()
                .map(|m| m.position().y as f64)
                .unwrap_or(0.0);
            let payload = serde_json::json!({
                "x": (pos.x - wp.x as f64) / scale,
                "y": (pos.y - wp.y as f64) / scale,
                "top": (pos.y - top) / scale,
            });
            let _ = app.emit("cursor", payload);
        }
    });
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state() != ShortcutState::Pressed {
                        return;
                    }
                    if shortcut.matches(Modifiers::CONTROL | Modifiers::ALT, Code::KeyI) {
                        let _ = app.emit("toggle", ());
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            set_interactive,
            shortcuts::open_path,
            shortcuts::start_apps,
            shortcuts::shortcut_icon,
            storage_migration::save_dev_storage,
            storage_migration::read_dev_storage,
            storage_migration::finish_dev_storage,
            open_explorer,
            open_uri,
            open_mixer,
            system_action,
            set_windows_dark,
            media_info,
            media_control,
            get_volume,
            set_volume,
            set_mute,
            audio_device,
            snip_start,
            snip_cancel,
            snip_done
        ])
        .setup(|app| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = center_top(&w);
                let _ = w.set_ignore_cursor_events(true);
            }
            let gs = app.global_shortcut();
            let _ = gs.register(Shortcut::new(
                Some(Modifiers::CONTROL | Modifiers::ALT),
                Code::KeyI,
            ));
            start_cursor_poll(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Island");
}
