import { RACE_TRACKS } from './tracks.js';
import { wallet as defaultWallet } from './wallet.js';
import { chain, enabled } from './config.js';
import { bitsToCount, formatMs, shortAddr, errorMessage } from './records.js';
import { el, raceRoot, sessionKey, dateText } from './race-ui.js';

export function mountRaceBoard(container, { wallet = defaultWallet } = {}) {
  const root = raceRoot(container), mine = el('section', null, 'rc-mine'), tabs = el('nav', null, 'rc-tabs'), board = el('section', null, 'rc-board');
  root.append(el('h2', '链上记录', 'rc-title'), el('p', '玩家自报成绩 · 各赛道前 50 名', 'rc-dim'), mine, tabs, board);
  let trackId = 1, boardVersion = 0, mineVersion = 0, key = sessionKey(wallet), dead = false, connecting = false;
  const buttons = RACE_TRACKS.map(track => {
    const button = el('button', track.name, 'rc-button'); button.type = 'button';
    button.onclick = () => { trackId = track.id; return loadBoard(); }; tabs.append(button); return button;
  });
  async function loadBoard() {
    if (dead) return;
    const id = ++boardVersion, selected = trackId;
    for (let i = 0; i < buttons.length; i++) buttons[i].setAttribute('aria-pressed', String(RACE_TRACKS[i].id === selected));
    board.replaceChildren(el('p', enabled ? '读取排行榜…' : '尚未配置合约', 'rc-dim'));
    if (!enabled) return;
    try {
      const rows = await wallet.readLeaderboard(selected);
      if (dead || id !== boardVersion) return;
      if (!rows.length) { board.replaceChildren(el('p', '暂无链上成绩', 'rc-dim')); return; }
      const scroll = el('div', null, 'rc-scroll'), table = el('table', null, 'rc-table'), head = el('thead'), header = el('tr'), body = el('tbody');
      for (const label of ['排名', '玩家', '最快单圈', '日期', '核实']) { const th = el('th', label); th.scope = 'col'; header.append(th); }
      head.append(header);
      rows.forEach((row, i) => {
        const tr = el('tr');
        for (const text of [i + 1, shortAddr(row.address), formatMs(row.bestMs), dateText(row.updatedAt), row.verified ? '已核实' : '玩家自报']) tr.append(el('td', text));
        tr.children[1].title = row.address; body.append(tr);
      });
      table.append(head, body); scroll.append(table); board.replaceChildren(scroll);
    } catch (err) {
      if (!dead && id === boardVersion) {
        const retry = el('button', '重试排行榜', 'rc-button'); retry.onclick = loadBoard;
        board.replaceChildren(el('p', errorMessage(err), 'rc-error'), retry);
      }
    }
  }
  async function loadMine() {
    if (dead) return;
    const id = ++mineVersion, session = sessionKey(wallet);
    mine.replaceChildren(el('h3', '我的首圈 NFT', 'rc-title'));
    if (!enabled) { mine.append(el('p', '尚未配置合约', 'rc-dim')); return; }
    if (!wallet.state.account || wallet.state.chainId !== chain.id) {
      const button = el('button', connecting ? '连接中…' : '连接钱包', 'rc-button'); button.type = 'button'; button.disabled = connecting;
      button.onclick = async () => {
        if (connecting) return;
        connecting = true; button.disabled = true;
        let failure = '';
        try { await wallet.connect(); }
        catch (err) { failure = errorMessage(err); }
        finally {
          connecting = false;
          await loadMine();
          if (!dead && failure) mine.append(el('p', failure, 'rc-error'));
        }
      }; mine.append(button); return;
    }
    mine.append(el('p', '读取我的记录…', 'rc-dim'));
    try {
      const account = wallet.state.account, record = await wallet.readRecord(account);
      const bests = Number(record.tokenId) ? await Promise.all(RACE_TRACKS.map(track => wallet.readBest(account, track.id))) : [];
      if (dead || id !== mineVersion || session !== sessionKey(wallet)) return;
      mine.replaceChildren(el('h3', '我的首圈 NFT', 'rc-title'));
      if (!Number(record.tokenId)) { mine.append(el('p', '尚未铸造首圈 NFT', 'rc-dim')); return; }
      const track = RACE_TRACKS.find(t => t.id === Number(record.firstTrack));
      mine.append(el('b', `#${String(record.tokenId).padStart(4, '0')}`, 'rc-number'), el('p', `首圈 · ${track?.name || `赛道 ${record.firstTrack}`} · ${formatMs(record.firstLapMs)}`, 'rc-first'), el('p', `成就 ${bitsToCount(record.achievements)}/28`, 'rc-dim'));
      bests.forEach((best, i) => mine.append(el('p', `${RACE_TRACKS[i].name} · ${Number(best.bestMs) ? formatMs(best.bestMs) : '暂无成绩'}${best.verified ? ' · 已核实' : ''}`, 'rc-best')));
    } catch (err) { if (!dead && id === mineVersion) mine.replaceChildren(el('p', errorMessage(err), 'rc-error')); }
  }
  const unsubscribe = wallet.subscribe(() => {
    const next = sessionKey(wallet);
    if (next !== key) { key = next; void loadMine(); }
  });
  void loadMine(); void loadBoard();
  return { refresh: () => Promise.all([loadMine(), loadBoard()]), destroy() { dead = true; ++mineVersion; ++boardVersion; unsubscribe(); root.remove(); } };
}
