import { t, onLangChange } from '../i18n/i18n.js';
import { readBestGhost } from './ghost-store.js';
import { shortAddr } from '../chain/records.js';
import { decode } from './sim/replay.js';
import { trackHash } from './track/build.js';

// 暂停界面挂在竞速工具栏内，沿用该模式的顶层可见性与层级。
export function mountRaceMenu(container, { onPauseChange, isOverlayOpen = () => false, selectHref = '/?race', roomMode = false, onLeave = () => {} }) {
  let paused = false, restoreFocus;
  const button = document.createElement('button'); button.type = 'button';
  const dialog = document.createElement('section'); dialog.id = 'race-menu'; dialog.hidden = true;
  dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true'); dialog.setAttribute('aria-labelledby', 'race-menu-title');
  const card = document.createElement('div'), title = document.createElement('h2'); title.id = 'race-menu-title';
  const resume = document.createElement('button'); resume.type = 'button';
  const select = document.createElement('a'); select.href = selectHref;
  const home = document.createElement('a'); home.href = '/';
  const note = document.createElement('p');
  card.append(title, resume, ...(roomMode ? [] : [select]), home, note); dialog.append(card); container.append(button, dialog);
  function paint() {
    button.textContent = t('ctl.pause'); button.setAttribute('aria-expanded', String(paused)); button.setAttribute('aria-controls', dialog.id);
    title.textContent = t(roomMode ? 'room.menuTitle' : 'menu.paused'); resume.textContent = t('menu.resume');
    select.textContent = t('race.select'); home.textContent = t('menu.home'); note.textContent = t(roomMode ? 'room.pauseNote' : 'menu.exitNote');
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
  home.onclick = () => onLeave();
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

// 每张选图卡片独立选择影子，排行榜按需读取，下载期间仍可取消。
export function mountGhostOptions(container, def, { record = readBestGhost(def), fetcher = globalThis.fetch } = {}) {
  const group = document.createElement('fieldset'); group.className = 'race-ghost-options';
  const legend = document.createElement('legend'), list = document.createElement('div'), status = document.createElement('p');
  list.className = 'race-ghost-ranked'; list.hidden = true; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const none = document.createElement('button'), best = document.createElement('button'), ranked = document.createElement('button');
  for (const button of [none, best, ranked]) button.type = 'button';
  best.disabled = !record;
  group.append(legend, none, best, ranked, list, status); container.append(group);
  let selected = 'none', selectedReplay = null, name = '', entries = [], loading = false, error = '', dead = false, version = 0, pending = Promise.resolve();
  function paint() {
    if (dead) return;
    legend.textContent = t('race.ghost.title'); none.textContent = t('race.ghost.none');
    best.textContent = t('race.ghost.best') + (record ? ` · ${record.bestLap.toFixed(3)} s` : '');
    ranked.textContent = t('race.ghost.ranked', { n: 'N' }); ranked.disabled = loading;
    none.setAttribute('aria-pressed', String(selected === 'none')); best.setAttribute('aria-pressed', String(selected === 'best'));
    ranked.setAttribute('aria-expanded', String(!list.hidden));
    status.textContent = error || (loading ? t('race.chain.loading') : !list.hidden && !entries.length ? t('race.ghost.empty') : '');
    list.replaceChildren();
    entries.forEach((entry, index) => {
      const button = document.createElement('button'); button.type = 'button';
      button.textContent = `${t('race.ghost.ranked', { n: index + 1 })} · ${shortAddr(entry.address)} · ${(entry.bestMs / 1000).toFixed(3)} s`;
      button.setAttribute('aria-pressed', String(selected === entry.address));
      button.onclick = () => {
        const id = ++version; loading = true; error = ''; paint();
        pending = (async () => {
          try {
            const response = await fetcher(`/api/ghost?trackId=${def.id}&address=${encodeURIComponent(entry.address)}`), replay = await response.json();
            if (!response.ok) throw new Error(replay.error || t('race.ghost.failed'));
            if (replay.trackId !== def.id || replay.track !== trackHash(def) || replay.laps !== def.laps) throw new Error(t('race.ghost.failed'));
            decode(replay);
            if (!dead && id === version) { selected = entry.address; selectedReplay = replay; name = shortAddr(entry.address); }
          } catch (err) { if (!dead && id === version) error = err.message || t('race.ghost.failed'); }
          finally { if (id === version) { loading = false; paint(); } }
        })();
        return pending;
      };
      list.append(button);
    });
  }
  function selectLocal(value) { ++version; pending = Promise.resolve(); loading = false; error = ''; selected = value; selectedReplay = value === 'best' ? record.replay : null; name = ''; paint(); }
  none.onclick = () => selectLocal('none'); best.onclick = () => { if (record) selectLocal('best'); };
  ranked.onclick = async () => {
    list.hidden = !list.hidden;
    if (list.hidden || entries.length) { paint(); return; }
    const id = ++version; loading = true; error = ''; paint();
    try {
      const response = await fetcher(`/api/ghost?trackId=${def.id}`), result = await response.json();
      if (!response.ok || !Array.isArray(result)) throw new Error(result.error || t('race.ghost.failed'));
      if (!dead && id === version) entries = result;
    } catch (err) { if (!dead && id === version) error = err.message || t('race.ghost.failed'); }
    finally { if (id === version) { loading = false; paint(); } }
  };
  const unlang = onLangChange(paint); paint();
  return { get replay() { return selectedReplay; }, get name() { return name; }, get ready() { return pending; }, destroy() { dead = true; ++version; unlang(); group.remove(); } };
}
