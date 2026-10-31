// 使用本地服务和真实 WebSocket 房间检验列表视觉、帧率、触屏布局和三图标题。
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import WebSocket from 'ws';

const out = process.env.LOBBY_SHOTS || '/private/tmp/claude-501/-Users-captain-python-Claude-arc-main-first/52a9eede-5d82-4a4f-9ef5-151e0447a67d/scratchpad/lobby-5';
const base = process.env.LOBBY_URL || 'http://localhost:8932/?race&room&garageCapture';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const errors = [], checks = [], shots = [], sockets = [];
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
await context.addInitScript(() => {
  localStorage.setItem('liftoff.lang.v1', 'zh');
  localStorage.setItem('liftoff.audio.v1', JSON.stringify({ muted: true }));
  localStorage.setItem('race.room.name', '视觉验收车手');
});
const page = await context.newPage();
page.setDefaultTimeout(60000);
page.on('pageerror', error => errors.push(error.message));
const shot = async name => {
  await page.screenshot({ path: `${out}/${name}.png`, scale: 'css' });
  shots.push(`${name}.png`);
  console.log('截图', name);
};
async function createRoom(name, full = false) {
  const ws = new WebSocket('ws://localhost:8933/rooms');
  sockets.push(ws);
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  const room = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('创建验收房间超时')), 10000);
    ws.on('message', raw => {
      const message = JSON.parse(raw);
      if (message.type === 'room' && (!full || message.players.length === 6)) { clearTimeout(timer); resolve(message); }
    });
    ws.send(JSON.stringify({ type: 'hello', name: '展厅房主', create: { name, locked: false } }));
    if (full) {
      let added = false;
      ws.on('message', raw => { if (JSON.parse(raw).type === 'room' && !added) { added = true; for (let i = 0; i < 5; i++) ws.send(JSON.stringify({ type: 'addBot', difficulty: 'normal' })); } });
    }
  });
  return room;
}
async function frameRate(label) {
  await page.bringToFront();
  const metrics = await page.evaluate(() => new Promise(resolve => {
    const intervals = [];
    let start, previous;
    function frame(now) {
      start ??= now;
      if (previous) intervals.push(now - previous);
      previous = now;
      if (now - start < 5000) requestAnimationFrame(frame);
      else {
        const sorted = [...intervals].sort((a, b) => a - b);
        resolve({ fps: intervals.length * 1000 / (now - start), p95ms: sorted[Math.floor(sorted.length * .95)], samples: intervals.length, seconds: (now - start) / 1000 });
      }
    }
    requestAnimationFrame(frame);
  }));
  checks.push({ label, ...metrics });
  console.log(label, JSON.stringify(metrics));
  assert.ok(metrics.fps >= 50, `${label} 帧率必须至少为 50`);
}
try {
  await page.goto(base);
  await page.locator('.rb-header__title').waitFor({ state: 'visible' });
  await page.locator('#race-loading').waitFor({ state: 'detached' });
  await page.waitForFunction(() => document.querySelector('.rb-status-bar').hidden);
  assert.equal(await page.locator('.rb-backdrop__map').count(), 3);
  assert.equal(await page.locator('.rb-backdrop').getAttribute('aria-hidden'), 'true');
  const dissolve = await page.evaluate(async () => {
    const maps = [...document.querySelectorAll('.rb-backdrop__map')];
    const animations = maps.map(el => el.getAnimations()[0]);
    const saved = animations.map(animation => animation.currentTime);
    animations.forEach(animation => animation.pause());
    const samples = [];
    for (const time of [0, 10500, 12000, 22500, 24000, 34500, 36000]) {
      animations.forEach(animation => { animation.currentTime = time; });
      await new Promise(requestAnimationFrame);
      samples.push({ time, opacities: maps.map(el => Number(getComputedStyle(el).opacity)) });
    }
    animations.forEach((animation, i) => { animation.currentTime = saved[i]; animation.play(); });
    return samples;
  });
  for (const sample of dissolve) assert.ok(sample.opacities.reduce((a, b) => a + b, 0) >= .99, '交叉淡入不得出现背景全黑间隙');
  assert.deepEqual(dissolve.filter(sample => [0, 12000, 24000].includes(sample.time)).map(sample => sample.opacities.indexOf(Math.max(...sample.opacities))), [0, 1, 2]);
  checks.push({ label: '36 秒轮播覆盖三图，交叉淡入不留黑场', dissolve });
  // 空态使用独立真实 UI 工厂，避免现存其他玩家的房间污染截图，不修改服务端房间。
  const empty = await page.locator('.rb-row').count() === 0;
  if (!empty) await page.evaluate(async () => {
    const { createRoomBrowser } = await import('/src/race/lobby/room-browser.js');
    const { t } = await import('/src/i18n/i18n.js');
    const container = document.querySelector('[data-rm-browser]');
    container.replaceChildren();
    const preview = createRoomBrowser({ container, t, onJoin() {}, onCreate() {}, onRefresh() {} });
    preview.setStatus('online');
  });
  assert.equal(await page.locator('.rb-empty-state__car').getAttribute('aria-hidden'), 'true');
  await shot('01-list-empty');
  if (!empty) await page.reload();
  const openRoom = await createRoom('发车前的聚会');
  const fullRoom = await createRoom('湖畔夜行 · 六席已满', true);
  const welcomeRoom = await createRoom('草甸冲刺 · 欢迎加入');
  await page.locator(`.rb-row[data-code="${openRoom.code}"]`).waitFor();
  await page.locator(`.rb-row[data-code="${fullRoom.code}"]`).waitFor();
  await page.locator(`.rb-row[data-code="${welcomeRoom.code}"]`).waitFor();
  assert.equal(await page.locator(`.rb-row[data-code="${fullRoom.code}"] .rb-btn--join`).isDisabled(), true);
  const row = page.locator(`.rb-row[data-code="${openRoom.code}"]`);
  await row.hover();
  assert.notEqual(await row.evaluate(el => getComputedStyle(el).boxShadow), 'none');
  assert.equal(await row.locator('.rb-seat-dot--filled').first().evaluate(el => getComputedStyle(el).animationName), 'rb-seat-breathe');
  await shot('02-list-desktop');
  await frameRate('桌面列表 1440×900，轮播与呼吸灯开启');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.mouse.move(0, 0);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.ok(await page.locator('.rb-btn--join').first().evaluate(el => el.getBoundingClientRect().height >= 44));
  await shot('03-list-mobile-390');
  await frameRate('手机列表 390×844，轮播与呼吸灯开启');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const motion = await page.evaluate(() => ({
    animations: [...document.querySelectorAll('.rb-backdrop *, .rb-seat-dot')].map(el => getComputedStyle(el).animationName),
    maps: [...document.querySelectorAll('.rb-backdrop__map')].map(el => getComputedStyle(el).opacity),
    beam: getComputedStyle(document.querySelector('.rb-backdrop__beam')).display,
  }));
  assert.ok(motion.animations.every(name => name === 'none'));
  assert.deepEqual(motion.maps, ['1', '0', '0']);
  assert.equal(motion.beam, 'none');
  checks.push({ label: '减少运动：固定草甸背景，光带/光点/呼吸灯关闭', motion });
  await shot('04-list-mobile-reduced-motion');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.setViewportSize({ width: 1440, height: 900 });
  // 用真实建房流程拍摄三张大厅标题，以房主权限切换地图。
  await page.locator('.rb-header .rb-btn--primary').click();
  await page.getByRole('textbox', { name: '房间名称（可选）', exact: true }).fill('发车前的聚会');
  await page.getByRole('button', { name: '确认创建', exact: true }).click();
  await page.locator('.grg-canvas').waitFor();
  for (const [id, name] of [[1, 'easy'], [2, 'normal'], [3, 'hard']]) {
    if (id !== 1) { await page.locator('.rm-track-details summary').click(); await page.locator(`[data-rm-track="${id}"]`).click(); }
    await page.waitForFunction(name => document.querySelector('.grg-canvas')?.garageProbe?.read().wallImage?.endsWith(`/${name}.webp`), name);
    await page.waitForTimeout(1400);
    const title = await page.locator('.grg-heading').evaluate(el => ({ text: el.innerText, scrim: getComputedStyle(el, '::before').backgroundImage, shadow: getComputedStyle(el).textShadow, box: el.getBoundingClientRect().toJSON() }));
    assert.ok(title.scrim.includes('linear-gradient'));
    assert.notEqual(title.shadow, 'none');
    checks.push({ label: `${name} 大厅标题暗色衬底和阴影`, title });
    await shot(`0${4 + id}-garage-title-${name}`);
  }
  await page.locator('[data-rm-leave]').click();
  await page.locator('.rb-header__title').waitFor({ state: 'visible' });
  assert.deepEqual(errors, []);
  console.log('视觉验收完成', JSON.stringify({ shots, checks, errors }, null, 2));
} finally {
  for (const ws of sockets) { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'leave' })); ws.close(); }
  await writeFile(`${out}/visuals-result.json`, JSON.stringify({ shots, checks, errors }, null, 2));
  await browser.close();
}
