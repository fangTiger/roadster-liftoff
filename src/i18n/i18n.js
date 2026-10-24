/**
 * Mars Roadster — 国际化模块
 * 支持简体中文 (zh) 和英文 (en) 双语切换。
 * 纯 ES 模块，无外部依赖，无构建步骤，无网络请求。
 *
 * 语言判断优先级（模块加载时）：
 *   1. localStorage 保存值（'liftoff.lang.v1'）
 *   2. navigator.languages / navigator.language（以 "zh" 开头 → 'zh'，否则 'en'）
 *   3. 无 navigator（Node.js 等）→ 默认 'zh'
 */

import zh from './zh.js';
import en from './en.js';

// ── 常量 ──────────────────────────────────────────────────────────────────────

/** 所有支持的语言列表 */
export const LANGS = ['zh', 'en'];

/** localStorage 持久化键名 */
const STORAGE_KEY = 'liftoff.lang.v1';

/** 词典映射 */
const DICTS = { zh, en };

// ── 纯工具函数（供测试直接导入） ─────────────────────────────────────────────

/**
 * 检测初始语言（纯函数，不依赖任何全局对象，便于单元测试）。
 * @param {{ saved?: string|null, languages?: readonly string[] }} opts
 * @returns {'zh'|'en'}
 */
export function detectLang({ saved, languages } = {}) {
  // 已保存值优先
  if (saved && LANGS.includes(saved)) return saved;
  // 浏览器语言偏好
  if (Array.isArray(languages) && languages.length > 0) {
    return languages.some(l => typeof l === 'string' && l.startsWith('zh')) ? 'zh' : 'en';
  }
  // 兜底默认
  return 'zh';
}

/**
 * 将 {placeholder} 替换为 vars 中的对应值；未知占位符保持原样。
 * @param {string} s
 * @param {Record<string,string|number>|undefined} vars
 * @returns {string}
 */
function fill(s, vars) {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

// ── 内部状态 ──────────────────────────────────────────────────────────────────

/** 当前激活语言 */
let _lang = 'zh';

/** 变更监听器 Set */
const _listeners = new Set();

// ── CSS 懒加载 ─────────────────────────────────────────────────────────────────

/** 确保 i18n.css 已挂载（只挂一次） */
function _ensureCss() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('i18n-css')) return;
  const link = document.createElement('link');
  link.id = 'i18n-css';
  link.rel = 'stylesheet';
  link.href = new URL('.', import.meta.url).href + 'i18n.css';
  document.head.appendChild(link);
}

// ── 核心 API ──────────────────────────────────────────────────────────────────

/**
 * 翻译指定 key。
 * 查找顺序：当前语言词典 → zh 词典 → key 本身。
 * 最后替换 {placeholder}。
 * @param {string} key
 * @param {Record<string,string|number>} [vars]
 * @returns {string}
 */
export function t(key, vars) {
  const dict = DICTS[_lang];
  let s = dict && key in dict ? dict[key] : undefined;
  // 回退到中文
  if (s == null) s = key in zh ? zh[key] : undefined;
  // 回退到 key 本身
  if (s == null) s = key;
  return fill(s, vars);
}

/**
 * 返回当前激活语言。
 * @returns {'zh'|'en'}
 */
export function getLang() {
  return _lang;
}

/**
 * 设置语言（忽略未知值；持久化；更新 document.documentElement.lang；通知监听器）。
 * 若语言未改变则为 no-op。
 * @param {string} lang
 */
export function setLang(lang) {
  // 忽略未知语言
  if (!LANGS.includes(lang)) return;
  // 未变更则不通知
  if (lang === _lang) return;

  _lang = lang;

  // 持久化到 localStorage
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch (_) {
    // 私人模式或配额满时静默忽略
  }

  // 更新 HTML lang 属性
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  }

  // 将 data-i18n 属性应用到整个文档
  if (typeof document !== 'undefined') {
    applyI18n(document);
  }

  // 通知所有监听器
  _listeners.forEach(fn => { try { fn(lang); } catch (_) {} });
}

/**
 * 注册语言变更监听器。
 * @param {Function} fn  接收新语言字符串的回调
 * @returns {Function}   取消订阅函数
 */
export function onLangChange(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

/**
 * 将词典应用到 DOM 节点及其后代。
 *   data-i18n="key"              → el.textContent = t(key)
 *   data-i18n-html="key"         → el.innerHTML   = t(key)（仅限自有词典中含 <kbd> 的字串）
 *   data-i18n-attr="attr:key;…"  → el.setAttribute(attr, t(key))
 *
 * @param {Document|Element} [root=document]
 */
export function applyI18n(root) {
  if (typeof document === 'undefined') return;
  const r = root || document;
  if (!r || typeof r.querySelectorAll !== 'function') return;

  // textContent 绑定
  r.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });

  // innerHTML 绑定（用于含 <kbd> 的条目）
  r.querySelectorAll('[data-i18n-html]').forEach(el => {
    el.innerHTML = t(el.dataset.i18nHtml);
  });

  // 属性绑定（格式："aria-label:key;title:key2"）
  r.querySelectorAll('[data-i18n-attr]').forEach(el => {
    const pairs = el.dataset.i18nAttr.split(';');
    for (const pair of pairs) {
      const colonIdx = pair.indexOf(':');
      if (colonIdx === -1) continue;
      const attr = pair.slice(0, colonIdx).trim();
      const key  = pair.slice(colonIdx + 1).trim();
      if (attr && key) el.setAttribute(attr, t(key));
    }
  });
}

/**
 * 挂载语言切换开关到容器元素。
 * container 为 null 时静默返回。
 * 调用两次不会重复挂载。
 *
 * 渲染结果（样式见 i18n.css）：
 *   <span class="lang-toggle" role="button" tabindex="0">中 / EN</span>
 *   当前语言字重为 bold white，另一个为 dim。
 *
 * @param {Element|null} container
 */
export function mountLangToggle(container, { injectCss = true } = {}) {
  if (!container || typeof document === 'undefined') return;
  // 幂等：若已挂载则只刷新
  const existing = container.querySelector('.lang-toggle');
  if (existing) {
    _refreshToggle(existing);
    return;
  }

  if (injectCss) _ensureCss();   // 页面已用 <link> 引入 i18n.css 时传 false（打包后按模块地址找不到 css）

  const el = document.createElement('span');
  el.className = 'lang-toggle';
  el.setAttribute('role', 'button');
  el.setAttribute('tabindex', '0');
  _refreshToggle(el);
  container.appendChild(el);

  // 点击切换
  el.addEventListener('click', _handleToggleActivate);

  // Enter / Space 切换（阻止冒泡，防止游戏收到）
  el.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      _handleToggleActivate();
    }
  });

  // 语言变更时刷新显示
  onLangChange(() => _refreshToggle(el));
}

/** 切换到另一种语言 */
function _handleToggleActivate() {
  setLang(_lang === 'zh' ? 'en' : 'zh');
}

/**
 * 刷新 toggle 元素的内容、aria-label 和 title。
 * @param {Element} el
 */
function _refreshToggle(el) {
  // 中文高亮时：粗体白色"中"，暗淡"/ EN"
  // 英文高亮时：粗体白色"EN"，暗淡"中 /"
  const label = t('lang.toggle');
  el.setAttribute('aria-label', label);
  el.setAttribute('title', label);
  el.innerHTML = _lang === 'zh'
    ? '<b class="lang-toggle-active">中</b><span class="lang-toggle-sep"> / </span><span class="lang-toggle-dim">EN</span>'
    : '<span class="lang-toggle-dim">中</span><span class="lang-toggle-sep"> / </span><b class="lang-toggle-active">EN</b>';
}

// ── 模块初始化（仅在非 Node 环境中读取 DOM / localStorage / navigator） ───────

(function _init() {
  // 在 Node.js 中 window / localStorage / navigator 均不存在，直接使用默认 'zh'
  let saved = null;
  try {
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      saved = localStorage.getItem(STORAGE_KEY);
    }
  } catch (_) {}

  let languages;
  try {
    // 只在浏览器里读：Node 21+ 也有 navigator（language 为 en-US），单元测试环境要保持默认中文
    if (typeof window !== 'undefined' && typeof navigator !== 'undefined') {
      languages = navigator.languages || (navigator.language ? [navigator.language] : undefined);
    }
  } catch (_) {}

  _lang = detectLang({ saved, languages });

  // 设置文档语言属性
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.lang = _lang === 'zh' ? 'zh-CN' : 'en';
  }
})();
