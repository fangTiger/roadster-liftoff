// 临时最小实现（接口占位）：只读中文词条。完整的多语言模块（英文、切换、记忆、开关）稍后替换此文件，接口保持不变
import zh from './zh.js';

let lang = 'zh';
const listeners = new Set();
const fill = (s, vars) => vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m)) : s;

export const LANGS = ['zh', 'en'];
export function t(key, vars) { const s = zh[key]; return s == null ? key : fill(s, vars); }
export function getLang() { return lang; }
export function setLang(next) { lang = next; applyI18n(); listeners.forEach(f => f(lang)); }
export function onLangChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-html]').forEach(el => { el.innerHTML = t(el.dataset.i18nHtml); });
  root.querySelectorAll('[data-i18n-attr]').forEach(el => {
    for (const pair of el.dataset.i18nAttr.split(';')) { const [attr, key] = pair.split(':'); if (attr && key) el.setAttribute(attr.trim(), t(key.trim())); }
  });
}
export function mountLangToggle() {}
