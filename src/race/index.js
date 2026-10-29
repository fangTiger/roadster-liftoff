import './race.css';
import { t, onLangChange, mountLangToggle } from '../i18n/i18n.js';
import { createAchievements } from '../achievements/achievements.js';
import { achievementsToBits } from '../chain/records.js';
import { wallet } from '../chain/wallet.js';
import { createAudio } from '../audio/audio.js';
import { createRaceAudio } from '../audio/race.js';
import { qualifyTime } from './config.js';
// 竞速模式入口：加载天空与车 → 选地图（简单 / 普通 / 困难，默认简单）→ 生成赛道与场景 → 倒数发车
// ?race&capture 时不自动跑循环，由录制脚本逐帧推进；&map=easy|normal|hard 指定地图（默认简单）
import { createEngine } from '../game/engine.js';
import { createCar } from '../game/car.js';
import { createRecorder } from './sim/replay.js';
import { buildTrack, trackHash } from './track/build.js';
import { TRACKS, DEFAULT_DIFFICULTY } from './track/data/index.js';
import { createSession } from './sim/session.js';
import { DT } from './sim/physics.js';
import { autopilot } from './sim/autopilot.js';
import * as B from './sim/input-bits.js';
import { createGreybox } from './scene/greybox.js';
import { createAlpine } from './scene/alpine.js';
import { createRaceCamera } from './camera.js';
import { createHud } from './hud.js';
import { createSky, SKIES, DEFAULT_SKY } from './scene/sky.js';
import { createSkidmarks } from './scene/skidmarks.js';
import { createBoostFx } from './scene/boostfx.js';
import { createStartGate } from './scene/startgate.js';
import { createCelebration } from './scene/celebration.js';
import { mountRaceChain } from '../chain/race-panel.js';
import { mountRaceBoard } from '../chain/race-board.js';
import { mountRaceMenu, mountGhostOptions } from './menu.js';
import { createGhost, checkpointCount, checkpointDelta, timeDelta } from './ghost.js';
import { readBestGhost, saveBestGhost } from './ghost-store.js';
import { prepareGhostCar } from './ghost-car.js';
const params = new URLSearchParams(location.search), capture = params.has('capture');
// 加载画面：素材加载、着色器预编译完成之前盖住页面
const loading = document.createElement('div'); loading.id = 'race-loading'; loading.textContent = t('race.loading');
Object.assign(loading.style, { position: 'fixed', inset: '0', zIndex: '50', display: 'grid', placeItems: 'center', background: '#0b0f14', color: '#cfd8e3', font: '500 15px/1 system-ui,sans-serif', letterSpacing: '.2em', transition: 'opacity .6s' });
document.body.append(loading);
// 竞速模式不用第一版的界面：一开始就藏起来（HUD 要等选完地图才创建）
const hideOld = document.createElement('style'); hideOld.textContent = 'body> :not(canvas):not(#race-hud):not(#race-pick):not(#race-loading):not(#race-tools):not(#ach-toast):not(#ach-panel-wrap):not(#roadster-wallet):not(w3m-modal):not(:has([data-rk])):not(script):not(style){display:none!important}'; document.head.append(hideOld);
// 与第一版共用存储和音量总线，竞速不加载音乐文件。
const audio = createAudio({ music: false }), raceAudio = createRaceAudio(audio), achievements = createAchievements();
let audioSettings = {};
try { audioSettings = JSON.parse(localStorage.getItem('liftoff.ui.v1')) || {}; } catch { /* 无存储时使用音频默认值。 */ }
if (typeof audioSettings.muted === 'boolean') audio.setMuted(audioSettings.muted);
if (Number.isFinite(audioSettings.volume)) audio.setVolume(audioSettings.volume);
const tools = document.createElement('div'); tools.id = 'race-tools';
Object.assign(tools.style, { position: 'fixed', left: '24px', bottom: '52px', zIndex: '60', display: 'flex', gap: '14px', alignItems: 'center', color: '#f4eee1', font: '13px system-ui' });
tools.innerHTML = `<button data-ach></button><details><summary data-settings></summary><div style="position:absolute;bottom:32px;background:#101a20ed;padding:18px;border:1px solid #ffffff33;border-radius:12px;min-width:190px"><label><span data-volume></span> <input type="range" min="0" max="1" step=".01"></label><label><input type="checkbox"> <span data-mute></span></label></div></details><span data-lang></span>`;
const volumeInput = tools.querySelector('[type=range]'), muteInput = tools.querySelector('[type=checkbox]');
volumeInput.value = audioSettings.volume ?? .8; muteInput.checked = audio.muted;
const paintTools = () => { tools.querySelector('[data-ach]').textContent = `${t('ach.title')} ${achievements.unlocked}/28`; tools.querySelector('[data-settings]').textContent = t('menu.settings'); tools.querySelector('[data-volume]').textContent = t('set.volume'); tools.querySelector('[data-mute]').textContent = t('set.mute'); };
const saveAudio = () => { audioSettings = { ...audioSettings, volume: Number(volumeInput.value), muted: muteInput.checked }; audio.setVolume(audioSettings.volume); audio.setMuted(audioSettings.muted); try { localStorage.setItem('liftoff.ui.v1', JSON.stringify(audioSettings)); } catch { /* 隐私模式继续使用内存。 */ } };
volumeInput.oninput = saveAudio; muteInput.onchange = saveAudio;
tools.querySelector('[data-ach]').onclick = () => achievements.openPanel();
mountLangToggle(tools.querySelector('[data-lang]'), { injectCss: false });
onLangChange(paintTools); achievements.onUnlock(() => { paintTools(); audio.event('achievement'); }); paintTools(); document.body.append(tools);
const unlockAudio = () => { void audio.unlock().catch(() => {}); };
addEventListener('pointerdown', unlockAudio); addEventListener('keydown', unlockAudio);
addEventListener('keydown', e => { if (e.code === 'KeyM' && !e.repeat) { muteInput.checked = !audio.muted; saveAudio(); } });
const engine = createEngine(capture ? { pixelRatio: 1 } : {});
engine.camera.far = 1800; engine.camera.updateProjectionMatrix();
// 背景：URL 参数 sky= 优先，其次上次的选择，默认阿尔卑斯山谷
const storedSky = (() => { try { return localStorage.getItem('race.sky'); } catch { return null; } })();
const skyKey = SKIES[params.get('sky')] ? params.get('sky') : SKIES[storedSky] ? storedSky : DEFAULT_SKY;
const sky = await createSky(engine.scene, engine.renderer, skyKey), skid = createSkidmarks(engine.scene), car = await createCar(); engine.scene.add(car.root);
const boostFx = createBoostFx(engine.scene, car), camera = createRaceCamera(engine.camera, engine.renderer.domElement), celebration = createCelebration(engine.scene);
const hideLoading = () => { loading.style.opacity = '0'; setTimeout(() => loading.remove(), 700); };

// 选定地图后才生成赛道、场景、HUD 与会话
let entry, qualifyMs, track, def, hash, scene, gate, hud, session, recorder, previous, current, raceMenu, seenEvents = 0, lastBits = 0, wheelAngle = 0, celebrated = false;
let ghost, ghostCar, ghostPrevious, ghostCurrent, ghostWheelAngle = 0, ghostDelta = null, ghostDeltaStep = 0;
async function setup(difficulty, replay = null) {
  entry = TRACKS.find(t => t.difficulty === difficulty) || TRACKS[0];
  qualifyMs = qualifyTime(entry);
  // 只读公共赛道配置，无需连接钱包；读取失败使用本地默认。
  void wallet.readTrack(entry.def.id).then(value => { qualifyMs = qualifyTime(entry, value); if (current) achievements.reportRace(current, { difficulty: entry.difficulty, qualifyMs }); }).catch(() => {});
  def = entry.def; track = buildTrack(def); hash = trackHash(def);
  scene = params.has('greybox') ? createGreybox(engine.scene, track, { tint: sky.tint }) : await createAlpine(engine.scene, track, { tint: sky.tint, renderer: engine.renderer }); gate = createStartGate(engine.scene, track, t('race.track' + def.id)); hud = createHud(track, () => `${t('race.track' + def.id)} · ${t('race.' + entry.difficulty)}`);
  session = createSession(track, { laps: def.laps }); recorder = createRecorder(); previous = current = session.snapshot;
  const selectedReplay = replay ?? (capture && params.get('ghost') === 'best' ? readBestGhost(def)?.replay : null);
  if (selectedReplay) {
    try { ghost = createGhost(track, selectedReplay); } catch { ghost = null; }
    if (ghost) {
      ghostCar = prepareGhostCar(await createCar(), t('race.ghost.best')); engine.scene.add(ghostCar.root);
      ghostPrevious = ghostCurrent = ghost.snapshot;
      onLangChange(() => ghostCar.setLabel(t('race.ghost.best')));
    }
  }
  render(); await engine.renderer.compileAsync(engine.scene, engine.camera); render();
  if (!capture && !raceMenu) {
    const selectionParams = new URLSearchParams(location.search);
    for (const key of ['map', 'autopilot', 'capture']) selectionParams.delete(key);
    raceMenu = mountRaceMenu(tools, {
      selectHref: `${location.pathname}?${selectionParams}`,
      onPauseChange: paused => {
        keys.clear();
        // 与太空模式保持一致：先保存真实偏好，避免暂停退出后把临时静音带到下一页。
        if (paused) saveAudio();
        audio.setMuted(paused || muteInput.checked);
      },
      isOverlayOpen: () => !!document.querySelector('.ach-panel-visible, [data-rk] [role="dialog"], w3m-modal.open'),
    });
  }
}
const keys = new Set(), map = { KeyW: B.THROTTLE, ArrowUp: B.THROTTLE, KeyS: B.BRAKE, ArrowDown: B.BRAKE, KeyA: B.LEFT, ArrowLeft: B.LEFT, KeyD: B.RIGHT, ArrowRight: B.RIGHT, Space: B.JET, ShiftLeft: B.DRIFT, ShiftRight: B.DRIFT, Backspace: B.RESET, KeyT: B.RESET };
addEventListener('keydown', e => { if (e.target.closest?.('input,select,textarea') || document.querySelector('.ach-panel-visible')) return; if (['Enter', 'Space'].includes(e.code) && e.target.closest?.('button,summary,[role=button]')) return; if (map[e.code]) { e.preventDefault(); keys.add(e.code); } if (e.code === 'KeyC' && !e.repeat) camera.setMode(); if (e.code === 'Enter' && current?.race.finished) location.reload(); });
addEventListener('keyup', e => keys.delete(e.code)); addEventListener('blur', () => keys.clear());
function simulate(bits) {
  previous = current; lastBits = bits;
  if (!current.race.finished) recorder.record(bits);
  session.step(bits); current = session.snapshot;
  if (ghost) {
    ghostPrevious = ghostCurrent; ghost.step(); ghostCurrent = ghost.snapshot;
    if (ghostCurrent.step !== ghostPrevious.step) ghostWheelAngle += Math.hypot(ghostCurrent.car.vx, ghostCurrent.car.vz) * DT / .34;
    if (checkpointCount(current) > checkpointCount(previous)) {
      ghostDelta = checkpointDelta(current, ghost); ghostDeltaStep = current.step;
    }
  }
  if (current.race.finished && !previous.race.finished) saveBestGhost(def, recorder.encode({ track: hash, trackId: def.id, laps: def.laps }), current.race.bestLap);
  achievements.reportRace(current, { difficulty: entry.difficulty, qualifyMs }); raceAudio.update(current, bits, DT);
  wheelAngle += Math.hypot(current.car.vx, current.car.vz) * DT / .34;
}
function render(alpha = 1, dt = 1 / 60) {
  const a = previous.car, b = current.car, blend = (x, y) => x + (y - x) * alpha;
  const c = { ...b, x: blend(a.x, b.x), y: blend(a.y, b.y), z: blend(a.z, b.z) };
  let delta = b.yaw - a.yaw; delta -= Math.PI * 2 * Math.floor((delta + Math.PI) / (Math.PI * 2)); const yaw = a.yaw + delta * alpha;
  car.root.position.set(c.x, c.y, c.z); car.root.rotation.y = yaw + Math.PI; car.chassis.rotation.x = c.pitch; car.chassis.rotation.z = -c.steer * Math.min(.06, Math.hypot(c.vx, c.vz) * .001);
  car.setRoll(0); car.setThrust((lastBits & B.THROTTLE) || c.boostTime > 0 ? 1 : 0, current.step * DT); car.setLift(lastBits & B.JET && c.fuel > 0 ? 1 : 0, current.step * DT);
  const rcs = c.drifting ? .65 : 0; car.setRCS(c.steer < 0 ? rcs : 0, c.steer > 0 ? rcs : 0, c.steer > 0 ? rcs : 0, c.steer < 0 ? rcs : 0, current.step * DT);   // 左转时前右、后左喷气
  car.setBrake(lastBits & B.BRAKE ? 1 : 0); car.setSteer(c.steer); for (const wheel of car.wheels) { wheel.spin.rotation.x = -wheelAngle; if (wheel.front) wheel.steer.rotation.y = c.steer * .35; }
  if (ghostCar) {
    const ga = ghostPrevious.car, gb = ghostCurrent.car;
    let turn = gb.yaw - ga.yaw; turn -= Math.PI * 2 * Math.floor((turn + Math.PI) / (Math.PI * 2));
    ghostCar.root.position.set(blend(ga.x, gb.x), blend(ga.y, gb.y), blend(ga.z, gb.z)); ghostCar.root.rotation.y = ga.yaw + turn * alpha + Math.PI;
    ghostCar.chassis.rotation.x = gb.pitch; ghostCar.chassis.rotation.z = -gb.steer * Math.min(.06, Math.hypot(gb.vx, gb.vz) * .001);
    ghostCar.setSteer(gb.steer);
    for (const wheel of ghostCar.wheels) { wheel.spin.rotation.x = -ghostWheelAngle; if (wheel.front) wheel.steer.rotation.y = gb.steer * .35; }
  }
  // 压上加速带、二次加速：冲击波环 + 视野猛张；处在加速状态时喷金色火焰
  for (; seenEvents < current.events.length; seenEvents++) { const t = current.events[seenEvents].type; if (t === 'counterBoost' || t === 'boost') { boostFx.trigger(c); camera.kick(); } }
  boostFx.update(dt, current.step * DT, c.boostTime > 0);
  // 冲线：彩带、烟花、镜头环拍
  if (current.race.finished && !celebrated) {
    celebrated = true; celebration.start(car.root.position); camera.setMode('celebrate');
    // 成绩面板下方挂上链区块（HUD 的成绩面板每帧重写，所以单独放一个容器）
    const slot = document.createElement('div'); slot.id = 'race-chain-slot';
    Object.assign(slot.style, { position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', pointerEvents: 'auto', width: 'min(420px, 92vw)' });
    document.getElementById('race-hud')?.append(slot);
    mountRaceChain(slot, { trackId: def.id, trackName: t('race.track' + def.id), bestLap: current.race.bestLap, bits: achievementsToBits(achievements.list()) });
  }
  celebration.update(dt); gate.update(current);
  camera.update(c, dt); sky.update(engine.camera, car.root.position); skid.update(c); scene.update(current); hud.update(current, { delta: ghostDelta, deltaStep: ghostDeltaStep, totalDelta: current.race.finished && ghost ? timeDelta(current.race.elapsed, ghost.totalTime) : null });
  // 成绩文字高度随语言变化，上链区块始终排在完整成绩之后。
  const chainSlot = document.getElementById('race-chain-slot');
  if (chainSlot) chainSlot.style.top = `${document.querySelector('#race-hud .rh-result').getBoundingClientRect().bottom + 12}px`;
  engine.render();
}
// 普通游玩也全程录制；控制台可导出本局，便于复盘和服务器核实
window.__raceReplay = () => recorder.encode({ track: hash, trackId: def.id, laps: def.laps });

if (capture) {
  await setup(params.get('map') || DEFAULT_DIFFICULTY); hideLoading();
  window.__race = { step(bits, n = 1) { for (let i = 0; i < n; i++) simulate(bits); render(1, Math.max(DT, n * DT)); return current; }, auto(n = 1) { for (let i = 0; i < n; i++) simulate(autopilot(current, track)); render(1, Math.max(DT, n * DT)); return current; }, snap: () => session.snapshot, replay: () => recorder.encode({ track: hash, trackId: def.id, laps: def.laps }), cam(mode) { const value = camera.setMode(mode); render(); return value; }, render: () => render() };
  window.__engine = engine; window.__sky = sky;   // 调试：检查天空与太阳方向
  document.title = 'ready';
} else {
  engine.render(); hideLoading();
  // 选图：三张卡片带走线缩略图，1/2/3 或点击选择，Enter 选当前高亮（默认简单）
  const thumb = d => { const t = buildTrack(d); let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; const pts = []; for (let i = 0; i < t.samples.length; i += 7 * 8) { const x = -t.samples[i], z = t.samples[i + 1]; pts.push([x, z]); x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); } const k = 104 / Math.max(x1 - x0, z1 - z0); return { len: t.length, d: 'M' + pts.map(([x, z]) => `${(8 + (x - x0) * k + (104 - (x1 - x0) * k) / 2).toFixed(1)},${(8 + (z1 - z) * k + (104 - (z1 - z0) * k) / 2).toFixed(1)}`).join('L') + 'Z' }; };
  const pick = document.createElement('div'); pick.id = 'race-pick';
  pick.innerHTML = `<style>#race-pick{position:fixed;inset:0;z-index:40;display:grid;place-items:center;background:#0b0f14b0;backdrop-filter:blur(4px);font:15px 'Helvetica Neue','PingFang SC',sans-serif;color:#f4eee1}#race-pick h2{text-align:center;font-weight:600;letter-spacing:.2em;margin:0 0 22px}#race-pick .cards{display:flex;gap:16px;flex-wrap:wrap;justify-content:center;padding:0 16px}#race-pick .cards button{all:unset;cursor:pointer;width:230px;padding:18px 20px;border-radius:12px;background:#17232ae6;border:1px solid #ffffff26;line-height:1.6}#race-pick .cards button:hover,#race-pick .cards button.on{border-color:#4bc8e5;box-shadow:0 0 0 2px #4bc8e555}#race-pick b{display:block;font-size:22px}#race-pick i{font-style:normal;color:#f8d28d;font-size:13px}#race-pick small{color:#aab7bd;display:block;min-height:48px}#race-pick kbd{float:right;color:#4bc8e5}#race-pick svg{display:block;margin:10px auto}#race-pick .skies{display:flex;gap:8px;justify-content:center;margin-top:22px;flex-wrap:wrap}#race-pick .skies span{color:#aab7bd;align-self:center;margin-right:4px}#race-pick .skies a{all:unset;cursor:pointer;padding:6px 14px;border-radius:999px;background:#17232ae6;border:1px solid #ffffff26;font-size:14px}#race-pick .skies a.on{border-color:#f8d28d;color:#f8d28d}</style>
<div><h2 data-i18n="race.pick">${t('race.pick')}</h2><div class="cards">${TRACKS.map((entry, i) => { const th = thumb(entry.def); return `<section class="track-card"><button data-k="${entry.difficulty}" class="${entry.difficulty === DEFAULT_DIFFICULTY ? 'on' : ''}"><kbd>${i + 1}</kbd><b><span data-i18n="race.${entry.difficulty}">${t('race.' + entry.difficulty)}</span></b><i><span data-i18n="race.track${entry.def.id}">${t('race.track' + entry.def.id)}</span> · ${(th.len / 1000).toFixed(1)} <span data-i18n="race.km">${t('race.km')}</span></i><svg width="120" height="120" viewBox="0 0 120 120"><path d="${th.d}" fill="none" stroke="#e8e2d4" stroke-width="3" stroke-linejoin="round"/></svg><small><span data-i18n="race.desc.${entry.difficulty}">${t('race.desc.' + entry.difficulty)}</span></small></button><div data-ghost-options="${entry.difficulty}"></div></section>`; }).join('')}</div><div class="skies"><a href="/" data-home data-i18n="race.home">${t('race.home')}</a><a data-board data-i18n="race.chain.title">${t('race.chain.title')}</a><span style="margin-left:14px" data-i18n="race.background">${t('race.background')}</span>${Object.entries(SKIES).map(([k, s]) => `<a data-sky="${k}" class="${k === skyKey ? 'on' : ''}"><span data-i18n="race.${k}">${t('race.' + k)}</span></a>`).join('')}</div></div>`;
  document.body.append(pick);
  const ghostOptions = new Map(TRACKS.map(entry => [entry.difficulty, mountGhostOptions(pick.querySelector(`[data-ghost-options="${entry.difficulty}"]`), entry.def)]));
  let chosen = false;
  const choose = async k => {
    if (chosen) return; unlockAudio(); chosen = true; removeEventListener('keydown', onPick);
    pick.querySelector('h2').textContent = t('race.generating'); await new Promise(r => setTimeout(r, 30));
    await setup(k, ghostOptions.get(k)?.replay); ghostOptions.forEach(options => options.destroy()); pick.remove(); requestAnimationFrame(frame);
  };
  const onPick = e => { const k = TRACKS[Number(e.key) - 1]?.difficulty; if (k) choose(k); else if (e.key === 'Enter' && !e.target.closest?.('button,a,input,select')) choose(DEFAULT_DIFFICULTY); };
  addEventListener('keydown', onPick); pick.querySelectorAll('button[data-k]').forEach(b => b.addEventListener('click', () => choose(b.dataset.k)));
  // 换背景：记住选择后带着 sky 参数重新加载
  // 链上记录：在选图界面上叠一层排行榜，点空白处关闭
  pick.querySelector('[data-board]').addEventListener('click', e => { e.stopPropagation(); const layer = document.createElement('div'); Object.assign(layer.style, { position: 'fixed', inset: '0', zIndex: '45', display: 'grid', placeItems: 'center', background: '#0b0f14cc' }); const box = document.createElement('div'); box.style.width = 'min(560px, 94vw)'; box.addEventListener('click', ev => ev.stopPropagation()); layer.append(box); layer.addEventListener('click', () => { board.destroy?.(); layer.remove(); }); pick.append(layer); const board = mountRaceBoard(box); });
  pick.querySelectorAll('.skies a[data-sky]').forEach(a => a.addEventListener('click', () => { if (a.dataset.sky === skyKey) return; try { localStorage.setItem('race.sky', a.dataset.sky); } catch {} const q = new URLSearchParams(location.search); q.set('sky', a.dataset.sky); location.search = q.toString(); }));
  let accumulator = 0, lastTime;
  const auto = params.has('autopilot');   // ?race&autopilot&map=…：机器人开完全程（测试网端到端脚本用）
  if (auto) choose(params.get('map') || DEFAULT_DIFFICULTY);
  function frame(time) {
    const elapsed = lastTime === undefined ? 0 : Math.min(.1, (time - lastTime) / 1000); lastTime = time;
    // 暂停时不推进车辆、计时或录制；逐帧更新时间，恢复时不补跑暂停期间的时间。
    if (raceMenu?.paused) { accumulator = 0; engine.render(); requestAnimationFrame(frame); return; }
    accumulator += elapsed; let bits = 0; for (const code of keys) bits |= map[code] || 0;
    if (auto && !current.race.finished) bits = autopilot(current, track);
    while (accumulator >= DT) { simulate(bits); accumulator -= DT; }
    render(accumulator / DT, elapsed); requestAnimationFrame(frame);
  }
}
