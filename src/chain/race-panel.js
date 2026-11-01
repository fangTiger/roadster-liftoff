import { zeroAddress } from 'viem';
import { t, onLangChange } from '../i18n/i18n.js';
import { chain, enabled } from './config.js';
import { wallet as defaultWallet } from './wallet.js';
import { decideAction, lapToMs, errorKind } from './records.js';
import { openMyNFT } from './wallet-hub.js';
import { nftImage } from './nft-card.js';
import { showWalletSuccess } from './wallet-toast.js';
import { el, raceRoot, link, sessionKey } from './race-ui.js';

const PHASES = { simulating: 'race.chain.simulating', signing: 'race.chain.signing', confirming: 'race.chain.confirming' };
export function mountRaceChain(container, { trackId, trackName, bestLap, bits, replay }, { wallet = defaultWallet, fetcher = globalThis.fetch, notifySuccess = showWalletSuccess, onOpenNFT = () => openMyNFT({ wallet }) } = {}) {
  const root = raceRoot(container), title = el('h3', t('race.chain.submit'), 'rc-title'), timing = el('p', t('race.chain.timing', { track: trackName, time: bestLap?.toFixed(3) ?? '—' }), 'rc-dim');
  const button = el('button', null, 'rc-button'), status = el('p', null, 'rc-status'), successBox = el('div', null, 'rc-success');
  button.type = 'button'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  root.append(title, timing, button, status, successBox);
  root.className = 'rc-panel rc-submit';
  root.setAttribute('data-track-id', String(trackId));
  let data = null, busy = false, loading = false, error = '', verifyError = '', tx = '', success = null, version = 0, dead = false, key = sessionKey(wallet), lapMs;
  try { lapMs = lapToMs(bestLap); root.setAttribute('data-lap-ms', String(lapMs)); } catch { error = 'race.chain.invalid'; }
  const action = () => data && decideAction({ hasToken: Number(data.record.tokenId) > 0, bestLapMs: lapMs, track: data.track, chainBestMs: data.best.bestMs, chainBits: data.record.achievements, bits });
  function paint() {
    if (dead) return;
    title.textContent = success ? t(success.record ? 'wallet.success.' + success.kind : 'race.chain.success', { id: success.record?.tokenId }) : t('race.chain.submit');
    button.hidden = !!success; successBox.hidden = !success; successBox.replaceChildren();
    if (success) {
      const check = el('span', '✓', 'rc-success-check'); check.setAttribute('aria-hidden', 'true');
      const mine = el('button', t('wallet.success.view'), 'rc-button'); mine.type = 'button'; mine.onclick = onOpenNFT;
      successBox.append(check);
      if (success.record) {
        const image = el('img'); image.alt = t('wallet.nft.imageAlt', { id: success.record.tokenId }); image.onerror = () => { image.hidden = true; }; image.src = nftImage(success.record); successBox.append(image);
        if (data) successBox.append(el('p', t('race.chain.timing', { track: t('race.track' + trackId), time: (Number(data.best.bestMs) / 1000).toFixed(3) }), 'rc-best'));
      } else successBox.append(el('p', t('chain.refreshFailed'), 'rc-dim'));
      const transaction = link(t('race.chain.success'), `${chain.blockExplorers.default.url}/tx/${tx}`); transaction.className = 'rc-button rc-link';
      successBox.append(mine, transaction);
    }
    timing.textContent = t('race.chain.timing', { track: t('race.track' + trackId), time: bestLap?.toFixed(3) ?? '—' });
    const connected = wallet.state.account && wallet.state.chainId === chain.id;
    const value = action();
    button.disabled = !enabled || !lapMs || busy || loading || !!wallet.state.phase;
    button.textContent = !enabled ? t('race.chain.unconfigured') : (PHASES[wallet.state.phase] && t(PHASES[wallet.state.phase])) || (busy || loading ? t('race.chain.loading') : !connected ? t('race.chain.connect') : !data ? t('race.chain.retry') : value === 'mint' ? t('race.chain.mint') : value === 'update' ? t('race.chain.update') : t('race.chain.nothing'));
    status.replaceChildren();
    if (connected && data && !['mint', 'update'].includes(value)) {
      button.disabled = true;
      const labels = { closed: t('race.chain.closed'), tooFast: t('race.chain.tooFast'), upToDate: t('race.chain.latest'), notQualified: t('race.chain.notQualified', { line: (Number(data.track.qualifyMs) / 1000).toFixed(3), gap: ((lapMs - Number(data.track.qualifyMs)) / 1000).toFixed(3) }) };
      // 成功状态已说明结果，不再叠加「已是最新」等按钮状态文字。
      if (!success) status.append(el('span', labels[value]));
    }
    if (tx && !success) status.append(link(t('race.chain.success'), `${chain.blockExplorers.default.url}/tx/${tx}`));
    if (verifyError) status.append(el('span', verifyError, 'rc-error'));
    if (error) status.append(el('span', t(error), 'rc-error'));
  }
  async function refresh() {
    const id = ++version, session = sessionKey(wallet), account = wallet.state.account;
    data = null;
    if (!account || wallet.state.chainId !== chain.id) { loading = false; paint(); return; }
    loading = true; paint();
    try {
      const [record, best, track] = await Promise.all([wallet.readRecord(account), wallet.readBest(account, trackId), wallet.readTrack(trackId)]);
      if (!dead && id === version && session === sessionKey(wallet)) data = { record, best, track };
    } catch (err) { if (id === version) error = 'race.error.' + errorKind(err); }
    finally { if (id === version) { loading = false; paint(); } }
  }
  button.onclick = async () => {
    if (button.disabled || dead) return;
    busy = true; error = ''; verifyError = ''; tx = ''; success = null; paint();
    let session;
    try {
      if (!wallet.state.account || wallet.state.chainId !== chain.id) { await wallet.connect(); await refresh(); return; }
      if (!data) { await refresh(); return; }
      session = sessionKey(wallet);
      await refresh();
      if (dead || session !== sessionKey(wallet) || !['mint', 'update'].includes(action())) return;
      const verifier = await wallet.readVerifier();
      if (dead || session !== sessionKey(wallet)) return;
      let verified;
      if (verifier.toLowerCase() !== zeroAddress) {
        if (!replay) { verifyError = t('race.chain.missingReplay'); return; }
        try {
          const response = await fetcher('/api/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ address: wallet.state.account, trackId, replay, bits0to19: Number(bits) & 0xfffff }) });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || t('race.chain.verifyFailed'));
          if (!Number.isInteger(result.lapMs) || result.lapMs <= 0 || !Number.isInteger(result.achievements) || !Number.isInteger(result.deadline) || typeof result.signature !== 'string') throw new Error(t('race.chain.verifyFailed'));
          verified = result;
        } catch (err) { if (!dead && session === sessionKey(wallet)) verifyError = err.message || t('race.chain.verifyFailed'); return; }
      }
      if (dead || session !== sessionKey(wallet)) return;
      const hadToken = Number(data.record.tokenId) > 0;
      const hash = verified
        ? await wallet.submit(trackId, verified.lapMs, verified.achievements, verified.deadline, verified.signature)
        : await wallet.submit(trackId, lapMs, Number(bits) >>> 0);
      if (dead || session !== sessionKey(wallet)) return;
      tx = hash; await refresh();
      if (dead || session !== sessionKey(wallet)) return;
      success = { kind: hadToken ? 'updated' : 'minted', record: Number(data?.record.tokenId) > 0 ? data.record : null };
      notifySuccess(success.record || hadToken ? success.kind : 'confirmed', success.record?.tokenId);
    } catch (err) { if (!session || session === sessionKey(wallet)) error = 'race.error.' + errorKind(err); }
    finally { busy = false; paint(); }
  };
  const unsubscribe = wallet.subscribe(() => {
    const next = sessionKey(wallet);
    if (next !== key) { key = next; error = ''; verifyError = ''; tx = ''; success = null; void refresh(); }
    paint();
  });
  const unlang = onLangChange(paint);
  paint(); if (enabled && lapMs) void refresh();
  return { refresh, destroy() { dead = true; ++version; unsubscribe(); unlang(); root.remove(); } };
}
