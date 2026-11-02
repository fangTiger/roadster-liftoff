import test from 'node:test';
import assert from 'node:assert/strict';
import * as tracks from './tracks.js';

for (const [id, goldMs, silverMs] of [[1, 43500, 51000], [2, 46500, 54600], [3, 81000, 95000]]) {
  test(`赛道 ${id} 使用批准的等级线并包含边界`, () => {
    assert.deepEqual(tracks.RACE_TRACKS.find(track => track.id === id).tiers, { goldMs, silverMs });
    assert.equal(tracks.nftTier(id, goldMs), 'gold');
    assert.equal(tracks.nftTier(id, goldMs + 1), 'silver');
    assert.equal(tracks.nftTier(id, silverMs), 'silver');
    assert.equal(tracks.nftTier(id, silverMs + 1), 'bronze');
    assert.equal(tracks.nftTier(BigInt(id), BigInt(goldMs)), 'gold');
  });
}
test('未知赛道回退铜级', () => {
  assert.equal(tracks.nftTier(99, 1), 'bronze');
});
