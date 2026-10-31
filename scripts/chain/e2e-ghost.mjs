// 审查者手动运行；仅 main 的正式模式读取 PLAYER_KEY，绝不加载文件或打印签名客户端异常。
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { createPublicClient, createWalletClient, decodeFunctionData, http, isAddress, zeroAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { getArcChain, recordsAbi, TESTNET_RACING_ADDRESS } from '../../src/chain/shared.js';
import { shortAddr } from '../../src/chain/records.js';
import { createPlayerRpc } from './e2e-race.mjs';

const chain = getArcChain();
const screenshots = '/private/tmp/claude-501/-Users-captain-python-Claude-arc-main-first/52a9eede-5d82-4a4f-9ef5-151e0447a67d/scratchpad/e2e-ghost/';

export function ghostRaceUrl(url) {
  const target = new URL(url);
  target.search = '?race&e2eAutopilot=1';
  return target;
}

export function createGhostPlayerRpc(options) {
  const rpc = createPlayerRpc(options);
  let authorized = false;
  return async (method, params = []) => {
    // 新浏览器上下文从未授权状态开始，避免 RainbowKit 自动恢复与连接弹窗竞争。
    if (method === 'eth_accounts' && !authorized) return [];
    if (method === 'eth_requestAccounts') {
      const accounts = await rpc(method, params); authorized = true; return accounts;
    }
    if (method === 'eth_sendTransaction') {
      const tx = params[0];
      if (tx?.from?.toLowerCase() !== options.account.address.toLowerCase()) throw new Error('仅允许当前玩家发送');
      const { functionName, args } = decodeFunctionData({ abi: recordsAbi, data: tx.data });
      if (functionName !== 'submit' || args[3] === 0n || !/^0x[0-9a-fA-F]{130}$/.test(args[4])) throw new Error('仅允许服务器核实后的成绩');
    }
    return rpc(method, params);
  };
}

async function installWallet(context, rpc) {
  await context.exposeFunction('__ghostWalletRpc', async (method, json) => {
    try { return { result: JSON.stringify(await rpc(method, JSON.parse(json)), (_, value) => typeof value === 'bigint' ? `0x${value.toString(16)}` : value) }; }
    catch { return { error: '测试钱包请求失败，请检查余额、合约配置及网络' }; }
  });
  await context.addInitScript(injectGhostWallet);
}

export function injectGhostWallet() {
  window.ethereum = { isMetaMask: true, on() {}, removeListener() {}, async request({ method, params }) {
    const response = await window.__ghostWalletRpc(method, JSON.stringify(params || []));
    if (response.error) throw Object.assign(new Error(response.error), { code: -32000 });
    return JSON.parse(response.result);
  } };
  // 公告为真正的注入连接器，避免 MetaMask SDK 接管并尝试唤起外部扩展。
  const announce = () => window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: {
    info: { uuid: '3505225f-0341-4cef-9500-8ea444b1f0bd', name: 'MetaMask', rdns: 'io.metamask',
      icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="orange"/></svg>',
    }, provider: window.ethereum,
  } }));
  window.addEventListener('eip6963:requestProvider', announce); announce();
}

export async function waitForGhostWallet(page, player) {
  const wallet = await page.evaluateHandle(async () => (await import('/src/chain/wallet.js')).wallet);
  try {
    // waitForFunction 把 Promise 视作真值；异步导入必须在轮询之前完成。
    await page.waitForFunction(({ wallet, player }) => wallet.state.account?.toLowerCase() === player.toLowerCase(), { wallet, player }, { timeout: 60000 });
  } finally { await wallet.dispose(); }
}

async function openRace(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  // 从站点首页开始，再进入带开发开关的正式选图页，不使用 capture 快进。
  await page.locator('canvas').first().waitFor({ timeout: 90000 });
  await page.goto(ghostRaceUrl(url).href, { waitUntil: 'domcontentloaded' });
  await page.locator('#race-pick button[data-k="easy"]').waitFor({ timeout: 90000 });
}

export async function runGhostE2e({ account, publicClient, walletClient, address = TESTNET_RACING_ADDRESS,
  url = 'http://localhost:8932/', beforeWallet = false, log = console.log } = {}) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const pages = [], errors = [], sent = [];
  let stage = '打开开发页面';
  const step = message => { stage = message; log(`步骤：${message}`); };
  const observe = page => { pages.push(page); page.on('pageerror', () => errors.push('页面脚本错误')); return page; };
  const contextOptions = { viewport: { width: 1280, height: 900 }, locale: 'zh-CN' };
  try {
    step('打开首页与录像赛选图页');
    const context = await browser.newContext(contextOptions);
    if (!beforeWallet) {
      assert.ok(account && publicClient && walletClient, '缺少测试客户端');
      await installWallet(context, createGhostPlayerRpc({ account, publicClient, walletClient, address,
        onSent: tx => { sent.push(tx); log(`交易哈希：${tx.hash}`); },
      }));
    }
    const page = observe(await context.newPage());
    await openRace(page, url);
    if (!beforeWallet) {
      step('检查链上草甸资格线、下限与核实者');
      const read = (functionName, args = []) => publicClient.readContract({ address, abi: recordsAbi, functionName, args });
      const [track, verifier] = await Promise.all([read('trackOf', [1]), read('verifier')]);
      assert.equal(Number(track.qualifyMs), 58000); assert.equal(Number(track.minLapMs), 15000);
      assert.notEqual(verifier.toLowerCase(), zeroAddress);
      step('连接注入的测试钱包');
      await page.locator('[data-board]').click();
      await page.locator('.rc-mine').getByRole('button', { name: '连接钱包', exact: true }).click();
      await page.getByRole('button', { name: 'MetaMask', exact: true }).click({ timeout: 60000 });
      await waitForGhostWallet(page, account.address);
      await page.locator('[data-rk][role="dialog"]').waitFor({ state: 'hidden', timeout: 60000 });
      await page.locator('#race-pick').click({ position: { x: 5, y: 5 } });
      log(`钱包已连接：${account.address}`);
    }
    step('选择草甸资格赛，hard 驾驶器完成正式三圈录像');
    await page.locator('#race-pick button[data-k="easy"]').click();
    const panel = page.locator('.rc-submit');
    await panel.waitFor({ state: 'visible', timeout: 900000 });
    const lapMs = Number(await panel.getAttribute('data-lap-ms'));
    assert.ok(lapMs >= 15000 && lapMs <= 58000, '最快圈必须进入链上资格线且不低于下限');
    assert.equal(errors.length, 0, '页面存在脚本错误');
    log(`三圈已完成，最快单圈 ${lapMs} ms`);
    if (beforeWallet) {
      await panel.getByRole('button', { name: '连接钱包', exact: true }).waitFor();
      await mkdir(screenshots, { recursive: true });
      await page.screenshot({ path: join(screenshots, 'before-wallet.png'), fullPage: true });
      log('无私钥检查通过，停在连接钱包之前；未核实签名、未发送交易。');
      return { lapMs, beforeWallet: true };
    }
    step('上传录像核实并提交签名成绩');
    const verification = page.waitForResponse(response => new URL(response.url()).pathname === '/api/verify' && response.request().method() === 'POST', { timeout: 120000 });
    // 旧钱包已持有更快成绩且无新增成就时不会提交；应换用可刷新成绩的钱包。
    const submit = panel.getByRole('button', { name: /铸造首圈纪念 NFT|更新链上记录/ });
    await submit.waitFor({ timeout: 60000 });
    const verifiedResponse = await Promise.all([verification, submit.click()]).then(([response]) => response);
    assert.equal(verifiedResponse.status(), 200, '核实接口应返回成功');
    const verified = await verifiedResponse.json();
    assert.equal(verified.lapMs, lapMs, '前端与核实重放圈速必须一致');
    log(`录像核实通过：${verified.lapMs} ms`);
    await panel.getByRole('link', { name: '上链成功 · 查看交易', exact: true }).waitFor({ timeout: 180000 });
    assert.equal(sent.length, 1, '只能发送一笔成绩交易');
    const hash = sent[0].hash;
    assert.equal((await publicClient.waitForTransactionReceipt({ hash })).status, 'success');
    const best = await publicClient.readContract({ address, abi: recordsAbi, functionName: 'bestOf', args: [account.address, 1] });
    assert.equal(best.verified, true); assert.ok(Number(best.bestMs) <= lapMs);
    log(`链上 bestOf verified=true，最快 ${best.bestMs} ms`);

    step('在独立无钱包页面下载排行榜影子');
    const guestContext = await browser.newContext(contextOptions);
    const guest = observe(await guestContext.newPage());
    await openRace(guest, url);
    assert.equal(await guest.evaluate(() => typeof window.ethereum), 'undefined');
    const choices = guest.locator('[data-ghost-options="easy"]');
    await choices.getByRole('button', { name: '排行榜第 N 名', exact: true }).click();
    const download = guest.waitForResponse(response => {
      const query = new URL(response.url());
      return query.pathname === '/api/ghost' && query.searchParams.get('address')?.toLowerCase() === account.address.toLowerCase();
    }, { timeout: 60000 });
    const downloaded = await Promise.all([download, choices.locator('.race-ghost-ranked button').filter({ hasText: shortAddr(account.address) }).click({ timeout: 60000 })]).then(([response]) => response);
    assert.equal(downloaded.status(), 200); assert.equal((await downloaded.json()).trackId, 1);
    await choices.locator('.race-ghost-ranked button[aria-pressed="true"]').waitFor();
    step('无钱包玩家与下载的影子同场行驶');
    await guest.locator('#race-pick button[data-k="easy"]').click();
    await guest.waitForFunction(() => {
      const state = window.__ghostE2e?.();
      return state?.ghostVisible && state.ghostStep > 500 && state.playerStep > 500;
    }, null, { timeout: 90000 });
    const first = await guest.evaluate(() => window.__ghostE2e());
    await guest.waitForFunction(previous => {
      const state = window.__ghostE2e();
      return state.ghostStep > previous.ghostStep + 120 && (state.ghostPosition.x !== previous.ghostPosition.x || state.ghostPosition.z !== previous.ghostPosition.z);
    }, first, { timeout: 60000 });
    assert.equal(errors.length, 0, '页面存在脚本错误');
    await mkdir(screenshots, { recursive: true });
    await guest.screenshot({ path: join(screenshots, 'ghost-together.png'), fullPage: true });
    log('端到端通过：已核实上链，独立无钱包页面已下载影子并同场显示。');
    return { hash, best };
  } catch {
    log(`失败步骤：${stage}`);
    await mkdir(screenshots, { recursive: true });
    for (const [index, page] of pages.entries()) {
      const path = join(screenshots, `failure-${Date.now()}-${index}.png`);
      try { await page.screenshot({ path, fullPage: true, timeout: 15000 }); log(`失败截图：${path}`); }
      catch { log('页面已关闭或无法截图'); }
    }
    // 上游错误可能携带签名请求；只输出受控的步骤信息。
    throw new Error(`录像赛端到端失败：${stage}`);
  } finally { await browser.close(); }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--before-wallet')) throw new Error('用法：node scripts/chain/e2e-ghost.mjs [--before-wallet]');
  const common = { url: process.env.E2E_URL || 'http://localhost:8932/', address: process.env.RACING_ADDRESS?.trim() || TESTNET_RACING_ADDRESS };
  if (!isAddress(common.address)) throw new Error('合约地址无效');
  if (args.includes('--before-wallet')) return runGhostE2e({ ...common, beforeWallet: true });
  if (!/^0x[0-9a-fA-F]{64}$/.test(process.env.PLAYER_KEY || '')) throw new Error('请由审查者在终端以 PLAYER_KEY 环境变量注入玩家私钥');
  const account = privateKeyToAccount(process.env.PLAYER_KEY);
  await runGhostE2e({ ...common, account, publicClient: createPublicClient({ chain, transport: http() }), walletClient: createWalletClient({ chain, account, transport: http() }) });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error('录像赛检查失败，请核对当前步骤、截图、开发服务、环境变量及测试网余额。'); process.exitCode = 1; });
}
