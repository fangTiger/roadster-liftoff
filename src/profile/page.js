import { t, onLangChange, mountLangToggle, getLang } from '../i18n/i18n.js';
import { chain, enabled, recordsAddress } from '../chain/config.js';
import { wallet as defaultWallet } from '../chain/wallet.js';
import { RACE_TRACKS } from '../chain/tracks.js';
import { el, link, dateText } from '../chain/race-ui.js';
import { shortAddr, formatMs, bitsToCount, errorKind } from '../chain/records.js';
import { nftImage } from '../chain/nft-card.js';
import { mountRaceBoard } from '../chain/race-board.js';
import { DEFS } from '../achievements/achievements.js';
import { avatarSVG } from './avatar.js';
import { deriveTitle, trackStats, profileAddress, createBoardCache, challengeHref, raceHref } from './title.js';
import { readTimeline, mergeTimeline, createBlockCache } from './timeline.js';

const action = (label, run) => { const button = el('button', label, 'pf-button'); button.type = 'button'; button.onclick = run; return button; };
const route = (label, href, primary = false) => { const node = el('a', label, 'pf-button' + (primary ? ' pf-primary' : '')); node.href = href; return node; };
const heading = (number, title, note) => { const node = el('header', null, 'pf-section-heading'); node.append(el('span', number, 'pf-kicker'), el('h2', title)); if (note) node.append(el('span', note, 'pf-dim')); return node; };
const gapText = gap => gap == null ? '—' : `${gap > 0 ? '+' : gap < 0 ? '−' : ''}${formatMs(Math.abs(gap))}`;

// 公共读取与钱包会话解耦；切换账户或卸载后，旧请求不能覆盖新页面。
export function mountProfile(root, { wallet = defaultWallet, client, search = globalThis.location?.search || '' } = {}) {
  const params = new URLSearchParams(search), boardCache = createBoardCache(wallet), blockTime = createBlockCache(client);
  root.className = 'pf-page';
  const nav = el('nav', null, 'pf-nav'), lang = el('span'), account = el('header', null, 'pf-account pf-glass'), notice = el('p', null, 'pf-notice');
  const tabs = el('nav', null, 'pf-tabs'), mineButton = action('', () => selectTab('profile')), boardButton = action('', () => selectTab('leaderboard'));
  tabs.setAttribute('role', 'tablist'); tabs.append(mineButton, boardButton);
  const personal = el('div', null, 'pf-personal'), boardSlot = el('section', null, 'pf-board pf-glass'), nft = el('section', null, 'pf-nft pf-glass'), scores = el('section', null, 'pf-scores');
  const achievements = el('section', null, 'pf-achievements pf-glass'), timeline = el('section', null, 'pf-timeline pf-glass');
  personal.append(nft, scores, achievements, timeline); root.append(nav, notice, account, tabs, personal, boardSlot);
  let selected = params.get('tab') === 'leaderboard' ? 'leaderboard' : 'profile', address = null, invalid = false, own = false;
  let record = null, recordError = null, rows = [], bests = [], tracks = [], stats = [], scoreErrors = [], loading = false;
  let history = null, historyError = null, historyLoading = false, times = new Map(), timestampErrors = new Set();
  let version = 0, historyVersion = 0, dead = false, board = null, busy = false, accountError = '', copied = '', copyTimer;
  notice.setAttribute('role', 'status'); notice.setAttribute('aria-live', 'polite');
  function paintNav() {
    nav.replaceChildren(route('← ' + t('menu.home'), '/'), el('span', 'MARS ROADSTER / ' + t('profile.garage'), 'pf-wordmark'), route(t('profile.timeTrial') + ' ↗', '/?race'), lang);
    mountLangToggle(lang, { injectCss: false });
    mineButton.textContent = t('wallet.profile'); boardButton.textContent = t('wallet.leaderboard');
    [mineButton, boardButton].forEach((button, i) => { const key = i ? 'leaderboard' : 'profile'; button.id = 'pf-tab-' + key; button.setAttribute('role', 'tab'); button.setAttribute('aria-selected', String(selected === key)); button.setAttribute('aria-controls', 'pf-content-' + key); button.tabIndex = selected === key ? 0 : -1; });
    personal.id = 'pf-content-profile'; boardSlot.id = 'pf-content-leaderboard';
    [personal, boardSlot].forEach((slot, i) => { slot.setAttribute('role', 'tabpanel'); slot.setAttribute('aria-labelledby', i ? boardButton.id : mineButton.id); });
    personal.hidden = selected !== 'profile'; boardSlot.hidden = selected !== 'leaderboard';
    notice.textContent = [invalid ? t('profile.invalidAddress') : '', accountError, copied].filter(Boolean).join(' · '); notice.hidden = !notice.textContent;
  }
  async function walletAction(fn) {
    if (busy) return; busy = true; accountError = ''; paintAccount();
    try { await fn(); } catch (error) { accountError = t('race.error.' + errorKind(error)); }
    finally { busy = false; if (!dead) { paintAccount(); paintNav(); } }
  }
  function paintAccount() {
    if (dead) return; account.replaceChildren();
    if (!address) {
      const intro = el('div'); intro.append(el('p', 'MARS ROADSTER', 'pf-kicker'), el('h1', t('profile.welcome')), el('p', t('profile.connectHint'), 'pf-dim'));
      const connect = action(t(busy ? 'race.chain.connecting' : 'race.chain.connect'), () => walletAction(() => wallet.connect())); connect.disabled = busy; intro.append(connect); account.append(intro); return;
    }
    const avatar = el('img', null, 'pf-avatar'); avatar.src = 'data:image/svg+xml,' + encodeURIComponent(avatarSVG(address)); avatar.alt = t('profile.avatar');
    const identity = el('div', null, 'pf-identity'), copy = action(shortAddr(address) + ' ⧉', async () => {
      try { await globalThis.navigator.clipboard.writeText(address); copied = t('profile.copied'); }
      catch { copied = t('profile.copyFailed'); }
      if (!dead) { paintNav(); clearTimeout(copyTimer); copyTimer = setTimeout(() => { copied = ''; if (!dead) paintNav(); }, 3200); }
    }); copy.title = address;
    identity.append(el('p', own ? t('profile.yourGarage') : t('profile.driverGarage'), 'pf-kicker'), el('h1', t('profile.title.' + deriveTitle({ tokenId: record?.tokenId, stats }))), copy);
    const details = el('div', null, 'pf-account-actions'); details.append(el('span', '● ' + chain.name, 'pf-network'), link(t('wallet.address'), `${chain.blockExplorers.default.url}/address/${address}`));
    if (own) {
      if (wallet.state.chainId !== chain.id) { const change = action(t('wallet.switch', { network: chain.name }), () => walletAction(() => wallet.switchNetwork())); change.disabled = busy; details.append(change); }
      const disconnect = action(t('wallet.disconnect'), () => walletAction(() => wallet.disconnect())); disconnect.disabled = busy; details.append(disconnect);
    }
    account.append(avatar, identity, details);
  }
  function failure(error, retry) { const node = el('div', null, 'pf-error'); node.setAttribute('role', 'status'); node.append(el('p', t('race.error.' + errorKind(error))), action(t('race.chain.retry'), retry)); return node; }
  function paintNFT() {
    nft.replaceChildren(heading('01', t('profile.firstLap'), t('profile.soulbound')));
    if (loading && !record && !recordError) { nft.append(el('p', t('race.chain.loadingMine'), 'pf-dim')); return; }
    if (recordError) { nft.append(failure(recordError, refresh)); return; }
    if (!Number(record?.tokenId)) {
      const empty = el('div', null, 'pf-empty-nft'), silhouette = el('div', null, 'pf-car-silhouette'); silhouette.setAttribute('aria-hidden', 'true');
      empty.append(silhouette, el('h3', t('race.chain.noNFT')), el('p', t('wallet.nft.qualify'), 'pf-dim'), route(t('profile.qualifyCTA'), '/?race', true)); nft.append(empty); return;
    }
    const layout = el('div', null, 'pf-nft-layout'), art = el('div', null, 'pf-nft-art'), tilt = el('div', null, 'pf-tilt'), image = el('img'), fallback = el('p', t('wallet.nft.imageFallback'), 'pf-image-fallback'), shine = el('div', null, 'pf-shine');
    image.alt = t('wallet.nft.imageAlt', { id: record.tokenId }); image.src = nftImage(record); image.draggable = false; fallback.hidden = true;
    image.onerror = () => { image.hidden = true; fallback.hidden = false; }; shine.setAttribute('aria-hidden', 'true'); tilt.append(image, fallback, shine); art.append(tilt);
    const reduced = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    art.onpointermove = event => {
      if (reduced()) return;
      const bounds = art.getBoundingClientRect(), x = (event.clientX - bounds.left) / bounds.width, y = (event.clientY - bounds.top) / bounds.height;
      tilt.style.setProperty('--rx', `${(y - .5) * -12}deg`); tilt.style.setProperty('--ry', `${(x - .5) * 16}deg`); tilt.style.setProperty('--shine-x', `${x * 100}%`);
    };
    art.onpointerleave = art.onpointerup = art.onpointercancel = () => { tilt.style.setProperty('--rx', '0deg'); tilt.style.setProperty('--ry', '0deg'); };
    const meta = el('div', null, 'pf-nft-meta'), number = '#' + String(record.tokenId).padStart(4, '0');
    meta.append(el('p', t('profile.edition'), 'pf-kicker'), el('h3', number, 'pf-token'), el('p', t('race.chain.first', { track: t('race.track' + record.firstTrack), time: formatMs(record.firstLapMs) }), 'pf-first'), el('p', t('chain.minted') + ' / ' + dateText(record.mintedAt), 'pf-dim'), el('p', t('profile.nftStory'), 'pf-story'));
    const links = el('div', null, 'pf-links'); links.append(link(t('wallet.nft.explorer'), `${chain.blockExplorers.default.url}/token/${recordsAddress}?a=${record.tokenId}`), link(t('wallet.nft.view'), `/api/nft/view/${record.tokenId}`)); meta.append(links); layout.append(art, meta); nft.append(layout);
  }
  function paintScores() {
    scores.replaceChildren(heading('02', t('profile.personalBests'), t('profile.rankAll')));
    const grid = el('div', null, 'pf-score-grid');
    RACE_TRACKS.forEach((track, index) => {
      const card = el('article', null, 'pf-score pf-glass'), best = bests[index], stat = stats[index];
      card.append(el('p', `0${track.id} / ${track.english.toUpperCase()}`, 'pf-kicker'), el('h3', t('race.track' + track.id)));
      if (scoreErrors[index]) card.append(failure(scoreErrors[index], refresh));
      else if (!best) card.append(el('p', t('race.chain.loadingMine'), 'pf-dim'));
      else {
        const hasLap = Number(best.bestMs) > 0;
        card.append(el('p', hasLap ? formatMs(best.bestMs) : '—', 'pf-lap'), el('p', t(hasLap ? best.verified ? 'race.chain.verified' : 'race.chain.selfReported' : 'race.chain.noLap'), 'pf-verification'));
        const list = el('dl');
        for (const [label, value] of [[t('race.chain.rank'), stat?.rank ? '#' + stat.rank : '—'], [t('profile.qualifyLine'), Number(tracks[index]?.qualifyMs) ? formatMs(tracks[index].qualifyMs) : '—'], [t('profile.qualifyGap'), gapText(stat?.qualifyGap)], [t('profile.leaderGap'), gapText(stat?.leaderGap)]]) list.append(el('dt', label), el('dd', value));
        card.append(list);
        const challenge = route(t(hasLap ? own ? 'profile.challengeMine' : 'profile.challengeOther' : 'profile.challenge'), raceHref(track.id, hasLap ? address : null), hasLap);
        // 只有用户点击时才写入影子记忆，打开主页不会改变游戏默认值。
        challenge.onclick = () => { challenge.href = challengeHref(track.id, hasLap ? address : null); }; card.append(challenge);
      }
      grid.append(card);
    }); scores.append(grid);
  }
  function paintAchievements() {
    const bits = Number(record?.achievements || 0), unlocked = bitsToCount(bits);
    achievements.replaceChildren(heading('03', t('profile.achievements'), record ? `${unlocked} / 28` : '— / 28'));
    if (recordError) achievements.append(el('p', t('profile.achievementsUnavailable'), 'pf-error'));
    const grid = el('div', null, 'pf-achievement-grid');
    DEFS.forEach(def => {
      const active = !!(bits & 1 << (def.index - 1)), tile = action('', () => { detail.textContent = `${def.name} · ${def.desc}`; });
      tile.className = 'pf-achievement' + (active ? ' is-unlocked' : ''); tile.setAttribute('data-achievement', def.id); tile.title = `${def.name} · ${def.desc}`; tile.setAttribute('aria-label', `${def.name} · ${def.desc} · ${t(active ? 'profile.unlocked' : 'profile.locked')}`);
      tile.append(el('span', String(def.index).padStart(2, '0'), 'pf-badge'), el('span', def.name)); tile.onfocus = tile.onpointerenter = () => { detail.textContent = `${def.name} · ${def.desc}`; }; grid.append(tile);
    });
    const detail = el('p', t('profile.achievementHint'), 'pf-achievement-detail'); detail.setAttribute('role', 'status'); achievements.append(grid, detail);
  }
  function paintTimeline() {
    if (dead) return;
    timeline.replaceChildren(heading('04', t('profile.timeline'), t('profile.onchain')));
    if (historyError) { timeline.append(failure(historyError, loadHistory)); return; }
    if (historyLoading) timeline.append(el('p', t('profile.historyLoading'), 'pf-dim'));
    if (!history) return;
    const allLogs = history.chunks.flatMap(chunk => chunk.logs), complete = !history.limited && history.chunks.every(chunk => !chunk.error), events = mergeTimeline(allLogs, { complete, gaps: history.chunks.filter(chunk => chunk.error) });
    if (!historyLoading && !events.length) timeline.append(el('p', t('profile.noHistory'), 'pf-dim'));
    const list = el('ol', null, 'pf-event-list');
    for (const event of events) {
      const item = el('li'), body = el('div'), key = String(event.blockNumber);
      const title = event.kind === 'mint' ? t('profile.event.mint', { id: event.args.tokenId }) : event.kind === 'best' ? t('profile.event.best', { track: t('race.track' + event.args.trackId), time: formatMs(event.args.bestMs) }) : t('profile.event.achievements', { count: bitsToCount(event.bits) });
      body.append(el('b', title));
      if (event.kind === 'achievements') body.append(el('p', DEFS.filter(def => event.bits & 1 << (def.index - 1)).map(def => def.name).join(' · '), 'pf-dim'));
      const timestamp = times.get(key), time = el('time', timestamp ? new Date(Number(timestamp) * 1000).toLocaleString(getLang() === 'zh' ? 'zh-CN' : 'en-US') : t('profile.block', { block: key }));
      if (timestamp) time.dateTime = new Date(Number(timestamp) * 1000).toISOString();
      body.append(time); item.append(el('span', event.kind === 'mint' ? '◆' : event.kind === 'best' ? '↗' : '+', 'pf-event-mark'), body, link(t('profile.viewTx') + ' ↗', `${chain.blockExplorers.default.url}/tx/${event.transactionHash}`)); list.append(item);
    }
    timeline.append(list);
    for (const chunk of history.chunks.filter(chunk => chunk.error)) {
      const error = el('div', null, 'pf-history-error'); error.append(el('p', t('profile.rangeFailed', { from: chunk.fromBlock, to: chunk.toBlock }), 'pf-error'));
      const retry = action(t('race.chain.retry'), async () => { await chunk.retry(); if (!dead) { paintTimeline(); void loadTimes(historyVersion); } }); retry.disabled = chunk.loading; error.append(retry); timeline.append(error);
    }
    if (timestampErrors.size) timeline.append(action(t('profile.retryTimes'), () => { timestampErrors.clear(); void loadTimes(historyVersion); }));
    if (history.limited) timeline.append(el('p', t('profile.historyLimit'), 'pf-dim'));
  }
  async function loadTimes(id) {
    if (!history) return;
    const blocks = [...new Set(history.chunks.flatMap(chunk => chunk.logs).map(log => String(log.blockNumber)))].filter(key => !times.has(key) && !timestampErrors.has(key));
    // 小批量读取，避免对公共 RPC 同时发出大量区块请求。
    for (let i = 0; i < blocks.length; i += 6) {
      if (dead || id !== historyVersion) return;
      await Promise.all(blocks.slice(i, i + 6).map(async key => { try { const value = await blockTime(BigInt(key)); if (id === historyVersion) times.set(key, value); } catch { if (id === historyVersion) timestampErrors.add(key); } }));
      if (!dead && id === historyVersion) paintTimeline();
    }
  }
  async function loadHistory() {
    const id = ++historyVersion, owner = address; history = null; historyError = null; times = new Map(); timestampErrors = new Set();
    if (!owner || !enabled) return;
    historyLoading = true; paintTimeline();
    try {
      const data = await readTimeline(client, recordsAddress, owner, { onChunk: (chunk, chunks) => {
        if (dead || id !== historyVersion || !chunks) return;
        history = { chunks, limited: history?.limited ?? true };
        if (chunks.some(part => part.logs.some(log => log.eventName === 'FirstLap'))) history.limited = false; paintTimeline(); void loadTimes(id);
      } });
      if (!dead && id === historyVersion) history = data;
    } catch (error) { if (id === historyVersion) historyError = error; }
    finally { if (!dead && id === historyVersion) { historyLoading = false; paintTimeline(); void loadTimes(id); } }
  }
  function paintData() { if (dead) return; for (const slot of [nft, scores, achievements, timeline]) slot.hidden = !address; paintAccount(); paintNFT(); paintScores(); paintAchievements(); }
  async function refresh() {
    const id = ++version, owner = address;
    record = null; recordError = null; bests = []; tracks = []; stats = []; rows = []; scoreErrors = []; loading = !!owner;
    paintData(); if (!owner || !enabled) return;
    const recordTask = wallet.readRecord(owner).then(value => { if (!dead && id === version) record = value; }, error => { if (!dead && id === version) recordError = error; }).then(() => { if (!dead && id === version) { paintAccount(); paintNFT(); paintAchievements(); } });
    const scoreTasks = RACE_TRACKS.map(async (track, index) => {
      try {
        const [best, config, leaders] = await Promise.all([wallet.readBest(owner, track.id), wallet.readTrack(track.id), boardCache.readLeaderboard(track.id)]);
        if (dead || id !== version) return;
        bests[index] = best; tracks[index] = config; rows[index] = leaders; stats[index] = trackStats(owner, best, config, leaders);
      } catch (error) { if (!dead && id === version) scoreErrors[index] = error; }
      if (!dead && id === version) { paintAccount(); paintScores(); }
    });
    await Promise.all([recordTask, ...scoreTasks]); if (!dead && id === version) { loading = false; paintAccount(); paintScores(); if (!record && !recordError) paintNFT(); }
  }
  function selectTab(value) {
    selected = value; paintNav();
    if (value === 'leaderboard' && !board) board = mountRaceBoard(boardSlot, { wallet: boardCache });
  }
  tabs.onkeydown = event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); selectTab(event.key === 'Home' ? 'profile' : event.key === 'End' ? 'leaderboard' : selected === 'profile' ? 'leaderboard' : 'profile'); (selected === 'profile' ? mineButton : boardButton).focus(); } };
  function sessionChanged() {
    const next = profileAddress(params.get('address'), wallet.state.account), changed = next.address?.toLowerCase() !== address?.toLowerCase();
    address = next.address; invalid = next.invalid; own = !!address && address.toLowerCase() === wallet.state.account?.toLowerCase();
    paintNav(); paintAccount();
    if (changed || !version) { void refresh(); void loadHistory(); }
  }
  const unsub = wallet.subscribe(sessionChanged), unlang = onLangChange(() => { paintNav(); paintData(); paintTimeline(); });
  sessionChanged(); selectTab(selected);
  return { refresh, selectTab, destroy() { dead = true; ++version; ++historyVersion; clearTimeout(copyTimer); board?.destroy(); unsub(); unlang(); root.replaceChildren(); } };
}
