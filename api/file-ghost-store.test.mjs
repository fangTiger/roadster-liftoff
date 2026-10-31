import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGhostStore } from './_lib/ghost-store.js';

const address = '0x81d400000000000000000000000000000000707B';
test('文件存储跨实例持久化、链和地图隔离、并发只保留最快', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'ghost-store-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const options = { mode: 'file', directory, chainId: 5042002, now: () => 100000 };
  const store = createGhostStore(options), other = createGhostStore(options);
  assert.equal(await store.get(1, address), null);
  assert.deepEqual(await store.list(1), []);
  assert.equal(await store.put(1, address, { trackId: 1, data: 'first' }, 58000), true);
  assert.equal(await other.put(1, address, { data: 'slow' }, 58000), false);
  await Promise.all([store.put(1, address, { trackId: 1, data: 'fast' }, 40000), other.put(1, address, { data: 'middle' }, 45000)]);
  const replay = await createGhostStore(options).get(1, address.toLowerCase());
  assert.equal(replay.bestMs, 40000); assert.equal(replay.data, 'fast'); assert.equal(replay.updatedAt, 100);
  assert.equal(replay.url, `/api/ghost?trackId=1&address=${address.toLowerCase()}`);
  const disk = JSON.parse(await readFile(join(directory, 'ghosts/5042002/1', `${address.toLowerCase()}.json`), 'utf8'));
  assert.equal(disk.data, 'fast');
  assert.equal(await store.get(2, address), null);
  assert.equal(await createGhostStore({ ...options, chainId: 5042 }).get(1, address), null);
  assert.equal((await store.list(1)).length, 1);
  await assert.rejects(async () => store.get(1, '../../escape'), /路径/);
  await assert.rejects(async () => store.get(0, address), /路径/);
  await assert.rejects(store.put(1, address, {}, 0), /圈速/);
});

test('GHOST_STORE=file 切换接口，未指定仍使用 Blob', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'ghost-env-'));
  const previous = process.env.GHOST_STORE;
  t.after(async () => { if (previous === undefined) delete process.env.GHOST_STORE; else process.env.GHOST_STORE = previous; await rm(directory, { recursive: true, force: true }); });
  process.env.GHOST_STORE = 'file';
  assert.equal(await createGhostStore({ chainId: 5042002, directory }).get(1, address), null);
  assert.throws(() => createGhostStore({ mode: 'blob', chainId: 5042002, token: '' }).get(1, address), /未配置/);
});
