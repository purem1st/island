//! Громкость (Core Audio), «Сейчас играет» (SMTC), устройство вывода, снимок экрана и OCR.

use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde_json::{json, Value};
use windows::core::{Interface, PWSTR};
use windows::Devices::Enumeration::DeviceInformation;
use windows::Foundation::TimeSpan;
use windows::Graphics::Imaging::{BitmapPixelFormat, SoftwareBitmap};
use windows::Media::Control::{
    GlobalSystemMediaTransportControlsSessionManager as Manager,
    GlobalSystemMediaTransportControlsSessionMediaProperties as MediaProps,
    GlobalSystemMediaTransportControlsSessionPlaybackStatus as PlayStatus,
};
use windows::Media::Devices::{AudioDeviceRole, MediaDevice};
use windows::Media::Ocr::OcrEngine;
use windows::Storage::Streams::{DataReader, DataWriter};
use windows::Win32::Foundation::{CloseHandle, BOOL};
use windows::Win32::Graphics::Gdi::{
    BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC, GetDIBits, ReleaseDC,
    SelectObject, BITMAPINFO, BITMAPINFOHEADER, DIB_RGB_COLORS, SRCCOPY,
};
use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
use windows::Win32::Media::Audio::{
    eConsole, eRender, IAudioSessionControl2, IAudioSessionManager2, IMMDeviceEnumerator, ISimpleAudioVolume,
    MMDeviceEnumerator,
};
use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED};
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
};

fn init_com() {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
    }
}

/* ================= громкость ================= */

fn endpoint() -> windows::core::Result<IAudioEndpointVolume> {
    init_com();
    unsafe {
        let enumerator: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
        let device = enumerator.GetDefaultAudioEndpoint(eRender, eConsole)?;
        device.Activate::<IAudioEndpointVolume>(CLSCTX_ALL, None)
    }
}

fn exe_stem(pid: u32) -> Option<String> {
    unsafe {
        let h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let mut buf = [0u16; 520];
        let mut len = buf.len() as u32;
        let r = QueryFullProcessImageNameW(h, PROCESS_NAME_WIN32, PWSTR(buf.as_mut_ptr()), &mut len);
        let _ = CloseHandle(h);
        r.ok()?;
        let path = String::from_utf16_lossy(&buf[..len as usize]);
        let file = path.rsplit('\\').next()?;
        Some(file.trim_end_matches(".exe").to_lowercase())
    }
}

fn norm(s: &str) -> String {
    s.to_lowercase().chars().filter(|c| c.is_alphanumeric()).collect()
}

/// Звуковые сессии приложения-плеера (по имени процесса и идентификатору из SMTC).
fn app_sessions(app: &str) -> windows::core::Result<Vec<ISimpleAudioVolume>> {
    init_com();
    let a = norm(app);
    let mut out = Vec::new();
    if a.is_empty() {
        return Ok(out);
    }
    unsafe {
        let enumerator: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
        let device = enumerator.GetDefaultAudioEndpoint(eRender, eConsole)?;
        let mgr: IAudioSessionManager2 = device.Activate(CLSCTX_ALL, None)?;
        let list = mgr.GetSessionEnumerator()?;
        let n = list.GetCount()?;
        for i in 0..n {
            let ctl = list.GetSession(i)?;
            let ctl2: IAudioSessionControl2 = ctl.cast()?;
            let pid = ctl2.GetProcessId().unwrap_or(0);
            if pid == 0 {
                continue;
            }
            if let Some(stem) = exe_stem(pid) {
                let s = norm(&stem);
                if !s.is_empty() && (a.contains(&s) || s.contains(&a)) {
                    if let Ok(v) = ctl.cast::<ISimpleAudioVolume>() {
                        out.push(v);
                    }
                }
            }
        }
    }
    Ok(out)
}

/// (уровень, без звука, найдено ли приложение). Пустое app: общая громкость.
pub fn get_volume(app: &str) -> windows::core::Result<(f32, bool, bool)> {
    if !app.is_empty() {
        if let Ok(list) = app_sessions(app) {
            if let Some(v) = list.first() {
                unsafe {
                    return Ok((v.GetMasterVolume()?, v.GetMute()?.as_bool(), true));
                }
            }
        }
    }
    let ep = endpoint()?;
    unsafe { Ok((ep.GetMasterVolumeLevelScalar()?, ep.GetMute()?.as_bool(), app.is_empty())) }
}

pub fn set_volume(level: f32, app: &str) -> windows::core::Result<()> {
    let level = level.clamp(0.0, 1.0);
    if !app.is_empty() {
        if let Ok(list) = app_sessions(app) {
            if !list.is_empty() {
                for v in list {
                    unsafe {
                        v.SetMasterVolume(level, std::ptr::null())?;
                        if level > 0.0 {
                            v.SetMute(BOOL(0), std::ptr::null())?;
                        }
                    }
                }
                return Ok(());
            }
        }
    }
    let ep = endpoint()?;
    unsafe {
        ep.SetMasterVolumeLevelScalar(level, std::ptr::null())?;
        if level > 0.0 {
            ep.SetMute(BOOL(0), std::ptr::null())?;
        }
    }
    Ok(())
}

pub fn set_mute(muted: bool, app: &str) -> windows::core::Result<()> {
    if !app.is_empty() {
        if let Ok(list) = app_sessions(app) {
            if !list.is_empty() {
                for v in list {
                    unsafe { v.SetMute(BOOL(muted as i32), std::ptr::null())? };
                }
                return Ok(());
            }
        }
    }
    let ep = endpoint()?;
    unsafe { ep.SetMute(BOOL(muted as i32), std::ptr::null()) }
}

/// Имя устройства, на которое сейчас идёт звук.
pub fn audio_device() -> windows::core::Result<String> {
    init_com();
    let id = MediaDevice::GetDefaultAudioRenderId(AudioDeviceRole::Default)?;
    let info = DeviceInformation::CreateFromIdAsync(&id)?.get()?;
    Ok(info.Name()?.to_string())
}

/* ================= музыка ================= */

fn seconds(t: TimeSpan) -> f64 {
    t.Duration as f64 / 10_000_000.0
}

fn read_thumb(props: &MediaProps) -> Option<String> {
    let reference = props.Thumbnail().ok()?;
    let stream = reference.OpenReadAsync().ok()?.get().ok()?;
    let size = stream.Size().ok()? as u32;
    if size == 0 || size > 8_000_000 {
        return None;
    }
    let reader = DataReader::CreateDataReader(&stream).ok()?;
    reader.LoadAsync(size).ok()?.get().ok()?;
    let mut buf = vec![0u8; size as usize];
    reader.ReadBytes(&mut buf).ok()?;
    let mut mime = stream.ContentType().map(|h| h.to_string()).unwrap_or_default();
    if mime.is_empty() {
        mime = "image/jpeg".to_string();
    }
    Some(format!("data:{};base64,{}", mime, STANDARD.encode(&buf)))
}

fn try_info(have: &str) -> windows::core::Result<Value> {
    init_com();
    let manager = Manager::RequestAsync()?.get()?;
    let session = manager.GetCurrentSession()?;
    let props = session.TryGetMediaPropertiesAsync()?.get()?;

    let title = props.Title()?.to_string();
    let artist = props.Artist()?.to_string();
    let album = props.AlbumTitle()?.to_string();
    let app = session.SourceAppUserModelId().map(|h| h.to_string()).unwrap_or_default();
    let key = format!("{}|{}|{}", title, artist, album);

    let playing = session.GetPlaybackInfo()?.PlaybackStatus()? == PlayStatus::Playing;

    let (mut pos, mut end) = (0.0, 0.0);
    if let Ok(tl) = session.GetTimelineProperties() {
        pos = tl.Position().map(seconds).unwrap_or(0.0);
        end = tl.EndTime().map(seconds).unwrap_or(0.0);
    }

    // обложку отправляем только при смене трека (иначе null: интерфейс оставляет прежнюю)
    let thumb = if key == have {
        Value::Null
    } else {
        Value::String(read_thumb(&props).unwrap_or_default())
    };

    Ok(json!({
        "title": title, "artist": artist, "album": album, "app": app, "key": key,
        "playing": playing, "pos": pos, "end": end, "thumb": thumb,
    }))
}

pub fn media_info(have: &str) -> Value {
    try_info(have).unwrap_or_else(|_| json!({ "none": true }))
}

pub fn media_control(action: &str, seconds_to: f64) -> windows::core::Result<()> {
    init_com();
    let manager = Manager::RequestAsync()?.get()?;
    let session = manager.GetCurrentSession()?;
    match action {
        "toggle" => {
            session.TryTogglePlayPauseAsync()?.get()?;
        }
        "next" => {
            session.TrySkipNextAsync()?.get()?;
        }
        "prev" => {
            session.TrySkipPreviousAsync()?.get()?;
        }
        "seek" => {
            session.TryChangePlaybackPositionAsync((seconds_to * 10_000_000.0) as i64)?.get()?;
        }
        _ => {}
    }
    Ok(())
}

/* ================= снимок экрана и распознавание текста ================= */

fn capture(x: i32, y: i32, w: i32, h: i32) -> Option<Vec<u8>> {
    if w <= 0 || h <= 0 {
        return None;
    }
    unsafe {
        let screen = GetDC(None);
        if screen.is_invalid() {
            return None;
        }
        let mem = CreateCompatibleDC(screen);
        let bmp = CreateCompatibleBitmap(screen, w, h);
        let old = SelectObject(mem, bmp);
        let copied = BitBlt(mem, 0, 0, w, h, screen, x, y, SRCCOPY).is_ok();

        let mut buf = vec![0u8; (w as usize) * (h as usize) * 4];
        let mut bi = BITMAPINFO::default();
        bi.bmiHeader.biSize = std::mem::size_of::<BITMAPINFOHEADER>() as u32;
        bi.bmiHeader.biWidth = w;
        bi.bmiHeader.biHeight = -h; // сверху вниз
        bi.bmiHeader.biPlanes = 1;
        bi.bmiHeader.biBitCount = 32;
        let lines = GetDIBits(mem, bmp, 0, h as u32, Some(buf.as_mut_ptr() as *mut _), &mut bi, DIB_RGB_COLORS);

        SelectObject(mem, old);
        let _ = DeleteObject(bmp);
        let _ = DeleteDC(mem);
        ReleaseDC(None, screen);
        if copied && lines != 0 {
            Some(buf)
        } else {
            None
        }
    }
}

fn recognize(buf: &[u8], w: i32, h: i32) -> windows::core::Result<String> {
    let writer = DataWriter::new()?;
    writer.WriteBytes(buf)?;
    let buffer = writer.DetachBuffer()?;
    let bmp = SoftwareBitmap::CreateCopyFromBuffer(&buffer, BitmapPixelFormat::Bgra8, w, h)?;
    let engine = OcrEngine::TryCreateFromUserProfileLanguages()?;
    let result = engine.RecognizeAsync(&bmp)?.get()?;
    Ok(result.Text()?.to_string())
}

/// Сделать снимок области (физические пиксели) и распознать текст.
pub fn ocr_region(x: i32, y: i32, w: i32, h: i32) -> Result<String, String> {
    init_com();
    let max = OcrEngine::MaxImageDimension().unwrap_or(10000) as i32;
    let (w, h) = (w.min(max), h.min(max));
    let mut buf = capture(x, y, w, h).ok_or_else(|| "Не удалось сделать снимок экрана".to_string())?;
    for px in buf.chunks_mut(4) {
        px[3] = 255; // GDI не заполняет альфа-канал
    }
    recognize(&buf, w, h).map_err(|e| {
        format!(
            "Не получилось распознать текст ({}). Проверь, что в Windows добавлен язык с распознаванием текста",
            e.message()
        )
    })
}
