// 独立界面外壳：只管理交互与设置，不接管游戏循环。
const STORE = 'liftoff.ui.v1';
import { QUALITY_PRESETS as PRESETS, getDefaultPreset } from '../mobile/perf.js';
import { t, applyI18n, onLangChange, mountLangToggle } from '../i18n/i18n.js';
// 文字都走多语言词条：L(key) 生成带 data-i18n 的片段，切换语言时由 applyI18n 原地刷新
const L = key => `<span data-i18n="${key}">${t(key)}</span>`;
const CONTROLS = [
  ['W', 'ctl.throttle'], ['S', 'ctl.brake'], ['A / D', 'ctl.steer'], ['key.space', 'ctl.jet'],
  ['R', 'ctl.roll'], ['C', 'ctl.camera'], ['M', 'ctl.mute'], ['H', 'ctl.horn'], ['P / Esc', 'ctl.pause'],
  ['F', 'ctl.fullscreen'], ['K', 'ctl.screenshot'], ['/', 'ctl.help'],
];
const controlsHTML = () => `<dl class="ui-controls">${CONTROLS.map(([key, text]) => `<div><dt><kbd>${key.startsWith('key.') ? L(key) : key}</kbd></dt><dd>${L(text)}</dd></div>`).join('')}</dl>`;

export function createUI({ engine, audio = null, onStart = () => {}, onPauseChange = () => {}, onQualityChange = () => {}, onSummary = null, isOverlayOpen = () => false }) {
  const settings = { quality: getDefaultPreset(), volume: .8, muted: audio?.muted ?? false, shake: true, hints: true };
  try {
    const saved = JSON.parse(localStorage.getItem(STORE));
    if (PRESETS.includes(saved?.quality)) settings.quality = saved.quality;
    if (Number.isFinite(saved?.volume)) settings.volume = Math.max(0, Math.min(1, saved.volume));
    for (const key of ['muted', 'shake', 'hints']) if (typeof saved?.[key] === 'boolean') settings[key] = saved[key];
  } catch { /* 私密模式或损坏的数据不影响游玩。 */ }
  let started = false, ready = false, paused = false, panel = '', helpReturn = '', restoreFocus = null;
  let toastTimer, fadeTimer;
  const root = document.createElement('div');
  root.id = 'liftoff-ui';
  root.innerHTML = `
    <section class="ui-overlay ui-loading" aria-labelledby="ui-title" role="dialog" aria-modal="true" tabindex="-1">
      <div class="ui-start-content">
        <div class="ui-start-lang"></div><div class="ui-eyebrow">${L('start.eyebrow')}</div>
        <h1 id="ui-title">Mars <span>Roadster</span></h1>
        <p class="ui-subtitle">${L('start.subtitle')}</p>
        <div class="ui-launch-status">
          <div class="ui-progress-wrap"><div class="ui-progress-label"><span role="status">${t('load.ready')}</span><span class="ui-percent">0%</span></div><div class="ui-progress" role="progressbar" aria-label="${t('load.progress')}" data-i18n-attr="aria-label:load.progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div></div>
          <div class="ui-start" hidden><button data-mode="race">${L('mode.race')}</button><button data-mode="room">${L('mode.room')}</button><button data-mode="space">${L('mode.space')}</button><button data-mode="season" class="ui-season">${L('mode.season')}</button></div>
        </div>
        <div class="g ui-control-panel"><h2>${L('start.guide')} <span>${L('start.guideSub')}</span></h2>${controlsHTML()}</div>
        <footer>${L('credit.author')} Captain@mycndota · Built with Arc Studio + Claude Code <a href="https://github.com/fangTiger/roadster-liftoff/blob/main/CREDITS.md" target="_blank" rel="noopener noreferrer">${L('start.credits')} ↗</a></footer>
      </div>
    </section>
    <section class="ui-overlay ui-modal" hidden role="dialog" aria-modal="true" aria-labelledby="ui-panel-title" tabindex="-1">
      <div class="g ui-card"><header><div><p class="ui-eyebrow">Mars Roadster</p><h2 id="ui-panel-title">${t('menu.paused')}</h2></div><button class="ui-close" aria-label="${t('menu.close')}" data-i18n-attr="aria-label:menu.close">×</button></header>
        <div data-panel="pause"><p class="ui-note">${L('menu.note')}</p><div class="ui-actions"><button class="ui-primary" data-action="resume">${L('menu.resume')}</button><button data-action="summary">${L('menu.summary')}</button><button data-action="settings">${L('menu.settings')}</button><button data-action="help">${L('menu.help')}</button><a class="ui-home" href="/">${L('menu.home')}</a></div><p class="ui-footnote">${L('menu.resumeHint')}<br>${L('menu.exitNote')}</p></div>
        <div data-panel="settings" hidden>
          <fieldset><legend>${L('set.quality')}</legend><div class="ui-quality">${PRESETS.map(p => `<button data-quality="${p}" aria-pressed="false">${L('quality.' + p)}</button>`).join('')}</div></fieldset>
          <label class="ui-setting ui-volume"><span>${L('set.volume')} <output id="ui-volume-output"></output></span><input aria-label="${t('set.volume')}" data-i18n-attr="aria-label:set.volume" type="range" min="0" max="1" step="0.01" data-setting="volume"></label>
          <label class="ui-setting"><span>${L('set.mute')}</span><input type="checkbox" role="switch" data-setting="muted"><i></i></label>
          <label class="ui-setting"><span>${L('set.shake')}</span><input type="checkbox" role="switch" data-setting="shake"><i></i></label>
          <label class="ui-setting"><span>${L('set.hints')}</span><input type="checkbox" role="switch" data-setting="hints"><i></i></label>
          <p class="ui-footnote">${L('set.saved')}</p><button class="ui-back" data-action="back">${L('set.back')}</button>
        </div>
        <div data-panel="help" hidden>${controlsHTML()}<p class="ui-howto">${L('help.howto')}</p><button class="ui-back" data-action="help-close">${L('help.back')}</button></div>
      </div>
    </section>
    <div class="ui-flash" aria-hidden="true"></div><div class="g ui-toast" role="status" hidden></div>`;
  document.body.append(root);
  mountLangToggle(root.querySelector('.ui-start-lang'), { injectCss: false });
  // 主入口没有移动端视口声明时补充，避免更改现有标记。
  if (!document.querySelector('meta[name="viewport"]')) {
    const meta = document.createElement('meta'); meta.name = 'viewport'; meta.content = 'width=device-width, initial-scale=1'; document.head.append(meta);
  }
  const $ = selector => root.querySelector(selector);
  const loading = $('.ui-loading'), modal = $('.ui-modal');
  onLangChange(() => { if (panel) $('#ui-panel-title').textContent = t(panel === 'settings' ? 'menu.settings' : panel === 'help' ? 'menu.help' : 'menu.paused'); });
  const background = new Map();
  function syncBackground() {
    const blocked = !started || !!panel;
    for (const el of document.body.children) {
      if (el === root || el.tagName === 'SCRIPT') continue;
      if (blocked && !background.has(el)) { background.set(el, el.inert); el.inert = true; }
    }
    if (!blocked) { for (const [el, inert] of background) el.inert = inert; background.clear(); }
  }
  function persist() { try { localStorage.setItem(STORE, JSON.stringify(settings)); } catch { /* 存储不可用时保留当前会话设置。 */ } }
  function applyQuality() {
    // "自动"档交给游戏侧的自适应画质（src/mobile/perf.js）处理
    if (settings.quality === '自动') { onQualityChange('自动'); return; }
    const ratio = settings.quality === '高' ? Math.min(devicePixelRatio || 1, 1.5) : settings.quality === '极致' ? Math.min(devicePixelRatio || 1, 2) : 1;
    engine.renderer.setPixelRatio(ratio);
    if (engine.renderer.shadowMap) engine.renderer.shadowMap.enabled = settings.quality !== '低';
    if (engine.bloom) engine.bloom.enabled = settings.quality !== '低';
    engine.composer?.setPixelRatio?.(ratio);
    engine.composer?.setSize(innerWidth, innerHeight);
    onQualityChange(settings.quality);
  }
  function paintSettings() {
    for (const button of root.querySelectorAll('[data-quality]')) button.setAttribute('aria-pressed', String(button.dataset.quality === settings.quality));
    for (const input of root.querySelectorAll('[data-setting]')) {
      const key = input.dataset.setting;
      if (key === 'volume') input.value = settings.volume;
      else input.checked = settings[key];
    }
    $('#ui-volume-output').textContent = `${Math.round(settings.volume * 100)}%`;
    const keys = document.getElementById('keys');
    if (keys) keys.classList.toggle('ui-hints-hidden', !settings.hints);
  }
  function openPanel(next) {
    if (next && !panel) restoreFocus = document.activeElement;
    panel = next;
    modal.hidden = !next;
    for (const el of root.querySelectorAll('[data-panel]')) el.hidden = el.dataset.panel !== next;
    $('#ui-panel-title').textContent = t(next === 'settings' ? 'menu.settings' : next === 'help' ? 'menu.help' : 'menu.paused');
    syncBackground();
    if (next) { paintSettings(); modal.scrollTop = 0; $('.ui-close').focus({ preventScroll: true }); }
    else {
      // 隐藏面板后立即释放焦点，避免下一次快捷键仍指向已隐藏按钮。
      document.activeElement?.blur();
      if (restoreFocus?.isConnected && !restoreFocus.closest('#liftoff-ui')) restoreFocus.focus({ preventScroll: true });
    }
  }
  function setPaused(value) {
    value = Boolean(value);
    if (paused === value) return;
    if (value) {
      settings.muted = audio?.muted ?? settings.muted;
      persist(); paused = true;
      // 输入模块在失焦时清空按键，防止暂停前的油门粘住。
      window.dispatchEvent(new Event('blur'));
      audio?.setMuted(true);
      if (started) openPanel('pause');
    } else { paused = false; audio?.setMuted(settings.muted); openPanel(''); }
    onPauseChange(paused);
  }
  function showSettings() {
    if (!started) return;
    if (!paused) setPaused(true);
    openPanel('settings');
  }
  function toggleHelp() {
    if (!started) return;
    if (panel === 'help') { openPanel(helpReturn); return; }
    helpReturn = panel;
    window.dispatchEvent(new Event('blur'));
    openPanel('help');
  }
  function closePanel() {
    if (panel === 'help') openPanel(helpReturn);
    else if (panel === 'settings') openPanel('pause');
    else setPaused(false);
  }
  function toast(text) {
    const el = $('.ui-toast'); el.textContent = text; el.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 2200);
  }
  function screenshot() {
    return new Promise(resolve => {
      try {
        // 必须同一任务先渲染再读回，兼容未保留绘图缓冲区的 WebGL。
        engine.render();
        engine.renderer.domElement.toBlob(blob => {
          if (!blob) { toast(t('toast.shotFail')); resolve(false); return; }
          const now = new Date(), pad = n => String(n).padStart(2, '0');
          const filename = `mars-roadster-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.png`;
          const url = URL.createObjectURL(blob), link = document.createElement('a');
          link.href = url; link.download = filename; link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          const flash = $('.ui-flash'); flash.classList.remove('ui-flashing'); void flash.offsetWidth; flash.classList.add('ui-flashing');
          toast(t('toast.shotSaved')); resolve(true);
        }, 'image/png');
      } catch { toast(t('toast.shotFail')); resolve(false); }
    });
  }
  function fullscreen() {
    try {
      const task = document.fullscreenElement ? document.exitFullscreen?.() : document.documentElement.requestFullscreen?.();
      if (!task) { toast(t('toast.noFullscreen')); return; }
      task.catch(() => toast(t('toast.fullscreenFail')));
    } catch { toast(t('toast.fullscreenFail')); }
  }
  function start() {
    if (!ready || started) return;
    // 解锁必须在用户手势内同步调用，不等待音频 Promise。
    try { audio?.unlock()?.catch(() => toast(t('toast.noAudio'))); } catch { toast(t('toast.noAudio')); }
    started = true; loading.classList.add('ui-leaving'); loading.inert = true;
    document.activeElement?.blur();
    syncBackground();
    fadeTimer = setTimeout(() => { loading.hidden = true; }, 600);
    if (paused) openPanel('pause');
    onStart();
  }
  loading.addEventListener('click', e => {
    const mode = e.target.closest('[data-mode]')?.dataset.mode;
    if (mode === 'race') { location.href = '/?race'; return; }
    if (mode === 'room') { location.href = '/?race&room'; return; }
    if (mode === 'season') { toast(t('mode.soon')); return; }
    if (mode === 'space' || !e.composedPath().some(node => node.matches?.('a,button,[role="button"]'))) start();
  });
  root.addEventListener('click', e => {
    const button = e.target.closest('button'); if (!button) return;
    if (button.dataset.quality) { settings.quality = button.dataset.quality; applyQuality(); persist(); paintSettings(); }
    const actions = { resume: () => setPaused(false), summary: () => { setPaused(false); onSummary?.(); }, settings: showSettings, help: toggleHelp, back: () => openPanel('pause'), 'help-close': closePanel };
    actions[button.dataset.action]?.();
    if (button.classList.contains('ui-close')) closePanel();
  });
  root.addEventListener('input', e => {
    const key = e.target.dataset.setting; if (!key) return;
    settings[key] = key === 'volume' ? Number(e.target.value) : e.target.checked;
    if (key === 'volume') audio?.setVolume(settings.volume);
    if (key === 'muted') audio?.setMuted(paused || settings.muted);
    persist(); paintSettings();
  });
  const tools = document.getElementById('tools');
  const toolActions = [screenshot, null, fullscreen, showSettings, toggleHelp];
  const toolNames = ['tool.screenshot', 'tool.mute', 'tool.fullscreen', 'tool.settings', 'tool.help'];
  tools?.querySelectorAll('span').forEach((el, i) => {
    if (!toolNames[i]) return;                                // 工具栏后面追加的按钮（如语言切换）自己处理
    el.tabIndex = 0; el.setAttribute('role', 'button'); el.setAttribute('aria-label', t(toolNames[i])); el.title = t(toolNames[i]);
    el.dataset.i18nAttr = `aria-label:${toolNames[i]};title:${toolNames[i]}`;
    if (toolActions[i]) el.addEventListener('click', toolActions[i]);
    // 音符只转发原有点击，不额外绑定静音逻辑。
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); el.click(); } });
  });
  window.addEventListener('keydown', e => {
    if (e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
    if (!started) {
      if (e.key === 'Tab') return;
      if (e.target.closest?.('a,button,[role="button"]')) return;
      e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) start(); return;
    }
    if (isOverlayOpen()) return;                              // 外部面板打开时，按键交给面板自己处理
    const editing = e.target.matches?.('input,select,textarea,[contenteditable="true"]');
    if (e.code === 'Escape' || (!editing && e.code === 'KeyP')) {
      e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) { if (panel) closePanel(); else setPaused(!paused); } return;
    }
    if (!editing && e.code === 'Slash') {
      e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) toggleHelp(); return;
    }
    if (panel) {
      e.stopImmediatePropagation();
      if (e.key === 'Tab') {
        const focusable = [...modal.querySelectorAll('button,input,a')].filter(el => !el.closest('[hidden]') && !el.disabled);
        const first = focusable[0], last = focusable.at(-1);
        if (e.shiftKey && (document.activeElement === first || document.activeElement === modal)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
      return;
    }
    if (editing || e.target.closest?.('[role="button"],button,a')) return;
    if (e.code === 'KeyF' || e.code === 'KeyK') { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) { if (e.code === 'KeyF') fullscreen(); else void screenshot(); } }
  }, true);
  document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });
  // 开始界面同样需要焦点边界，背景 HUD 在加载时不可操作。
  loading.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const items = [...loading.querySelectorAll('a,button')].filter(el => !el.hidden);
    if ((e.shiftKey && (document.activeElement === items[0] || document.activeElement === loading)) || (!e.shiftKey && document.activeElement === items.at(-1))) {
      e.preventDefault(); (e.shiftKey ? items.at(-1) : items[0]).focus();
    }
  });
  applyQuality(); audio?.setVolume(settings.volume); audio?.setMuted(settings.muted); paintSettings(); syncBackground(); loading.focus({ preventScroll: true });
  return {
    showLoading(progress0to1, label = t('load.ready')) {
      if (started) return;
      ready = false; clearTimeout(fadeTimer); loading.hidden = false; $('.ui-start').hidden = true; $('.ui-progress-wrap').hidden = false;
      const p = Number.isFinite(progress0to1) ? Math.max(0, Math.min(1, progress0to1)) : 0;
      $('.ui-progress i').style.transform = `scaleX(${p})`; $('.ui-progress').setAttribute('aria-valuenow', String(Math.round(p * 100)));
      $('.ui-percent').textContent = `${Math.round(p * 100)}%`; $('.ui-progress-label [role="status"]').textContent = label;
    },
    hideLoading() { if (started) return; ready = true; $('.ui-progress-wrap').hidden = true; $('.ui-start').hidden = false; },
    get paused() { return paused; }, setPaused, toggleHelp, screenshot,
    get quality() { return settings.quality; }, get shakeEnabled() { return settings.shake; },
  };
}
