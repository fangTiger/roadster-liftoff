// 每个触点独立持有动作，捕获指针后即使移出按钮也能正确释放。
export function createTouch({ input, onCamera = () => {} }) {
  const media = matchMedia('(pointer: coarse)');
  const forced = new URLSearchParams(location.search).has('touch');
  const root = document.createElement('div'); root.id = 'mobile-touch';
  root.setAttribute('aria-label', '触屏驾驶');
  root.innerHTML = `
    <div class="mobile-steering mobile-glass" role="group" aria-label="左右拖动转向" data-touch="steer">
      <span class="mobile-steer-arrows" aria-hidden="true">‹<span>转向</span>›</span><i class="mobile-knob"></i>
    </div>
    <div class="mobile-pedals">
      <button type="button" class="mobile-camera mobile-glass" data-touch="camera">镜头</button>
      <button type="button" class="mobile-brake mobile-glass" data-touch="brake" aria-pressed="false">刹车</button>
      <button type="button" class="mobile-throttle mobile-glass" data-touch="throttle" aria-pressed="false">加速<small>按住</small></button>
      <button type="button" class="mobile-jet mobile-glass" data-touch="jet" aria-pressed="false">
        <svg viewBox="0 0 84 84" aria-hidden="true"><circle cx="42" cy="42" r="37"/></svg><span>推进器<small>按住升空</small></span>
      </button>
    </div>
    <aside class="mobile-rotate mobile-glass" aria-label="横屏建议"><span class="mobile-rotate-icon" aria-hidden="true">▯ ↻</span><div>横屏体验更佳<small>转动手机，视野更开阔</small></div><button type="button" aria-label="关闭横屏提示">×</button></aside>`;
  const pointers = new Map(), knob = root.querySelector('.mobile-knob');
  const controls = [...root.querySelectorAll('[data-touch]')];
  const abort = new AbortController();
  const listen = (el, type, fn, options = {}) => el.addEventListener(type, fn, { ...options, signal: abort.signal });
  let enabled = true, active = false, disposed = false;
  // 原页面没有视口声明，运行时补充；已有声明则保留。
  const viewport = document.querySelector('meta[name="viewport"]');
  if (viewport && !/viewport-fit\s*=/.test(viewport.content)) viewport.content += ', viewport-fit=cover';
  if (!viewport) {
    const meta = document.createElement('meta'); meta.name = 'viewport';
    meta.content = 'width=device-width, initial-scale=1, viewport-fit=cover'; document.head.append(meta);
  }
  document.body.append(root);
  function paint() {
    const held = new Set([...pointers.values()].map(p => p.action));
    for (const action of ['throttle', 'brake', 'jet', 'left', 'right']) input.setTouch(action, held.has(action));
    for (const el of controls) {
      const pressed = held.has(el.dataset.touch);
      el.classList.toggle('is-held', pressed);
      if (el.tagName === 'BUTTON') el.setAttribute('aria-pressed', String(pressed));
    }
  }
  function releaseAll() {
    for (const [id, p] of pointers) {
      if (p.el.hasPointerCapture(id)) p.el.releasePointerCapture(id);
    }
    pointers.clear(); knob.style.transform = 'translateX(0px)'; paint();
  }
  function sync() {
    active = forced || media.matches;
    root.hidden = !active || !enabled;
    document.documentElement.classList.toggle('mobile-touch-active', active);
    if (root.hidden) releaseAll();
  }
  function steer(p, x) {
    const rect = p.el.getBoundingClientRect();
    const value = Math.max(-1, Math.min(1, (x - rect.left - rect.width / 2) / (rect.width / 2)));
    p.action = value < -.15 ? 'left' : value > .15 ? 'right' : null;
    knob.style.transform = `translateX(${value * (rect.width / 2 - 26)}px)`;
  }
  for (const el of controls) {
    listen(el, 'pointerdown', e => {
      if (root.hidden || root.inert || !enabled || e.button > 0) return;
      e.preventDefault(); e.stopPropagation();
      if (pointers.has(e.pointerId)) return;
      // 转向区只由一个拇指占用，踏板允许多个触点共同按住。
      if (el.dataset.touch === 'steer' && [...pointers.values()].some(p => p.el === el)) return;
      const p = { el, action: el.dataset.touch };
      pointers.set(e.pointerId, p);
      el.setPointerCapture(e.pointerId);
      if (p.action === 'steer') steer(p, e.clientX);
      try { navigator.vibrate?.(8); } catch { /* 平台不支持震动时忽略。 */ }
      paint();
    });
    listen(el, 'pointermove', e => {
      const p = pointers.get(e.pointerId);
      if (p?.el.dataset.touch !== 'steer') return;
      steer(p, e.clientX); paint();
    });
    if (el.dataset.touch === 'camera') listen(el, 'click', onCamera);
  }
  function release(e) {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    pointers.delete(e.pointerId);
    if (p.el.dataset.touch === 'steer') knob.style.transform = 'translateX(0px)';
    if (p.el.hasPointerCapture(e.pointerId)) p.el.releasePointerCapture(e.pointerId);
    paint();
  }
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) listen(window, event, release, { capture: true });
  listen(window, 'blur', releaseAll);
  listen(window, 'resize', releaseAll);
  listen(document, 'visibilitychange', releaseAll);
  listen(root, 'contextmenu', e => e.preventDefault());
  listen(root.querySelector('.mobile-rotate button'), 'click', () => { root.querySelector('.mobile-rotate').hidden = true; });
  listen(media, 'change', sync);
  // UI 暂停和加载层用 inert 隔离背景，立即释放已按住的触点。
  const observer = new MutationObserver(() => { if (root.inert) releaseAll(); });
  observer.observe(root, { attributes: true, attributeFilter: ['inert'] });
  sync();
  return {
    get active() { return active; },
    release: releaseAll,
    setEnabled(value) { enabled = Boolean(value); sync(); },
    dispose() {
      if (disposed) return;
      disposed = true; releaseAll(); abort.abort(); observer.disconnect(); root.remove();
      document.documentElement.classList.remove('mobile-touch-active');
    },
  };
}
