// 需先由竞速入口接好 autopilot 与面板；本脚本会用 PLAYER_KEY 发测试网交易，请手动运行。
// 用法：PLAYER_KEY 已在终端设置后，node scripts/chain/e2e-race.mjs
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { createPublicClient, createWalletClient, decodeFunctionData, http, isAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { getArcChain, recordsAbi, TESTNET_RACING_ADDRESS } from '../../src/chain/shared.js';

const chain = getArcChain();
export function createPlayerRpc({ account, publicClient, walletClient, address = TESTNET_RACING_ADDRESS, onSent = () => {} }) {
  return async (method, params = []) => {
    switch (method) {
      case 'eth_accounts': case 'eth_requestAccounts': return [account.address];
      case 'eth_chainId': return `0x${chain.id.toString(16)}`;
      case 'wallet_switchEthereumChain':
        if (Number(params[0]?.chainId) !== chain.id) throw new Error('仅支持 Arc 测试网');
        return null;
      case 'wallet_addEthereumChain': return null;
      case 'eth_sendTransaction': {
        const tx = params[0];
        if (tx?.to?.toLowerCase() !== address.toLowerCase() || BigInt(tx.value || 0) !== 0n) throw new Error('仅允许目标合约的零金额交易');
        const { functionName, args } = decodeFunctionData({ abi: recordsAbi, data: tx.data });
        if (functionName !== 'submit' || args[0] !== 1) throw new Error('仅允许简单赛道 submit');
        const hash = await walletClient.sendTransaction({ to: address, data: tx.data, value: 0n, gas: tx.gas ? BigInt(tx.gas) : undefined });
        onSent({ hash, args }); return hash;
      }
      default:
        if (!/^eth_(blockNumber|call|estimateGas|feeHistory|gasPrice|getBalance|getBlockByNumber|getCode|getTransactionByHash|getTransactionCount|getTransactionReceipt|maxPriorityFeePerGas)$/.test(method)) throw new Error('不支持的钱包请求');
        return publicClient.request({ method, params });
    }
  };
}
export async function runRaceE2e({ account, publicClient, walletClient, address = TESTNET_RACING_ADDRESS, url = 'http://127.0.0.1:5173/' }) {
  const read = (functionName, args) => publicClient.readContract({ address, abi: recordsAbi, functionName, args });
  const track = await read('trackOf', [1]);
  assert.ok(Number(track.qualifyMs), '简单赛道尚未开放，请先配置赛道');
  assert.equal(Number((await read('recordOf', [account.address])).tokenId), 0, '首圈铸造测试需要尚无 NFT 的 PLAYER_KEY 钱包');
  const sent = [], pageErrors = [];
  const rpc = createPlayerRpc({ account, publicClient, walletClient, address, onSent: tx => sent.push(tx) });
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.exposeFunction('__raceWalletRpc', async (method, json) => {
      try { return { result: JSON.stringify(await rpc(method, JSON.parse(json)), (_, value) => typeof value === 'bigint' ? `0x${value.toString(16)}` : value) }; }
      catch { return { error: '测试钱包请求失败，请检查余额、配置及网络' }; }
    });
    await context.addInitScript(() => {
      window.ethereum = { isMetaMask: true, on() {}, removeListener() {}, async request({ method, params }) {
        const response = await window.__raceWalletRpc(method, JSON.stringify(params || []));
        if (response.error) throw Object.assign(new Error(response.error), { code: -32000 });
        return JSON.parse(response.result);
      } };
    });
    const page = await context.newPage(); page.on('pageerror', () => pageErrors.push('页面脚本错误'));
    const target = new URL(url); target.search = '?race&autopilot&map=easy';
    await page.goto(target.href);
    // 入口须在三圈完成后才挂载 rc-submit，不采用 capture 跳过正式比赛流程。
    const panel = page.locator('.rc-submit');
    await panel.waitFor({ state: 'visible', timeout: 1800000 });
    const lapMs = Number(await panel.getAttribute('data-lap-ms'));
    assert.ok(lapMs > 0, '面板应包含有效最快单圈');
    await panel.getByRole('button', { name: '连接钱包', exact: true }).click();
    await panel.getByRole('button', { name: '铸造首圈纪念 NFT', exact: true }).click({ timeout: 60000 });
    await panel.getByRole('link', { name: '上链成功 · 查看交易', exact: true }).waitFor({ timeout: 180000 });
    assert.equal(sent.length, 1, '只能提交一笔铸造交易');
    const { hash, args } = sent[0];
    const receipt = await publicClient.waitForTransactionReceipt({ hash }); assert.equal(receipt.status, 'success');
    const record = await read('recordOf', [account.address]), best = await read('bestOf', [account.address, 1]);
    assert.ok(Number(record.tokenId) > 0); assert.equal(Number(record.firstTrack), 1);
    assert.equal(Number(record.firstLapMs), lapMs); assert.equal(Number(best.bestMs), lapMs);
    assert.equal(Number(args[1]), lapMs); assert.equal(Number(record.achievements), Number(args[2]));
    assert.equal(pageErrors.length, 0, '页面存在脚本错误');
    console.log(`上链验证成功 · NFT #${record.tokenId} · 最快单圈 ${best.bestMs} ms`);
    console.log(`交易哈希：${hash}`);
    return { hash, record, best };
  } finally { await browser.close(); }
}
async function main() {
  if (!/^0x[0-9a-fA-F]{64}$/.test(process.env.PLAYER_KEY || '')) throw new Error('请在自己的终端设置 PLAYER_KEY');
  const account = privateKeyToAccount(process.env.PLAYER_KEY), address = process.env.RACING_ADDRESS?.trim() || TESTNET_RACING_ADDRESS;
  if (!isAddress(address)) throw new Error('RACING_ADDRESS 无效');
  await runRaceE2e({ account, address, url: process.env.URL || 'http://127.0.0.1:5173/', publicClient: createPublicClient({ chain, transport: http() }), walletClient: createWalletClient({ chain, account, transport: http() }) });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error('竞速端到端验证失败：请检查 PLAYER_KEY、余额、赛道开放情况、入口/autopilot 接线及网络。'); process.exitCode = 1; });
}
