import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BaseError, ContractFunctionRevertedError, encodeErrorResult } from 'viem';
import { achievementsToBits, bitsToCount, needsUpdate, formatMs, shortAddr, sortLeaderboard, errorKind } from './records.js';

test('成就 index 1..20 映射低二十位，仅计已解锁项', () => {
  assert.equal(achievementsToBits([{ index: 1, unlocked: true }, { index: 20, unlocked: true }, { index: 2, unlocked: false }, { index: 21, unlocked: true }, { index: 0, unlocked: true }]), 524289);
  assert.equal(achievementsToBits(Array.from({ length: 20 }, (_, i) => ({ index: i + 1, unlocked: true }))), 1048575);
  assert.equal(achievementsToBits([]), 0);
  assert.equal(bitsToCount(1048575n), 20);
  assert.equal(bitsToCount(1 << 20), 0);
  assert.equal(bitsToCount(5), 2);
});
test('只有首次、更快或新增成就才更新，兼容链上 bigint', () => {
  const record = { tokenId: 1n, bestMs: 50000, achievements: 3 };
  assert.equal(needsUpdate(null, 60000, 0), true);
  assert.equal(needsUpdate({ tokenId: 0 }, 60000, 0), true);
  assert.equal(needsUpdate(record, 49999, 0), true);
  assert.equal(needsUpdate(record, 60000, 7), true);
  assert.equal(needsUpdate(record, 50000, 3), false);
  assert.equal(needsUpdate(record, 60000, 1), false);
});
test('用时和钱包缩写', () => {
  assert.equal(formatMs(46830), '46.83 s');
  assert.equal(formatMs(null), '—');
  assert.equal(formatMs(NaN), '—');
  assert.equal(shortAddr('0x1234567890123456789012345678901234567890'), '0x1234…7890');
  assert.equal(shortAddr(null), '—');
});
test('榜单过滤无 NFT，成绩相同按更新时间，不改输入且应用 limit', () => {
  const recs = [{ tokenId: 1, bestMs: 50, updatedAt: 20n }, { tokenId: 0, bestMs: 0 }, { tokenId: 2, bestMs: 50, updatedAt: 10n }, { tokenId: 3, bestMs: 40, updatedAt: 30n }];
  const rows = sortLeaderboard(['a', 'b', 'c', 'd'], recs, 2);
  assert.deepEqual(rows.map(r => r.address), ['d', 'c']);
  assert.equal(rows[0].bestMs, 40);
  assert.equal(recs[0].tokenId, 1);
  assert.equal(sortLeaderboard([], []).length, 0);
});
test('错误分类读取真实 viem 自定义错误及嵌套 RPC 错误', () => {
  const abi = [{ type: 'error', name: 'TooFast', inputs: [{ name: 'got', type: 'uint32' }, { name: 'min', type: 'uint32' }] }];
  const cause = new ContractFunctionRevertedError({ abi, data: encodeErrorResult({ abi, errorName: 'TooFast', args: [1, 100] }), functionName: 'submit' });
  assert.equal(errorKind(new BaseError('失败', { cause })), 'too_fast');
  assert.equal(errorKind({ cause: { data: { errorName: 'NothingToUpdate' } } }), 'nothing_to_update');
  assert.equal(errorKind({ cause: { code: 4001 } }), 'user_rejected');
  assert.equal(errorKind({ code: 'ACTION_REJECTED' }), 'user_rejected');
  assert.equal(errorKind({ cause: { message: 'insufficient funds for gas' } }), 'insufficient_funds');
  assert.equal(errorKind({ name: 'ChainMismatchError' }), 'wrong_network');
  assert.equal(errorKind({ code: 4902 }), 'wrong_network');
  assert.equal(errorKind({ code: 'no_wallet' }), 'no_wallet');
  assert.equal(errorKind(new Error('RPC timeout')), 'unknown');
});
