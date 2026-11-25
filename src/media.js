/* Плеер (Windows «Сейчас играет»), фон по цветам обложки, громкость, устройство вывода */
let media = null;
let mediaAt = 0;
let haveKey = '';
let thumbCache = '';
let mediaPolling = false;
const player = $('#player');

const fmtTime = (s) => { s = Math.max(0, Math.floor(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

/* ---------- цвета обложки ---------- */
const colorCache = new Map();

function tone(c) { // чтобы белый текст читался на любом фоне
  let [r, g, b] = c;
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  if (lum > 0.42) { const k = 0.42 / lum; r *= k; g *= k; b *= k; }
  else if (lum < 0.14) { const add = (0.14 - lum) * 255; r += add; g += add; b += add; }
  const cl = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return 'rgb(' + cl(r) + ',' + cl(g) + ',' + cl(b) + ')';
}
async function coverColors(url) {
  if (!url) return null;
  if (colorCache.has(url)) return colorCache.get(url);
  let res = null;
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const cv = document.createElement('canvas');
    cv.width = cv.height = 32;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, 32, 32);
    const d = ctx.getImageData(0, 0, 32, 32).data;
    const buckets = new Map();
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      const sat = mx === 0 ? 0 : (mx - mn) / mx;
      const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      if (d[i + 3] < 128 || lum < 0.04) continue;
      const k = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
      const e = buckets.get(k) || { w: 0, r: 0, g: 0, b: 0 };
      const w = 0.4 + sat * 2.2; // насыщенные цвета важнее серых
      e.w += w; e.r += r * w; e.g += g * w; e.b += b * w;
      buckets.set(k, e);
    }
    const list = [...buckets.values()].sort((a, b) => b.w - a.w).map((e) => [e.r / e.w, e.g / e.w, e.b / e.w]);
    if (list.length) {
      const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
      const c1 = list[0];
      const c2 = list.find((p) => dist(p, c1) > 80) || c1.map((v) => Math.min(255, v * 0.6 + 60));
      res = [tone(c1), tone(c2)];
    }
  } catch { res = null; }
  if (colorCache.size >= 16) colorCache.delete(colorCache.keys().next().value);
  colorCache.set(url, res);
  return res;
}
let colorSeq = 0;
async function applyCoverColors() {
  const seq = ++colorSeq;
  const cols = media && thumbCache ? await coverColors(thumbCache) : null;
  if (seq !== colorSeq) return;
  if (cols) { player.style.setProperty('--c1', cols[0]); player.style.setProperty('--c2', cols[1]); }
  else { player.style.removeProperty('--c1'); player.style.removeProperty('--c2'); }
  if (cols) {
    isl.style.setProperty('--eq-start', cols[0]);
    isl.style.setProperty('--eq-end', cols[1]);
  } else {
    isl.style.removeProperty('--eq-start');
    isl.style.removeProperty('--eq-end');
  }
}

/* ---------- отрисовка плеера ---------- */
function renderMedia() {
  const m = media;
  $('.m-title').textContent = m ? (m.title || uiText('Без названия')) : uiText('Ничего не играет');
  $('.m-sub').textContent = m ? [m.artist, m.album].filter(Boolean).join(' • ') : uiText('Включи музыку в любом плеере');
  $('.m-play').innerHTML = icon(m && m.playing ? 'pause' : 'play');
  const cover = $('.m-cover');
  if (m && thumbCache) { cover.style.backgroundImage = 'url("' + thumbCache + '")'; cover.innerHTML = ''; }
  else { cover.style.backgroundImage = ''; cover.innerHTML = icon('note'); }
  const playing = !!m?.playing;
  isl.classList.toggle('playing', playing);
  $$('.status-cover').forEach((el) => {
    el.hidden = !playing;
    el.style.backgroundImage = playing && thumbCache ? 'url("' + thumbCache + '")' : '';
    el.firstElementChild.hidden = playing && !!thumbCache;
  });
  $$('.eq').forEach((el) => { el.hidden = !playing; });
  clock();
  updateProgress();
}
function updateProgress() {
  let pos = 0, end = 0;
  if (media) {
    end = media.end;
    pos = media.pos + (media.playing ? (Date.now() - mediaAt) / 1000 : 0);
    if (end > 0) pos = Math.min(pos, end);
  }
  $('.m-bar u').style.width = (end > 0 ? Math.min(100, (pos / end) * 100) : 0) + '%';
  $('.m-pos').textContent = fmtTime(pos);
  $('.m-end').textContent = end > 0 ? fmtTime(end) : '--:--';
}
async function pollMedia() {
  if (mediaPolling) return;
  mediaPolling = true;
  const previousCover = thumbCache;
  try {
    const r = await invoke('media_info', { have: haveKey });
    if (r.none) {
      media = null; haveKey = ''; thumbCache = '';
    } else {
      if (typeof r.thumb === 'string') thumbCache = r.thumb;
      else if (r.key !== haveKey) thumbCache = '';
      haveKey = r.key;
      media = r;
      mediaAt = Date.now();
    }
  } catch { media = null; haveKey = ''; thumbCache = ''; }
  finally { mediaPolling = false; }
  if (thumbCache !== previousCover) applyCoverColors();
  renderMedia();
}
async function mediaControl(action, seconds) {
  try { await invoke('media_control', { action, seconds }); } catch {}
  setTimeout(pollMedia, 350);
}
$('.m-play').addEventListener('click', () => mediaControl('toggle'));
$('.m-prev').addEventListener('click', () => mediaControl('prev'));
$('.m-next').addEventListener('click', () => mediaControl('next'));
$('#m-bar').addEventListener('click', (e) => {
  if (!media || !(media.end > 0)) return;
  const r = e.currentTarget.getBoundingClientRect();
  const sec = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * media.end;
  media.pos = sec; mediaAt = Date.now(); updateProgress();
  mediaControl('seek', sec);
});
setInterval(pollMedia, 2000);
setInterval(() => { if (state === 'open') updateProgress(); }, 500);

/* ---------- громкость: весь компьютер / только музыка ---------- */
let volMode = store.get('volMode', 'pc'); // 'pc' | 'music'
let vol = { level: 0.5, muted: false };
let volOk = true;
let volDragging = false;
let volSentAt = 0;
let volWarned = false;
const volSlider = $('.vol');

const volApp = () => (volMode === 'music' && media && media.app ? media.app : '');

function renderVol() {
  const pct = Math.round(vol.level * 100);
  if (!volDragging) volSlider.value = pct;
  volSlider.style.setProperty('--p', pct + '%');
  $('.vol-n').textContent = pct;
  $('#vol-ico').innerHTML = icon(vol.muted || pct === 0 ? 'mute' : 'speaker');
  $$('#vol-mode button').forEach((b) => b.classList.toggle('on', b.dataset.mode === volMode));
  $('.volrow').style.display = volOk ? '' : 'none';
}
async function pollVolume() {
  if (volDragging) return;
  try {
    const r = await invoke('get_volume', { app: volApp() });
    if (r.none) volOk = false;
    else {
      volOk = true;
      vol = { level: r.level, muted: r.muted };
      if (volMode === 'music' && volApp() && r.found === false && !volWarned) {
        volWarned = true;
        if (window.say) window.say(uiText('Плеер не найден: кручу общую громкость'));
      }
    }
  } catch { volOk = false; }
  renderVol();
}
volSlider.addEventListener('pointerdown', () => { volDragging = true; });
volSlider.addEventListener('input', () => {
  vol.level = volSlider.value / 100;
  vol.muted = false;
  renderVol();
  const now = Date.now();
  if (now - volSentAt > 40) { volSentAt = now; invoke('set_volume', { level: vol.level, app: volApp() }); }
});
volSlider.addEventListener('change', () => {
  invoke('set_volume', { level: volSlider.value / 100, app: volApp() });
  volDragging = false;
});
document.addEventListener('pointerup', () => { setTimeout(() => { volDragging = false; }, 60); });
$('#vol-ico').addEventListener('click', () => {
  vol.muted = !vol.muted;
  invoke('set_mute', { muted: vol.muted, app: volApp() });
  renderVol();
});
$$('#vol-mode button').forEach((b) => b.addEventListener('click', () => {
  volMode = b.dataset.mode;
  store.set('volMode', volMode);
  volWarned = false;
  renderVol();
  pollVolume();
}));
$('#mixer').addEventListener('click', () => invoke('open_mixer'));
setInterval(() => { if (state === 'open') pollVolume(); }, 1000);

/* ---------- устройство вывода звука ---------- */
async function pollDevice() {
  try {
    const full = await invoke('audio_device');
    if (!full) return;
    const name = full.split(' (')[0];
    $('#device-name').textContent = name;
    $('#device').title = full + uiText(' (нажми, чтобы открыть настройки звука)');
    const isHead = /науш|гарнитур|headphone|headset|airpods|buds/i.test(full);
    $('#device-ico').innerHTML = icon(isHead ? 'headphones' : 'speaker');
  } catch {}
}
$('#device').addEventListener('click', () => invoke('open_uri', { uri: 'ms-settings:sound' }));
setInterval(() => { if (state === 'open') pollDevice(); }, 3000);
stateHooks.push((s) => { if (s === 'open') { pollVolume(); pollDevice(); pollMedia(); } });

/* ---------- старт ---------- */
renderMedia();
renderVol();
pollMedia();
pollVolume();
pollDevice();
