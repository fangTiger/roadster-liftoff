import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTrackArgs, setTracks } from './set-tracks.mjs';
import { createPlayerRpc } from './e2e-race.mjs';
import { encodeFunctionData } from 'viem';
import { recordsAbi, TESTNET_RACING_ADDRESS } from '../../src/chain/shared.js';

test('赛道参数必须包含三条、整数毫秒且配置有效', () => {
  const args = ['--track', '1:60000:10000', '--track', '2:80000:15000', '--track', '3:120000:20000'];
  assert.equal(parseTrackArgs(args).yes, false);
  assert.equal(parseTrackArgs([...args, '--yes']).yes, true);
  assert.equal(parseTrackArgs(args).tracks.length, 3);
  for (const invalid of [[], ['--track', '1:1.5:0'], ['--track', '1:5:10'], ['--yes', '--oops'], [...args, '--track', '1:10:0']]) assert.throws(() => parseTrackArgs(invalid));
});
test('默认仅预览，所有赛道检查完成前不得写入；--yes 等回执', async () => {
  const tracks = [1, 2, 3].map(id => ({ id, qualifyMs: 60000, minLapMs: 10000 }));
  let writes = 0, receipts = 0; const output = [];
  const publicClient = {
    readContract: async ({ functionName }) => functionName === 'owner' ? '0xabc' : { qualifyMs: 0, minLapMs: 0 },
    simulateContract: async ({ args }) => ({ request: { args } }),
    waitForTransactionReceipt: async () => { receipts++; return { status: 'success' }; },
  };
  const deps = { publicClient, account: { address: '0xabc' }, walletClient: { writeContract: async () => { writes++; return '0xhash'; } }, log: message => output.push(message) };
  await setTracks({ tracks, yes: false }, deps); assert.equal(writes, 0); assert.ok(output.some(s => /0 → 60000/.test(s)));
  await setTracks({ tracks, yes: true }, deps); assert.equal(writes, 3); assert.equal(receipts, 3);
  publicClient.readContract = async ({ functionName }) => functionName === 'owner' ? '0xabc' : { qualifyMs: 60000, minLapMs: 20000 };
  await assert.rejects(setTracks({ tracks, yes: true }, deps), /下限/); assert.equal(writes, 3);
});
test('注入钱包只允许目标合约 submit，返回交易哈希，其他请求走公共 RPC', async () => {
  let calls = 0;
  const rpc = createPlayerRpc({ account: { address: '0xabc' }, publicClient: { request: async () => '0x123' }, walletClient: { sendTransaction: async () => { calls++; return '0xhash'; } } });
  assert.deepEqual(await rpc('eth_accounts', []), ['0xabc']);
  assert.equal(await rpc('eth_chainId', []), '0x4cef52');
  assert.equal(await rpc('eth_blockNumber', []), '0x123');
  const data = encodeFunctionData({ abi: recordsAbi, functionName: 'submit', args: [1, 50000, 3, 0n, '0x'] });
  assert.equal(await rpc('eth_sendTransaction', [{ to: TESTNET_RACING_ADDRESS, data }]), '0xhash'); assert.equal(calls, 1);
  await assert.rejects(rpc('eth_sendTransaction', [{ to: '0x0000000000000000000000000000000000000001', data }]), /目标合约/);
  await assert.rejects(rpc('personal_sign', []), /不支持/);
});
