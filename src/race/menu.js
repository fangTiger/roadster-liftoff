import { t, onLangChange } from '../i18n/i18n.js';
import { readBestGhost } from './ghost-store.js';

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

// 每张选图卡片独立选择影子；排行榜选项留给第二批启用。
export function mountGhostOptions(container, def, { record = readBestGhost(def) } = {}) {
  const group = document.createElement('fieldset'); group.className = 'race-ghost-options';
  const legend = document.createElement('legend');
  const none = document.createElement('button'), best = document.createElement('button'), ranked = document.createElement('button');
  for (const button of [none, best, ranked]) button.type = 'button';
  best.disabled = !record; ranked.disabled = true;
  group.append(legend, none, best, ranked); container.append(group);
  let selected = false;
  function paint() {
    legend.textContent = t('race.ghost.title'); none.textContent = t('race.ghost.none');
    best.textContent = t('race.ghost.best') + (record ? ` · ${record.bestLap.toFixed(3)} s` : '');
    ranked.textContent = t('race.ghost.ranked', { n: 'N' }); ranked.title = t('race.ghost.comingSoon');
    none.setAttribute('aria-pressed', String(!selected)); best.setAttribute('aria-pressed', String(selected));
  }
  none.onclick = () => { selected = false; paint(); };
  best.onclick = () => { if (record) { selected = true; paint(); } };
  const unlang = onLangChange(paint); paint();
  return { get replay() { return selected ? record.replay : null; }, destroy() { unlang(); group.remove(); } };
}
