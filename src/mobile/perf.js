import { t } from '../i18n/i18n.js';
// 自动档只调整像素比与底档泛光，保留用户选择的质量上限。
export const QUALITY_PRESETS = Object.freeze(['自动', '低', '中', '高', '极致']);
export function getDefaultPreset() {
  return globalThis.matchMedia?.('(pointer: coarse)').matches || new URLSearchParams(globalThis.location?.search).has('touch') ? '自动' : '极致';
}

export function createPerf({ engine, getPreset, setPreset }) {
  if (!getPreset()) setPreset(getDefaultPreset());
  let previous, ema = 0, slow = 0, fast = 0, ceiling = 1, bloom = true;
  let levels = [], notified = false, toast, timer, disposed = false;
  function apply(ratio) {
    engine.renderer.setPixelRatio(ratio);
    engine.composer?.setPixelRatio(ratio);
    engine.composer?.setSize(innerWidth, innerHeight);
    if (engine.bloom) engine.bloom.enabled = ratio <= .6 ? false : bloom;
  }
  function notify() {
    if (notified) return;
    notified = true;
    if (!globalThis.document) return;
    toast = document.createElement('div');
    toast.className = 'mobile-perf-toast'; toast.role = 'status';
    toast.textContent = t('toast.autoQuality');
    document.body.append(toast);
    timer = setTimeout(() => { toast.remove(); }, 4200);
  }
  function reset() { ema = slow = fast = 0; }
  function update(dt) {
    if (disposed) return;
    const preset = getPreset();
    if (preset !== previous) {
      reset(); levels = [];
      if (preset === '自动') {
        ceiling = engine.renderer.getPixelRatio();
        bloom = engine.bloom?.enabled ?? true;
      }
      previous = preset;
    }
    if (preset !== '自动') return;
    // 暂停和后台不作为显卡负载样本；dt 必须使用未经过物理裁剪的秒数。
    if (!Number.isFinite(dt) || dt <= 0 || globalThis.document?.hidden) { reset(); return; }
    ema = ema ? ema + (dt * 1000 - ema) * (1 - Math.exp(-dt / .5)) : dt * 1000;
    slow = ema > 24 ? slow + dt : 0;
    fast = ema < 14 ? fast + dt : 0;
    const ratio = engine.renderer.getPixelRatio();
    if (slow >= 3 && ratio > .6) {
      levels.push(ratio);
      apply(Math.max(.6, ratio * .8));
      slow = fast = 0; notify();
    } else if (fast >= 6 && levels.length) {
      apply(Math.min(ceiling, levels.pop()));
      slow = fast = 0;
    }
  }
  // 暂停菜单可在两帧之间切换多次档位；由宿主显式通知，避免遗漏同名自动档的新上限。
  function refresh() { previous = undefined; levels = []; reset(); }
  return { update, reset, refresh, dispose() { disposed = true; clearTimeout(timer); toast?.remove(); } };
}
