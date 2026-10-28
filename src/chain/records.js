// 成就与成绩的纯数据处理，不读取浏览器状态。
const MASK = (1 << 28) - 1;
export function achievementsToBits(list = []) {
  return list.reduce((bits, item) => item.unlocked && Number.isInteger(item.index) && item.index >= 1 && item.index <= 28 ? bits | (1 << (item.index - 1)) : bits, 0);
}
export function bitsToCount(bits) {
  let value = Number(bits) & MASK, count = 0;
  while (value) { value &= value - 1; count++; }
  return count;
}
export function lapToMs(seconds) {
  const ms = Math.round(seconds * 1000);
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || ms <= 0 || ms > 0xffffffff) throw new RangeError('单圈用时无效');
  return ms;
}
export function decideAction({ hasToken, bestLapMs, track, chainBestMs = 0, chainBits = 0, bits = 0 }) {
  if (Number(track.qualifyMs) === 0) return 'closed';
  if (bestLapMs < Number(track.minLapMs)) return 'tooFast';
  if (!hasToken) return bestLapMs <= Number(track.qualifyMs) ? 'mint' : 'notQualified';
  return !Number(chainBestMs) || bestLapMs < Number(chainBestMs) || ((Number(bits) >>> 0) & ~(Number(chainBits) >>> 0)) !== 0 ? 'update' : 'upToDate';
}
export function formatMs(ms) {
  return ms == null || !Number.isFinite(Number(ms)) ? '—' : `${(Number(ms) / 1000).toFixed(2)} s`;
}
export function shortAddr(addr) { return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : '—'; }
export function sortLeaderboard(addrs, recs, limit = 50) {
  return recs.map((record, i) => ({ ...record, address: addrs[i] }))
    .filter(row => Number(row.bestMs) > 0 && row.address)
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
  if (errors.some(e => e.errorName === 'TrackClosed')) return 'closed';
  if (errors.some(e => e.errorName === 'NotQualified')) return 'not_qualified';
  if (errors.some(e => ['BadSignature', 'Expired'].includes(e.errorName))) return 'verification_required';
  if (errors.some(e => e.errorName === 'TooFast')) return 'too_fast';
  if (errors.some(e => e.errorName === 'NothingToUpdate')) return 'nothing_to_update';
  if (errors.some(e => /insufficient funds|exceeds the balance/i.test(e.message || '') || e.name === 'InsufficientFundsError')) return 'insufficient_funds';
  if (errors.some(e => [4901, 4902].includes(e.code) || /ChainMismatch|ChainNotFound|SwitchChain/.test(e.name || '') || e.code === 'wrong_network')) return 'wrong_network';
  if (errors.some(e => e.code === 'no_wallet')) return 'no_wallet';
  if (errors.some(e => e.code === 'wallet_config')) return 'wallet_config';
  if (errors.some(e => /network|fetch|timeout|HTTP|RPC|socket/i.test(e.message || '') || /HttpRequest|Timeout|RpcRequest/.test(e.name || ''))) return 'network';
  return 'unknown';
}

const ERROR_TEXT = {
  closed: '赛道尚未开放', too_fast: '成绩低于赛道下限，无法提交', not_qualified: '未进资格线，无法铸造',
  nothing_to_update: '链上记录已是最新', user_rejected: '已取消钱包操作', insufficient_funds: '钱包余额不足，请补充 USDC 支付 Gas',
  wrong_network: '钱包网络不正确，请切换到 Arc 网络', no_wallet: '钱包连接尚未就绪，请重新选择钱包或扫码连接',
  wallet_config: '钱包连接尚未配置，请设置 WalletConnect 项目 ID',
  network: '网络错误，请稍后重试', verification_required: '合约需要有效的核实签名，当前自报提交不可用',
};
export function errorMessage(error) { return ERROR_TEXT[errorKind(error)] || '操作失败，请稍后重试'; }
