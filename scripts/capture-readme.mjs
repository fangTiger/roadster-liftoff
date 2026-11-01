// README 真实截图：复用已启动的 Vite（8932）、房间（8933）及只读 API（8934）。
// 运行：node scripts/capture-readme.mjs；可用 URL、ROOMS_URL、SHOTS 指定地址或输出目录。
// 可选参数：home、race-alpine、race-lake、rooms（三张房间截图）、profile；不传则全部采集。
// 只读公开链上数据，不连接钱包、不签名、不发送交易，不读取任何密钥或 .env。
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import sharp from 'sharp';
import WebSocket from 'ws';

const base = process.env.URL || 'http://localhost:8932/';
const endpoint = process.env.ROOMS_URL || 'ws://localhost:8933/rooms';
const out = resolve(process.env.SHOTS || 'docs/screenshots');
const selected = new Set(process.argv.slice(2));
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: [
  '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
] });
const sockets = [], contexts = [], results = [];
await mkdir(out, { recursive: true });
async function newPage() {
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1, locale: 'zh-CN' });
  contexts.push(context);
  await context.addInitScript(() => {
    localStorage.setItem('liftoff.lang.v1', 'zh');
    for (const key of ['liftoff.ui.v1', 'liftoff.audio.v1']) localStorage.setItem(key, JSON.stringify({ muted: true }));
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  page.captureErrors = [];
  page.on('pageerror', error => page.captureErrors.push(error.message));
  // 截图无需核实签名，明确禁止触发核实接口。
  await page.route('**/api/verify', route => route.abort());
  return page;
}
async function shot(page, name, cropHeight = 900) {
  await page.evaluate(() => document.fonts.ready);
  assert.deepEqual(page.captureErrors, [], '页面存在运行异常，拒绝保存');
  const png = await page.screenshot({ scale: 'css', fullPage: cropHeight > 900 });
  let jpeg, quality = 82;
  do { jpeg = await sharp(png).extract({ left: 0, top: 0, width: 1600, height: cropHeight }).resize({ width: 1600 }).jpeg({ quality, mozjpeg: true }).toBuffer(); quality -= 3; }
  while (jpeg.length > 250 * 1024 && quality >= 55);
  assert.ok(jpeg.length <= 250 * 1024, '截图超过 250KB');
  await writeFile(resolve(out, `${name}.jpg`), jpeg);
  const { width, height } = await sharp(jpeg).metadata();
  results.push({ name, width, height, bytes: jpeg.length, quality: quality + 3 });
  console.log('已截图', name, `${width}×${height}`, `${(jpeg.length / 1024).toFixed(1)}KB`);
}
async function task(name, run) {
  if (selected.size && !selected.has(name)) return;
  console.log('开始采集', name);
  try { await run(); }
  catch (error) { results.push({ name, error: error.message }); console.error('截图失败', name, error.message); process.exitCode = 1; }
}
async function openCapture(page, map, suffix = '') {
  await page.goto(new URL(`/?race&capture&map=${map}&sky=sunset${suffix}`, base).href);
  await page.waitForFunction(() => document.title === 'ready', null, { timeout: 120000 });
  await page.locator('#race-loading').waitFor({ state: 'detached' });
}
async function driveTo(page, distance) {
  await page.evaluate(distance => {
    for (let i = 0; i < 3000; i++) {
      const state = window.__race.auto(8);
      if (state.step > 600 && state.race.lap === 1 && state.car.near.s >= distance && state.car.near.s < distance + 30 && state.car.near.path === 'main') return;
      if (state.race.finished) break;
    }
    throw new Error('真实驾驶未到达取景点');
  }, distance);
  await page.waitForTimeout(300);
}
async function socketPlayer(name, options) {
  const ws = new WebSocket(endpoint); sockets.push(ws);
  const messages = []; ws.on('message', raw => messages.push(JSON.parse(String(raw))));
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  ws.send(JSON.stringify({ type: 'hello', name, ...options }));
  for (let i = 0; i < 200; i++) {
    const room = messages.find(message => message.type === 'room');
    if (room) return { ws, room };
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('临时房间连接超时');
}
try {
  await task('home', async () => {
    const page = await newPage(); await page.goto(base);
    await page.getByRole('button', { name: '竞速', exact: true }).waitFor({ state: 'visible' });
    await page.waitForTimeout(3000);
    await page.locator('.hh-live-strip:not([hidden])').waitFor({ state: 'visible', timeout: 30000 });
    await page.waitForFunction(() => [...document.querySelectorAll('.hh-card')].every(el => getComputedStyle(el).opacity === '1'));
    await shot(page, 'home'); await page.context().close();
  });
  await task('race-alpine', async () => {
    const page = await newPage(); await openCapture(page, 'hard');
    await driveTo(page, 940); await shot(page, 'race-alpine'); await page.context().close();
  });
  await task('race-lake', async () => {
    const page = await newPage(); await openCapture(page, 'normal');
    // 先完成真实三圈生成「我的最佳」，再与自己的录像同场，无伪造排行榜或录像。
    await page.evaluate(() => {
      for (let i = 0; i < 400; i++) if (window.__race.auto(120).race.finished) return;
      throw new Error('本地影子录像未完赛');
    });
    await openCapture(page, 'normal', '&ghost=best');
    await page.evaluate(() => window.__race.step(0, 420));
    await driveTo(page, 390); await shot(page, 'race-lake'); await page.context().close();
  });
  await task('rooms', async () => {
    await socketPlayer('追风车手', { create: { name: '湖畔兜风 · 欢迎加入', locked: false } }).then(({ ws }) => {
      ws.send(JSON.stringify({ type: 'pickTrack', trackId: 2 }));
      ws.send(JSON.stringify({ type: 'addBot', difficulty: 'normal' }));
    });
    const page = await newPage(); await page.goto(new URL('/?race&room&autopilot', base).href);
    await page.locator('[data-rm-name]').fill('离地车手');
    await page.locator('.rb-header .rb-btn--primary').click();
    await page.getByRole('textbox', { name: '房间名称（可选）', exact: true }).fill('草甸派对 · 一起发车');
    await page.getByRole('button', { name: '确认创建', exact: true }).click();
    await page.locator('[data-rm-room-code]').waitFor({ state: 'visible' });
    const code = await page.locator('[data-rm-room-code]').innerText();
    await page.locator('[data-rm-mode="items"]').click();
    for (const difficulty of ['easy', 'normal', 'hard']) {
      await page.locator('[data-rm-difficulty]').selectOption(difficulty);
      await page.locator('[data-rm-add-bot]').click();
    }
    const peer = await socketPlayer('星际旅人', { roomCode: code });
    peer.ws.send(JSON.stringify({ type: 'ready', on: true }));
    await page.waitForFunction(() => !document.querySelector('[data-rm-ready]').disabled);
    const list = await newPage(); await list.goto(new URL('/?race&room', base).href);
    await list.locator(`.rb-row[data-code="${code}"]`).waitFor();
    await list.locator('#race-loading').waitFor({ state: 'detached' });
    await list.waitForTimeout(1800); await shot(list, 'rooms-browser'); await list.context().close();
    await page.bringToFront(); await page.waitForTimeout(1800);
    await shot(page, 'rooms-lobby');
    // 真实旁观连接完成大厅截图后离开，比赛由真人客户端与三名机器人运行。
    peer.ws.send(JSON.stringify({ type: 'leave' })); peer.ws.close();
    await page.waitForFunction(() => document.querySelectorAll('[data-rm-players] li').length === 4);
    await page.getByRole('button', { name: '开始比赛', exact: true }).click();
    await page.locator('[data-rm-lobby]').waitFor({ state: 'hidden' });
    await page.locator('.grg-transition').waitFor({ state: 'hidden' });
    await page.locator('#race-hud').waitFor();
    await page.waitForFunction(() => Number(document.querySelector('.rh-speed strong')?.textContent) > 40);
    await page.waitForTimeout(1800); await shot(page, 'rooms-race');
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide'))); await page.context().close();
  });
  await task('profile', async () => {
    const page = await newPage(); await page.goto(base);
    // 直接通过与页面相同的公开读取取得真实榜单地址，优先选已有 NFT 的 0x4206 玩家。
    const address = await page.evaluate(async () => {
      const { wallet } = await import('/src/chain/wallet.js');
      const rows = (await Promise.all([1, 2, 3].map(id => wallet.readLeaderboard(id)))).flat();
      rows.sort((a, b) => Number(b.address.toLowerCase().startsWith('0x4206')) - Number(a.address.toLowerCase().startsWith('0x4206')));
      for (const row of rows) if (Number((await wallet.readRecord(row.address)).tokenId)) return row.address;
      throw new Error('公开排行榜中未找到已铸造玩家');
    });
    await page.goto(new URL(`/?profile&address=${address}`, base).href);
    await page.locator('.pf-token').waitFor();
    await page.waitForFunction(() => document.querySelectorAll('.pf-score dl').length === 3);
    await page.locator('.pf-nft-art img').evaluate(img => img.decode());
    assert.equal(await page.locator('.pf-error:visible').count(), 0, '个人主页存在读取错误');
    const height = await page.locator('.pf-scores').evaluate(el => Math.ceil(el.getBoundingClientRect().bottom + 24));
    await page.waitForTimeout(800); await shot(page, 'profile', height); await page.context().close();
  });
} finally {
  for (const ws of sockets) { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'leave' })); ws.close(); }
  for (const context of contexts) await context.close().catch(() => {});
  await browser.close();
  console.log(JSON.stringify(results, null, 2));
}
