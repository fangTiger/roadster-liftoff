import './profile.css';
import '../chain/race-panel.css';
import { createPublicClient, http } from 'viem';
import { chain } from '../chain/config.js';
import { mountProfile } from './page.js';
// 独立路由只移除旧静态 HUD，不载入游戏或首页模块。
for (const node of [...document.body.children]) if (node.tagName !== 'SCRIPT') node.remove();
document.documentElement.classList.add('profile-document');
const root = document.createElement('main'); document.body.append(root);
const page = mountProfile(root, { client: createPublicClient({ chain, transport: http(undefined, { timeout: 12000, retryCount: 2, retryDelay: 1000, batch: { wait: 30 } }) }) });
window.addEventListener('pagehide', () => page.destroy(), { once: true });
