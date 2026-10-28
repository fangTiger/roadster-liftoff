import { chain, enabled } from './config.js';
import { wallet as defaultWallet } from './wallet.js';
import { decideAction, lapToMs, errorMessage } from './records.js';
import { el, raceRoot, link, sessionKey } from './race-ui.js';

const PHASES = { simulating: '校验交易中…', signing: '请在钱包中确认…', confirming: '交易确认中…' };
export function mountRaceChain(container, { trackId, trackName, bestLap, bits }, { wallet = defaultWallet } = {}) {
  const root = raceRoot(container), title = el('h3', '上链', 'rc-title'), timing = el('p', `${trackName} · 最快单圈 ${bestLap?.toFixed(3) ?? '—'} 秒`, 'rc-dim');
  const button = el('button', null, 'rc-button'), status = el('p', null, 'rc-status');
  button.type = 'button'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  root.append(title, timing, button, status);
  root.className = 'rc-panel rc-submit';
  root.setAttribute('data-track-id', String(trackId));
  let data = null, busy = false, loading = false, error = '', tx = '', version = 0, dead = false, key = sessionKey(wallet), lapMs;
  try { lapMs = lapToMs(bestLap); root.setAttribute('data-lap-ms', String(lapMs)); } catch { error = '尚无有效单圈成绩'; }
  const action = () => data && decideAction({ hasToken: Number(data.record.tokenId) > 0, bestLapMs: lapMs, track: data.track, chainBestMs: data.best.bestMs, chainBits: data.record.achievements, bits });
  function paint() {
    if (dead) return;
    const connected = wallet.state.account && wallet.state.chainId === chain.id;
    const value = action();
    button.disabled = !enabled || !lapMs || busy || loading || !!wallet.state.phase;
    button.textContent = !enabled ? '尚未配置合约' : PHASES[wallet.state.phase] || (busy || loading ? '读取链上记录…' : !connected ? '连接钱包' : !data ? '重试读取' : value === 'mint' ? '铸造首圈纪念 NFT' : value === 'update' ? '更新链上记录' : '暂无可提交内容');
    status.replaceChildren();
    if (connected && data && !['mint', 'update'].includes(value)) {
      button.disabled = true;
      const labels = { closed: '赛道尚未开放', tooFast: '成绩低于赛道下限，无法提交', upToDate: '链上记录已是最新', notQualified: `未进资格线（资格线 ${(Number(data.track.qualifyMs) / 1000).toFixed(3)} 秒，差 ${((lapMs - Number(data.track.qualifyMs)) / 1000).toFixed(3)} 秒）` };
      status.append(el('span', labels[value]));
    }
    if (tx) status.append(link('上链成功 · 查看交易', `${chain.blockExplorers.default.url}/tx/${tx}`));
    if (error) status.append(el('span', error, 'rc-error'));
  }
  async function refresh() {
    const id = ++version, session = sessionKey(wallet), account = wallet.state.account;
    data = null;
    if (!account || wallet.state.chainId !== chain.id) { loading = false; paint(); return; }
    loading = true; paint();
    try {
      const [record, best, track] = await Promise.all([wallet.readRecord(account), wallet.readBest(account, trackId), wallet.readTrack(trackId)]);
      if (!dead && id === version && session === sessionKey(wallet)) data = { record, best, track };
    } catch (err) { if (id === version) error = errorMessage(err); }
    finally { if (id === version) { loading = false; paint(); } }
  }
  button.onclick = async () => {
    if (button.disabled || dead) return;
    busy = true; error = ''; tx = ''; paint();
    let session;
    try {
      if (!wallet.state.account || wallet.state.chainId !== chain.id) { await wallet.connect(); await refresh(); return; }
      if (!data) { await refresh(); return; }
      session = sessionKey(wallet);
      await refresh();
      if (dead || session !== sessionKey(wallet) || !['mint', 'update'].includes(action())) return;
      const hash = await wallet.submit(trackId, lapMs, Number(bits) >>> 0);
      if (dead || session !== sessionKey(wallet)) return;
      tx = hash; await refresh();
    } catch (err) { if (!session || session === sessionKey(wallet)) error = errorMessage(err); }
    finally { busy = false; paint(); }
  };
  const unsubscribe = wallet.subscribe(() => {
    const next = sessionKey(wallet);
    if (next !== key) { key = next; error = ''; tx = ''; void refresh(); }
    paint();
  });
  paint(); if (enabled && lapMs) void refresh();
  return { refresh, destroy() { dead = true; ++version; unsubscribe(); root.remove(); } };
}
