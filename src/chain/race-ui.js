// 面板共享安全 DOM 工具，不把赛道名、钱包数据或错误插入 HTML。
export function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (className) node.className = className;
  return node;
}
let styled = false;
export function raceRoot(container) {
  if (!styled) {
    const link = el('link'); link.rel = 'stylesheet'; link.href = new URL('./race-panel.css', import.meta.url).href;
    document.head.append(link); styled = true;
  }
  const root = el('section', null, 'rc-panel'); container.replaceChildren(root); return root;
}
export function link(label, href) {
  const node = el('a', label, 'rc-link'); node.href = href; node.target = '_blank'; node.rel = 'noopener noreferrer'; return node;
}
export const sessionKey = wallet => `${wallet.state.account || ''}/${wallet.state.chainId}`;
export const dateText = seconds => seconds ? new Date(Number(seconds) * 1000).toLocaleDateString('zh-CN') : '—';
