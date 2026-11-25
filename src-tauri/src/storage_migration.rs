use std::{collections::BTreeMap, fs, io::ErrorKind, path::PathBuf};
use tauri::{Manager, WebviewWindow};

type Storage = BTreeMap<String, String>;

fn snapshot_path(window: &WebviewWindow, dev: bool) -> Result<PathBuf, String> {
    let url = window.url().map_err(|err| err.to_string())?;
    let allowed = if dev {
        url.host_str() == Some("127.0.0.1") && url.port() == Some(1430)
    } else {
        url.host_str() == Some("tauri.localhost")
    };
    if window.label() != "main" || !allowed {
        return Err("Unexpected storage origin".into());
    }
    window
        .path()
        .app_local_data_dir()
        .map(|dir| dir.join("pending-dev-storage.json"))
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn save_dev_storage(window: WebviewWindow, data: Storage) -> Result<(), String> {
    let path = snapshot_path(&window, true)?;
    let temp = path.with_extension("tmp");
    let bytes = serde_json::to_vec(&data).map_err(|err| err.to_string())?;
    fs::write(&temp, bytes)
        .and_then(|()| fs::rename(temp, path))
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn read_dev_storage(window: WebviewWindow) -> Result<Option<Storage>, String> {
    match fs::read(snapshot_path(&window, false)?) {
        Ok(bytes) => serde_json::from_slice(&bytes)
            .map(Some)
            .map_err(|err| err.to_string()),
        Err(err) if err.kind() == ErrorKind::NotFound => Ok(None),
        Err(err) => Err(err.to_string()),
    }
}

#[tauri::command]
pub fn finish_dev_storage(window: WebviewWindow) -> Result<(), String> {
    match fs::remove_file(snapshot_path(&window, false)?) {
        Ok(()) => Ok(()),
        Err(err) if err.kind() == ErrorKind::NotFound => Ok(()),
        Err(err) => Err(err.to_string()),
    }
}
