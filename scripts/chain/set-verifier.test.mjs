import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVerifierArgs, setVerifier } from './set-verifier.mjs';
import { getServerConfig } from '../../api/_lib/chain.js';
const address = '0x0000000000000000000000000000000000000001', owner = '0x0000000000000000000000000000000000000002';
test('核实者脚本解析网络与地址，默认预览；拒绝歧义和无效参数', () => {
  assert.deepEqual(parseVerifierArgs(['--verifier', address]), { verifier: address, network: 'testnet', yes: false });
  assert.deepEqual(parseVerifierArgs(['--network', 'mainnet', '--yes', '--verifier', address]), { verifier: address, network: 'mainnet', yes: true });
  for (const args of [[], ['--verifier', 'bad'], ['--network', 'bad', '--verifier', address], ['--verifier', address, '--yes', '--yes'], ['--verifier', address, '--verifier', owner]]) assert.throws(() => parseVerifierArgs(args));
});
function setup() {
  const logs = [], calls = [];
  return { logs, calls, address, account: { address: owner }, log: value => logs.push(value), publicClient: {
    readContract: async ({ functionName, abi }) => { assert.ok(abi.some(item => item.name === 'setVerifier')); return functionName === 'owner' ? owner : owner; },
    simulateContract: async options => { calls.push(['simulate', options]); return { request: { args: options.args } }; },
    waitForTransactionReceipt: async () => ({ status: 'success' }),
  }, walletClient: { writeContract: async request => { calls.push(['write', request]); return '0xhash'; } } };
}
test('不带--yes仅打印现值和目标值，不模拟或发送；主网配置独立', async () => {
  const env = setup(); await setVerifier({ verifier: address, network: 'mainnet', yes: false }, env);
  assert.equal(env.calls.length, 0); assert.ok(env.logs.some(line => line.includes(owner) && line.includes(address)));
  assert.equal(getServerConfig({ ARC_NETWORK: 'mainnet' }).chain.id, 5042);
});
test('只有显式yes且owner匹配才模拟发送，回执失败必须报错', async () => {
  const env = setup(); await setVerifier({ verifier: address, network: 'testnet', yes: true }, env);
  assert.deepEqual(env.calls.map(([name]) => name), ['simulate', 'write']); assert.deepEqual(env.calls[0][1].args, [address]);
  const wrong = setup(); wrong.account.address = address;
  await assert.rejects(setVerifier({ verifier: address, network: 'testnet', yes: true }, wrong), /owner/); assert.equal(wrong.calls.length, 0);
  env.publicClient.waitForTransactionReceipt = async () => ({ status: 'reverted' });
  await assert.rejects(setVerifier({ verifier: address, network: 'testnet', yes: true }, env), /回退/);
});
