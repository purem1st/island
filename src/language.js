function renderLanguage() {
  $$('#language-seg button').forEach((button) => {
    button.setAttribute('aria-pressed', button.dataset.language === uiLanguage);
  });
}

function changeLanguage(language) {
  if (!['ru', 'en'].includes(language) || language === uiLanguage) return;
  // Finish any inline edit before refreshing the task list.
  document.activeElement?.blur();
  uiLanguage = language;
  store.set('language', language);
  document.documentElement.lang = language;
  staticTranslations.forEach((render) => render());
  renderLanguage();
  $$('#task-categories button').forEach((button) => {
    button.textContent = uiText(TASK_CATEGORIES[button.dataset.category]);
  });
  $$('#tr-to option').forEach((option) => {
    option.textContent = uiText(LANGS.find(([value]) => value === option.value)[1]);
  });
  $('#tr-from').textContent = $('#tr-in').value.trim() ? uiText(LANG_NAME[trDetect($('#tr-in').value)]) : uiText('Авто');
  $('#tpl-save').textContent = uiText(tplEditing === null ? 'Добавить' : 'Сохранить');
  renderTasks();
  renderClip();
  renderReminders();
  renderTemplates();
  renderSlots();
  renderTimer();
  renderMedia();
  if (shortcutPicker.open) renderStartApps();
  say(randomPhrase());
  loadWeather(true);
  pollDevice();
}

$$('#language-seg button').forEach((button) => {
  button.addEventListener('click', () => changeLanguage(button.dataset.language));
});
renderLanguage();
