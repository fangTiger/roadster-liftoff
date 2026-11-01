import { createPublicClient, http } from 'viem';
import { chain, recordsAddress, recordsAbi } from './config.js';
import { RACE_TRACKS } from './tracks.js';
import { sortLeaderboard } from './records.js';

const defaultName = id => RACE_TRACKS.find(track => track.id === id)?.name || '';

// 链上的 bigint 在展示边界转为数字，事件时间统一为 epochMs。
export function assembleHomeLive({ minted = 0, boards = [], event = null, timestamp = null, trackName = defaultName, explorerUrl = '' } = {}) {
  const tracks = RACE_TRACKS.flatMap((track, i) => {
    const top = boards[i]?.[0];
    return top?.address && Number(top.bestMs) > 0 ? [{ id: track.id, name: trackName(track.id), bestMs: Number(top.bestMs), holder: top.address }] : [];
  });
  if (!Number(minted) && !tracks.length) return null;
  let latest = null;
  if (event?.args?.player && timestamp != null) {
    const args = event.args;
    latest = {
      kind: event.eventName === 'FirstLap' ? 'mint' : args.improved ? 'best' : 'achievement',
      holder: args.player, trackName: trackName(Number(args.trackId)), ms: Number(args.lapMs), at: Number(timestamp) * 1000,
      ...(explorerUrl && event.transactionHash ? { href: `${explorerUrl}/tx/${event.transactionHash}` } : {}),
    };
  }
  return { minted: Number(minted), tracks, latest };
}

async function latestEvent(client, address) {
  try {
    const toBlock = await client.getBlockNumber();
    for (const range of [1000n, 100n]) {
      try {
        const logs = await client.getLogs({ address, events: recordsAbi.filter(item => item.type === 'event' && ['FirstLap', 'LapRecorded'].includes(item.name)), fromBlock: toBlock >= range ? toBlock - range + 1n : 0n, toBlock, strict: true });
        const event = logs.filter(log => !log.removed && log.blockNumber != null).sort((a, b) => a.blockNumber === b.blockNumber ? Number(b.logIndex) - Number(a.logIndex) : a.blockNumber > b.blockNumber ? -1 : 1)[0];
        if (!event) return {};
        const block = await client.getBlock({ blockNumber: event.blockNumber });
        return { event, timestamp: block.timestamp };
      } catch { /* RPC 限制日志区间时，仅重试最近 100 个区块。 */ }
    }
  } catch { /* 历史事件不可读不影响铸造数与排行榜。 */ }
  return {};
}

// 首页只调用一次；无钱包依赖，失败静默隐藏，不影响资源加载和进入游戏。
export async function readHomeLive({ client, address = recordsAddress, trackName = defaultName, explorerUrl = chain.blockExplorers.default.url } = {}) {
  if (!address) return null;
  client ||= createPublicClient({ chain, transport: http(undefined, { timeout: 8000, retryCount: 0 }) });
  const read = (functionName, args = []) => client.readContract({ address, abi: recordsAbi, functionName, args });
  try {
    const [minted, count] = await Promise.all([read('totalSupply'), read('playerCount')]);
    if (!Number(minted) && !Number(count)) return null;
    const boards = await Promise.all(RACE_TRACKS.map(async track => {
      const addrs = [], bests = [];
      for (let start = 0n; start < BigInt(count); start += 100n) {
        const size = BigInt(count) - start < 100n ? BigInt(count) - start : 100n;
        const [pageAddrs, , pageBests] = await read('players', [track.id, start, size]);
        addrs.push(...pageAddrs); bests.push(...pageBests);
        if (!pageAddrs.length) break;
      }
      return sortLeaderboard(addrs, bests, 1);
    }));
    return assembleHomeLive({ minted, boards, ...await latestEvent(client, address), trackName, explorerUrl });
  } catch { return null; }
}
