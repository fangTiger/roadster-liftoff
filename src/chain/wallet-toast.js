import { t, onLangChange } from '../i18n/i18n.js';
import { el, raceRoot } from './race-ui.js';

export function createSuccessToast(container, { schedule = setTimeout, cancel = clearTimeout } = {}) {
  const slot = el('div'); container.append(slot);
  const root = raceRoot(slot); root.className = 'rc-panel wh-toast'; root.hidden = true;
  root.setAttribute('role', 'status'); root.setAttribute('aria-live', 'polite');
  let timer, message, tokenId, frame;
  function stopFrame() { if (frame != null) globalThis.cancelAnimationFrame?.(frame); frame = null; }
  function place() {
    // 移动端会缩放成就提示，按动画中的实际边界避让，避免硬编码其高度。
    const achievement = document.querySelector?.('#ach-toast.ach-toast-show, #ach-toast.ach-toast-hide');
    root.style.top = `${Math.max(76, (achievement?.getBoundingClientRect().bottom ?? 0) + 12)}px`;
    if (!root.hidden && globalThis.requestAnimationFrame) frame = requestAnimationFrame(place);
  }
  const paint = () => { if (message) root.textContent = '✓ ' + t('wallet.success.' + message, { id: tokenId }); };
  const unlang = onLangChange(paint);
  return {
    show(kind, id) { if (timer !== undefined) cancel(timer); message = kind; tokenId = id; paint(); root.hidden = false; stopFrame(); place(); timer = schedule(() => { root.hidden = true; stopFrame(); }, 3600); },
    destroy() { cancel(timer); stopFrame(); unlang(); slot.remove(); },
  };
}

let toast;
export function showWalletSuccess(kind, id) {
  if (!toast) {
    const host = el('div'); host.id = 'wallet-success-host'; document.body.append(host);
    toast = createSuccessToast(host);
  }
  toast.show(kind, id);
}
