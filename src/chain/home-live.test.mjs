import test from 'node:test';
import assert from 'node:assert/strict';
import { assembleHomeLive, readHomeLive } from './home-live.js';
const holder = '0x1234567890123456789012345678901234567890';
const boards = [[{ address: holder, bestMs: 51000n }], [], [{ address: holder, bestMs: 75000 }]];

test('组装铸造数、各赛道榜首与最新上链；无数据隐藏', () => {
  const data = assembleHomeLive({ minted: 3n, boards, trackName: id => `赛道${id}` });
  assert.deepEqual(data, { minted: 3, tracks: [{ id: 1, name: '赛道1', bestMs: 51000, holder }, { id: 3, name: '赛道3', bestMs: 75000, holder }], latest: null });
  assert.equal(assembleHomeLive({ minted: 0n, boards: [[], [], []] }), null);
  const latest = { eventName: 'FirstLap', args: { player: holder, trackId: 1, lapMs: 51000 }, transactionHash: '0xabc' };
  const result = assembleHomeLive({ minted: 3, boards, event: latest, timestamp: 1800000000n, explorerUrl: 'https://explorer.test', trackName: id => `赛道${id}` });
  assert.deepEqual(result.latest, { kind: 'mint', holder, trackName: '赛道1', ms: 51000, at: 1800000000000, href: 'https://explorer.test/tx/0xabc' });
  latest.eventName = 'LapRecorded'; latest.args.improved = true;
  assert.equal(assembleHomeLive({ minted: 3, boards, event: latest, timestamp: 1n }).latest.kind, 'best');
  latest.args.improved = false;
  assert.equal(assembleHomeLive({ minted: 3, boards, event: latest, timestamp: 1n }).latest.kind, 'achievement');
});

function clientFor({ failRead = false, failLogs = false } = {}) {
  const ranges = [];
  return { ranges, async readContract({ functionName, args }) {
    if (failRead) throw Error('读取失败');
    if (functionName === 'totalSupply') return 102n;
    if (functionName === 'playerCount') return 102n;
    assert.equal(functionName, 'players');
    const [id, start, count] = args;
    assert.ok(count <= 100n);
    return [[holder], [], [{ bestMs: start === 0n ? 90000 : 50000 + id, updatedAt: 1 }]];
  }, async getBlockNumber() { return 10000n; }, async getLogs({ fromBlock, toBlock }) {
    ranges.push([fromBlock, toBlock]); if (failLogs || ranges.length === 1) throw Error('区块范围受限');
    return [
      { eventName: 'FirstLap', blockNumber: 9999n, logIndex: 3, args: { player: holder, trackId: 1, lapMs: 51000 } },
      { eventName: 'LapRecorded', blockNumber: 9999n, logIndex: 4, args: { player: holder, trackId: 2, lapMs: 50000, improved: true } },
    ];
  }, async getBlock({ blockNumber }) { assert.equal(blockNumber, 9999n); return { timestamp: 1800000000n }; } };
}

test('分页选出真正榜首，事件受限时缩小区块范围并按日志顺序取最新', async () => {
  const client = clientFor(); const data = await readHomeLive({ client, address: holder });
  assert.deepEqual(data.tracks.map(t => t.bestMs), [50001, 50002, 50003]);
  assert.equal(data.latest.kind, 'best'); assert.match(data.latest.trackName, /湖畔/);
  assert.deepEqual(client.ranges, [[9001n, 10000n], [9901n, 10000n]]);
});

test('未配置或合约读取失败返回 null，日志失败只隐藏 latest', async () => {
  assert.equal(await readHomeLive({ address: '', client: {} }), null);
  assert.equal(await readHomeLive({ address: holder, client: clientFor({ failRead: true }) }), null);
  assert.equal((await readHomeLive({ address: holder, client: clientFor({ failLogs: true }) })).latest, null);
});
