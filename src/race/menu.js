import { t, onLangChange } from '../i18n/i18n.js';

// 暂停界面挂在竞速工具栏内，沿用该模式的顶层可见性与层级。
export function mountRaceMenu(container, { onPauseChange, isOverlayOpen = () => false, selectHref = '/?race' }) {
  let paused = false, restoreFocus;
  const button = document.createElement('button'); button.type = 'button';
  const dialog = document.createElement('section'); dialog.id = 'race-menu'; dialog.hidden = true;
  dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true'); dialog.setAttribute('aria-labelledby', 'race-menu-title');
  const card = document.createElement('div'), title = document.createElement('h2'); title.id = 'race-menu-title';
  const resume = document.createElement('button'); resume.type = 'button';
  const select = document.createElement('a'); select.href = selectHref;
  const home = document.createElement('a'); home.href = '/';
  const note = document.createElement('p');
  card.append(title, resume, select, home, note); dialog.append(card); container.append(button, dialog);
  function paint() {
    button.textContent = t('ctl.pause'); button.setAttribute('aria-expanded', String(paused)); button.setAttribute('aria-controls', dialog.id);
    title.textContent = t('menu.paused'); resume.textContent = t('menu.resume');
    select.textContent = t('race.select'); home.textContent = t('menu.home'); note.textContent = t('menu.exitNote');
  }
  function setPaused(value) {
    if (paused === value) return;
    paused = value; dialog.hidden = !value; paint();
    if (value) restoreFocus = document.activeElement;
    window.dispatchEvent(new Event('blur'));
    onPauseChange(value);
    if (value) resume.focus();
    else { document.activeElement?.blur(); restoreFocus?.focus?.({ preventScroll: true }); }
  }
  button.onclick = () => setPaused(true); resume.onclick = () => setPaused(false);
  function onKey(event) {
    if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey || isOverlayOpen()) return;
    if (!paused && event.target.closest?.('input,select,textarea,[contenteditable="true"]')) return;
    if (['Escape', 'KeyP'].includes(event.code)) {
      event.preventDefault(); event.stopImmediatePropagation();
      if (!event.repeat) setPaused(!paused);
      return;
    }
    if (!paused) return;
    event.stopImmediatePropagation();
    if (event.key === 'Tab') {
      if (event.shiftKey && document.activeElement === resume) { event.preventDefault(); home.focus(); }
      else if (!event.shiftKey && document.activeElement === home) { event.preventDefault(); resume.focus(); }
    }
  }
  window.addEventListener('keydown', onKey, true);
  const unlang = onLangChange(paint); paint();
  return {
    get paused() { return paused; },
    destroy() { if (paused) setPaused(false); window.removeEventListener('keydown', onKey, true); unlang(); button.remove(); dialog.remove(); },
  };
}
