/* Набор линейных иконок. <i data-icon="имя"></i> заполняется автоматически. */
const $$ = (s) => document.querySelectorAll(s);

const BRACKETS = '<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/>';
const FILL = 'fill="currentColor" stroke="none"';
const ICONS = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/><path d="M10 19.5v-5h4v5"/>',
  tasks: '<rect x="5.5" y="4.5" width="13" height="16" rx="2.5"/><path d="M9.5 4.5V3.5h5v1"/><path d="M9 10h6M9 14h6M9 17.5h3.5"/>',
  clip: '<path d="M5 4.5h11l3 3v12.5H5z"/><path d="M8 4.5v5h7v-5"/><rect x="8" y="13.5" width="8" height="6"/>',
  bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
  cloud: '<path d="M7 18a4.5 4.5 0 0 1-.5-9A6 6 0 0 1 18 9.5 4 4 0 0 1 17.5 18z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  ocr: BRACKETS + '<text x="12" y="14.3" font-size="6.4" font-weight="700" text-anchor="middle" ' + FILL + ' font-family="Segoe UI,sans-serif">Abc</text>',
  timer: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  stopwatch: '<circle cx="12" cy="14" r="8.5"/><path d="M9.5 2h5M12 2v3.5M4 4.5 2.5 6M20 4.5 21.5 6M9.5 10.5l2.5 3.5h3.5"/>',
  layout: BRACKETS + '<path d="M8 9.5v5M11 8.5v7M14 10v4M16.5 9v6"/>',
  templates: '<rect x="4.5" y="5" width="11" height="12" rx="2"/><path d="M8 20h8.5a2.5 2.5 0 0 0 2.5-2.5V9"/>',
  clipper: '<path d="M19.5 11.5 11.8 19.2a4.6 4.6 0 0 1-6.5-6.5l8-8a3 3 0 0 1 4.2 4.2l-8 8a1.4 1.4 0 0 1-2-2l7.2-7.2"/>',
  folder: '<path d="M3.5 7a2 2 0 0 1 2-2H10l2 2.5h6.5a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
  search: '<circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 4.5 4.5"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1"/>',
  translate: '<path d="M4 6h8M8 4v2M5.5 6c.7 3 2.7 5.2 5.5 6.3M10.5 6c-.8 3.2-3.2 5.6-6.5 7"/><path d="M12.5 20l4-10 4 10M14 16.5h5"/>',
  mixer: '<path d="M6 3.5v17M12 3.5v17M18 3.5v17"/><circle cx="6" cy="14" r="2.3" ' + FILL + '/><circle cx="12" cy="8" r="2.3" ' + FILL + '/><circle cx="18" cy="12" r="2.3" ' + FILL + '/>',
  monitor: '<rect x="3.5" y="4.5" width="17" height="11.5" rx="2"/><path d="M9 20h6M12 16v4"/>',
  note: '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
  speaker: '<path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  mute: '<path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
  headphones: '<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3.5" y="14" width="4" height="6" rx="1.5"/><rect x="16.5" y="14" width="4" height="6" rx="1.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  back: '<path d="M14.5 6 8.5 12l6 6"/>',
  play: '<path d="M8 5.2v13.6a.6.6 0 0 0 .9.5l11-6.8a.6.6 0 0 0 0-1L8.9 4.7a.6.6 0 0 0-.9.5z" ' + FILL + '/>',
  pause: '<rect x="6.5" y="5" width="3.8" height="14" rx="1.2" ' + FILL + '/><rect x="13.7" y="5" width="3.8" height="14" rx="1.2" ' + FILL + '/>',
  prev: '<rect x="5" y="5.5" width="2.6" height="13" rx="1" ' + FILL + '/><path d="M19 6.2v11.6a.5.5 0 0 1-.8.4l-8.6-5.8a.5.5 0 0 1 0-.8l8.6-5.8a.5.5 0 0 1 .8.4z" ' + FILL + '/>',
  next: '<rect x="16.4" y="5.5" width="2.6" height="13" rx="1" ' + FILL + '/><path d="M5 6.2v11.6a.5.5 0 0 0 .8.4l8.6-5.8a.5.5 0 0 0 0-.8L5.8 5.8a.5.5 0 0 0-.8.4z" ' + FILL + '/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  trash: '<path d="M5 7h14M10 7V4.5h4V7M7 7l1 12.5h8L17 7"/>',
  edit: '<path d="M5 19l1-4L16 5a2 2 0 0 1 3 3L9 18z"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  swap: '<path d="M5 9h13l-3-3M19 15H6l3 3"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5"/>',
  lock: '<rect x="5.5" y="11" width="13" height="9" rx="2"/><path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  restart: '<path d="M19 12a7 7 0 1 1-2.1-5"/><path d="M19 4.5V8h-3.5"/>',
  power: '<path d="M12 3.5v8"/><path d="M7 6.5a7.5 7.5 0 1 0 10 0"/>',
};

function icon(name, size) {
  const s = size ? ' width="' + size + '" height="' + size + '"' : '';
  return '<svg viewBox="0 0 24 24"' + s + ' fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[name] || '') + '</svg>';
}
function applyIcons(root) {
  (root || document).querySelectorAll('[data-icon]').forEach((e) => { e.innerHTML = icon(e.dataset.icon); });
}
applyIcons();
