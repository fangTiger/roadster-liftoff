// 先启动 Vite；仅检查本地影子赛，不连接钱包、不发送交易、不截图。
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } }), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(() => localStorage.setItem('liftoff.lang.v1', 'zh'));
  const base = process.env.URL || 'http://127.0.0.1:8934/';
  const openCapture = async suffix => {
    await page.goto(new URL(`/?race&capture&map=easy${suffix}`, base).href);
    await page.waitForFunction(() => document.title === 'ready', { timeout: 60000 });
  };
  await openCapture('');
  const first = await page.evaluate(() => {
    let snapshot;
    for (let i = 0; i < 180; i++) { snapshot = window.__race.auto(120); if (snapshot.race.finished) break; }
    return { finished: snapshot.race.finished, replay: window.__race.replay(), record: JSON.parse(localStorage.getItem('race.ghost.1')) };
  });
  assert.ok(first.finished); assert.equal(first.replay.trackId, 1); assert.deepEqual(first.record.replay, first.replay);
  await openCapture('&ghost=best');
  assert.equal(await page.evaluate(() => window.__engine.scene.children.filter(root => root.children.some(child => child.isSprite)).length), 1);
  const second = await page.evaluate(() => {
    let snapshot;
    for (let i = 0; i < 180; i++) { snapshot = window.__race.auto(120); if (snapshot.race.finished) break; }
    return { finished: snapshot.race.finished, result: document.querySelector('.rh-result').textContent };
  });
  assert.ok(second.finished); assert.match(second.result, /与影子总时间差 \+0.00/);
  const stopped = await page.evaluate(() => {
    const root = window.__engine.scene.children.find(root => root.children.some(child => child.isSprite));
    const before = root.position.toArray(); window.__race.step(0, 240);
    return { before, after: root.position.toArray() };
  });
  assert.deepEqual(stopped.before, stopped.after);
  await page.goto(new URL('/?race', base).href);
  await page.locator('#race-loading').waitFor({ state: 'detached', timeout: 60000 });
  const easy = page.locator('[data-ghost-options=easy]');
  assert.equal(await easy.getByRole('button', { name: /我的最佳/ }).isEnabled(), true);
  assert.equal(await easy.getByRole('button', { name: /排行榜/ }).isDisabled(), true);
  assert.equal(await page.locator('[data-ghost-options=normal]').getByRole('button', { name: /我的最佳/ }).isDisabled(), true);
  await easy.getByRole('button', { name: /我的最佳/ }).click();
  assert.equal(await easy.getByRole('button', { name: /我的最佳/ }).getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#race-pick').isVisible(), true);
  assert.deepEqual(errors, []);
  console.log('浏览器检查通过：指定 capture 页面零报错、完赛存储、影子车回放与停止、总时间差、选图可用性。');
} finally { await browser.close(); }
