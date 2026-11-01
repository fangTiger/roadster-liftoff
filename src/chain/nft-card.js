import { t, onLangChange } from '../i18n/i18n.js';
import { chain, enabled, recordsAddress } from './config.js';
import { wallet as defaultWallet } from './wallet.js';
import { RACE_TRACKS } from './tracks.js';
import { bitsToCount, formatMs, errorKind } from './records.js';
import { el, link, raceRoot, sessionKey, dateText } from './race-ui.js';

export const nftImage = record => `/api/nft/image/${record.tokenId}?v=${record.updatedAt ?? 0}`;
// 卡片只依赖钱包单例接口；切换会话、刷新和卸载均使旧请求失效。
export function mountNFTCard(container, { wallet = defaultWallet } = {}) {
  const root = raceRoot(container); root.className = 'rc-panel rc-nft';
  let data = null, error = '', loading = false, connecting = false, version = 0, dead = false, key = sessionKey(wallet);
  function paint() {
    if (dead) return;
    root.replaceChildren(el('h3', t('race.chain.mine'), 'rc-title'));
    if (!enabled) { root.append(el('p', t('race.chain.unconfigured'), 'rc-dim')); return; }
    if (!wallet.state.account || wallet.state.chainId !== chain.id) {
      root.append(el('p', t('wallet.nft.connectHint'), 'rc-dim'));
      const button = el('button', t(connecting ? 'race.chain.connecting' : 'race.chain.connect'), 'rc-button'); button.type = 'button'; button.disabled = connecting;
      button.onclick = async () => {
        connecting = true; error = ''; paint();
        try { await wallet.connect(); }
        catch (err) { if (!dead) error = 'race.error.' + errorKind(err); }
        finally { connecting = false; paint(); }
      };
      root.append(button);
    } else if (loading) root.append(el('p', t('race.chain.loadingMine'), 'rc-dim'));
    else if (data && !Number(data.record.tokenId)) {
      root.append(el('p', t('race.chain.noNFT'), 'rc-dim'), el('p', t('wallet.nft.qualify'), 'rc-dim'));
      const enter = el('a', t('race.pick'), 'rc-link'); enter.href = '/?race'; root.append(enter);
    } else if (data) {
      const { record, bests } = data, image = el('img'), fallback = el('p', t('wallet.nft.imageFallback'), 'rc-image-fallback');
      const art = el('div', null, 'rc-art'); fallback.hidden = true; image.alt = t('wallet.nft.imageAlt', { id: record.tokenId });
      image.onerror = () => { image.hidden = true; fallback.hidden = false; }; image.src = nftImage(record); art.append(image, fallback);
      root.append(art, el('b', `#${String(record.tokenId).padStart(4, '0')}`, 'rc-number'), el('p', t('race.chain.first', { track: t('race.track' + record.firstTrack), time: formatMs(record.firstLapMs) }), 'rc-first'), el('p', `${t('chain.minted')} · ${dateText(record.mintedAt)}`, 'rc-dim'), el('p', t('race.chain.achievements', { count: bitsToCount(record.achievements) }), 'rc-dim'));
      bests.forEach((best, i) => root.append(el('p', `${t('race.track' + RACE_TRACKS[i].id)} · ${Number(best.bestMs) ? formatMs(best.bestMs) + ' · ' + t(best.verified ? 'race.chain.verified' : 'race.chain.selfReported') : t('race.chain.noLap')}`, 'rc-best')));
      const actions = el('div', null, 'rc-nft-actions');
      actions.append(link(t('wallet.nft.explorer'), `${chain.blockExplorers.default.url}/token/${recordsAddress}?a=${record.tokenId}`), link(t('wallet.nft.view'), `/api/nft/view/${record.tokenId}`)); root.append(actions);
    }
    if (error) {
      root.append(el('p', t(error), 'rc-error'));
      if (wallet.state.account && wallet.state.chainId === chain.id) { const retry = el('button', t('race.chain.retry'), 'rc-button'); retry.type = 'button'; retry.onclick = refresh; root.append(retry); }
    }
  }
  async function refresh() {
    if (dead) return;
    const id = ++version, session = sessionKey(wallet), account = wallet.state.account;
    data = null; error = ''; loading = false;
    if (!enabled || !account || wallet.state.chainId !== chain.id) { paint(); return; }
    loading = true; paint();
    try {
      const record = await wallet.readRecord(account);
      if (dead || id !== version || session !== sessionKey(wallet)) return;
      const bests = Number(record.tokenId) ? await Promise.all(RACE_TRACKS.map(track => wallet.readBest(account, track.id))) : [];
      if (!dead && id === version && session === sessionKey(wallet)) data = { record, bests };
    } catch (err) { if (!dead && id === version) error = 'race.error.' + errorKind(err); }
    finally { if (!dead && id === version) { loading = false; paint(); } }
  }
  const unsubscribe = wallet.subscribe(() => { const next = sessionKey(wallet); if (next !== key) { key = next; void refresh(); } });
  const unlang = onLangChange(paint); void refresh();
  return { refresh, destroy() { dead = true; ++version; unsubscribe(); unlang(); root.remove(); } };
}
