import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRecordsWallet } from './wallet.js';
import { chain } from './config.js';

const address = '0x0000000000000000000000000000000000000001';
const alice = '0x000000000000000000000000000000000000000a';
const bob = '0x000000000000000000000000000000000000000b';
function setup({ missingChain = false } = {}) {
  let chainId = 1, accounts = [alice];
  const listeners = new Map(), calls = [];
  const provider = {
    on: (name, fn) => listeners.set(name, fn),
    request: async ({ method, params }) => {
      calls.push(method);
      if (method === 'eth_requestAccounts' || method === 'eth_accounts') return accounts;
      if (method === 'eth_chainId') return `0x${chainId.toString(16)}`;
      if (method === 'wallet_switchEthereumChain') {
        if (missingChain) { missingChain = false; throw { code: 4902 }; }
        chainId = Number(params[0].chainId); return null;
      }
      if (method === 'wallet_addEthereumChain') { assert.equal(params[0].nativeCurrency.decimals, 18); return null; }
      throw new Error(`意外调用 ${method}`);
    },
  };
  const publicClient = {
    readContract: async ({ functionName }) => functionName === 'recordOf' ? { tokenId: 1, bestMs: 50000 } : 0n,
    simulateContract: async ({ args }) => { assert.equal(args.length, 5); assert.equal(args[3], 0n); assert.equal(args[4], '0x'); calls.push('simulate'); return { request: {} }; },
    waitForTransactionReceipt: async () => { calls.push('receipt'); return { status: 'success', transactionHash: '0xconfirmed' }; },
  };
  const wallet = createRecordsWallet({ address, getProvider: () => provider, publicClient,
    getWalletClient: () => ({ writeContract: async () => { calls.push('write'); return '0xsent'; } }),
  });
  return { wallet, publicClient, calls, changeAccount(value) { accounts = value; listeners.get('accountsChanged')(value); }, changeChain(value) { chainId = value; listeners.get('chainChanged')(`0x${value.toString(16)}`); } };
}
test('连接时添加缺失网络，并跟随账户和网络事件', async () => {
  const { wallet, calls, changeAccount, changeChain } = setup({ missingChain: true });
  assert.equal(await wallet.connect(), alice);
  assert.equal(wallet.state.chainId, chain.id);
  assert.ok(calls.includes('wallet_addEthereumChain'));
  changeAccount([bob]); assert.equal(wallet.state.account, bob);
  changeAccount([]); assert.equal(wallet.state.account, null);
  changeChain(1); assert.equal(wallet.state.chainId, 1);
});
test('HTTP 读取无需钱包，未配置合约不发请求', async () => {
  let calls = 0;
  const publicClient = { readContract: async () => { calls++; return { tokenId: 1 }; } };
  const wallet = createRecordsWallet({ address, publicClient, getProvider: () => null });
  assert.equal((await wallet.readRecord(alice)).tokenId, 1);
  await assert.rejects(wallet.connect(), { code: 'no_wallet' });
  const disabled = createRecordsWallet({ address: '', publicClient });
  assert.throws(() => disabled.readRecord(alice), { code: 'unavailable' });
  assert.equal(calls, 1);
});
test('模拟失败不得签名，回执失败不得报成功，交易后释放忙状态', async () => {
  const { wallet, publicClient, calls } = setup(); await wallet.connect();
  publicClient.simulateContract = async () => { throw { data: { errorName: 'TooFast' } }; };
  await assert.rejects(wallet.submit(1, 1, 0)); assert.ok(!calls.includes('write')); assert.equal(wallet.state.phase, '');
  publicClient.simulateContract = async () => ({ request: {} });
  publicClient.waitForTransactionReceipt = async () => ({ status: 'reverted' });
  await assert.rejects(wallet.submit(1, 50000, 0), { code: 'reverted' }); assert.equal(wallet.state.phase, '');
});
test('模拟过程中切换账户或网络不会提交', async () => {
  for (const change of ['account', 'chain']) {
    const env = setup(); await env.wallet.connect();
    env.publicClient.simulateContract = async () => {
      if (change === 'account') env.changeAccount([bob]); else env.changeChain(1);
      return { request: {} };
    };
    await assert.rejects(env.wallet.submit(1, 50000, 0)); assert.ok(!env.calls.includes('write'));
  }
});
test('成功必须等待回执，按阶段通知，禁止重复提交', async () => {
  const { wallet, calls } = setup(); await wallet.connect();
  const phases = []; wallet.subscribe(state => { if (phases.at(-1) !== state.phase) phases.push(state.phase); });
  const promise = wallet.submit(2, 50000, 3);
  await assert.rejects(wallet.submit(2, 50000, 3), { code: 'busy' });
  assert.equal(await promise, '0xconfirmed');
  assert.deepEqual(calls.filter(v => ['simulate', 'write', 'receipt'].includes(v)), ['simulate', 'write', 'receipt']);
  assert.deepEqual(phases, ['simulating', 'signing', 'confirming', '']);
});
test('榜单按赛道分页读取全部玩家，跳过零值再选最快五十名', async () => {
  const { wallet, publicClient } = setup(); const pages = [];
  publicClient.readContract = async ({ functionName, args }) => {
    if (functionName === 'playerCount') return 2501n;
    const [trackId, start, count] = args; assert.equal(trackId, 3); pages.push([Number(start), Number(count)]);
    return [Array.from({ length: Number(count) }, (_, i) => `player${Number(start) + i}`), [], Array.from({ length: Number(count) }, (_, i) => ({ tokenId: Number(start) + i + 1, bestMs: 50000 - Number(start) - i, updatedAt: 1 }))];
  };
  const rows = await wallet.readLeaderboard(3); assert.equal(pages.length, 26);
  assert.deepEqual(pages.at(-1), [2500, 1]); assert.equal(rows.length, 50); assert.equal(rows[0].address, 'player2500');
});

test('V2 按赛道读取配置和最快圈', async () => {
  const { wallet, publicClient } = setup(); const calls = [];
  publicClient.readContract = async ({ functionName, args }) => { calls.push([functionName, args]); return {}; };
  await wallet.readBest(alice, 2); await wallet.readTrack(2);
  assert.deepEqual(calls, [['bestOf', [alice, 2]], ['trackOf', [2]]]);
});
