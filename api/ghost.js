import { isAddress } from 'viem';
import { createRaceReader, getServerConfig, jsonResponse } from './_lib/chain.js';
import { createGhostStore } from './_lib/ghost-store.js';

const CACHE = 'public, s-maxage=30';
export function createGhostHandler(options = {}) {
  return async request => {
    const query = new URL(request.url).searchParams, value = query.get('trackId'), address = query.get('address');
    if (!/^[1-3]$/.test(value || '') || (address !== null && !isAddress(address, { strict: false }))) return jsonResponse({ error: '地图编号或地址无效' }, 400);
    const trackId = Number(value);
    try {
      const config = { ...getServerConfig(), ...options }, storage = options.store || createGhostStore({ chainId: config.chain.id });
      if (address !== null) {
        const record = await storage.get(trackId, address);
        if (!record) return jsonResponse({ error: '影子录像不存在' }, 404);
        const { url, etag, ...replay } = record;
        return jsonResponse(replay, 200, CACHE);
      }
      const rows = await (options.readLeaderboard || createRaceReader(config).readLeaderboard)(trackId);
      const leaders = rows.filter(row => row.verified === true && Number(row.bestMs) > 0)
        .sort((a, b) => Number(a.bestMs) - Number(b.bestMs) || Number(a.updatedAt || 0) - Number(b.updatedAt || 0)).slice(0, 20);
      const entries = await Promise.all(leaders.map(async row => {
        const record = await storage.get(trackId, row.address);
        return record ? { address: row.address, bestMs: Number(row.bestMs), url: record.url } : null;
      }));
      return jsonResponse(entries.filter(Boolean), 200, CACHE);
    } catch { return jsonResponse({ error: '暂时无法读取影子录像，请稍后重试' }, 503); }
  };
}
export const GET = createGhostHandler();
