const MIGRATION_KEYS = [
  'tasks', 'templates', 'history', 'note', 'reminders', 'slots',
  'autohide', 'volMode', 'geo', 'trTo', 'language',
];

async function migrateDevStorage() {
  const { invoke } = window.__TAURI__.core;
  if (location.hostname === '127.0.0.1' && location.port === '1430') {
    const data = {};
    for (const key of MIGRATION_KEYS) {
      const value = localStorage.getItem(key);
      if (value !== null) data[key] = value;
    }
    if (Object.keys(data).length) await invoke('save_dev_storage', { data });
  } else if (location.hostname === 'tauri.localhost') {
    const data = await invoke('read_dev_storage');
    if (!data) return;
    for (const key of MIGRATION_KEYS) {
      if (typeof data[key] === 'string' && localStorage.getItem(key) === null) {
        localStorage.setItem(key, data[key]);
      }
    }
    await invoke('finish_dev_storage');
  }
}

migrateDevStorage().catch((error) => console.warn('Island storage migration:', error)).finally(() => {
  uiLanguage = savedUiLanguage();
  document.documentElement.lang = uiLanguage;
  staticTranslations.forEach((render) => render());
  for (const name of ['icons', 'app', 'weather', 'media', 'buddy', 'features', 'language']) {
    const script = document.createElement('script');
    script.async = false;
    script.src = name + '.js';
    document.body.append(script);
  }
});
