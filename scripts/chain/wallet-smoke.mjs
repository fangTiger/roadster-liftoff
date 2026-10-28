// 先启动 Vite；默认 URL=http://127.0.0.1:8934/。只验证连接界面，不签名或发交易。
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
try {
  const viewport = process.argv.includes('--mobile') ? { width: 390, height: 844 } : { width: 1280, height: 900 };
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.name));
  await page.addInitScript(() => localStorage.setItem('liftoff.lang.v1', 'zh'));
  await page.route('https://rpc.testnet.arc.io/**', async route => {
    const request = route.request().postDataJSON();
    const result = row => ({ jsonrpc: '2.0', id: row.id, result: '0x' + '0'.repeat(64 * 6) });
    await route.fulfill({ json: Array.isArray(request) ? request.map(result) : result(request) });
  });
  const url = new URL(process.env.URL || 'http://127.0.0.1:8934/'); url.search = '?race';
  await page.goto(url.href, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-board]').waitFor({ timeout: 60000 });
  await page.locator('#race-loading').waitFor({ state: 'detached', timeout: 60000 });
  assert.equal(await page.evaluate(() => typeof window.ethereum), 'undefined');
  assert.equal(await page.locator('#roadster-wallet').count(), 0);
  await page.locator('[data-board]').click();
  await page.setViewportSize(viewport);
  await page.getByRole('button', { name: '连接钱包', exact: true }).click();
  const dialog = page.locator('[data-rk] [role="dialog"]');
  await dialog.waitFor({ state: 'attached', timeout: 60000 });
  assert.ok(await dialog.isVisible(), '竞速页面必须显示第三方弹窗');
  const pickTitle = await page.locator('#race-pick [data-i18n="race.pick"]').innerText();
  await page.keyboard.press('2');
  assert.equal(await page.locator('#race-pick [data-i18n="race.pick"]').innerText(), pickTitle, '弹窗输入不得触发游戏选图');
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });
  await page.getByRole('button', { name: '连接钱包', exact: true }).click();
  await dialog.waitFor({ state: 'visible' });
  if (process.argv.includes('--qr')) {
    await dialog.getByRole('button', { name: 'WalletConnect', exact: true }).click();
    await dialog.locator('svg').filter({ has: page.locator('title', { hasText: 'QR Code' }) }).waitFor({ state: 'visible', timeout: 60000 });
    await dialog.getByRole('button', { name: '打开', exact: true }).click();
    const official = page.locator('w3m-modal').getByRole('alertdialog');
    await official.waitFor({ state: 'visible', timeout: 60000 });
    await page.keyboard.press('Escape');
    await official.waitFor({ state: 'hidden', timeout: 3000 });
    await page.getByRole('button', { name: '连接钱包', exact: true }).click();
    await dialog.waitFor({ state: 'visible' });
  }
  await page.evaluate(() => {
    window.__walletCalls = [];
    const listeners = new Map();
    let chainId = 1;
    const account = '0x000000000000000000000000000000000000000b';
    const provider = {
      on(event, fn) { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event).add(fn); },
      removeListener(event, fn) { listeners.get(event)?.delete(fn); },
      async request({ method, params }) {
        window.__walletCalls.push(method);
        if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [account];
        if (method === 'eth_chainId') return '0x' + chainId.toString(16);
        if (method === 'wallet_switchEthereumChain') {
          chainId = Number(params[0].chainId);
          for (const fn of listeners.get('chainChanged') || []) fn('0x' + chainId.toString(16));
          return null;
        }
        if (method === 'wallet_requestPermissions') return [{ parentCapability: 'eth_accounts' }];
        if (method === 'wallet_getPermissions') return [];
        throw new Error('未实现的测试钱包方法：' + method);
      },
    };
    window.ethereum = { request() { throw new Error('不应使用默认钱包'); } };
    window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: {
      info: { name: '测试钱包 B', uuid: '00000000-0000-4000-8000-00000000000b', rdns: 'io.roadster.wallet-b', icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>' }, provider,
    } }));
  });
  await dialog.getByRole('button', { name: '测试钱包 B', exact: true }).click();
  await dialog.waitFor({ state: 'detached' });
  await page.waitForFunction(() => window.__walletCalls.includes('wallet_switchEthereumChain'));
  await page.getByRole('button', { name: '连接钱包', exact: true }).waitFor({ state: 'hidden' });
  assert.ok((await page.evaluate(() => window.__walletCalls)).includes('wallet_switchEthereumChain'));
  assert.equal(errors.length, 0, '浏览器不应有未捕获异常');
  console.log('钱包浏览器验证通过：按需加载、无插件弹窗、键盘隔离、取消重试、指定连接器、Arc 切网');
} finally { await browser.close(); }
