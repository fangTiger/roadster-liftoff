import { t, onLangChange } from '../i18n/i18n.js';
import { RACE_TRACKS } from './tracks.js';
import { wallet as defaultWallet } from './wallet.js';
import { chain, enabled } from './config.js';
import { bitsToCount, formatMs, shortAddr, errorKind } from './records.js';
import { el, raceRoot, sessionKey, dateText } from './race-ui.js';

export function mountRaceBoard(container, { wallet = defaultWallet } = {}) {
  const root = raceRoot(container), mine = el('section', null, 'rc-mine'), tabs = el('nav', null, 'rc-tabs'), board = el('section', null, 'rc-board');
  root.append(el('h2', t('race.chain.title'), 'rc-title'), el('p', t('race.chain.intro'), 'rc-dim'), mine, tabs, board);
  let trackId = 1, boardVersion = 0, mineVersion = 0, key = sessionKey(wallet), dead = false, connecting = false;
  const buttons = RACE_TRACKS.map(track => {
    const button = el('button', t('race.track' + track.id), 'rc-button'); button.type = 'button';
    button.onclick = () => { trackId = track.id; return loadBoard(); }; tabs.append(button); return button;
  });
  async function loadBoard() {
    if (dead) return;
    const id = ++boardVersion, selected = trackId;
    for (let i = 0; i < buttons.length; i++) buttons[i].setAttribute('aria-pressed', String(RACE_TRACKS[i].id === selected));
    board.replaceChildren(el('p', enabled ? t('race.chain.loadingBoard') : t('race.chain.unconfigured'), 'rc-dim'));
    if (!enabled) return;
    try {
      const rows = await wallet.readLeaderboard(selected);
      if (dead || id !== boardVersion) return;
      if (!rows.length) { board.replaceChildren(el('p', t('race.chain.empty'), 'rc-dim')); return; }
      const scroll = el('div', null, 'rc-scroll'), table = el('table', null, 'rc-table'), head = el('thead'), header = el('tr'), body = el('tbody');
      for (const label of [t('race.chain.rank'), t('race.chain.player'), t('race.chain.best'), t('race.chain.date'), t('race.chain.verification')]) { const th = el('th', label); th.scope = 'col'; header.append(th); }
      head.append(header);
      rows.forEach((row, i) => {
        const tr = el('tr');
        for (const text of [i + 1, shortAddr(row.address), formatMs(row.bestMs), dateText(row.updatedAt), row.verified ? t('race.chain.verified') : t('race.chain.selfReported')]) tr.append(el('td', text));
        tr.children[1].title = row.address; body.append(tr);
      });
      table.append(head, body); scroll.append(table); board.replaceChildren(scroll);
    } catch (err) {
      if (!dead && id === boardVersion) {
        const retry = el('button', t('race.chain.retryBoard'), 'rc-button'); retry.onclick = loadBoard;
        board.replaceChildren(el('p', t('race.error.' + errorKind(err)), 'rc-error'), retry);
      }
    }
  }
  async function loadMine() {
    if (dead) return;
    const id = ++mineVersion, session = sessionKey(wallet);
    mine.replaceChildren(el('h3', t('race.chain.mine'), 'rc-title'));
    if (!enabled) { mine.append(el('p', t('race.chain.unconfigured'), 'rc-dim')); return; }
    if (!wallet.state.account || wallet.state.chainId !== chain.id) {
      const button = el('button', connecting ? t('race.chain.connecting') : t('race.chain.connect'), 'rc-button'); button.type = 'button'; button.disabled = connecting;
      button.onclick = async () => {
        if (connecting) return;
        connecting = true; button.disabled = true;
        let failure = '';
        try { await wallet.connect(); }
        catch (err) { failure = t('race.error.' + errorKind(err)); }
        finally {
          connecting = false;
          await loadMine();
          if (!dead && failure) mine.append(el('p', failure, 'rc-error'));
        }
      }; mine.append(button); return;
    }
    mine.append(el('p', t('race.chain.loadingMine'), 'rc-dim'));
    try {
      const account = wallet.state.account, record = await wallet.readRecord(account);
      const bests = Number(record.tokenId) ? await Promise.all(RACE_TRACKS.map(track => wallet.readBest(account, track.id))) : [];
      if (dead || id !== mineVersion || session !== sessionKey(wallet)) return;
      mine.replaceChildren(el('h3', t('race.chain.mine'), 'rc-title'));
      if (!Number(record.tokenId)) { mine.append(el('p', t('race.chain.noNFT'), 'rc-dim')); return; }
      const track = RACE_TRACKS.find(t => t.id === Number(record.firstTrack));
      mine.append(el('b', `#${String(record.tokenId).padStart(4, '0')}`, 'rc-number'), el('p', t('race.chain.first', { track: t('race.track' + record.firstTrack), time: formatMs(record.firstLapMs) }), 'rc-first'), el('p', t('race.chain.achievements', { count: bitsToCount(record.achievements) }), 'rc-dim'));
      bests.forEach((best, i) => mine.append(el('p', `${t('race.track' + RACE_TRACKS[i].id)} · ${Number(best.bestMs) ? formatMs(best.bestMs) : t('race.chain.noLap')}${best.verified ? ` · ${t('race.chain.verified')}` : ''}`, 'rc-best')));
    } catch (err) { if (!dead && id === mineVersion) mine.replaceChildren(el('p', t('race.error.' + errorKind(err)), 'rc-error')); }
  }
  const unsubscribe = wallet.subscribe(() => {
    const next = sessionKey(wallet);
    if (next !== key) { key = next; void loadMine(); }
  });
  const unlang = onLangChange(() => {
    root.children[0].textContent = t('race.chain.title'); root.children[1].textContent = t('race.chain.intro');
    buttons.forEach((button, i) => { button.textContent = t('race.track' + RACE_TRACKS[i].id); });
    void loadMine(); void loadBoard();
  });
  void loadMine(); void loadBoard();
  return { refresh: () => Promise.all([loadMine(), loadBoard()]), destroy() { dead = true; ++mineVersion; ++boardVersion; unsubscribe(); unlang(); root.remove(); } };
}
