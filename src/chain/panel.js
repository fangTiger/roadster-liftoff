import { t, getLang, onLangChange } from '../i18n/i18n.js';
import { chain, enabled, faucetUrl } from './config.js';
import { wallet } from './wallet.js';
import { achievementsToBits, bitsToCount, needsUpdate, formatMs, shortAddr, errorKind } from './records.js';
import './panel.css';

const el = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (className) node.className = className;
  return node;
};
const dateText = seconds => seconds ? new Date(Number(seconds) * 1000).toLocaleDateString(getLang() === 'zh' ? 'zh-CN' : 'en-US') : '—';
const sessionKey = () => `${wallet.state.account || ''}/${wallet.state.chainId}`;
function externalLink(label, url) {
  const link = el('a', label); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; return link;
}
function showError(node, kind) {
  node.replaceChildren(el('span', t(`chain.error.${kind}`)));
  if (kind === 'insufficient_funds') {
    node.append(el('span', ` ${t(faucetUrl ? 'chain.testFunds' : 'chain.mainFunds')} `));
    if (faucetUrl) node.append(externalLink(t('chain.faucet'), faucetUrl));
  }
}

// 分享模块只提供插槽；钱包状态与交易逻辑均留在链上模块。
export function createRecordSlot({ getAchievements }) {
  let container = null, stats = null, record = null, loaded = false, loading = false, busy = false;
  let error = '', tx = '', version = 0, key = sessionKey();
  let action, status, heading, timing, accountLabel;
  function paint() {
    if (!container) return;
    container.hidden = stats?.roundTripMs == null;
    if (container.hidden) return;
    const state = wallet.state;
    heading.textContent = t('chain.title');
    timing.textContent = `${t('chain.thisTrip')} · ${formatMs(stats.roundTripMs)}`;
    accountLabel.textContent = state.account ? shortAddr(state.account) : '';
    action.disabled = !enabled || busy || loading || !!state.phase;
    let label = 'chain.connect';
    if (!enabled) label = 'chain.soon';
    else if (state.phase) label = `chain.${state.phase}`;
    else if (loading || busy) label = 'chain.loading';
    else if (state.account && state.chainId !== chain.id) label = 'chain.switch';
    else if (state.account && loaded) {
      label = !Number(record?.tokenId) ? 'chain.mint' : needsUpdate(record, stats.roundTripMs, achievementsToBits(getAchievements())) ? 'chain.update' : 'chain.latest';
      if (label === 'chain.latest') action.disabled = true;
    }
    action.textContent = t(label);
    status.replaceChildren();
    if (tx) {
      status.append(externalLink(t('chain.success'), `${chain.blockExplorers.default.url}/tx/${tx}`));
      if (error) status.append(el('span', ` ${t('chain.refreshFailed')}`));
    } else if (error) showError(status, error);
  }
  async function refresh() {
    const id = ++version, session = sessionKey();
    loaded = false; record = null;
    if (!enabled || !wallet.state.account) { loading = false; paint(); return; }
    loading = true; paint();
    try {
      const result = await wallet.readRecord(wallet.state.account);
      if (id !== version || session !== sessionKey()) return;
      record = result; loaded = true;
    } catch (err) { if (id === version) error = errorKind(err); }
    finally { if (id === version) { loading = false; paint(); } }
  }
  async function activate() {
    if (busy || loading || wallet.state.phase || !enabled) return;
    busy = true; error = ''; tx = ''; paint();
    let session;
    try {
      if (!wallet.state.account || wallet.state.chainId !== chain.id || !loaded) {
        await wallet.connect(); await refresh(); return;
      }
      session = sessionKey();
      // 提交前再次读取，避免打开面板后其他标签页已经更新记录。
      record = await wallet.readRecord(wallet.state.account);
      if (session !== sessionKey()) return;
      const bits = achievementsToBits(getAchievements());
      if (!needsUpdate(record, stats.roundTripMs, bits)) { loaded = true; return; }
      const hash = await wallet.submit(stats.roundTripMs, bits);
      if (session !== sessionKey()) return;
      tx = hash;
      await refresh();
    } catch (err) { if (!session || session === sessionKey()) error = errorKind(err); }
    finally { busy = false; paint(); }
  }
  wallet.subscribe(() => {
    const next = sessionKey();
    if (key !== next) { key = next; error = ''; tx = ''; if (container) void refresh(); }
    paint();
  });
  onLangChange(paint);
  return {
    render(slot, nextStats) {
      container = slot; stats = nextStats; error = ''; tx = '';
      container.className = 'chain-submit';
      heading = el('h3'); timing = el('p', '', 'chain-time'); accountLabel = el('span', '', 'chain-dim');
      action = el('button'); action.type = 'button'; action.addEventListener('click', () => void activate());
      status = el('p', '', 'chain-status'); status.setAttribute('role', 'status');
      container.replaceChildren(heading, timing, accountLabel, action, status);
      paint();
      if (stats?.roundTripMs != null) void refresh();
    },
  };
}

export function createChainPanel() {
  let wrap = null, card = null, mine = null, board = null, title = null, note = null, closeButton = null;
  let open = false, previousFocus = null, myVersion = 0, boardVersion = 0, rows = null, boardError = '';
  let myRecord = null, myError = '', myLoading = false, connecting = false, key = sessionKey();
  const button = el('button', '⛓', 'chain-tool'); button.type = 'button';
  const labelButton = () => { button.title = t('chain.title'); button.setAttribute('aria-label', t('chain.title')); };
  labelButton(); document.getElementById('tools')?.append(button);
  button.addEventListener('click', show);
  function paintBoard() {
    if (!board) return;
    const heading = el('h3', t('chain.leaderboard'));
    board.replaceChildren(heading);
    if (!enabled) { board.append(el('p', t('chain.soon'), 'chain-dim')); return; }
    if (boardError) { const status = el('p'); showError(status, boardError); board.append(status); return; }
    if (!rows) { board.append(el('p', t('chain.loading'), 'chain-dim')); return; }
    if (!rows.length) { board.append(el('p', t('chain.empty'), 'chain-dim')); return; }
    const scroll = el('div', null, 'chain-table-scroll'), table = el('table'), head = el('thead'), header = el('tr');
    for (const name of ['rank', 'player', 'time', 'date']) { const th = el('th', t(`chain.${name}`)); th.scope = 'col'; header.append(th); }
    head.append(header); const body = el('tbody');
    rows.forEach((row, index) => {
      const tr = el('tr');
      if (row.address.toLowerCase() === wallet.state.account?.toLowerCase()) tr.className = 'chain-self';
      for (const value of [index + 1, shortAddr(row.address), formatMs(row.bestMs), dateText(row.updatedAt)]) tr.append(el('td', value));
      tr.children[1].title = row.address; body.append(tr);
    });
    table.append(head, body); scroll.append(table); board.append(scroll);
  }
  function paintMine() {
    if (!mine) return;
    mine.replaceChildren(el('h3', t('chain.myNFT')));
    if (!enabled) { mine.append(el('p', t('chain.soon'), 'chain-dim')); return; }
    const state = wallet.state;
    if (state.account) mine.append(el('p', shortAddr(state.account), 'chain-dim'));
    if (!state.account || state.chainId !== chain.id || myError) {
      const connect = el('button', t(connecting ? 'chain.loading' : state.account && state.chainId !== chain.id ? 'chain.switch' : 'chain.connect'));
      connect.disabled = connecting;
      connect.onclick = async () => {
        connecting = true; myError = ''; paintMine();
        try { await wallet.connect(); await loadMine(); }
        catch (err) { myError = errorKind(err); }
        finally { connecting = false; paintMine(); }
      };
      mine.append(connect);
    }
    if (myError) { const status = el('p', null, 'chain-status'); showError(status, myError); mine.append(status); return; }
    if (!state.account) { mine.append(el('p', t('chain.connectHint'), 'chain-dim')); return; }
    if (myLoading) { mine.append(el('p', t('chain.loading'), 'chain-dim')); return; }
    if (!Number(myRecord?.tokenId)) {
      mine.append(el('div', t('chain.noNFT'), 'chain-nft-placeholder'), el('p', t('chain.achievements', { count: 0 }), 'chain-count')); return;
    }
    const snapshot = myRecord, id = myVersion;
    const hero = el('div', null, 'chain-nft'), imageBox = el('div', t('chain.imageFallback'), 'chain-nft-placeholder');
    const details = el('div');
    details.append(el('b', t('chain.number', { id: snapshot.tokenId })), el('p', formatMs(snapshot.bestMs), 'chain-time'), el('p', `${t('chain.minted')} · ${dateText(snapshot.mintedAt)}`, 'chain-dim'));
    hero.append(imageBox, details);
    mine.append(hero, el('p', t('chain.achievements', { count: bitsToCount(snapshot.achievements) }), 'chain-count'));
    // 元数据与图片都不可信：不插入 HTML，只接受可显示的图片协议。
    void loadImage(snapshot.tokenId).then(url => {
      if (!url || id !== myVersion || !imageBox.isConnected) return;
      const image = el('img'); image.alt = t('chain.imageAlt', { id: snapshot.tokenId }); image.referrerPolicy = 'no-referrer';
      image.onload = () => { if (id === myVersion) imageBox.replaceChildren(image); };
      image.src = url;
    }).catch(() => {});
  }
  async function loadImage(tokenId) {
    const uri = await wallet.readTokenURI(tokenId);
    const metadataUrl = safeUrl(uri, false);
    if (!metadataUrl) return null;
    const response = await fetch(metadataUrl, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) return null;
    const data = await response.json();
    return typeof data.image === 'string' ? safeUrl(data.image, true, metadataUrl) : null;
  }
  async function loadMine() {
    const id = ++myVersion, session = sessionKey();
    myRecord = null; myError = ''; myLoading = !!wallet.state.account && enabled; paintMine();
    if (!myLoading) return;
    try {
      const record = await wallet.readRecord(wallet.state.account);
      if (id === myVersion && session === sessionKey()) myRecord = record;
    } catch (err) { if (id === myVersion) myError = errorKind(err); }
    finally { if (id === myVersion) { myLoading = false; paintMine(); } }
  }
  async function loadBoard() {
    const id = ++boardVersion; rows = null; boardError = ''; paintBoard();
    if (!enabled) return;
    try { const result = await wallet.readLeaderboard(); if (id === boardVersion) rows = result; }
    catch (err) { if (id === boardVersion) boardError = errorKind(err); }
    finally { if (id === boardVersion) paintBoard(); }
  }
  function capture(e) {
    if (!open || e.ctrlKey || e.metaKey || e.altKey || /^F\d+$/.test(e.key)) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); return; }
    if (!wrap.contains(e.target)) { e.stopImmediatePropagation(); return; }
    // 让面板内按钮先处理默认操作，再在冒泡阶段阻止游戏监听器。
  }
  function trap(e) {
    if (e.type === 'keydown' && e.key === 'Tab') {
      const items = [...card.querySelectorAll('button:not(:disabled),a[href]')], first = items[0], last = items.at(-1);
      if (e.shiftKey && (document.activeElement === first || document.activeElement === card)) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || document.activeElement === card)) { e.preventDefault(); first?.focus(); }
    }
    if (!(e.ctrlKey || e.metaKey || e.altKey || /^F\d+$/.test(e.key))) e.stopPropagation();
  }
  function ensurePanel() {
    if (wrap) return;
    wrap = el('div', null, 'chain-wrap'); wrap.hidden = true;
    card = el('section', null, 'chain-panel'); card.tabIndex = -1; card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true'); card.setAttribute('aria-labelledby', 'chain-title');
    const header = el('header'); title = el('h2'); title.id = 'chain-title';
    closeButton = el('button', '×', 'chain-close'); closeButton.onclick = close;
    header.append(title, closeButton); note = el('p', null, 'chain-dim');
    mine = el('section', null, 'chain-mine'); board = el('section', null, 'chain-board');
    card.append(header, note, mine, board); wrap.append(card); document.body.append(wrap);
    wrap.onclick = e => { if (e.target === wrap) close(); };
    wrap.addEventListener('keydown', trap); wrap.addEventListener('keyup', trap);
  }
  function show() {
    if (open) return;
    ensurePanel(); previousFocus = document.activeElement; open = true; wrap.hidden = false;
    window.dispatchEvent(new Event('blur'));
    window.addEventListener('keydown', capture, true); window.addEventListener('keyup', capture, true);
    paintText(); card.focus({ preventScroll: true }); void loadMine(); void loadBoard();
  }
  function close() {
    if (!open) return;
    open = false; wrap.hidden = true; ++myVersion; ++boardVersion;
    window.removeEventListener('keydown', capture, true); window.removeEventListener('keyup', capture, true);
    previousFocus?.focus?.({ preventScroll: true });
  }
  function paintText() {
    labelButton();
    if (!wrap) return;
    title.textContent = t('chain.title'); note.textContent = t('chain.selfReported', { network: chain.name }); closeButton.setAttribute('aria-label', t('menu.close'));
    paintMine(); paintBoard();
  }
  onLangChange(paintText);
  wallet.subscribe(() => {
    const next = sessionKey();
    if (next !== key) { key = next; if (open) { void loadMine(); paintBoard(); } }
  });
  return { open: show, close, get isOpen() { return open; } };
}

function safeUrl(value, image, base) {
  try {
    if (value.startsWith('ipfs://')) value = `https://ipfs.io/ipfs/${value.slice(7)}`;
    const url = new URL(value, base || location.href);
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.href;
    if (url.protocol === 'data:' && (image ? /^data:image\/(png|jpeg|webp|gif|svg\+xml)[;,]/i : /^data:application\/json[;,]/i).test(value)) return value;
  } catch { /* 元数据异常时保留占位卡。 */ }
  return null;
}
