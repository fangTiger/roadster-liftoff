import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWalletConnection } from './wallet-connection.js';

const alice = '0x000000000000000000000000000000000000000a';
const flush = async () => { await new Promise(resolve => setImmediate(resolve)); };
function setup() {
  let callbacks, opens = 0, loads = 0;
  const connection = createWalletConnection({
    loadUI: async handlers => {
      loads++; callbacks = handlers;
      return { getSession: async () => null, open: () => { opens++; } };
    },
  });
  return { connection, get loads() { return loads; }, get opens() { return opens; },
    change: session => callbacks.onSession(session), close: () => callbacks.onClose() };
}
test('连接前不加载第三方，无注入钱包时等待用户选中的 provider', async () => {
  const env = setup(), provider = { request() {} };
  assert.equal(env.loads, 0); assert.equal(env.connection.getProvider(), null);
  const promise = env.connection.connect(); await flush();
  assert.equal(env.opens, 1);
  env.change({ provider, account: alice, chainId: 5042002 });
  assert.equal(await promise, provider); assert.equal(env.connection.getProvider(), provider);
});
test('并发连接只打开一次弹窗，取消后可以重试', async () => {
  const env = setup();
  const first = env.connection.connect(), second = env.connection.connect();
  const failures = Promise.all([assert.rejects(first, { code: 4001 }), assert.rejects(second, { code: 4001 })]);
  await flush(); assert.equal(env.opens, 1); env.close(); await failures;
  const retry = env.connection.connect(); await flush(); assert.equal(env.opens, 2);
  const provider = {}; env.change({ provider, account: alice, chainId: 5042002 });
  assert.equal(await retry, provider); assert.equal(env.loads, 1);
});
test('会话恢复无需弹窗，切换和断开均通知订阅者', async () => {
  const provider = {}, sessions = []; let handlers, opens = 0;
  const connection = createWalletConnection({ loadUI: async callbacks => {
    handlers = callbacks;
    return { getSession: async () => ({ provider, account: alice, chainId: 5042002 }), open() { opens++; } };
  } });
  const unsubscribe = connection.subscribe(session => sessions.push(session));
  assert.equal(await connection.connect(), provider); assert.equal(opens, 0);
  handlers.onSession({ provider: {}, account: alice, chainId: 1 });
  handlers.onSession(null);
  assert.equal(connection.getProvider(), null); assert.equal(sessions.length, 3);
  unsubscribe(); handlers.onSession(null); assert.equal(sessions.length, 3);
});
test('初始化失败不锁死连接，之后可以重新加载', async () => {
  let attempts = 0;
  const provider = {};
  const connection = createWalletConnection({ loadUI: async () => {
    if (++attempts === 1) throw new Error('加载失败');
    return { getSession: async () => ({ provider, account: alice, chainId: 5042002 }) };
  } });
  await assert.rejects(connection.connect(), /加载失败/);
  assert.equal(await connection.connect(), provider); assert.equal(attempts, 2);
});

test('恢复旧会话期间的新会话优先，不被过期读取清空', async () => {
  let handlers, finishRead, opens = 0;
  const provider = {}, sessions = [];
  const connection = createWalletConnection({ loadUI: async callbacks => {
    handlers = callbacks;
    return { getSession: () => new Promise(resolve => { finishRead = resolve; }), open() { opens++; } };
  } });
  connection.subscribe(session => sessions.push(session));
  const connecting = connection.connect(); await flush();
  handlers.onSession({ provider, account: alice, chainId: 5042002 });
  finishRead(null); await flush();
  assert.equal(connection.getProvider(), provider);
  assert.equal(await connecting, provider);
  assert.equal(opens, 0); assert.equal(sessions.length, 1);
});

test('主动断开使用已加载的界面桥，之后可重新连接', async () => {
  let disconnected = 0, restored = true;
  const provider = {}, connection = createWalletConnection({ loadUI: async () => ({ getSession: async () => restored ? { provider, account: alice, chainId: 5042002 } : null, disconnect: async () => { disconnected++; restored = false; }, open() {} }) });
  await connection.disconnect(); assert.equal(disconnected, 0);
  await connection.connect(); await connection.disconnect();
  assert.equal(disconnected, 1); assert.equal(connection.getProvider(), null);
});

test('上次已连接时静默恢复会话，主动断开后不再恢复', async () => {
  const store = new Map(), storage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) };
  let loads = 0, opened = 0; const provider = {};
  const loadUI = async ({ onSession }) => { loads++; return { getSession: async () => ({ provider, account: '0xabc', chainId: 1 }), open() { opened++; }, disconnect: async () => {} }; };
  const first = createWalletConnection({ loadUI, storage });
  assert.equal(await first.restore(), null); assert.equal(loads, 0, '没有记忆时不加载钱包组件');
  await first.connect(); assert.equal(store.get('roadster.wallet.connected'), '1');
  const second = createWalletConnection({ loadUI, storage });
  assert.equal(await second.restore(), provider); assert.equal(opened, 0, '恢复不弹窗');
  await second.disconnect(); assert.equal(store.has('roadster.wallet.connected'), false);
  const third = createWalletConnection({ loadUI, storage }), before = loads;
  assert.equal(await third.restore(), null); assert.equal(loads, before);
});
