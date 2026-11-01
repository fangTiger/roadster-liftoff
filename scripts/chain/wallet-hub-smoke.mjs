// 使用已运行的 Vite 检查真实页面布局；假钱包只用于展示 NFT 和成功反馈，不签名或发交易。
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const directory = process.argv[2] || 'output/playwright/wallet-hub';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const results = [], errors = [];
try {
  for (const width of (process.argv[3] ? [Number(process.argv[3])] : [1400, 390])) {
    const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 900 } });
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('liftoff.lang.v1', 'zh'));
    async function shot(name) { await page.screenshot({ path: `${directory}/${name}-${width}.png` }); }
    async function check(name, selectors = []) {
      const wallet = await page.locator('#wallet-hub .wh-button').boundingBox();
      assert.ok(wallet && wallet.x >= 0 && wallet.x + wallet.width <= width, name + ' 钱包在视口内');
      for (const selector of selectors) {
        const box = await page.locator(selector).boundingBox();
        if (box) assert.ok(wallet.x + wallet.width <= box.x || box.x + box.width <= wallet.x || wallet.y + wallet.height <= box.y || box.y + box.height <= wallet.y, name + ' 钱包避让 ' + selector);
      }
      results.push({ name, width, wallet });
    }
    await page.goto('http://localhost:8932/', { waitUntil: 'domcontentloaded' });
    await page.locator('#wallet-hub .wh-button').waitFor();
    await page.locator('.ui-start:not([hidden])').waitFor({ timeout: 60000 });
    await check('home'); await shot('home');
    assert.equal(await page.locator('#wallet-hub .wh-short').isVisible(), width <= 420);
    await page.locator('[data-mode=space]').click();
    await page.locator('.ui-loading').waitFor({ state: 'hidden' });
    await check('home-driving', ['#tools']); await shot('home-driving');
    await page.goto('http://localhost:8932/?race', { waitUntil: 'domcontentloaded' });
    await page.locator('#race-pick .track-card').first().waitFor({ timeout: 60000 });
    await page.locator('#race-loading').waitFor({ state: 'detached', timeout: 60000 });
    await check('race-pick'); await shot('race-pick');
    // 使用公共客户端替身呈现持有 NFT 的榜单，检查整体滚动。
    await page.locator('[data-board]').click();
    await page.evaluate(async () => {
      const { mountRaceBoard } = await import('/src/chain/race-board.js');
      const { chain } = await import('/src/chain/config.js');
      const box = document.querySelector('.rc-board-layer>div');
      mountRaceBoard(box, { wallet: { state: { account: '0xabc', chainId: chain.id }, subscribe: () => () => {},
        readRecord: async () => ({ tokenId: 7, firstTrack: 1, firstLapMs: 50000, achievements: 7, mintedAt: 1700000000, updatedAt: 1800000000 }),
        readBest: async () => ({ bestMs: 50000, verified: true }),
        readLeaderboard: async () => Array.from({ length: 10 }, (_, i) => ({ address: '0x1234567890123456789012345678901234567890', bestMs: 50000 + i, verified: true, updatedAt: 1800000000 })),
      } });
    });
    await page.locator('.rc-leaderboard .rc-number').waitFor();
    assert.equal(await page.locator('#race-pick').evaluate(node => node.inert), true, '榜单打开时背景赛道按钮不可操作');
    await page.keyboard.press('1'); assert.equal(await page.locator('#race-pick').count(), 1);
    const boardBox = await page.locator('.rc-leaderboard').boundingBox();
    assert.ok(boardBox.y >= 0 && boardBox.y + boardBox.height <= page.viewportSize().height, '持有 NFT 的榜单在屏内滚动');
    await shot('leaderboard');
    await page.locator('.rc-board-layer').click({ position: { x: 2, y: 2 } });

    await page.locator('#race-pick button[data-k=easy]').click();
    await page.locator('#race-hud .rh-map').waitFor({ timeout: 60000 });
    await page.locator('#race-pick').waitFor({ state: 'detached', timeout: 60000 });
    await check('race-driving', ['#race-hud .rh-map', '#race-hud header']); await shot('race-driving');
    await page.keyboard.press('Escape'); await page.locator('#race-menu:not([hidden])').waitFor();
    await check('race-pause', ['#race-menu>div']); await shot('race-pause');
    await page.evaluate(async () => {
      const { openMyNFT } = await import('/src/chain/wallet-hub.js');
      const { chain } = await import('/src/chain/config.js');
      window.__walletHubModal = openMyNFT({ wallet: { state: { account: '0x1234567890123456789012345678901234567890', chainId: chain.id }, subscribe: () => () => {},
        readRecord: async () => ({ tokenId: 7, firstTrack: 1, firstLapMs: 50000, achievements: 7, mintedAt: 1700000000, updatedAt: 1800000000 }),
        readBest: async (_, id) => ({ bestMs: id === 3 ? 0 : 50000, verified: id === 1 }),
      } });
    });
    await page.locator('.rc-nft .rc-number').waitFor(); await page.locator('.rc-image-fallback:not([hidden])').waitFor();
    await shot('my-nft'); await page.keyboard.press('Escape'); assert.equal(await page.locator('.wh-layer').count(), 0);
    assert.equal(await page.locator('#race-menu').isVisible(), true, '关闭 NFT 不应关闭暂停菜单');
    // 用假 publicClient 验证真实成功面板、菜单与成就提示的空间关系。
    await page.evaluate(async () => {
      const { mountWalletHub } = await import('/src/chain/wallet-hub.js');
      const { createRecordsWallet } = await import('/src/chain/wallet.js');
      const { mountRaceChain } = await import('/src/chain/race-panel.js');
      const { chain } = await import('/src/chain/config.js');
      let minted = false;
      const provider = { request: async ({ method }) => method === 'eth_chainId' ? chain.id : ['0x1234567890123456789012345678901234567890'] };
      const wallet = createRecordsWallet({ getProvider: () => provider, getWalletClient: () => ({ writeContract: async () => '0x123' }), publicClient: {
        readContract: async ({ functionName }) => ({
          recordOf: { tokenId: minted ? 7 : 0, firstTrack: 1, firstLapMs: 35000, achievements: 7, mintedAt: 1700000000, updatedAt: 1800000000 },
          bestOf: { bestMs: minted ? 35000 : 50000, verified: true }, trackOf: { qualifyMs: 60000, minLapMs: 10000 }, verifier: '0x0000000000000000000000000000000000000000',
        })[functionName],
        simulateContract: async () => ({ request: {} }), waitForTransactionReceipt: async () => { minted = true; return { status: 'success', transactionHash: '0x123' }; },
      } });
      await wallet.connect(); document.getElementById('wallet-hub-host').remove(); mountWalletHub(document.body, { wallet });
      const slot = document.createElement('div'); slot.className = 'rm-root'; Object.assign(slot.style, { position: 'fixed', left: '50%', top: '320px', transform: 'translateX(-50%)', width: 'min(420px, 92vw)', zIndex: 100 }); document.body.append(slot);
      mountRaceChain(slot, { trackId: 1, bestLap: 35, bits: 7 }, { wallet });
    });
    await check('race-connected', ['#race-hud .rh-map', '#race-hud header']);
    await page.getByRole('button', { name: '铸造首圈纪念 NFT', exact: true }).click();
    await page.getByRole('heading', { name: '首圈纪念 NFT 已铸造 #7', exact: true }).waitFor();
    await page.evaluate(async () => { const { createAchievements } = await import('/src/achievements/achievements.js'); createAchievements({ storageKey: 'wallet-hub-smoke-achievements' }).report('drive_start'); });
    await page.locator('#ach-toast').waitFor();
    await page.waitForFunction(() => getComputedStyle(document.getElementById('ach-toast')).position === 'fixed');
    await page.locator('#ach-toast').evaluate(node => Promise.all(node.getAnimations().map(animation => animation.finished)));
    const success = await page.locator('.wh-toast').boundingBox(), achievement = await page.locator('#ach-toast').boundingBox();
    await shot('mint-success');
    assert.ok(success.y + success.height <= achievement.y || achievement.y + achievement.height <= success.y, `成功提示为成就提示预留独立区域：${JSON.stringify({ success, achievement })}`);
    await page.locator('#wallet-hub .wh-button').click(); await shot('wallet-menu');
    await page.goto('http://localhost:8932/?race&room', { waitUntil: 'domcontentloaded' });
    await page.locator('.rm-browser-page').waitFor({ timeout: 60000 });
    await page.locator('#race-loading').waitFor({ state: 'detached', timeout: 60000 });
    await check('room-browser', ['.rm-browser-masthead']); await shot('room-browser');
    await page.locator('[data-rm-name]').fill('钱包布局检查');
    await page.getByRole('button', { name: '建房', exact: true }).first().click();
    await page.getByRole('button', { name: '确认创建', exact: true }).click();
    await page.locator('.rm-root.grg-layout').waitFor({ timeout: 30000 });
    await page.locator('[data-rm-lobby]').waitFor({ state: 'visible' });
    await page.locator('#race-loading').waitFor({ state: 'detached', timeout: 60000 });
    await check('room-lobby', ['[data-rm-lobby]']); await shot('room-lobby');
    await page.locator('.grg-plate__add').first().click();
    await page.locator('[data-rm-ready]:not([disabled])').waitFor(); await page.locator('[data-rm-ready]').click();
    await page.locator('#race-hud .rh-map').waitFor({ timeout: 60000 });
    await page.locator('[data-rm-lobby]').waitFor({ state: 'hidden', timeout: 60000 });
    await check('room-driving', ['#race-hud .rh-map', '#race-hud header']); await shot('room-driving');
    await page.evaluate(async () => {
      const { mountWalletHub } = await import('/src/chain/wallet-hub.js'), { chain } = await import('/src/chain/config.js');
      document.getElementById('wallet-hub-host').remove();
      mountWalletHub(document.body, { wallet: { state: { account: '0x1234567890123456789012345678901234567890', chainId: chain.id }, subscribe: () => () => {} } });
    });
    await check('room-connected', ['#race-hud .rh-map', '#race-hud header', '#race-hud .rh-item']); await shot('room-connected');

    await page.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(`${directory}/layout-checks.json`, JSON.stringify({ results, errors }, null, 2));
  console.log(`布局检查通过：${results.length} 项，截图保存在 ${directory}`);
} finally { await browser.close(); }
