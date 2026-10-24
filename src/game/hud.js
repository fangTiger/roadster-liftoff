// 界面：速度表、0–100 计时、里程、速度线、成就提示
import { KMH } from './vehicle.js';
import { t } from '../i18n/i18n.js';

const $ = id => document.getElementById(id);
const ARC = 198;                           // 速度表弧长（与 SVG 的 dasharray 对应）

export function createHUD() {
  const arc = document.querySelector('#gauge circle:nth-of-type(2)');
  let toastTimer = 0, shownClub = false, shownLift = false, shownHigh = false, override = null;
  function toast(title, sub, ms = 3200) {
    $('tt').textContent = title; $('ts').textContent = sub;
    const el = $('toast'); el.style.opacity = 1; el.style.transform = 'translateY(0)';
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.style.opacity = 0; el.style.transform = 'translateY(-8px)'; }, ms);
  }
  $('toast').style.transition = 'opacity .4s, transform .4s';
  $('toast').style.opacity = 0;
  document.querySelectorAll('#cams span').forEach(s => s.classList.toggle('on', s.dataset.v === 'road'));
  $('camname').textContent = t('cam.chase');

  function update(s) {
    const kmh = s.v * KMH;
    if (override) {
      $('spd').textContent = override.spd; $('alt').textContent = override.alt; $('speed').style.opacity = 0;
      $('fuelbar').style.width = (s.fuel * 100).toFixed(0) + '%'; $('fuelpct').textContent = (s.fuel * 100).toFixed(0) + '%';
      $('fuelbar').style.background = s.fuel < .15 ? 'linear-gradient(90deg,#ff5a3c,#ffb35c)' : '';
      if (override.label) { $('lt').textContent = override.label; $('lv').innerHTML = override.value.replace(/ (km|m)$/, '<i>$1</i>'); $('launch').style.opacity = 1; }
      return;
    }
    $('lt').textContent = '0 – 100 KM/H';
    $('spd').textContent = Math.round(kmh);
    arc.setAttribute('stroke-dasharray', `${(Math.min(kmh, 400) / 400 * ARC).toFixed(1)} 264`);
    $('dist').textContent = (s.dist / 1000).toFixed(1) + ' km';
    $('alt').textContent = s.y < 1 ? '0 m' : Math.round(s.y) + ' m';
    $('fuelbar').style.width = (s.fuel * 100).toFixed(0) + '%'; $('fuelpct').textContent = (s.fuel * 100).toFixed(0) + '%';
    $('hops').textContent = s.hops;
    // "第一次起飞"由成就系统弹出
    if (s.y > 10 && !shownHigh) { shownHigh = true; toast(t('toast.high'), t('toast.highSub')); }
    const L = s.launch;
    $('lv').innerHTML = (L.timing ? L.t : (L.last ?? 0)).toFixed(2) + '<i>s</i>';
    $('launch').style.opacity = L.timing || L.last != null ? 1 : .55;
    $('speed').style.opacity = Math.max(0, Math.min(1, (kmh - 90) / 220));
    // "0.8 秒俱乐部"由成就系统弹出，这里不再重复提示
  }
  // 飞行导演接管时，用覆盖值显示轨道高度/速度
  const setOverride = o => { override = o; };
  // 金币计数：数字跳一下
  let popTimer = 0;
  function setCoins(n) { const el = $('coins'); $('coinn').textContent = n; el.classList.add('pop'); clearTimeout(popTimer); popTimer = setTimeout(() => el.classList.remove('pop'), 120); }
  return { update, toast, setOverride, setCoins };
}
