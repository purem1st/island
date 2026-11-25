/* Плитки, шаблоны, перевод, таймер, ярлыки, настройки. Использует app.js, media.js, buddy.js. */

/* ================= настройки: тема Windows, питание ================= */
function notifyLater(opts) { closeIsland(); setTimeout(() => showNotice(opts), 200); }

$$('#win-seg button').forEach((b) => b.onclick = () => {
  const dark = b.dataset.win === 'dark';
  invoke('set_windows_dark', { dark });
  notifyLater({ icon: dark ? '🌙' : '☀️', text: uiText('Тема Windows: ') + (dark ? uiText('тёмная') : uiText('светлая')) });
});
$$('[data-sys]').forEach((b) => {
  b.onclick = () => {
    const a = b.dataset.sys;
    if (a === 'lock') { invoke('system_action', { action: a }); return; }
    if (b.classList.contains('armed')) { invoke('system_action', { action: a }); return; }
    $$('[data-sys]').forEach((x) => x.classList.remove('armed'));
    b.classList.add('armed');
    setTimeout(() => b.classList.remove('armed'), 3000);
  };
});

/* ================= листы поверх главной ================= */
function closeSheets() {
  $$('.sheet.open').forEach((s) => { s.classList.remove('open'); s.inert = true; });
  $$('.home > :not(.sheet)').forEach((el) => { el.inert = false; });
}
window.closeSheets = closeSheets;
function openSheet(name) {
  closeSheets();
  const sheet = $('#sheet-' + name);
  sheet.classList.add('open');
  sheet.inert = false;
  $$('.home > :not(.sheet)').forEach((el) => { el.inert = true; });
  sheet.querySelector('.back').focus({ preventScroll: true });
  if (name === 'translate') translateOpen();
  if (name === 'templates') renderTemplates();
  if (name === 'timer') renderTimer();
}
$$('.sheet .back').forEach((b) => b.addEventListener('click', closeSheets));
stateHooks.push((s) => { if (s !== 'open') closeSheets(); });

/* ================= таймер ================= */
let timer = null; // { total, left, endAt, running }
let lastTimerMs = 0;
const tmArc = $('#tm-arc');
const CIRC = 2 * Math.PI * 52;
tmArc.style.strokeDasharray = CIRC;

function fmtDur(ms) {
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return [h && h + uiText(' ч'), m && m + uiText(' мин'), x && x + uiText(' с')].filter(Boolean).join(' ') || uiText('0 с');
}
function tmFmt(ms) {
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  const mm = String(m).padStart(2, '0'), ss = String(x).padStart(2, '0');
  return h ? h + ':' + mm + ':' + ss : mm + ':' + ss;
}
const tmLeft = () => (timer ? (timer.running ? Math.max(0, timer.endAt - Date.now()) : timer.left) : null);
const tmInputsMs = () => (((+$('#tm-m').value || 0) * 60) + (+$('#tm-s').value || 0)) * 1000;

function tmStart(ms) {
  unlockAudio();
  stopAlarm();
  timer = { total: ms, left: ms, endAt: Date.now() + ms, running: true };
  lastTimerMs = ms;
  renderTimer();
}
function tmToggle() {
  unlockAudio();
  if (!timer) { const ms = tmInputsMs(); if (ms > 0) tmStart(ms); return; }
  if (timer.running) { timer.left = Math.max(0, timer.endAt - Date.now()); timer.running = false; }
  else { timer.endAt = Date.now() + timer.left; timer.running = true; }
  renderTimer();
}
function tmReset() { timer = null; stopAlarm(); renderTimer(); }

function renderTimer() {
  const left = tmLeft();
  $('#tm-time').textContent = tmFmt(left ?? tmInputsMs());
  const frac = timer ? left / timer.total : 1;
  tmArc.style.strokeDashoffset = CIRC * (1 - frac);
  $('#tm-go').textContent = !timer ? uiText('Старт') : timer.running ? uiText('Пауза') : uiText('Продолжить');
  $('#tm-reset').disabled = !timer && !alarmTimer;
  const badge = $('#timer-status');
  isl.classList.toggle('timer-active', !!timer);
  badge.hidden = !timer;
  if (timer) badge.title = (timer.running ? uiText('Осталось ') : uiText('На паузе · ')) + tmFmt(left);
}
window.renderTimer = renderTimer;

function tmFinish() {
  const ms = timer.total;
  timer = null;
  lastTimerMs = ms;
  startAlarm();
  const shown = showNotice({ icon: '⏳', text: uiText('Время вышло · ') + fmtDur(ms), sticky: true, wide: true, buttons: true });
  if (!shown) flashToast(uiText('⏳ Время вышло · ') + fmtDur(ms) + uiText('   (нажми, чтобы выключить звук)'), 0);
}
setInterval(() => {
  if (timer && timer.running && Date.now() >= timer.endAt) tmFinish();
  if (timer || state === 'open') renderTimer();
}, 200);

$('#tm-go').addEventListener('click', tmToggle);
$('#tm-reset').addEventListener('click', tmReset);
$('#tm-m').addEventListener('input', renderTimer);
$('#tm-s').addEventListener('input', renderTimer);
$$('.chips button').forEach((b) => b.addEventListener('click', () => {
  const min = +b.dataset.min;
  $('#tm-m').value = min;
  $('#tm-s').value = 0;
  tmStart(min * 60000);
}));
$('#n-again').addEventListener('click', (e) => { e.stopPropagation(); stopAlarm(); if (lastTimerMs) tmStart(lastTimerMs); endNotice(); });
$('#n-ok').addEventListener('click', (e) => { e.stopPropagation(); stopAlarm(); endNotice(); });
$('#notice').addEventListener('click', stopAlarm);
$('#toast').addEventListener('click', stopAlarm);
$('#timer-status').addEventListener('click', () => {
  pinned = !autoHide;
  setState('open');
  showTab('home');
  openSheet('timer');
});

/* ================= раскладка ================= */
const EN = "qwertyuiop[]asdfghjkl;'zxcvbnm,./`QWERTYUIOP{}ASDFGHJKL:\"ZXCVBNM<>?~@#$^&";
const RU = 'йцукенгшщзхъфывапролджэячсмитьбю.ёЙЦУКЕНГШЩЗХЪФЫВАПРОЛДЖЭЯЧСМИТЬБЮ,Ё"№;:?';
const TO_RU = {}, TO_EN = {};
for (let i = 0; i < EN.length; i++) {
  TO_RU[EN[i]] = RU[i];
  if (/[а-яё]/i.test(RU[i])) TO_EN[RU[i]] = EN[i]; // обратно переводим только буквы
}
const isLat = (c) => /[a-z]/i.test(c || '');
const PUNCT_LETTER_KEYS = "[]{};':\"<>,.~`";

const ALWAYS = { '/': '.', '?': ',', '&': '?', '@': '"', '#': '№', '$': ';', '^': ':' };

function convertLayout(text) {
  const lat = (text.match(/[a-z]/gi) || []).length;
  const cyr = (text.match(/[а-яё]/gi) || []).length;
  if (!lat && !cyr) return text;
  let out = '';
  if (lat > cyr) { // набрано в английской раскладке, нужен русский
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (/[a-z]/i.test(ch)) out += TO_RU[ch];
      else if (PUNCT_LETTER_KEYS.includes(ch) && isLat(text[i + 1])) out += TO_RU[ch]; // [ ] ; ' , . внутри слова: это буквы х ъ ж э б ю
      else out += ALWAYS[ch] !== undefined ? ALWAYS[ch] : ch;
    }
    return out;
  }
  for (const ch of text) out += TO_EN[ch] !== undefined ? TO_EN[ch] : ch; // набрано в русской, нужен английский
  return out;
}
async function fixLayout() {
  let t = '';
  try { t = await T.clipboardManager.readText(); } catch {}
  if (!t) { flashToast(uiText('В буфере нет текста'), 1800); say(uiText('Сначала скопируй текст 🙂')); return; }
  const out = convertLayout(t);
  if (out === t) { flashToast(uiText('Здесь нечего исправлять'), 1800); return; }
  await copyText(out);
  addHistory(out);
  flashToast(uiText('Раскладка исправлена: ') + out.replace(/\s+/g, ' ').slice(0, 60), 2600);
  say(uiText('Раскладка исправлена ✔'));
}

/* ================= шаблоны ================= */
let templates = store.get('templates', [
  { id: 1, title: uiText('Спасибо'), text: uiText('Спасибо! Скоро вернусь с ответом.') },
  { id: 2, title: uiText('Занят'), text: uiText('Сейчас занят, отвечу чуть позже.') },
]);
let tplEditing = null;
const tplFilter = $('#tpl-filter');

function renderTemplates() {
  const selected = tplFilter.value;
  const categories = [...new Set(templates.map((t) => t.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
  tplFilter.replaceChildren(new Option(uiText('Все категории'), ''), ...categories.map((c) => new Option(c, c)));
  tplFilter.value = categories.includes(selected) ? selected : '';
  const visible = templates.filter((t) => !tplFilter.value || t.category === tplFilter.value);
  const box = $('#tpl-list');
  box.replaceChildren();
  if (!visible.length) box.innerHTML = '<div class="empty">' + uiText('Шаблонов пока нет.') + '</div>';
  visible.forEach((t) => {
    const el = document.createElement('div');
    el.className = 'item tpl';
    el.innerHTML = '<button class="tpl-copy"><strong></strong><span></span></button><div class="acts"></div>';
    const copy = el.querySelector('.tpl-copy');
    copy.title = t.text;
    copy.querySelector('strong').textContent = t.category ? t.category + ' ·' : '';
    copy.querySelector('span').textContent = t.title;
    copy.onclick = async () => {
      try {
        await copyText(t.text);
        flashToast(uiText('Шаблон скопирован'), 1200);
      } catch { flashToast(uiText('Не удалось скопировать шаблон')); }
    };
    const edit = document.createElement('button');
    edit.className = 'action';
    edit.setAttribute('aria-label', uiText('Редактировать шаблон'));
    edit.innerHTML = icon('edit');
    edit.onclick = () => {
      tplEditing = t.id;
      $('#tpl-title').value = t.title;
      $('#tpl-category').value = t.category || '';
      $('#tpl-text').value = t.text;
      $('#tpl-save').textContent = uiText('Сохранить');
      $('#tpl-cancel').hidden = false;
      $('#tpl-title').focus();
    };
    const del = document.createElement('button');
    del.className = 'action';
    del.setAttribute('aria-label', uiText('Удалить шаблон'));
    del.innerHTML = icon('trash');
    del.onclick = () => {
      if (tplEditing === t.id) tplReset();
      templates = templates.filter((x) => x !== t);
      store.set('templates', templates);
      renderTemplates();
    };
    el.querySelector('.acts').append(edit, del);
    box.append(el);
  });
}
function tplReset() {
  tplEditing = null;
  $('#tpl-title').value = $('#tpl-category').value = $('#tpl-text').value = '';
  $('#tpl-save').textContent = uiText('Добавить');
  $('#tpl-cancel').hidden = true;
}
tplFilter.addEventListener('change', renderTemplates);
$('#tpl-save').addEventListener('click', () => {
  const text = $('#tpl-text').value.trim();
  if (!text) { $('#tpl-text').focus(); return; }
  const title = $('#tpl-title').value.trim() || text.slice(0, 20);
  const category = $('#tpl-category').value.trim();
  const existing = templates.find((t) => t.id === tplEditing);
  if (existing) Object.assign(existing, { title, category, text });
  else templates.unshift({ id: Date.now(), title, category, text });
  if (tplFilter.value && tplFilter.value !== category) tplFilter.value = '';
  store.set('templates', templates);
  tplReset();
  renderTemplates();
});
$('#tpl-cancel').addEventListener('click', tplReset);

/* ================= перевод ================= */
const LANGS = [['auto', 'Авто (рус ⇄ англ)'], ['en', 'English'], ['ru', 'Русский'], ['de', 'Deutsch'], ['fr', 'Français'],
  ['es', 'Español'], ['it', 'Italiano'], ['tr', 'Türkçe'], ['uk', 'Українська'], ['zh-CN', '中文'], ['ja', '日本語']];
const LANG_NAME = { ru: 'Русский', en: 'English' };
for (const [v, n] of LANGS) { const o = document.createElement('option'); o.value = v; o.textContent = uiText(n); $('#tr-to').append(o); }
$('#tr-to').value = store.get('trTo', 'auto');

let trTimer = null;
let trSeq = 0;
let translationReady = false;
const trDetect = (s) => ((s.match(/[а-яё]/gi) || []).length > (s.match(/[a-z]/gi) || []).length ? 'ru' : 'en');

function trChunks(s) {
  const parts = s.split(/(?<=[.!?\n])\s+/);
  const out = [];
  let cur = '';
  for (const p of parts) {
    if ((cur + ' ' + p).length > 450 && cur) { out.push(cur); cur = p; } else cur = cur ? cur + ' ' + p : p;
  }
  if (cur) out.push(cur);
  return out.flatMap((c) => (c.length > 450 ? c.match(/.{1,450}/gs) : [c]));
}
async function translateNow() {
  const src = $('#tr-in').value.trim();
  const out = $('#tr-out');
  translationReady = false;
  if (!src) { out.value = ''; return; }
  const from = trDetect(src);
  let to = $('#tr-to').value;
  if (to === 'auto') to = from === 'ru' ? 'en' : 'ru';
  $('#tr-from').textContent = uiText(LANG_NAME[from] || from);
  const seq = ++trSeq;
  out.value = uiText('Перевожу…');
  try {
    const res = [];
    for (const c of trChunks(src)) {
      const r = await (await fetch('https://api.mymemory.translated.net/get?q=' + encodeURIComponent(c) + '&langpair=' + from + '|' + to)).json();
      if (seq !== trSeq) return;
      const txt = r.responseData && r.responseData.translatedText;
      if (!txt || /MYMEMORY WARNING/i.test(txt)) { out.value = uiText('Лимит бесплатного сервиса исчерпан. Попробуй позже или нажми «В браузере».'); return; }
      res.push(txt);
    }
    out.value = res.join(' ');
    translationReady = true;
  } catch { if (seq === trSeq) out.value = uiText('Нет связи с сервисом перевода.'); }
}
const trSoon = () => { clearTimeout(trTimer); trTimer = setTimeout(translateNow, 500); };
$('#tr-in').addEventListener('input', trSoon);
$('#tr-to').addEventListener('change', () => { store.set('trTo', $('#tr-to').value); translateNow(); });
$('#tr-paste').addEventListener('click', async () => { try { $('#tr-in').value = (await T.clipboardManager.readText()) || ''; } catch {} translateNow(); });
$('#tr-copy').addEventListener('click', async () => {
  const v = $('#tr-out').value;
  if (v && translationReady) { await copyText(v); say(uiText('Перевод скопирован ✨')); }
});
$('#tr-web').addEventListener('click', () => {
  const src = $('#tr-in').value.trim();
  let to = $('#tr-to').value;
  if (to === 'auto') to = trDetect(src || 'a') === 'ru' ? 'en' : 'ru';
  T.opener.openUrl('https://translate.google.com/?sl=auto&tl=' + to + '&text=' + encodeURIComponent(src) + '&op=translate');
});
async function translateOpen() {
  if (!$('#tr-in').value.trim()) {
    try { const t = await T.clipboardManager.readText(); if (t) $('#tr-in').value = t.slice(0, 2000); } catch {}
  }
  translateNow();
  setTimeout(() => $('#tr-in').focus(), 80);
}

/* ================= текст с экрана ================= */
async function startOcr() {
  busy = true;
  pinned = false;
  setState('hidden');
  try { await invoke('snip_start'); }
  catch { busy = false; notifyLater({ icon: '🔤', text: uiText('Не удалось открыть выбор области') }); }
}
T.event.listen('ocr-result', (e) => {
  busy = false;
  const r = e.payload || {};
  if (r.cancel) { setState('pill'); return; }
  if (r.ok) {
    lastText = r.text;
    addHistory(r.text);
    showNotice({ icon: '🔤', text: uiText('Текст скопирован · ') + r.text.replace(/\s+/g, ' ').slice(0, 30), ms: 2600 });
  } else {
    showNotice({ icon: '🔤', text: uiText(r.error || 'Не удалось распознать'), ms: 3200, wide: true });
  }
});

/* ================= плитки ================= */
const actions = {
  ocr: startOcr,
  timer: () => openSheet('timer'),
  layout: fixLayout,
  templates: () => openSheet('templates'),
  explorer: () => { invoke('open_explorer'); say(uiText('Открываю Проводник 📁')); },
  translate: () => openSheet('translate'),
};
$$('[data-act]').forEach((b) => b.addEventListener('click', () => actions[b.dataset.act]()));

/* ================= ярлыки ================= */
const SLOT_COUNT = 14;
let slots = store.get('slots', []);
while (slots.length < SLOT_COUNT) slots.push(null);
const shortcutIcons = new Map();
const shortcutPicker = $('#shortcut-picker');
let shortcutIndex = null;
let shortcutWasPinned = false;
let startApps = [];
let loadingApps = null;
let startAppsFailed = false;

const baseName = (p) => p.split(/[\\/]/).filter(Boolean).pop() || p;
function nameOf(p) {
  if (/^https?:/i.test(p)) return p.replace(/^https?:\/\//i, '').split('/')[0];
  return baseName(p).replace(/\.(lnk|exe|url)$/i, '');
}
function shortcutImage(path) {
  if (!shortcutIcons.has(path)) {
    shortcutIcons.set(path, invoke('shortcut_icon', { path }).catch(() => null));
  }
  return shortcutIcons.get(path);
}

function renderSlots() {
  const box = $('#slots');
  box.replaceChildren();
  slots.forEach((s, i) => {
    const el = document.createElement('button');
    el.className = 'slot';
    el.dataset.i = i;
    const wrap = document.createElement('div');
    wrap.className = 'slot-wrap';
    wrap.append(el);
    if (s) {
      const name = s.name || nameOf(s.path);
      el.classList.add('filled');
      el.title = name;
      const isUrl = /^https?:/i.test(s.path);
      const isFolder = !isUrl && !/\.[a-z0-9]{1,5}$/i.test(baseName(s.path));
      if (isUrl || (isFolder && !s.name)) el.innerHTML = icon(isUrl ? 'link' : 'folder');
      else el.textContent = (name[0] || '?').toUpperCase();
      if (!isUrl) shortcutImage(s.path).then((src) => {
        if (!src || !el.isConnected) return;
        const img = new Image();
        img.alt = '';
        img.onload = () => el.replaceChildren(img);
        img.src = src;
      });
      el.setAttribute('aria-label', uiText('Открыть ') + name);
      const x = document.createElement('button');
      x.className = 'x';
      x.setAttribute('aria-label', uiText('Удалить ярлык ') + name);
      x.innerHTML = icon('close');
      x.onclick = () => {
        slots[i] = null;
        shortcutIcons.delete(s.path);
        store.set('slots', slots);
        renderSlots();
        box.children[i].firstElementChild.focus();
      };
      wrap.append(x);
      el.onclick = async () => {
        try { await invoke('open_path', { path: s.path }); }
        catch { flashToast(uiText('Не удалось открыть «') + name + uiText('»')); }
      };
    } else {
      el.innerHTML = icon('plus');
      el.title = uiText('Добавить ярлык');
      el.onclick = () => pickShortcut(i);
    }
    box.append(wrap);
  });
}
function saveShortcut(i, shortcut) {
  slots[i] = shortcut;
  store.set('slots', slots);
  renderSlots();
  say(uiText('Ярлык добавлен'));
}

function renderStartApps() {
  const box = $('#shortcut-apps');
  box.replaceChildren();
  const query = $('#shortcut-search').value.trim().toLocaleLowerCase('ru');
  if (loadingApps || startAppsFailed) {
    box.textContent = loadingApps ? uiText('Загружаю список приложений…') : uiText('Не удалось загрузить приложения из меню «Пуск». Можно выбрать файл ярлыка.');
    return;
  }
  const matches = startApps.filter((app) => app.name.toLocaleLowerCase('ru').includes(query));
  if (!matches.length) box.textContent = uiText('Приложения не найдены.');
  for (const app of matches) {
    const button = document.createElement('button');
    button.className = 'item';
    button.textContent = app.name;
    button.onclick = () => {
      saveShortcut(shortcutIndex, { name: app.name, path: 'shell:AppsFolder\\' + app.id });
      shortcutPicker.close();
    };
    box.append(button);
  }
}

async function pickShortcut(i) {
  if (shortcutPicker.open) return;
  shortcutIndex = i;
  shortcutWasPinned = pinned;
  pinned = true;
  $('#shortcut-search').value = '';
  shortcutPicker.showModal();
  if (!loadingApps) {
    startAppsFailed = false;
    loadingApps = invoke('start_apps').then((apps) => { startApps = apps; })
      .catch(() => { startAppsFailed = true; })
      .finally(() => { loadingApps = null; renderStartApps(); });
  }
  renderStartApps();
}
$('#shortcut-search').addEventListener('input', renderStartApps);
$('#shortcut-search').addEventListener('keydown', (e) => {
  const apps = $('#shortcut-apps');
  if (e.key === 'Enter' && apps.childElementCount === 1) apps.firstElementChild.click();
});
$('#shortcut-close').addEventListener('click', () => shortcutPicker.close());
shortcutPicker.addEventListener('close', () => {
  pinned = shortcutWasPinned;
  $('#slots').children[shortcutIndex]?.firstElementChild.focus();
});
$('#shortcut-file').addEventListener('click', async (e) => {
  const button = e.currentTarget;
  const index = shortcutIndex;
  button.disabled = true;
  try {
    const path = await T.dialog.open({ multiple: false, directory: false, title: uiText('Выбери программу, файл или ярлык') });
    if (typeof path === 'string' && path && shortcutPicker.open && shortcutIndex === index) {
      saveShortcut(index, { path });
      shortcutPicker.close();
    }
  } catch { $('#shortcut-apps').textContent = uiText('Не удалось открыть выбор файла.'); }
  finally { button.disabled = false; }
});
stateHooks.push((s) => { if (s !== 'open' && shortcutPicker.open) shortcutPicker.close(); });

/* перетаскивание файлов, папок и ярлыков на остров */
function slotAt(pos) {
  if (!pos) return null;
  const k = window.devicePixelRatio || 1;
  try {
    const el = document.elementFromPoint(pos.x / k, pos.y / k);
    const s = el && el.closest && el.closest('.slot');
    return s ? +s.dataset.i : null;
  } catch { return null; }
}
function setHot(i) { $$('.slot').forEach((el) => el.classList.toggle('hot', i !== null && +el.dataset.i === i)); }

T.webview.getCurrentWebview().onDragDropEvent((e) => {
  if (shortcutPicker.open) return;
  const p = e.payload;
  if (p.type === 'enter' || p.type === 'over') {
    if (state !== 'open') { setState('open'); showTab('home'); }
    setHot(slotAt(p.position));
  } else if (p.type === 'drop') {
    let target = slotAt(p.position);
    for (const path of p.paths) {
      let i = target !== null && !slots[target] ? target : slots.findIndex((s) => !s);
      if (i < 0) break;
      slots[i] = { path };
      target = null;
    }
    store.set('slots', slots);
    renderSlots();
    setHot(null);
    say(uiText('Ярлык добавлен 👍'));
  } else setHot(null);
});

/* ================= старт ================= */
renderSlots();
renderTemplates();
renderTimer();
