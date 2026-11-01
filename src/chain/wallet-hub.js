import { t, onLangChange } from '../i18n/i18n.js';
import { chain } from './config.js';
import { wallet as defaultWallet } from './wallet.js';
import { shortAddr, errorKind } from './records.js';
import { el, link, raceRoot } from './race-ui.js';
import { mountNFTCard } from './nft-card.js';

let activeModal = null;
export function openMyNFT({ wallet = defaultWallet } = {}) {
  activeModal?.destroy();
  const restoreFocus = document.activeElement, root = el('div', null, 'wh-layer'), box = el('div'), header = el('div', null, 'wh-header'), title = el('h2', null, 'rc-title'), close = el('button', '×', 'rc-button'), slot = el('div');
  const panel = raceRoot(box); panel.className = 'rc-panel wh-dialog';
  root.id = 'wallet-nft-layer'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-labelledby', 'wallet-nft-title'); title.id = 'wallet-nft-title'; close.type = 'button';
  header.append(title, close); panel.append(header, slot); root.append(box); document.body.append(root);
  const card = mountNFTCard(slot, { wallet });
  function paint() { title.textContent = t('wallet.myNFT'); close.setAttribute('aria-label', t('menu.close')); }
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
    event.stopImmediatePropagation();
  }
  let dead = false;
  const unlang = onLangChange(paint), modal = { root, destroy() {
    if (dead) return; dead = true; card.destroy(); unlang(); document.removeEventListener('keydown', onKey, true); root.remove();
    if (activeModal === modal) activeModal = null;
    restoreFocus?.focus?.({ preventScroll: true });
  } };
  close.onclick = modal.destroy; root.onclick = event => { if (event.target === root) modal.destroy(); };
  document.addEventListener('keydown', onKey, true); globalThis.window?.dispatchEvent(new Event('blur'));
  activeModal = modal; paint(); close.focus({ preventScroll: true }); return modal;
}

export function mountWalletHub(container, { wallet = defaultWallet } = {}) {
  const slot = el('div'); slot.id = 'wallet-hub-host'; container.append(slot);
  const root = raceRoot(slot), button = el('button', null, 'rc-button wh-button'), menu = el('div', null, 'wh-menu'), status = el('p', null, 'rc-error');
  root.className = 'rc-panel wh-hub'; root.id = 'wallet-hub'; status.setAttribute('role', 'status'); button.type = 'button'; button.setAttribute('aria-controls', 'wallet-hub-menu'); menu.id = 'wallet-hub-menu';
  root.append(button, menu, status);
  let expanded = false, busy = false, error = '', key = '', dead = false;
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
    button.setAttribute('aria-label', account ? `${shortAddr(account)} · ${wrong ? t('wallet.switch', { network: chain.name }) : chain.name}` : t('race.chain.connect'));
    button.setAttribute('aria-expanded', String(expanded)); button.setAttribute('data-warning', String(!!wrong)); button.disabled = busy;
    menu.hidden = !expanded || !account; menu.replaceChildren();
    const mine = el('button', t('wallet.myNFT'), 'rc-button'); mine.type = 'button'; mine.onclick = () => { expanded = false; paint(); openMyNFT({ wallet }); };
    menu.append(mine, link(t('wallet.address'), `${chain.blockExplorers.default.url}/address/${account}`));
    if (wrong) { const change = el('button', t('wallet.switch', { network: chain.name }), 'rc-button'); change.type = 'button'; change.disabled = busy; change.onclick = () => run(() => wallet.switchNetwork()); menu.append(change); }
    const disconnect = el('button', t('wallet.disconnect'), 'rc-button'); disconnect.type = 'button'; disconnect.disabled = busy; disconnect.onclick = () => run(() => wallet.disconnect()); menu.append(disconnect);
    status.textContent = error ? t(error) : ''; status.hidden = !error;
  }
  button.onclick = () => {
    if (!wallet.state.account) return run(() => wallet.connect());
    expanded = !expanded; paint(); if (expanded) globalThis.window?.dispatchEvent(new Event('blur'));
  };
  function outside(event) { if (!root.contains(event.target)) { expanded = false; paint(); } }
  function onKey(event) {
    if (!expanded) return;
    if (event.key === 'Escape') { expanded = false; paint(); button.focus(); event.preventDefault(); }
    event.stopImmediatePropagation();
  }
  document.addEventListener('pointerdown', outside); document.addEventListener('keydown', onKey, true);
  const unsubscribe = wallet.subscribe(() => {
    if (key !== wallet.state.account) { key = wallet.state.account; expanded = false; error = ''; }
    paint();
  }), unlang = onLangChange(paint); key = wallet.state.account; paint();
  return { destroy() { dead = true; unsubscribe(); unlang(); document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', onKey, true); slot.remove(); } };
}
