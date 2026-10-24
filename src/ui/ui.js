// 独立界面外壳：只管理交互与设置，不接管游戏循环。
const STORE = 'liftoff.ui.v1';
import { QUALITY_PRESETS as PRESETS, getDefaultPreset } from '../mobile/perf.js';
const CONTROLS = [
  ['W', '加速'], ['S', '刹车 / 再入'], ['A / D', '转向'], ['空格', '推进器（按住冲上太空）'],
  ['R', '空中翻滚'], ['C', '切换镜头'], ['M', '静音'], ['H', '喇叭（按住）'], ['P / Esc', '暂停'],
  ['F', '全屏'], ['K', '截图'], ['/', '操作说明'],
];
const controlsHTML = () => `<dl class="ui-controls">${CONTROLS.map(([key, text]) => `<div><dt><kbd>${key}</kbd></dt><dd>${text}</dd></div>`).join('')}</dl>`;

export function createUI({ engine, audio = null, onStart = () => {}, onPauseChange = () => {}, onQualityChange = () => {} }) {
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
        <div class="ui-eyebrow">沙漠公路 → 太空轨道</div>
        <h1 id="ui-title">离地 <span>LIFTOFF</span></h1>
        <p class="ui-subtitle">推进器超跑 · 从沙漠公路冲上太空</p>
        <div class="ui-launch-status">
          <div class="ui-progress-wrap"><div class="ui-progress-label"><span role="status">准备起飞…</span><span class="ui-percent">0%</span></div><div class="ui-progress" role="progressbar" aria-label="加载进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div></div>
          <button class="ui-start" hidden>按任意键 / 点击开始</button>
        </div>
        <div class="g ui-control-panel"><h2>驾驶指南 <span>从第一次离地开始</span></h2>${controlsHTML()}</div>
        <footer>Built with Arc Studio + Claude Code <a href="https://github.com/fangTiger/roadster-liftoff/blob/main/CREDITS.md" target="_blank" rel="noopener noreferrer">素材致谢 ↗</a></footer>
      </div>
    </section>
    <section class="ui-overlay ui-modal" hidden role="dialog" aria-modal="true" aria-labelledby="ui-panel-title" tabindex="-1">
      <div class="g ui-card"><header><div><p class="ui-eyebrow">离地 LIFTOFF</p><h2 id="ui-panel-title">已暂停</h2></div><button class="ui-close" aria-label="关闭">×</button></header>
        <div data-panel="pause"><p class="ui-note">旅程停在这里，随时继续。</p><div class="ui-actions"><button class="ui-primary" data-action="resume">继续</button><button data-action="settings">设置</button><button data-action="help">操作说明</button></div><p class="ui-footnote">P / Esc 继续旅程</p></div>
        <div data-panel="settings" hidden>
          <fieldset><legend>画质</legend><div class="ui-quality">${PRESETS.map(p => `<button data-quality="${p}" aria-pressed="false">${p}</button>`).join('')}</div></fieldset>
          <label class="ui-setting ui-volume"><span>音量 <output id="ui-volume-output"></output></span><input aria-label="音量" type="range" min="0" max="1" step="0.01" data-setting="volume"></label>
          <label class="ui-setting"><span>静音</span><input type="checkbox" role="switch" data-setting="muted"><i></i></label>
          <label class="ui-setting"><span>镜头抖动</span><input type="checkbox" role="switch" data-setting="shake"><i></i></label>
          <label class="ui-setting"><span>显示操作提示</span><input type="checkbox" role="switch" data-setting="hints"><i></i></label>
          <p class="ui-footnote">设置自动保存到此设备</p><button class="ui-back" data-action="back">返回暂停菜单</button>
        </div>
        <div data-panel="help" hidden>${controlsHTML()}<p class="ui-howto">推进剂过半时，离地 8 米后一直按住空格即可冲向太空；松开后推进器自动托底，缓缓降落。空中按 R 翻滚，按 S 从轨道再入。</p><button class="ui-back" data-action="help-close">返回</button></div>
      </div>
    </section>
    <div class="ui-flash" aria-hidden="true"></div><div class="g ui-toast" role="status" hidden></div>`;
  document.body.append(root);
  // 主入口没有移动端视口声明时补充，避免更改现有标记。
  if (!document.querySelector('meta[name="viewport"]')) {
    const meta = document.createElement('meta'); meta.name = 'viewport'; meta.content = 'width=device-width, initial-scale=1'; document.head.append(meta);
  }
  const $ = selector => root.querySelector(selector);
  const loading = $('.ui-loading'), modal = $('.ui-modal');
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
    $('#ui-panel-title').textContent = next === 'settings' ? '设置' : next === 'help' ? '操作说明' : '已暂停';
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
          if (!blob) { toast('截图失败，请重试'); resolve(false); return; }
          const now = new Date(), pad = n => String(n).padStart(2, '0');
          const filename = `liftoff-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.png`;
          const url = URL.createObjectURL(blob), link = document.createElement('a');
          link.href = url; link.download = filename; link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          const flash = $('.ui-flash'); flash.classList.remove('ui-flashing'); void flash.offsetWidth; flash.classList.add('ui-flashing');
          toast('已保存截图'); resolve(true);
        }, 'image/png');
      } catch { toast('截图失败，请重试'); resolve(false); }
    });
  }
  function fullscreen() {
    try {
      const task = document.fullscreenElement ? document.exitFullscreen?.() : document.documentElement.requestFullscreen?.();
      if (!task) { toast('此设备暂不支持全屏'); return; }
      task.catch(() => toast('无法切换全屏，请重试'));
    } catch { toast('无法切换全屏，请重试'); }
  }
  function start() {
    if (!ready || started) return;
    // 解锁必须在用户手势内同步调用，不等待音频 Promise。
    try { audio?.unlock()?.catch(() => toast('音频暂不可用')); } catch { toast('音频暂不可用'); }
    started = true; loading.classList.add('ui-leaving'); loading.inert = true;
    document.activeElement?.blur();
    syncBackground();
    fadeTimer = setTimeout(() => { loading.hidden = true; }, 600);
    if (paused) openPanel('pause');
    onStart();
  }
  loading.addEventListener('click', e => { if (!e.target.closest('a')) start(); });
  root.addEventListener('click', e => {
    const button = e.target.closest('button'); if (!button) return;
    if (button.dataset.quality) { settings.quality = button.dataset.quality; applyQuality(); persist(); paintSettings(); }
    const actions = { resume: () => setPaused(false), settings: showSettings, help: toggleHelp, back: () => openPanel('pause'), 'help-close': closePanel };
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
  const toolNames = ['截图', '静音', '全屏', '设置', '操作说明'];
  tools?.querySelectorAll('span').forEach((el, i) => {
    el.tabIndex = 0; el.setAttribute('role', 'button'); el.setAttribute('aria-label', toolNames[i]); el.title = toolNames[i];
    if (toolActions[i]) el.addEventListener('click', toolActions[i]);
    // 音符只转发原有点击，不额外绑定静音逻辑。
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); el.click(); } });
  });
  window.addEventListener('keydown', e => {
    if (e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
    if (!started) {
      if (e.key === 'Tab') return;
      if (e.target.closest?.('a')) return;
      e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) start(); return;
    }
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
    showLoading(progress0to1, label = '准备起飞…') {
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
