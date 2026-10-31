import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { recordsAbi } from './shared.js';
import * as config from './config.js';
const clean = value => Array.isArray(value) ? value.map(clean) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).filter(([k]) => k !== 'internalType').map(([k, v]) => [k, clean(v)])) : value;
test('前端 ABI 每个函数、事件、错误与部署 JSON 逐项一致', async () => {
  const deployed = JSON.parse(await readFile(new URL('../../contracts/MarsRoadsterRacing.abi.json', import.meta.url)));
  for (const entry of recordsAbi) assert.deepEqual(clean(entry), clean(deployed.find(item => item.type === entry.type && item.name === entry.name)), entry.name);
  for (const name of ['recordOf', 'bestOf', 'trackOf', 'players', 'submit', 'ownerOf', 'setTrack', 'FirstLap', 'LapRecorded', 'TrackClosed', 'NotQualified']) assert.ok(recordsAbi.some(item => item.name === name), name);
});
test('测试网默认 V2 地址，主网无默认地址且环境覆盖', () => {
  assert.equal(config.getRacingConfig({}).address, '0xbcc98b9635113a0669F97ce4122f3e2C5490dc59');
  assert.equal(config.getRacingConfig({ VITE_ARC_NETWORK: 'mainnet' }).address, '');
  assert.equal(config.getRacingConfig({ VITE_RACING_ADDRESS: ' 0xabc ' }).address, '0xabc');
});
