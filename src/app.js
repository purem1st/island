const T = window.__TAURI__;
const { invoke } = T.core;
const $ = (s) => document.querySelector(s);
const isl = $('#island');

const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { localStorage.setItem(k, JSON.stringify(v)); },
};
const stateHooks = [];  // функции, которым сообщают о смене состояния острова
const cursorHooks = []; // функции, которым сообщают о движении курсора

/* =========================================================
   Состояния острова: hidden → pill → open / notice
   Окно всегда большое и прозрачное, мышь проходит сквозь него.
   Позицию курсора присылает Rust.
   ========================================================= */
const WIN_W = 860;
const TOP = 10;
const AUTOHIDE_DELAY = 2500;
const SIZES = { notice: [320, 58], open: [760, 470] };

let state = 'hidden';
let pinned = false;
let busy = false; // true, пока идёт выбор области для «Текст с экрана»
let autoHide = store.get('autohide', true);
let cur = { x: -9999, y: -9999, top: 9999 };
let hoverSince = 0;
let leaveSince = 0;
let openGraceUntil = 0;
let lastActive = Date.now();
let interactive = false;
let noticeTimer = null;
let noticeFrom = 'pill';

function setState(s) {
  if (s === state) return;
  state = s;
  isl.dataset.state = s;
  $('#panel').inert = s !== 'open';
  $('#notice').inert = s !== 'notice';
  leaveSince = 0;
  if (s !== 'pill') isl.classList.remove('near');
  if (s !== 'open') openGraceUntil = 0;
  if (s === 'pill' || s === 'open') lastActive = Date.now();
  stateHooks.forEach((f) => f(s));
}

function cursorIn(el, pad = 0) {
  const r = el.getBoundingClientRect();
  return cur.x >= r.left - pad && cur.x <= r.right + pad && cur.y >= Math.max(0, r.top - pad) && cur.y <= r.bottom + pad;
}
function hitTest(pad) {
  if (state === 'hidden') return false;
  if (state === 'pill') return cursorIn(isl, pad) || (!$('#timer-status').hidden && cursorIn($('#timer-status'), pad));
  const [w, h] = SIZES[state];
  const cx = WIN_W / 2;
  return cur.x >= cx - w / 2 - pad && cur.x <= cx + w / 2 + pad && cur.y >= 0 && cur.y <= TOP + h + pad;
}
function nearTop() { return cur.top >= 0 && cur.top <= 6 && Math.abs(cur.x - WIN_W / 2) <= 260; }
function setInteractive(v) {
  if (v === interactive) return;
  interactive = v;
  invoke('set_interactive', { interactive: v });
}

function tick() {
  const now = Date.now();
  const over = hitTest(state === 'open' ? 14 : 10);
  setInteractive(over);
  if (busy || state === 'notice') return;

  if (state === 'hidden') {
    if (nearTop()) { setState('pill'); hoverSince = now; }
    return;
  }
  if (over) {
    lastActive = now;
    leaveSince = 0;
    openGraceUntil = 0;
    isl.classList.toggle('near', state === 'pill');
    if (state === 'pill' && cursorIn(isl, 5)) {
      if (!hoverSince) hoverSince = now;
      if (now - hoverSince >= 120) setState('open');
    } else hoverSince = 0;
  } else {
    hoverSince = 0;
    isl.classList.remove('near');
    if (state === 'open' && !pinned && now >= openGraceUntil) {
      if (!leaveSince) leaveSince = now;
      if (now - leaveSince >= 300) setState('pill');
    }
    if (state === 'pill' && autoHide && now - lastActive >= AUTOHIDE_DELAY && !nearTop()) setState('hidden');
  }
}

T.event.listen('cursor', (e) => { cur = e.payload; tick(); cursorHooks.forEach((f) => f(cur)); });
setInterval(tick, 80);

function closeIsland() {
  pinned = false;
  if (state === 'open') setState('pill');
}
$('#close').addEventListener('click', closeIsland);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#shortcut-picker').open) closeIsland(); });

T.event.listen('toggle', () => {
  if (state === 'open') closeIsland();
  else {
    pinned = !autoHide;
    openGraceUntil = Date.now() + AUTOHIDE_DELAY;
    setState('open');
  }
});

/* ---------- автоскрытие ---------- */
function renderAutohide() {
  $('#autohide').classList.toggle('on', autoHide);
  $('#autohide').setAttribute('aria-checked', autoHide);
}
$('#autohide').addEventListener('click', () => {
  autoHide = !autoHide;
  store.set('autohide', autoHide);
  renderAutohide();
  if (autoHide) pinned = false;
  if (!autoHide && state === 'hidden') setState('pill');
});
renderAutohide();

/* ---------- уведомления («живые события») ---------- */
function showNotice({ icon, text, sticky = false, ms = 1600, wide = false, buttons = false }) {
  if (state === 'open') return false;
  noticeFrom = state === 'hidden' ? 'hidden' : 'pill';
  SIZES.notice = [wide ? 440 : 320, 58];
  isl.classList.toggle('wide', wide);
  isl.classList.toggle('btns', buttons);
  $('#n-icon').textContent = icon;
  $('#n-text').textContent = text;
  isl.classList.remove('sticky');
  void isl.offsetWidth;
  isl.classList.toggle('sticky', sticky);
  clearTimeout(noticeTimer);
  setState('notice');
  if (!sticky) noticeTimer = setTimeout(endNotice, ms);
  return true;
}
function endNotice() {
  clearTimeout(noticeTimer);
  if (state !== 'notice') return;
  isl.classList.remove('sticky');
  setState(noticeFrom === 'hidden' && autoHide ? 'hidden' : 'pill');
  lastActive = Date.now();
}
$('#notice').addEventListener('click', endNotice);

let toastTimer = null;
function flashToast(text, ms = 2400) {
  const el = $('#toast');
  el.hidden = false;
  el.textContent = text;
  el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  clearTimeout(toastTimer);
  if (ms) toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}
$('#toast').addEventListener('click', () => { $('#toast').hidden = true; });

/* ---------- вкладки ---------- */
function showTab(name) {
  $$('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  $$('.page').forEach((p) => p.classList.toggle('active', p.id === 'page-' + name));
  if (window.closeSheets) window.closeSheets();
}
$$('.tab').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

/* ---------- часы на пилюле ---------- */
function clock() {
  const time = new Date().toLocaleTimeString(uiLocale(), { hour: '2-digit', minute: '2-digit', hour12: false });
  $('#clock').textContent = !isl.classList.contains('playing') && !isl.classList.contains('timer-active') &&
    typeof wxTemp !== 'undefined' && wxTemp !== null ? time + ' · ' + wxTemp + '°' : time;
  $('#panel-clock').textContent = time;
}
clock();
setInterval(clock, 1000);

/* ---------- звук ---------- */
let audioCtx = null;
let alarmTimer = null;

function unlockAudio() {
  try {
    audioCtx = audioCtx || new AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch {}
}
document.addEventListener('pointerdown', unlockAudio, true);
document.addEventListener('keydown', unlockAudio, true);

function chime() {
  unlockAudio();
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  [880, 1108.7, 1318.5].forEach((f, i) => {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    const at = t + i * 0.17;
    o.type = 'sine';
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(0.35, at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.6);
    o.connect(g).connect(audioCtx.destination);
    o.start(at);
    o.stop(at + 0.65);
  });
}
function startAlarm() {
  stopAlarm();
  chime();
  let n = 0;
  alarmTimer = setInterval(() => { chime(); if (++n >= 20) stopAlarm(); }, 1600); // до ~30 секунд
  if (window.renderTimer) window.renderTimer();
}
function stopAlarm() {
  if (alarmTimer) { clearInterval(alarmTimer); alarmTimer = null; }
  if (window.renderTimer) window.renderTimer();
}

/* ---------- история буфера ---------- */
let history = store.get('history', []); // { text, pin }
let lastText = null;

function addHistory(text) {
  const old = history.find((h) => h.text === text);
  history = history.filter((h) => h.text !== text);
  history.unshift({ text, pin: old?.pin ?? false });
  let free = 50;
  history = history.filter((h) => h.pin || free-- > 0);
  store.set('history', history);
  renderClip();
}
async function pollClipboard() {
  try {
    const text = await T.clipboardManager.readText();
    if (!text) return;
    if (lastText === null) { lastText = text; return; } // первый опрос: просто запоминаем
    if (text === lastText) return;
    lastText = text;
    addHistory(text);
    if (state === 'pill') showNotice({ icon: '📋', text: text.replace(/\s+/g, ' ').slice(0, 40) });
  } catch { /* в буфере не текст */ }
}
setInterval(pollClipboard, 700);

async function copyText(text) {
  lastText = text;
  await T.clipboardManager.writeText(text);
}

function renderClip() {
  const q = $('#clip-search').value.toLowerCase();
  const box = $('#clip-list');
  box.replaceChildren();
  const items = history.filter((h) => h.text.toLowerCase().includes(q));
  if (!items.length) { box.innerHTML = "<div class=\"empty\">" + uiText("Пока пусто. Скопируй что-нибудь.") + "</div>"; return; }
  items.forEach((h, i) => {
    const el = document.createElement('div');
    el.className = 'item';
    el.style.setProperty('--i', Math.min(i, 10));
    const t = document.createElement('span');
    t.className = 'txt';
    t.textContent = h.text.replace(/\s+/g, ' ');
    const pin = document.createElement('button');
    pin.className = 'action pin' + (h.pin ? ' on' : '');
    pin.setAttribute('aria-label', h.pin ? uiText('Открепить запись') : uiText('Закрепить запись'));
    pin.textContent = '★';
    pin.onclick = (e) => { e.stopPropagation(); h.pin = !h.pin; store.set('history', history); renderClip(); };
    const del = document.createElement('button');
    del.className = 'action';
    del.setAttribute('aria-label', uiText('Удалить запись'));
    del.innerHTML = icon('trash');
    del.onclick = (e) => { e.stopPropagation(); history = history.filter((x) => x !== h); store.set('history', history); renderClip(); };
    el.onclick = async () => {
      await copyText(h.text);
      const old = t.textContent;
      t.textContent = uiText('✓ Скопировано');
      el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
      setTimeout(() => { t.textContent = old; }, 700);
    };
    el.append(t, pin, del);
    box.append(el);
  });
}
$('#clip-search').addEventListener('input', renderClip);

/* ---------- задачи ---------- */
const TASK_CATEGORIES = {
  important: 'Важные',
  secondary: '2-о степенно',
  minor: 'Маловажно',
  neutral: 'Нейтрально',
  progress: 'В процессе…',
};
let tasks = store.get('tasks', []);
let newTaskCategory = 'neutral';

for (const [category, label] of Object.entries(TASK_CATEGORIES)) {
  const button = document.createElement('button');
  button.dataset.category = category;
  button.textContent = uiText(label);
  button.setAttribute('aria-pressed', category === newTaskCategory);
  button.onclick = () => {
    newTaskCategory = category;
    $$('#task-categories button').forEach((b) => b.setAttribute('aria-pressed', b === button));
  };
  $('#task-categories').append(button);
}

function renderTasks() {
  const box = $('#task-list');
  box.replaceChildren();
  if (!tasks.length) box.innerHTML = "<div class=\"empty\">" + uiText("Задач пока нет. Добавь первую.") + "</div>";
  tasks.forEach((t) => {
    const el = document.createElement('div');
    el.className = 'task';
    const category = Object.hasOwn(TASK_CATEGORIES, t.category) ? t.category : 'neutral';
    el.dataset.category = category;
    const head = document.createElement('div');
    head.className = 'task-title';
    const ck = document.createElement('button');
    ck.className = 'ck';
    ck.setAttribute('aria-label', uiText('Выполнено: ') + t.text);
    ck.innerHTML = icon('check');
    ck.setAttribute('aria-pressed', !!t.done);
    ck.onclick = () => {
      t.done = !t.done;
      store.set('tasks', tasks);
      ck.setAttribute('aria-pressed', t.done);
      updateTaskFooter();
    };
    const tx = document.createElement('span');
    tx.className = 'txt';
    tx.textContent = t.text;
    tx.title = t.text;
    const del = document.createElement('button');
    del.className = 'action';
    del.setAttribute('aria-label', uiText('Удалить задачу'));
    del.innerHTML = icon('trash');
    del.onclick = () => {
      tasks = tasks.filter((x) => x !== t);
      store.set('tasks', tasks);
      el.remove();
      if (tasks.length) updateTaskFooter();
      else renderTasks();
    };
    head.append(ck, tx, del);
    const meta = document.createElement('div');
    meta.className = 'task-meta';
    const categorySelect = document.createElement('select');
    categorySelect.setAttribute('aria-label', uiText('Категория задачи'));
    for (const [value, label] of Object.entries(TASK_CATEGORIES)) categorySelect.add(new Option(uiText(label), value));
    categorySelect.value = category;
    categorySelect.onchange = () => {
      t.category = categorySelect.value;
      el.dataset.category = t.category;
      store.set('tasks', tasks);
    };
    meta.append(categorySelect);
    const created = new Date(t.createdAt ?? t.id);
    if (!Number.isNaN(created.getTime())) {
      const date = document.createElement('time');
      date.dateTime = created.toISOString();
      date.textContent = uiText('Добавлено ') + new Intl.DateTimeFormat(uiLocale(), { dateStyle: 'short', timeStyle: 'short' }).format(created).replace(',', '');
      meta.append(date);
    }
    const desc = document.createElement('button');
    desc.className = 'task-description';
    const updateDescription = () => {
      desc.textContent = t.description || uiText('+ Добавить описание');
      desc.title = t.description || uiText('Добавить описание');
    };
    updateDescription();
    desc.onclick = () => {
      const editor = document.createElement('input');
      editor.maxLength = 240;
      editor.value = t.description || '';
      editor.setAttribute('aria-label', uiText('Описание задачи'));
      desc.replaceWith(editor);
      editor.focus();
      editor.select();
      editor.onblur = () => {
        t.description = editor.value.trim();
        store.set('tasks', tasks);
        updateDescription();
        editor.replaceWith(desc);
      };
      editor.onkeydown = (e) => {
        if (e.key !== 'Escape' && e.key !== 'Enter') return;
        e.stopPropagation();
        if (e.key === 'Escape') editor.value = t.description || '';
        editor.blur();
        desc.focus();
      };
    };
    meta.append(desc);
    el.append(head, meta);
    box.append(el);
  });
  updateTaskFooter();
}
function updateTaskFooter() {
  const left = tasks.filter((t) => !t.done).length;
  $('#task-footer').hidden = !tasks.length;
  $('#task-clear').hidden = left === tasks.length;
  $('#task-count').textContent = tasks.length ? uiText('Осталось: ') + left + uiText(' из ') + tasks.length : '';
}
function addTask() {
  const v = $('#task-input').value.trim();
  if (!v) return;
  tasks.unshift({ id: Date.now(), text: v, done: false, category: newTaskCategory });
  store.set('tasks', tasks);
  $('#task-input').value = '';
  renderTasks();
}
$('#task-form').addEventListener('submit', (e) => { e.preventDefault(); addTask(); });
$('#task-clear').addEventListener('click', () => { tasks = tasks.filter((t) => !t.done); store.set('tasks', tasks); renderTasks(); });

/* ---------- заметка и напоминания ---------- */
$('#note').value = store.get('note', '');
$('#note').addEventListener('input', () => store.set('note', $('#note').value));

let reminders = store.get('reminders', []); // { at, text }

function renderReminders() {
  const box = $('#rem-list');
  box.replaceChildren();
  if (!reminders.length) box.innerHTML = "<div class=\"empty\">" + uiText("Напоминаний нет.") + "</div>";
  reminders.forEach((r, i) => {
    const el = document.createElement('div');
    el.className = 'item';
    el.style.setProperty('--i', i);
    const t = document.createElement('span');
    t.className = 'txt';
    t.textContent = new Date(r.at).toLocaleTimeString(uiLocale(), { hour: '2-digit', minute: '2-digit', hour12: false }) + '  ' + r.text;
    const del = document.createElement('button');
    del.className = 'action';
    del.setAttribute('aria-label', uiText('Удалить напоминание'));
    del.innerHTML = icon('trash');
    del.onclick = () => { reminders = reminders.filter((x) => x !== r); store.set('reminders', reminders); renderReminders(); };
    el.append(t, del);
    box.append(el);
  });
}
$('#rem-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const min = Math.max(1, parseInt($('#rem-min').value, 10) || 1);
  const text = $('#rem-text').value.trim() || uiText('Напоминание');
  reminders.push({ at: Date.now() + min * 60000, text });
  store.set('reminders', reminders);
  $('#rem-text').value = '';
  renderReminders();
});
function showReminder(text) {
  chime();
  if (state === 'open') flashToast('⏰ ' + text, 0);
  else showNotice({ icon: '⏰', text, sticky: true });
}
setInterval(() => {
  const now = Date.now();
  const due = reminders.filter((r) => r.at <= now);
  if (!due.length) return;
  reminders = reminders.filter((r) => r.at > now);
  store.set('reminders', reminders);
  renderReminders();
  due.forEach((r) => showReminder(r.text));
}, 5000);

/* ---------- старт ---------- */
renderClip();
renderTasks();
renderReminders();
setTimeout(() => { if (state === 'hidden') setState('pill'); }, 300);
