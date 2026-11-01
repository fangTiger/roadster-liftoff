// 称号、名次和资格线只依赖传入的公共链上数据。
export function deriveTitle({ tokenId = 0, stats = [] } = {}) {
  if (stats.some(row => row?.rank === 1)) return 'champion';
  if (stats.length === 3 && Array.from(stats).every(row => row?.qualified)) return 'explorer';
  return Number(tokenId) ? 'driver' : 'rookie';
}
export function trackStats(address, best, track, rows = []) {
  const ms = Number(best?.bestMs || 0), qualify = Number(track?.qualifyMs || 0);
  const index = rows.findIndex(row => row.address.toLowerCase() === address?.toLowerCase());
  return { rank: ms && index >= 0 ? index + 1 : null, qualifyGap: ms && qualify ? ms - qualify : null,
    leaderGap: ms && rows.length ? ms - Number(rows[0].bestMs) : null, qualified: ms > 0 && qualify > 0 && ms <= qualify };
}
export function profileAddress(parameter, current) {
  const invalid = parameter != null && !/^0x[\da-f]{40}$/i.test(parameter);
  return { address: parameter != null && !invalid ? parameter : current || null, invalid };
}
export function createBoardCache(wallet) {
  const cache = new Map();
  return { async readLeaderboard(trackId, { verifiedOnly = false } = {}) {
    if (!cache.has(trackId)) cache.set(trackId, Promise.resolve().then(() => wallet.readLeaderboard(trackId, { verifiedOnly: false, limit: Infinity })).catch(error => { cache.delete(trackId); throw error; }));
    const rows = await cache.get(trackId);
    return verifiedOnly ? rows.filter(row => row.verified === true) : rows;
  } };
}
export function challengeHref(trackId, address, storage) {
  if (address) { try { (storage ?? globalThis.localStorage)?.setItem(`race.ghost.choice.${trackId}`, address.toLowerCase()); } catch {} }
  return raceHref(trackId, address);
}
export function raceHref(trackId, address) {
  return `/?race&map=${['easy', 'normal', 'hard'][trackId - 1]}${address ? `&ghostAddress=${encodeURIComponent(address.toLowerCase())}` : ''}`;
}
