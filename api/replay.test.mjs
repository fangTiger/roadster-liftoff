import test from 'node:test';
import assert from 'node:assert/strict';
import { recoverTypedDataAddress, keccak256, stringToHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { readFile } from 'node:fs/promises';
import { createSession } from '../src/race/sim/session.js';
import { autopilot } from '../src/race/sim/autopilot.js';
import { createRecorder, decode } from '../src/race/sim/replay.js';
import { buildTrack, trackHash } from '../src/race/track/build.js';
import { TRACKS } from '../src/race/track/data/index.js';
import { verifyReplay, MAX_REPLAY_STEPS } from './_lib/replay.js';
import { signLap, lapTypedData, LAP_TYPE, LAP_TYPES } from './_lib/sign.js';

const def = TRACKS[0].def;
let tape;
function recording() {
  if (tape) return tape;
  const track = buildTrack(def), session = createSession(track), recorder = createRecorder();
  while (!session.race.finished && session.snapshot.step < 60000) {
    const bits = autopilot(session.snapshot, track); recorder.record(bits); session.step(bits);
  }
  assert.ok(session.race.finished);
  tape = { replay: recorder.encode({ track: trackHash(def), trackId: 1, laps: 3 }), snapshot: session.snapshot };
  return tape;
}
test('正确三圈重放返回圈速、统计与服务器成就位', () => {
  const { replay, snapshot } = recording();
  const result = verifyReplay(replay, { trackId: 1, qualifyMs: 300000 });
  assert.deepEqual(result.lapTimes, snapshot.race.lapTimes);
  assert.equal(result.bestLap, snapshot.race.bestLap);
  assert.deepEqual(result.completedStats, snapshot.completedStats);
  assert.ok(result.achievements & (1 << 20)); assert.ok(result.achievements & (1 << 21));
  assert.equal(result.achievements & 0xfffff, 0);
});
test('篡改一位有效按键必须改变圈速或被拒绝', () => {
  const { replay, snapshot } = recording(), bits = decode(replay), recorder = createRecorder();
  bits[500] ^= 128;
  bits.forEach(value => recorder.record(value));
  const altered = recorder.encode({ track: replay.track, trackId: 1, laps: 3 });
  try { assert.notDeepEqual(verifyReplay(altered, { trackId: 1 }).lapTimes, snapshot.race.lapTimes); }
  catch (error) { if (error.code === 'ERR_ASSERTION') throw error; }
});
test('版本、哈希、地图、步数、圈数、编码和未完赛被拒绝', () => {
  const { replay } = recording();
  for (const delta of [{ v: 999 }, { track: 'bad' }, { trackId: 4 }, { steps: MAX_REPLAY_STEPS + 1 }, { laps: 1 }, { data: '!' }, { trackId: 2 }]) {
    assert.throws(() => verifyReplay({ ...replay, ...delta }, { trackId: 1 }));
  }
  const r = createRecorder(); r.record(0);
  assert.throws(() => verifyReplay(r.encode({ track: replay.track, trackId: 1, laps: 3 }), { trackId: 1 }), /未完成/);
});
test('EIP-712 类型与 Solidity 字符串一致，签名恢复为公开测试账户', async () => {
  // Anvil 公开测试账户，仅用于离线断言。
  const previous = process.env.VERIFIER_PRIVATE_KEY;
  process.env.VERIFIER_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
  try {
    const account = privateKeyToAccount(process.env.VERIFIER_PRIVATE_KEY);
    const message = { player: account.address, trackId: 1, lapMs: 47000, achievements: 0xff00001, deadline: 1800000000 };
    const config = { chainId: 5042002, address: account.address };
    const { signature, verifier } = await signLap(message, config);
    assert.equal(await recoverTypedDataAddress({ ...lapTypedData(message, config), signature }), account.address);
    assert.equal(verifier, account.address);
    assert.equal('Lap(' + LAP_TYPES.Lap.map(field => `${field.type} ${field.name}`).join(',') + ')', LAP_TYPE);
    assert.deepEqual(lapTypedData(message, config).domain, { name: 'MarsRoadsterRacing', version: '1', chainId: 5042002, verifyingContract: account.address });
    const source = await readFile(new URL('../contracts/MarsRoadsterRacing.sol', import.meta.url), 'utf8');
    assert.ok(source.includes(`keccak256("${LAP_TYPE}")`));
    assert.equal(keccak256(stringToHex(LAP_TYPE)), keccak256(stringToHex('Lap(address player,uint8 trackId,uint32 lapMs,uint32 achievements,uint64 deadline)')));
  } finally { if (previous === undefined) delete process.env.VERIFIER_PRIVATE_KEY; else process.env.VERIFIER_PRIVATE_KEY = previous; }
});
test('未配置或错误私钥仅返回固定安全错误', async () => {
  const old = process.env.VERIFIER_PRIVATE_KEY;
  try {
    for (const value of ['', 'sensitive-invalid-value']) {
      process.env.VERIFIER_PRIVATE_KEY = value;
      await assert.rejects(signLap({}, {}), error => error.message === '核实签名服务未配置');
    }
  } finally { if (old === undefined) delete process.env.VERIFIER_PRIVATE_KEY; else process.env.VERIFIER_PRIVATE_KEY = old; }
});

test('大量重置的非法录像在线性开销内被拒绝，避免逐步复制全部事件', () => {
  const recorder = createRecorder();
  for (let step = 0; step < 32000; step++) recorder.record(step % 20 < 10 ? 128 : 0);
  const replay = recorder.encode({ track: trackHash(def), trackId: 1, laps: 3 }), start = process.cpuUsage();
  assert.throws(() => verifyReplay(replay, { trackId: 1 }), /未完成/);
  const cpu = process.cpuUsage(start);
  assert.ok(cpu.user + cpu.system < 3000000, `重放消耗 ${(cpu.user + cpu.system) / 1000} ms CPU，超过3秒预算`);
});
