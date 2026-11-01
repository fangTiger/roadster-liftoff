import { t, onLangChange } from '../i18n/i18n.js';
import { chain } from './config.js';
import { wallet as defaultWallet } from './wallet.js';
import { shortAddr, errorKind } from './records.js';
import { el, link, raceRoot } from './race-ui.js';

const navigateTo = href => globalThis.location.assign(href);
// 保留调用接口，旧弹窗由独立主页取代。
export const openMyNFT = options => openProfile({ ...options, tab: 'profile' });
export function openProfile({ tab = 'profile', navigate = navigateTo } = {}) {
  navigate('/?profile' + (tab === 'leaderboard' ? '&tab=leaderboard' : ''));
}
export function mountWalletHub(container, { wallet = defaultWallet, navigate = navigateTo } = {}) {
  const slot = el('div'); slot.id = 'wallet-hub-host'; container.append(slot);
  const root = raceRoot(slot), button = el('button', null, 'rc-button wh-button'), menu = el('details', null, 'wh-menu'), summary = el('summary', '⋯', 'rc-button'), actions = el('div', null, 'wh-menu-actions'), status = el('p', null, 'rc-error');
  root.className = 'rc-panel wh-hub'; root.id = 'wallet-hub'; status.setAttribute('role', 'status'); button.type = 'button'; menu.append(summary, actions); root.append(button, menu, status);
  let busy = false, error = '', key = '', dead = false;
  async function run(action) {
    if (busy || dead) return; busy = true; error = ''; paint();
    try { await action(); } catch (err) { if (!dead) error = 'race.error.' + errorKind(err); }
    finally { busy = false; paint(); }
  }
  function paint() {
    if (dead) return;
    const { account, chainId } = wallet.state, wrong = account && chainId !== chain.id;
    button.replaceChildren(); const icon = el('span', '▣', 'wh-icon'); icon.setAttribute('aria-hidden', 'true');
    button.append(icon, el('span', account ? shortAddr(account) : t('race.chain.connect'), 'wh-label'), el('span', account ? `${account.slice(0, 4)}…${account.slice(-2)}` : t('wallet.short'), 'wh-short'));
    if (account) button.append(el('span', wrong ? '!' : chain.name, 'wh-network'));
    button.setAttribute('aria-label', account ? `${shortAddr(account)} · ${t('wallet.profile')} · ${wrong ? t('wallet.switch', { network: chain.name }) : chain.name}` : t('race.chain.connect'));
    button.setAttribute('data-warning', String(!!wrong)); button.disabled = busy;
    menu.hidden = !account; summary.setAttribute('aria-label', t('wallet.short')); actions.replaceChildren();
    if (account) {
      const board = el('a', t('wallet.leaderboard'), 'rc-link'); board.href = '/?profile&tab=leaderboard';
      actions.append(board, link(t('wallet.address'), `${chain.blockExplorers.default.url}/address/${account}`));
      if (wrong) { const change = el('button', t('wallet.switch', { network: chain.name }), 'rc-button'); change.type = 'button'; change.disabled = busy; change.onclick = () => run(() => wallet.switchNetwork()); actions.append(change); }
      const disconnect = el('button', t('wallet.disconnect'), 'rc-button'); disconnect.type = 'button'; disconnect.disabled = busy; disconnect.onclick = () => run(() => wallet.disconnect()); actions.append(disconnect);
    }
    status.textContent = error ? t(error) : ''; status.hidden = !error;
  }
  button.onclick = () => wallet.state.account ? openProfile({ navigate }) : run(() => wallet.connect());
  function outside(event) { if (!root.contains(event.target)) menu.open = false; }
  function onKey(event) { if (event.key === 'Escape' && menu.open) { menu.open = false; summary.focus(); event.stopPropagation(); } }
  document.addEventListener('pointerdown', outside); root.addEventListener('keydown', onKey);
  const unsubscribe = wallet.subscribe(() => { if (key !== wallet.state.account) { key = wallet.state.account; error = ''; menu.open = false; } paint(); }), unlang = onLangChange(paint); key = wallet.state.account; paint();
  return { destroy() { dead = true; unsubscribe(); unlang(); document.removeEventListener('pointerdown', outside); root.removeEventListener('keydown', onKey); slot.remove(); } };
}
