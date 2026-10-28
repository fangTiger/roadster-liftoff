import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as records from './records.js';
import { BaseError, ContractFunctionRevertedError, encodeErrorResult } from 'viem';
import { recordsAbi } from './shared.js';

const input = { hasToken: false, bestLapMs: 50000, track: { qualifyMs: 60000, minLapMs: 20000 }, chainBestMs: 50000, chainBits: 3, bits: 3 };
test('资格判断覆盖边界及持有 NFT 后跨赛道与新增成就', () => {
  for (const [patch, expected] of [
    [{}, 'mint'], [{ bestLapMs: 60000 }, 'mint'], [{ bestLapMs: 60001 }, 'notQualified'],
    [{ bestLapMs: 19999 }, 'tooFast'], [{ bestLapMs: 20000 }, 'mint'],
    [{ track: { qualifyMs: 0, minLapMs: 20000 } }, 'closed'],
    [{ hasToken: true }, 'upToDate'], [{ hasToken: true, bestLapMs: 49999 }, 'update'],
    [{ hasToken: true, bestLapMs: 70000, bits: 7 }, 'update'],
    [{ hasToken: true, chainBestMs: 0, bestLapMs: 70000 }, 'update'],
    [{ hasToken: true, bits: 1 }, 'upToDate'],
    [{ hasToken: true, chainBits: 0, bits: 0x80000000 }, 'update'],
  ]) assert.equal(records.decideAction({ ...input, ...patch }), expected);
});
test('秒转换四舍五入并拒绝无效、零及 uint32 溢出', () => {
  assert.equal(records.lapToMs(45.1236), 45124);
  assert.equal(records.lapToMs(45.1234), 45123);
  for (const lap of [null, undefined, NaN, Infinity, -1, 0, 0.0001, 4294968]) assert.throws(() => records.lapToMs(lap));
});
test('成就映射和计数使用低 28 位', () => {
  assert.equal(records.achievementsToBits(Array.from({ length: 29 }, (_, i) => ({ index: i + 1, unlocked: true }))), 0xfffffff);
  assert.equal(records.bitsToCount(0xffffffffn), 28);
  assert.equal(records.bitsToCount(1 << 28), 0);
});
test('榜单跳过零成绩、稳定排序且不修改输入', () => {
  const bests = [{ bestMs: 50, updatedAt: 20n }, { bestMs: 0 }, { bestMs: 50, updatedAt: 10n }, { bestMs: 40, verified: true }];
  assert.deepEqual(records.sortLeaderboard(['a', 'b', 'c', 'd'], bests, 2).map(r => r.address), ['d', 'c']);
  assert.equal(bests[0].bestMs, 50);
  assert.equal(records.formatMs(null), '—');
  assert.equal(records.formatMs(46830), '46.83 s');
  assert.equal(records.shortAddr('0x1234567890123456789012345678901234567890'), '0x1234…7890');
});
test('真实 viem 回退和嵌套钱包/网络错误映射中文', () => {
  for (const [errorName, args, text] of [
    ['TrackClosed', [1], /未开放/], ['TooFast', [1, 100], /下限/],
    ['NotQualified', [100, 50], /资格线/], ['NothingToUpdate', [], /最新/],
  ]) {
    const cause = new ContractFunctionRevertedError({ abi: recordsAbi, data: encodeErrorResult({ abi: recordsAbi, errorName, args }), functionName: 'submit' });
    assert.match(records.errorMessage(new BaseError('失败', { cause })), text);
  }
  for (const [error, text] of [
    [{ cause: { code: 4001 } }, /取消/], [{ code: 'ACTION_REJECTED' }, /取消/],
    [{ cause: { message: 'insufficient funds for gas' } }, /余额不足/],
    [new Error('RPC timeout'), /网络/], [{ code: 4902 }, /网络/],
    [{ code: 'no_wallet' }, /钱包/], [{ data: { errorName: 'BadSignature' } }, /核实/],
  ]) assert.match(records.errorMessage(error), text);
});
