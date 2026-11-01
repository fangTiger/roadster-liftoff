import { recordsAbi } from '../chain/shared.js';
const order = (a, b) => a.blockNumber < b.blockNumber ? -1 : a.blockNumber > b.blockNumber ? 1 : Number(a.logIndex) - Number(b.logIndex);
// 合约成就是累计位图；必须按正序求差量，再倒序展示。
export function mergeTimeline(logs, { complete = false, gaps = [] } = {}) {
  const unique = [...new Map(logs.filter(log => !log.removed).map(log => [`${log.transactionHash}/${log.logIndex}`, log])).values()].sort(order);
  const mints = new Set(unique.filter(log => log.eventName === 'FirstLap').map(log => log.transactionHash));
  let previous = complete ? 0 : null;
  const rows = [];
  let lastBlock = -1n;
  for (const log of unique) {
    if (gaps.some(gap => gap.fromBlock > lastBlock && gap.toBlock < log.blockNumber)) previous = null;
    lastBlock = log.blockNumber;
    if (log.eventName === 'FirstLap') { rows.push({ ...log, kind: 'mint' }); previous = 0; }
    else if (log.eventName === 'LapRecorded') {
      if (log.args.improved && !mints.has(log.transactionHash)) rows.push({ ...log, kind: 'best' });
      const bits = Number(log.args.achievements) & 0xfffffff;
      if (previous != null && (bits & ~previous)) rows.push({ ...log, kind: 'achievements', bits: bits & ~previous });
      previous = bits;
    }
  }
  return rows.reverse();
}
export function createBlockCache(client) {
  const cache = new Map();
  return blockNumber => {
    const key = String(blockNumber);
    if (!cache.has(key)) cache.set(key, client.getBlock({ blockNumber }).then(block => block.timestamp).catch(error => { cache.delete(key); throw error; }));
    return cache.get(key);
  };
}
// 每段不超过 RPC 范围上限，最多扫描固定段数；失败段保留自己的重试入口。
export async function readTimeline(client, contract, player, { range = 10000n, maxRanges = 24, onChunk = () => {}, fromBlock = 0n } = {}) {
  let end = await client.getBlockNumber();
  const chunks = [];
  for (let i = 0; i < maxRanges && end >= fromBlock; i++) {
    const start = end - range + 1n > fromBlock ? end - range + 1n : fromBlock;
    const chunk = { fromBlock: start, toBlock: end, logs: [], error: null, loading: false };
    chunk.retry = async () => {
      chunk.loading = true; onChunk(chunk, chunks);
      try {
        const results = await Promise.all(['FirstLap', 'LapRecorded'].map(name => client.getLogs({ address: contract,
          event: recordsAbi.find(item => item.type === 'event' && item.name === name), args: { player }, fromBlock: start, toBlock: chunk.toBlock, strict: true })));
        chunk.logs = results.flat(); chunk.error = null;
      } catch (error) { chunk.error = error; }
      finally { chunk.loading = false; onChunk(chunk, chunks); }
    };
    chunks.push(chunk); await chunk.retry(); end = start - 1n;
    // 找到铸造事件后，历史已完整，不继续查更早区块。
    if (!chunk.error && chunk.logs.some(log => log.eventName === 'FirstLap')) break;
  }
  return { chunks, limited: end >= fromBlock && !chunks.some(chunk => chunk.logs.some(log => log.eventName === 'FirstLap')) };
}
