// 使用现有 Vite 服务验证首页，不启动服务、不签名、不发送交易。
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const directory = process.argv[2] || '/private/tmp/home-wire';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const errors = [], results = [];
try {
  // 独立模块的重显和语言切换回归；不依赖 3D 加载。
  const demo = await browser.newPage();
  await demo.goto('http://localhost:8932/src/ui/home/demo.html');
  const regressions = await demo.evaluate(async () => {
    const { createHomeHero } = await import('/src/ui/home/home-hero.js');
    let english = false;
    const container = document.createElement('div'); document.body.append(container);
    const hero = createHomeHero({ container, reducedMotion: true, t: key => key,
      modes: [{ id: 'race', get title() { return english ? 'Race' : '计时赛'; }, get desc() { return english ? 'Drive' : '驾驶'; } }] });
    hero.show(); hero.hide(); hero.show();
    const root = container.querySelector('.hh-root');
    const interactive = !root.inert && root.style.visibility === 'visible';
    const card = container.querySelector('.hh-card'); card.focus(); english = true; hero.setLang();
    const translated = card.querySelector('.hh-card-title').textContent === 'Race' && document.activeElement === card;
    hero.destroy(); return { interactive, translated };
  });
  assert.equal(regressions.interactive, true, '重显应恢复交互');
  assert.equal(regressions.translated, true, '语言切换应刷新卡片并保留焦点');
  await demo.close();
  if (process.argv.includes('--module-only')) { console.log(regressions); process.exitCode = 0; }
  else {
    // UI 生命周期用轻量演示页检查，链上失败不得阻塞。
    const ui = await browser.newPage();
    await ui.goto('http://localhost:8932/src/ui/demo.html');
    await ui.waitForFunction(() => !!window.ui);
    assert.equal(await ui.locator('.ui-progress').getAttribute('aria-valuenow'), '42');
    assert.equal(await ui.locator('.hh-root').count(), 0);
    await ui.evaluate(() => window.ui.hideLoading());
    await ui.locator('.hh-card').first().waitFor();
    await ui.evaluate(() => { window.ui.showLoading(.7); window.ui.hideLoading(); });
    await ui.waitForTimeout(400);
    assert.equal(await ui.locator('.hh-root').evaluate(el => el.inert), false);
    await ui.keyboard.press('w'); assert.equal(await ui.locator('.ui-loading').isVisible(), true);
    await ui.evaluate(async () => { const { createInput } = await import('/src/game/input.js'); window.__wireInput = createInput(); });
    await ui.locator('.hh-card').first().focus(); await ui.keyboard.press('ArrowRight');
    assert.equal(await ui.evaluate(() => __wireInput.state().right), false);
    await ui.keyboard.down('Space');
    assert.equal(await ui.evaluate(() => __wireInput.state().jet), false, '卡片空格不传入推进器');
    await ui.keyboard.up('Space'); await ui.waitForTimeout(700);
    assert.equal(await ui.locator('.ui-loading').isVisible(), false);
    assert.equal(await ui.evaluate(() => demoCalls.filter(c => c[0] === '开始').length), 1);
    await ui.close();
    for (const width of [1400, 390]) {
      const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 860 } });
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      await page.addInitScript(() => localStorage.setItem('liftoff.lang.v1', 'zh'));
      await page.goto('http://localhost:8932/', { waitUntil: 'domcontentloaded' });
      await page.locator('.hh-root[aria-hidden="false"]').waitFor({ timeout: 90000 });
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${directory}/home-${width}-0.5s.png` });
      await page.waitForTimeout(2500);
      await page.screenshot({ path: `${directory}/home-${width}-3s.png` });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth || document.querySelector('.ui-loading').scrollWidth > innerWidth), false, '无横向滚动');
      assert.equal(await page.locator('.hh-slot-footer .ui-control-panel').count(), 1);
      assert.equal(await page.locator('.hh-slot-footer footer').count(), 1);
      const cards = page.locator('.hh-card');
      await cards.nth(0).hover(); await page.waitForTimeout(650);
      await page.screenshot({ path: `${directory}/hover-race-${width}.png` });
      await cards.nth(1).hover(); await page.waitForTimeout(650);
      await page.screenshot({ path: `${directory}/hover-space-${width}.png` });
      await page.mouse.move(0, 0);
      await page.locator('.ui-start-lang .lang-toggle').click();
      assert.equal(await cards.nth(1).locator('.hh-card-title').textContent(), 'Fly to Space');
      await page.locator('.ui-start-lang .lang-toggle').click();
      await cards.nth(3).click({ force: true });
      assert.equal(await page.locator('.ui-toast').isVisible(), true, '赛季仍显示即将推出提示'); assert.equal(await page.locator('.ui-loading').isVisible(), true);
      await cards.nth(0).click(); await page.waitForURL('**/?race');
      results.push({ width, raceUrl: page.url(), horizontalOverflow: false });
      await page.goto('http://localhost:8932/', { waitUntil: 'domcontentloaded' });
      await page.locator('.hh-root[aria-hidden="false"]').waitFor({ timeout: 90000 });
      await page.waitForTimeout(2500);
      await page.locator('.hh-card').nth(1).click();
      await page.locator('.ui-loading').waitFor({ state: 'hidden' });
      assert.equal(await page.locator('.hh-root').getAttribute('aria-hidden'), 'true');
      await page.keyboard.down('w'); await page.waitForTimeout(1000); await page.keyboard.up('w');
      assert.ok(Number(await page.locator('#spd').textContent()) > 0, '进入太空模式后驾驶循环正常推进');
      await page.keyboard.down('Space'); await page.waitForTimeout(1500); await page.keyboard.up('Space');
      assert.ok(Number(await page.locator('#hops').textContent()) > 0, '推进器可开始飞行');
      await page.screenshot({ path: `${directory}/space-started-${width}.png` });
      results.push({ width, spaceStarted: true }); await page.close();
    }
    const reduced = await browser.newPage({ viewport: { width: 1400, height: 860 } });
    reduced.on('pageerror', e => errors.push(e.message));
    await reduced.emulateMedia({ reducedMotion: 'reduce' });
    await reduced.addInitScript(() => localStorage.setItem('liftoff.lang.v1', 'zh'));
    await reduced.goto('http://localhost:8932/');
    await reduced.locator('.hh-root[aria-hidden="false"]').waitFor({ timeout: 90000 });
    await reduced.waitForTimeout(500);
    await reduced.screenshot({ path: `${directory}/home-reduced-motion.png` });
    assert.equal(await reduced.locator('.hh-letter').first().evaluate(el => getComputedStyle(el).opacity), '1');
    await reduced.close();
    assert.deepEqual(errors, [], '控制台无错误');
    await writeFile(`${directory}/results.json`, JSON.stringify({ regressions, results, errors }, null, 2));
    console.log(JSON.stringify({ regressions, results, errors }));
  }
} finally { await browser.close(); }
