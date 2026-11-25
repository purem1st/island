/* Два глазика следят за курсором, рядом появляются дружелюбные фразы */
const eyes = $('#eyes');
const sayEl = $('#say');

const PHRASES = {
  any: ['Я тут. С тобой.', 'Как дела?', 'Всё под контролем 😌', 'Ты отлично справляешься!', 'Не забудь про перерыв ☕',
    'Попей водички 💧', 'Расправь плечи 🧘', 'Дай глазам отдохнуть 👀', 'Я рядом, если что.', 'Хорошего дня! ✨',
    'Давай что-нибудь сделаем?', 'Горжусь тобой!', 'Всё получится 💪'],
  music: ['Классный трек! 🎧', 'Музыка — это жизнь 🎶', 'Подпеваешь? 😄'],
  morning: ['Доброе утро! ☀️', 'Утро — твоё время!'],
  day: ['Добрый день! 🙂', 'Как продвигается день?'],
  evening: ['Добрый вечер 🌆', 'Вечер — время отдыха'],
  night: ['Уже поздно. Отдохни 🌙', 'Ночные дела? Я с тобой.'],
};
const pick = (a) => a[Math.floor(Math.random() * a.length)];

function daypart() {
  const h = new Date().getHours();
  return h >= 5 && h < 11 ? 'morning' : h < 17 ? 'day' : h < 23 ? 'evening' : 'night';
}
function say(text) {
  if (sayEl.textContent === text) return;
  sayEl.textContent = uiText(text);
  sayEl.style.animation = 'none'; void sayEl.offsetWidth; sayEl.style.animation = '';
}
function randomPhrase() {
  let pool = PHRASES.any;
  if (typeof media !== 'undefined' && media && media.playing && Math.random() < 0.4) pool = PHRASES.music;
  else if (Math.random() < 0.3) pool = PHRASES[daypart()];
  let t = pick(pool), tries = 0;
  while (uiText(t) === sayEl.textContent && tries++ < 5) t = pick(pool);
  return t;
}

/* взгляд: глазки смотрят на курсор, даже когда он далеко за пределами острова */
let eyePending = null;
function lookAt(c) {
  eyePending = c;
  if (lookAt.raf) return;
  lookAt.raf = requestAnimationFrame(() => {
    lookAt.raf = 0;
    const c2 = eyePending;
    if (!c2 || state !== 'open') return;
    const r = eyes.getBoundingClientRect();
    const dx = c2.x - (r.left + r.width / 2);
    const dy = c2.y - (r.top + r.height / 2);
    const dist = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, dist / 160);
    eyes.style.setProperty('--ex', (dx / dist) * k * 4.5 + 'px');
    eyes.style.setProperty('--ey', (dy / dist) * k * 3.5 + 'px');
  });
}
cursorHooks.push(lookAt);

eyes.addEventListener('click', () => {
  eyes.classList.add('wink');
  setTimeout(() => eyes.classList.remove('wink'), 420);
  say(randomPhrase());
});

/* фразы: приветствие при открытии и смена раз в несколько секунд */
let sayTimer = null;
stateHooks.push((s) => {
  clearInterval(sayTimer);
  if (s === 'open') {
    say(pick(PHRASES[daypart()]));
    sayTimer = setInterval(() => { if (state === 'open') say(randomPhrase()); }, 9000);
  }
});
