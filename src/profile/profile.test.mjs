import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avatarSVG } from './avatar.js';
import { deriveTitle, trackStats, profileAddress, createBoardCache, challengeHref } from './title.js';
import { mergeTimeline, readTimeline, createBlockCache } from './timeline.js';
const address = '0x4206000000000000000000000000000000000000';
test('地址头像稳定、忽略大小写且不同地址有不同图形', () => {
  assert.equal(avatarSVG(address), avatarSVG(address.toUpperCase()));
  assert.notEqual(avatarSVG(address), avatarSVG(address.replace('4206', '4207')));
  assert.match(avatarSVG(address), /^<svg/); assert.doesNotMatch(avatarSVG(address), /(?:href|src)="https?:|<script/);
});
test('称号取最高档，未完成三条资格线不会提前升级', () => {
  assert.equal(deriveTitle({}), 'rookie');
  assert.equal(deriveTitle({ tokenId: 1 }), 'driver');
  const stats = [1, 2, 3].map(() => ({ qualified: true, rank: 2 }));
  assert.equal(deriveTitle({ tokenId: 1, stats }), 'explorer');
  assert.equal(deriveTitle({ tokenId: 1, stats: stats.slice(0, 2) }), 'driver');
  assert.equal(deriveTitle({ tokenId: 1, stats: [{ rank: 1 }] }), 'champion');
});
test('名次由榜单计算，差距带符号，无成绩或榜外不捏造排名', () => {
  const rows = [{ address: '0xother', bestMs: 40000 }, { address, bestMs: 45000 }];
  assert.deepEqual(trackStats(address.toUpperCase(), { bestMs: 45000 }, { qualifyMs: 50000 }, rows), { rank: 2, qualifyGap: -5000, leaderGap: 5000, qualified: true });
  assert.equal(trackStats(address, { bestMs: 0 }, { qualifyMs: 50000 }, rows).rank, null);
  assert.equal(trackStats(address, { bestMs: 45000 }, { qualifyMs: 0 }, []).qualified, false);
});
test('地址参数严格校验，无效地址回退当前钱包', () => {
  assert.deepEqual(profileAddress('0x4206', address), { address, invalid: true });
  assert.deepEqual(profileAddress(address, null), { address, invalid: false });
  assert.deepEqual(profileAddress(null, null), { address: null, invalid: false });
});
test('榜单整页每图只读取一次，筛选与语言变更共享，失败允许重试', async () => {
  let calls = 0;
  const cache = createBoardCache({ readLeaderboard: async (_, options) => { calls++; assert.equal(options.limit, Infinity); return [{ verified: false }, { verified: true }]; } });
  assert.equal((await cache.readLeaderboard(1, { verifiedOnly: true })).length, 1);
  await cache.readLeaderboard(1); await cache.readLeaderboard(1); assert.equal(calls, 1);
  let fails = true;
  const retry = createBoardCache({ readLeaderboard: async () => { if (fails) throw Error('RPC'); return []; } });
  await assert.rejects(retry.readLeaderboard(2)); fails = false; assert.deepEqual(await retry.readLeaderboard(2), []);
});
test('挑战入口选择地图并记住目标影子，存储不可用仍可通过 URL 选择', () => {
  const saved = [];
  const href = challengeHref(2, address, { setItem: (...args) => saved.push(args) });
  assert.deepEqual(saved, [['race.ghost.choice.2', address]]);
  assert.match(href, /map=normal/); assert.match(href, /ghostAddress=/);
});
const log = (eventName, blockNumber, logIndex, args, hash = '0xhash') => ({ eventName, blockNumber: BigInt(blockNumber), logIndex, transactionHash: hash, args });
test('事件去重、按链上顺序归并成就差量，铸造不重复显示刷新，最后倒序', () => {
  const first = log('FirstLap', 10, 0, { tokenId: 1, trackId: 1, lapMs: 50000 });
  const minted = log('LapRecorded', 10, 1, { improved: true, achievements: 3, trackId: 1, bestMs: 50000 });
  const update = log('LapRecorded', 11, 0, { improved: true, achievements: 7, trackId: 2, bestMs: 45000 }, '0xnext');
  const rows = mergeTimeline([update, first, minted, update], { complete: true });
  assert.deepEqual(rows.map(row => row.kind), ['achievements', 'best', 'achievements', 'mint']);
  assert.deepEqual(rows.filter(row => row.kind === 'achievements').map(row => row.bits), [4, 3]);
  assert.equal(mergeTimeline([update], { complete: false }).some(row => row.kind === 'achievements'), false);
});
test('时间线按 player 过滤、有限分段倒查，保留其他范围，失败范围独立重试', async () => {
  const calls = []; let fail = true;
  const client = { getBlockNumber: async () => 29n, async getLogs(query) {
    calls.push(query); assert.equal(query.args.player, address);
    if (query.fromBlock === 10n && fail) throw Error('RPC range');
    return query.event.name === 'LapRecorded' ? [log('LapRecorded', query.fromBlock, 0, { improved: true, achievements: 1 })] : [];
  } };
  const data = await readTimeline(client, '0xcontract', address, { range: 10n, maxRanges: 2 });
  assert.equal(data.chunks.length, 2); assert.equal(data.limited, true);
  assert.equal(data.chunks[0].error, null); assert.ok(data.chunks[1].error);
  assert.equal(calls.length, 4); assert.ok(calls.every(q => q.toBlock - q.fromBlock < 10n));
  fail = false; await data.chunks[1].retry(); assert.equal(data.chunks[1].error, null);
});
test('区块时间按需缓存，失败不污染缓存', async () => {
  let calls = 0;
  const time = createBlockCache({ getBlock: async ({ blockNumber }) => { calls++; return { timestamp: blockNumber * 100n }; } });
  assert.deepEqual(await Promise.all([time(1n), time(1n), time(2n)]), [100n, 100n, 200n]); assert.equal(calls, 2);
});

test('并行返回的稀疏赛道成绩不能提前授予全图称号', () => {
  const stats = []; stats[2] = { qualified: true, rank: 3 };
  assert.equal(deriveTitle({ tokenId: 1, stats }), 'driver');
});
test('历史存在失败范围时，不将跨越缺口的累计位图当作单次新增成就', () => {
  const rows = mergeTimeline([
    log('FirstLap', 1, 0, { tokenId: 1 }),
    log('LapRecorded', 1, 1, { achievements: 1 }),
    log('LapRecorded', 20, 1, { achievements: 7 }, '0xnext'),
  ], { gaps: [{ fromBlock: 2n, toBlock: 10n }] });
  assert.deepEqual(rows.filter(row => row.kind === 'achievements').map(row => row.bits), [1]);
});
