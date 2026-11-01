import { t, onLangChange } from '../i18n/i18n.js';
import { RACE_TRACKS } from './tracks.js';
import { wallet as defaultWallet } from './wallet.js';
import { enabled } from './config.js';
import { formatMs, shortAddr, errorKind } from './records.js';
import { el, raceRoot, dateText } from './race-ui.js';

export function mountRaceBoard(container, { wallet = defaultWallet } = {}) {
  const root = raceRoot(container), tabs = el('nav', null, 'rc-tabs'), board = el('section', null, 'rc-board'), filters = el('nav', null, 'rc-tabs');
  root.className = 'rc-panel rc-leaderboard';
  root.append(el('p', t('race.chain.intro'), 'rc-dim'), tabs, filters, board);
  let verifiedOnly = true, trackId = 1, boardVersion = 0, dead = false;
  const buttons = RACE_TRACKS.map(track => {
    const button = el('button', t('race.track' + track.id), 'rc-button'); button.type = 'button';
    button.onclick = () => { trackId = track.id; return loadBoard(); }; tabs.append(button); return button;
  });
  const filterButtons = [true, false].map(value => {
    const button = el('button', t(value ? 'race.chain.verifiedOnly' : 'race.chain.all'), 'rc-button'); button.type = 'button';
    button.onclick = () => { verifiedOnly = value; return loadBoard(); }; filters.append(button); return button;
  });
  async function loadBoard() {
    if (dead) return;
    const id = ++boardVersion, selected = trackId;
    filterButtons.forEach((button, index) => button.setAttribute('aria-pressed', String(verifiedOnly === (index === 0))));
    for (let i = 0; i < buttons.length; i++) buttons[i].setAttribute('aria-pressed', String(RACE_TRACKS[i].id === selected));
    board.replaceChildren(el('p', enabled ? t('race.chain.loadingBoard') : t('race.chain.unconfigured'), 'rc-dim'));
    if (!enabled) return;
    try {
      const rows = (await wallet.readLeaderboard(selected, { verifiedOnly })).filter(row => !verifiedOnly || row.verified === true).slice(0, 50);
      if (dead || id !== boardVersion) return;
      if (!rows.length) { board.replaceChildren(el('p', t('race.chain.empty'), 'rc-dim')); return; }
      const scroll = el('div', null, 'rc-scroll'), table = el('table', null, 'rc-table'), head = el('thead'), header = el('tr'), body = el('tbody');
      for (const label of [t('race.chain.rank'), t('race.chain.player'), t('race.chain.best'), t('race.chain.date'), t('race.chain.verification')]) { const th = el('th', label); th.scope = 'col'; header.append(th); }
      head.append(header);
      rows.forEach((row, i) => {
        const tr = el('tr');
        for (const text of [i + 1, shortAddr(row.address), formatMs(row.bestMs), dateText(row.updatedAt), row.verified ? t('race.chain.verified') : t('race.chain.selfReported')]) tr.append(el('td', text));
        const player = el('a', shortAddr(row.address), 'rc-link'); player.href = '/?profile&address=' + encodeURIComponent(row.address); player.title = row.address; tr.children[1].replaceChildren(player); body.append(tr);
      });
      table.append(head, body); scroll.append(table); board.replaceChildren(scroll);
    } catch (err) {
      if (!dead && id === boardVersion) {
        const retry = el('button', t('race.chain.retryBoard'), 'rc-button'); retry.onclick = loadBoard;
        board.replaceChildren(el('p', t('race.error.' + errorKind(err)), 'rc-error'), retry);
      }
    }
  }
  const unlang = onLangChange(() => {
    root.children[0].textContent = t('race.chain.intro');
    buttons.forEach((button, i) => { button.textContent = t('race.track' + RACE_TRACKS[i].id); });
    filterButtons.forEach((button, index) => { button.textContent = t(index === 0 ? 'race.chain.verifiedOnly' : 'race.chain.all'); });
    void loadBoard();
  });
  void loadBoard();
  return { refresh: loadBoard, destroy() { dead = true; ++boardVersion; unlang(); root.remove(); } };
}
