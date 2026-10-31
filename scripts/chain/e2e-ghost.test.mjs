import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeFunctionData } from 'viem';
import { recordsAbi, TESTNET_RACING_ADDRESS } from '../../src/chain/shared.js';
import { createGhostPlayerRpc, ghostRaceUrl, injectGhostWallet, waitForGhostWallet } from './e2e-ghost.mjs';
import { runInNewContext } from 'node:vm';

test('录像赛注入钱包只发送玩家自己的草甸签名成绩，拒绝转账和未核实提交', async () => {
  const player = '0x0000000000000000000000000000000000000001';
  let writes = 0, sent;
  const rpc = createGhostPlayerRpc({ account: { address: player }, publicClient: { request: async () => '0x123' }, walletClient: { sendTransaction: async () => { writes++; return '0xhash'; } }, onSent: tx => { sent = tx; } });
  const data = signature => encodeFunctionData({ abi: recordsAbi, functionName: 'submit', args: [1, 50000, 0, 1900000000n, signature] });
  const tx = { from: player, to: TESTNET_RACING_ADDRESS, data: data(`0x${'11'.repeat(65)}`) };
  assert.deepEqual(await rpc('eth_accounts'), [], '授权前不得触发第三方界面的自动恢复');
  assert.deepEqual(await rpc('eth_requestAccounts'), [player]);
  assert.deepEqual(await rpc('eth_accounts'), [player]);
  assert.equal(await rpc('eth_blockNumber'), '0x123');
  assert.equal(await rpc('eth_sendTransaction', [tx]), '0xhash');
  assert.equal(sent.hash, '0xhash');
  await assert.rejects(rpc('eth_sendTransaction', [{ ...tx, from: TESTNET_RACING_ADDRESS }]), /玩家/);
  await assert.rejects(rpc('eth_sendTransaction', [{ ...tx, data: data('0x') }]), /核实/);
  await assert.rejects(rpc('eth_sendTransaction', [{ ...tx, value: '0x1' }]), /零金额/);
  await assert.rejects(rpc('eth_sendTransaction', [{ ...tx, to: player }]), /目标合约/);
  await assert.rejects(rpc('personal_sign'), /不支持/);
  assert.equal(writes, 1);
});
test('端到端地址固定本机开发入口且启用显式 DEV 开关', () => {
  const url = ghostRaceUrl('http://localhost:8932/');
  assert.equal(url.origin, 'http://localhost:8932');
  assert.equal(url.searchParams.get('e2eAutopilot'), '1');
  assert.equal(url.searchParams.has('race'), true);
  assert.equal(url.searchParams.has('capture'), false);
});

test('注入钱包按 EIP-6963 公告，钱包等待使用同步谓词避免 Promise 被当作成功', async () => {
  const announcements = [], listeners = {};
  const window = { dispatchEvent: event => announcements.push(event), addEventListener: (name, fn) => { listeners[name] = fn; } };
  runInNewContext(`(${injectGhostWallet.toString()})()`, { window, CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } } });
  assert.equal(announcements[0].type, 'eip6963:announceProvider');
  assert.equal(announcements[0].detail.info.rdns, 'io.metamask');
  assert.equal(announcements[0].detail.provider, window.ethereum);
  listeners['eip6963:requestProvider'](); assert.equal(announcements.length, 2);
  let disposed = false;
  const wallet = { state: { account: null }, dispose: async () => { disposed = true; } };
  await waitForGhostWallet({ evaluateHandle: async () => wallet, waitForFunction: async (predicate, args) => {
    assert.equal(predicate(args), false);
    wallet.state.account = '0xABc'; assert.equal(predicate(args), true);
  } }, '0xabc');
  assert.equal(disposed, true);
});
