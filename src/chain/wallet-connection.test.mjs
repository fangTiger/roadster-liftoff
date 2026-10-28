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
