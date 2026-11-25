/* Погода (Open-Meteo, без ключей) */
let wxAt = 0;
let wxTemp = null;
const DIRS = ['С', 'СВ', 'В', 'ЮВ', 'Ю', 'ЮЗ', 'З', 'СЗ'];

function wxIcon(c, day = true) {
  if (c === 0) return day ? '☀️' : '🌙';
  if (c <= 2) return day ? '🌤' : '☁️';
  if (c === 3) return '☁️';
  if (c <= 48) return '🌫';
  if (c <= 57) return '🌦';
  if (c <= 67) return '🌧';
  if (c <= 77) return '❄️';
  if (c <= 82) return '🌧';
  if (c <= 86) return '🌨';
  return '⛈';
}
function wxText(c) {
  if (c === 0) return uiText('Ясно');
  if (c <= 2) return uiText('Переменная облачность');
  if (c === 3) return uiText('Пасмурно');
  if (c <= 48) return uiText('Туман');
  if (c <= 57) return uiText('Морось');
  if (c <= 67) return uiText('Дождь');
  if (c <= 77) return uiText('Снег');
  if (c <= 82) return uiText('Ливень');
  if (c <= 86) return uiText('Снегопад');
  return uiText('Гроза');
}
async function getGeo() {
  const g = store.get('geo', null);
  if (g) return g;
  try {
    const r = await (await fetch('https://get.geojs.io/v1/ip/geo.json')).json();
    const geo = { lat: +r.latitude, lon: +r.longitude, name: r.city || r.region || uiText('Моё место') };
    if (!isFinite(geo.lat) || !isFinite(geo.lon)) return null;
    store.set('geo', geo);
    return geo;
  } catch { return null; }
}
async function loadWeather(force = false) {
  if (!force && wxAt && Date.now() - wxAt < 15 * 60000) return;
  const box = $('#wx');
  const geo = await getGeo();
  if (!geo) { box.innerHTML = "<div class=\"empty surface\">" + uiText("Не удалось определить место. Введите город выше.") + "</div>"; return; }
  try {
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + geo.lat + '&longitude=' + geo.lon +
      '&current=temperature_2m,apparent_temperature,relative_humidity_2m,pressure_msl,wind_speed_10m,wind_direction_10m,weather_code,is_day' +
      '&hourly=temperature_2m,weather_code&daily=sunrise,sunset&timezone=auto&forecast_days=2&wind_speed_unit=ms';
    const d = await (await fetch(url)).json();
    const c = d.current;
    wxAt = Date.now();
    wxTemp = Math.round(c.temperature_2m);
    clock();

    const hourNow = c.time.slice(0, 13);
    let idx = d.hourly.time.findIndex((t) => t.startsWith(hourNow));
    if (idx < 0) idx = 0;
    const hours = d.hourly.time.slice(idx, idx + 8).map((t, i) => {
      const h = +t.slice(11, 13);
      return '<div><span>' + (i === 0 ? uiText('Сейчас') : t.slice(11, 16)) + '</span><i>' + wxIcon(d.hourly.weather_code[idx + i], h >= 6 && h < 20) +
        '</i><span>' + Math.round(d.hourly.temperature_2m[idx + i]) + '°</span></div>';
    }).join('');
    const mm = Math.round(c.pressure_msl * 0.750062);
    const directions = uiLanguage === 'en' ? ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] : DIRS;
    const dir = directions[Math.round(c.wind_direction_10m / 45) % 8];
    const tile = (delay, label, big, small) =>
      '<div class="wx-tile surface" style="animation-delay:' + delay + 's"><span>' + label + '</span><b>' + big + '</b>' + small + '</div>';

    box.innerHTML =
      '<div class="wx-main surface"><small id="wx-place"></small><div class="big">' + wxTemp + '°</div>' +
      '<div>' + wxIcon(c.weather_code, !!c.is_day) + ' ' + wxText(c.weather_code) + '</div>' +
      "<small>" + uiText("Ощущается как ") + Math.round(c.apparent_temperature) + '°</small></div>' +
      '<div class="wx-right"><div class="hours surface">' + hours + '</div><div class="wx-tiles">' +
      tile(0.03, uiText('Ветер'), Math.round(c.wind_speed_10m) + uiText(' м/с'), '<small>' + dir + '</small>') +
      tile(0.06, uiText('Влажность'), Math.round(c.relative_humidity_2m) + '%', '<div class="bar"><u style="width:' + Math.round(c.relative_humidity_2m) + '%"></u></div>') +
      tile(0.09, uiText('Давление'), mm, "<small>" + uiText("мм рт. ст.") + "</small>") +
      tile(0.12, uiText('Восход'), d.daily.sunrise[0].slice(11, 16), '') +
      tile(0.15, uiText('Закат'), d.daily.sunset[0].slice(11, 16), '') +
      '</div></div>';
    $('#wx-place').textContent = geo.name;
  } catch {
    box.innerHTML = "<div class=\"empty surface\">" + uiText("Нет связи с сервисом погоды.") + "</div>";
  }
}
$('#wx-city').addEventListener('keydown', async (e) => {
  if (e.key !== 'Enter') return;
  const q = $('#wx-city').value.trim();
  if (!q) return;
  try {
    const r = await (await fetch('https://geocoding-api.open-meteo.com/v1/search?count=1&language=' + uiLanguage + '&name=' + encodeURIComponent(q))).json();
    const p = r.results && r.results[0];
    if (!p) { $('#wx').innerHTML = "<div class=\"empty surface\">" + uiText("Город не найден.") + "</div>"; return; }
    store.set('geo', { lat: p.latitude, lon: p.longitude, name: p.name });
    $('#wx-city').value = '';
    loadWeather(true);
  } catch { $('#wx').innerHTML = "<div class=\"empty surface\">" + uiText("Нет связи с сервисом погоды.") + "</div>"; }
});
$$('.tab[data-tab="weather"]').forEach((b) => b.addEventListener('click', () => loadWeather()));
loadWeather();
setInterval(() => loadWeather(), 15 * 60000);
