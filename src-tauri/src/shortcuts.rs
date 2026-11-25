use std::{ffi::c_void, mem::size_of, os::windows::process::CommandExt, process::Command};

use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use windows::{
    core::{w, PCWSTR},
    Win32::{
        Foundation::SIZE,
        Graphics::Gdi::{
            DeleteObject, GetDC, GetDIBits, GetObjectW, ReleaseDC, BITMAP, BITMAPINFO,
            BITMAPINFOHEADER, DIB_RGB_COLORS, HBITMAP,
        },
        System::Com::{CoInitializeEx, CoTaskMemFree, CoUninitialize, COINIT_MULTITHREADED},
        UI::{
            Shell::{
                IShellItemImageFactory, SHCreateItemFromParsingName, SHParseDisplayName,
                ShellExecuteExW, SEE_MASK_FLAG_NO_UI, SEE_MASK_INVOKEIDLIST, SEE_MASK_NOASYNC,
                SHELLEXECUTEINFOW, SIIGBF_ICONONLY, SIIGBF_SCALEUP,
            },
            WindowsAndMessaging::SW_SHOWNORMAL,
        },
    },
};

const APPS_FOLDER: &str = "shell:AppsFolder\\";

#[derive(Deserialize, Serialize)]
pub struct StartApp {
    #[serde(rename(deserialize = "Name"))]
    name: String,
    #[serde(rename(deserialize = "AppID"))]
    id: String,
}

#[tauri::command]
pub async fn start_apps() -> Result<Vec<StartApp>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let output = Command::new("powershell.exe")
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                "[Console]::OutputEncoding = [Text.UTF8Encoding]::new(); ConvertTo-Json -InputObject @(Get-StartApps | Sort-Object Name) -Compress",
            ])
            .creation_flags(0x08000000)
            .output()
            .map_err(|err| err.to_string())?;
        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).trim().into());
        }
        serde_json::from_slice(&output.stdout).map_err(|err| err.to_string())
    })
    .await
    .map_err(|err| err.to_string())?
}

fn with_com<T>(run: impl FnOnce() -> T) -> windows::core::Result<T> {
    unsafe { CoInitializeEx(None, COINIT_MULTITHREADED).ok()? };
    let result = run();
    unsafe { CoUninitialize() };
    Ok(result)
}

#[tauri::command]
pub async fn open_path(path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        with_com(|| launch(&path))
            .and_then(|result| result)
            .map_err(|err| err.to_string())
    })
    .await
    .map_err(|err| err.to_string())?
}

fn launch(path: &str) -> windows::core::Result<()> {
    let wide: Vec<u16> = path.encode_utf16().chain([0]).collect();
    let target = PCWSTR(wide.as_ptr());
    let mut execute = SHELLEXECUTEINFOW {
        cbSize: size_of::<SHELLEXECUTEINFOW>() as u32,
        fMask: SEE_MASK_FLAG_NO_UI | SEE_MASK_NOASYNC,
        nShow: SW_SHOWNORMAL.0,
        ..Default::default()
    };
    unsafe {
        if path.starts_with(APPS_FOLDER) {
            let mut id = std::ptr::null_mut();
            SHParseDisplayName(target, None, &mut id, 0, None)?;
            execute.fMask |= SEE_MASK_INVOKEIDLIST;
            execute.lpIDList = id.cast();
            let result = ShellExecuteExW(&mut execute);
            CoTaskMemFree(Some(id.cast()));
            result
        } else {
            execute.lpVerb = w!("open");
            execute.lpFile = target;
            ShellExecuteExW(&mut execute)
        }
    }
}

#[tauri::command]
pub async fn shortcut_icon(path: String) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        with_com(|| load_icon(&path)).map_err(|err| err.to_string())
    })
    .await
    .map_err(|err| err.to_string())?
}

fn load_icon(path: &str) -> Option<String> {
    let wide: Vec<u16> = path.encode_utf16().chain([0]).collect();
    let bitmap = unsafe {
        let factory: IShellItemImageFactory =
            SHCreateItemFromParsingName(PCWSTR(wide.as_ptr()), None).ok()?;
        factory
            .GetImage(SIZE { cx: 48, cy: 48 }, SIIGBF_ICONONLY | SIIGBF_SCALEUP)
            .ok()?
    };
    let image = bitmap_png(bitmap);
    unsafe {
        let _ = DeleteObject(bitmap);
    }
    image.map(|data| format!("data:image/png;base64,{}", STANDARD.encode(data)))
}

fn bitmap_png(bitmap: HBITMAP) -> Option<Vec<u8>> {
    let mut info = BITMAP::default();
    unsafe {
        if GetObjectW(
            bitmap,
            size_of::<BITMAP>() as i32,
            Some((&mut info as *mut BITMAP).cast()),
        ) == 0
        {
            return None;
        }
    }
    let (width, height) = (info.bmWidth, info.bmHeight);
    if !(1..=256).contains(&width) || !(1..=256).contains(&height) {
        return None;
    }
    let mut pixels = vec![0u8; (width * height * 4) as usize];
    let mut format = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: width,
            biHeight: -height,
            biPlanes: 1,
            biBitCount: 32,
            ..Default::default()
        },
        ..Default::default()
    };
    unsafe {
        let dc = GetDC(None);
        if dc.is_invalid() {
            return None;
        }
        let rows = GetDIBits(
            dc,
            bitmap,
            0,
            height as u32,
            Some(pixels.as_mut_ptr().cast::<c_void>()),
            &mut format,
            DIB_RGB_COLORS,
        );
        ReleaseDC(None, dc);
        if rows != height {
            return None;
        }
    }

    let has_alpha = pixels.chunks_exact(4).any(|pixel| pixel[3] != 0);
    for pixel in pixels.chunks_exact_mut(4) {
        pixel.swap(0, 2);
        if !has_alpha {
            pixel[3] = 255;
        } else if (1..255).contains(&pixel[3]) {
            let alpha = u16::from(pixel[3]);
            for channel in &mut pixel[..3] {
                *channel = (u16::from(*channel) * 255 / alpha).min(255) as u8;
            }
        }
    }
    let mut data = Vec::new();
    let mut encoder = png::Encoder::new(&mut data, width as u32, height as u32);
    encoder.set_color(png::ColorType::Rgba);
    encoder
        .write_header()
        .ok()?
        .write_image_data(&pixels)
        .ok()?;
    Some(data)
}
