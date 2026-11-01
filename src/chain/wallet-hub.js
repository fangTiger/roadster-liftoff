import { t, onLangChange } from '../i18n/i18n.js';
import { chain } from './config.js';
import { wallet as defaultWallet } from './wallet.js';
import { shortAddr, errorKind } from './records.js';
import { el, link, raceRoot } from './race-ui.js';
import { mountNFTCard } from './nft-card.js';
import { mountRaceBoard } from './race-board.js';

let activeModal = null;
export const openMyNFT = options => openProfile({ ...options, tab: 'mine' });
export function openProfile({ wallet = defaultWallet, tab = 'mine' } = {}) {
  activeModal?.destroy();
  const restoreFocus = document.activeElement, root = el('div', null, 'wh-layer'), box = el('div'), header = el('div', null, 'wh-header'), title = el('h2', null, 'rc-title'), close = el('button', '×', 'rc-button'), tabs = el('nav', null, 'rc-tabs wh-tabs'), slot = el('div');
  const panel = raceRoot(box); panel.className = 'rc-panel wh-dialog';
  root.id = 'wallet-profile-layer'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-labelledby', 'wallet-profile-title'); title.id = 'wallet-profile-title'; close.type = 'button';
  header.append(title, close); tabs.setAttribute('role', 'tablist'); panel.append(header, tabs, slot); root.append(box); document.body.append(root);
  let selected = tab === 'leaderboard' ? tab : 'mine', content, busy = false, error = '', dead = false;
  const buttons = ['mine', 'leaderboard'].map(value => {
    const button = el('button', null, 'rc-button'); button.type = 'button'; button.id = 'profile-tab-' + value;
    button.setAttribute('role', 'tab'); button.setAttribute('aria-controls', 'profile-content');
    button.onclick = () => { selected = value; mountContent(); paint(); }; tabs.append(button); return button;
  });
  slot.id = 'profile-content'; slot.setAttribute('role', 'tabpanel');
  tabs.onkeydown = event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); const index = selected === 'mine' ? 0 : 1;
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - index;
    buttons[next].onclick(); buttons[next].focus();
  };
  async function run(action) {
    if (busy || dead) return; busy = true; error = ''; paintAccount();
    try { await action(); } catch (err) { if (!dead) error = 'race.error.' + errorKind(err); }
    finally { busy = false; if (!dead) paintAccount(); }
  }
  let accountSlot;
  function paintAccount() {
    if (!accountSlot || dead) return;
    accountSlot.replaceChildren(); const { account, chainId } = wallet.state;
    if (account) {
      accountSlot.append(el('p', account, 'wh-address'), el('p', t('wallet.network', { network: chainId === chain.id ? chain.name : String(chainId ?? '—') }), 'rc-dim'), link(t('wallet.address'), `${chain.blockExplorers.default.url}/address/${account}`));
      const actions = el('div', null, 'wh-actions');
      if (chainId !== chain.id) { const change = el('button', t('wallet.switch', { network: chain.name }), 'rc-button'); change.type = 'button'; change.disabled = busy; change.onclick = () => run(() => wallet.switchNetwork()); actions.append(change); }
      const disconnect = el('button', t('wallet.disconnect'), 'rc-button'); disconnect.type = 'button'; disconnect.disabled = busy; disconnect.onclick = () => run(() => wallet.disconnect()); actions.append(disconnect); accountSlot.append(actions);
    }
    if (error) { const status = el('p', t(error), 'rc-error'); status.setAttribute('role', 'status'); accountSlot.append(status); }
  }
  function mountContent() {
    content?.destroy(); slot.replaceChildren(); accountSlot = null;
    slot.setAttribute('aria-labelledby', 'profile-tab-' + selected);
    if (selected === 'leaderboard') content = mountRaceBoard(slot, { wallet });
    else { accountSlot = el('div', null, 'wh-account'); const nft = el('div'); slot.append(accountSlot, nft); content = mountNFTCard(nft, { wallet }); paintAccount(); }
  }
  function paint() {
    title.textContent = t('wallet.profile'); close.setAttribute('aria-label', t('menu.close')); tabs.setAttribute('aria-label', t('wallet.profile'));
    buttons.forEach((button, index) => { const active = (index === 0 ? 'mine' : 'leaderboard') === selected;
      button.textContent = t(index === 0 ? 'wallet.mine' : 'wallet.leaderboard'); button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1;
    }); paintAccount();
  }
  function onKey(event) {
    if (document.querySelector?.('[data-rk] [role="dialog"], w3m-modal.open')) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); modal.destroy(); return; }
    // 在文档捕获阶段隔离游戏快捷键，并让 Tab 留在对话框内。
    if (event.key === 'Tab') {
      const items = [...root.querySelectorAll('button,a')].filter(node => !node.disabled && !node.closest('[hidden]'));
      const first = items[0], last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    if (tabs.contains(event.target)) tabs.onkeydown(event);
    event.stopImmediatePropagation();
  }
  const unsubscribe = wallet.subscribe(paintAccount);
  const unlang = onLangChange(paint), modal = { root, destroy() {
    if (dead) return; dead = true; content?.destroy(); unsubscribe(); unlang(); document.removeEventListener('keydown', onKey, true); root.remove();
    if (activeModal === modal) activeModal = null;
    restoreFocus?.focus?.({ preventScroll: true });
  } };
  close.onclick = modal.destroy; root.onclick = event => { if (event.target === root) modal.destroy(); };
  document.addEventListener('keydown', onKey, true); globalThis.window?.dispatchEvent(new Event('blur'));
  activeModal = modal; mountContent(); paint(); close.focus({ preventScroll: true }); return modal;
}

export function mountWalletHub(container, { wallet = defaultWallet } = {}) {
  const slot = el('div'); slot.id = 'wallet-hub-host'; container.append(slot);
  const root = raceRoot(slot), button = el('button', null, 'rc-button wh-button'), status = el('p', null, 'rc-error');
  root.className = 'rc-panel wh-hub'; root.id = 'wallet-hub'; status.setAttribute('role', 'status'); button.type = 'button'; button.setAttribute('aria-haspopup', 'dialog');
  root.append(button, status);
  let busy = false, error = '', key = '', dead = false;
  async function connect() {
    if (busy || dead) return; busy = true; error = ''; paint();
    try { await wallet.connect(); } catch (err) { if (!dead) error = 'race.error.' + errorKind(err); }
    finally { busy = false; paint(); }
  }
  function paint() {
    if (dead) return;
    const { account, chainId } = wallet.state, wrong = account && chainId !== chain.id;
    button.replaceChildren(); const icon = el('span', '▣', 'wh-icon'); icon.setAttribute('aria-hidden', 'true');
    button.append(icon, el('span', account ? shortAddr(account) : t('race.chain.connect'), 'wh-label'), el('span', account ? `${account.slice(0, 4)}…${account.slice(-2)}` : t('wallet.short'), 'wh-short'));
    if (account) button.append(el('span', wrong ? '!' : chain.name, 'wh-network'));
    button.setAttribute('aria-label', account ? `${shortAddr(account)} · ${wrong ? t('wallet.switch', { network: chain.name }) : chain.name}` : t('race.chain.connect'));
    button.setAttribute('data-warning', String(!!wrong)); button.disabled = busy;
    status.textContent = error ? t(error) : ''; status.hidden = !error;
  }
  button.onclick = () => wallet.state.account ? openProfile({ wallet }) : connect();
  const unsubscribe = wallet.subscribe(() => {
    if (key !== wallet.state.account) { key = wallet.state.account; error = ''; }
    paint();
  }), unlang = onLangChange(paint); key = wallet.state.account; paint();
  return { destroy() { dead = true; unsubscribe(); unlang(); slot.remove(); } };
}
