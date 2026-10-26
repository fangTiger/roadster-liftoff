// 成就与成绩的纯数据处理，不读取浏览器状态。
const MASK = (1 << 20) - 1;
export function achievementsToBits(list = []) {
  return list.reduce((bits, item) => item.unlocked && Number.isInteger(item.index) && item.index >= 1 && item.index <= 20 ? bits | (1 << (item.index - 1)) : bits, 0);
}
export function bitsToCount(bits) {
  let value = Number(bits) & MASK, count = 0;
  while (value) { value &= value - 1; count++; }
  return count;
}
export function needsUpdate(record, ms, bits) {
  return !record || Number(record.tokenId) === 0 || ms < Number(record.bestMs) || ((Number(bits) & MASK) & ~Number(record.achievements)) !== 0;
}
export function formatMs(ms) {
  return ms == null || !Number.isFinite(Number(ms)) ? '—' : `${(Number(ms) / 1000).toFixed(2)} s`;
}
export function shortAddr(addr) { return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : '—'; }
export function sortLeaderboard(addrs, recs, limit = 50) {
  return recs.map((record, i) => ({ ...record, address: addrs[i] }))
    .filter(row => Number(row.tokenId) > 0 && row.address)
    .sort((a, b) => Number(a.bestMs) - Number(b.bestMs) || Number(a.updatedAt) - Number(b.updatedAt))
    .slice(0, Math.max(0, limit));
}
export function errorKind(err) {
  // viem 的合约错误通常在 cause 链中，钱包 RPC 也可能再包一层 data。
  const queue = [err], seen = new Set(), errors = [];
  while (queue.length) {
    const value = queue.shift();
    if (!value || typeof value !== 'object' || seen.has(value)) continue;
    seen.add(value); errors.push(value); queue.push(value.cause, value.data, value.error, value.originalError);
  }
  if (errors.some(e => e.code === 4001 || e.code === 'ACTION_REJECTED' || e.name === 'UserRejectedRequestError')) return 'user_rejected';
  if (errors.some(e => e.errorName === 'TooFast')) return 'too_fast';
  if (errors.some(e => e.errorName === 'NothingToUpdate')) return 'nothing_to_update';
  if (errors.some(e => /insufficient funds|exceeds the balance/i.test(e.message || '') || e.name === 'InsufficientFundsError')) return 'insufficient_funds';
  if (errors.some(e => [4901, 4902].includes(e.code) || /ChainMismatch|ChainNotFound|SwitchChain/.test(e.name || '') || e.code === 'wrong_network')) return 'wrong_network';
  if (errors.some(e => e.code === 'no_wallet')) return 'no_wallet';
  return 'unknown';
}
