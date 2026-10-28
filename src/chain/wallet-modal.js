import { createElement, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { getDefaultConfig, RainbowKitProvider, darkTheme, useConnectModal } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, useAccount } from 'wagmi';
import { getAccount } from 'wagmi/actions';
import { chain } from './config.js';
import { getLang, onLangChange } from '../i18n/i18n.js';

export async function mountWalletUI({ onSession, onClose }) {
  const projectId = (import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '').trim();
  if (!projectId) throw Object.assign(new Error('请配置 WalletConnect 项目 ID'), { code: 'wallet_config' });
  const config = getDefaultConfig({ appName: 'Mars Roadster', projectId, chains: [chain] });
  const queryClient = new QueryClient();
  const host = document.createElement('div');
  host.id = 'roadster-wallet'; document.body.append(host);
  const root = createRoot(host);
  async function getSession() {
    const account = getAccount(config);
    if (!account.isConnected || !account.connector) return null;
    const provider = await account.connector.getProvider();
    // provider 解析期间会话可能已变化，下一次 effect 会发布新的会话。
    const current = getAccount(config);
    if (!current.isConnected || current.connector !== account.connector || current.address !== account.address || current.chainId !== account.chainId) return null;
    return { provider, account: account.address, chainId: account.chainId };
  }
  return new Promise((resolve, reject) => {
    let ready = false, openModal;
    function Bridge() {
      const { openConnectModal, connectModalOpen } = useConnectModal();
      const { address, chainId, connector, status } = useAccount();
      const wasOpen = useRef(false);
      useEffect(() => {
        openModal = openConnectModal;
        if (!ready && (openConnectModal || status === 'connected')) {
          ready = true;
          resolve({ getSession, open() {
            if (!openModal) throw Object.assign(new Error('钱包连接尚未就绪'), { code: 'no_wallet' });
            openModal();
          } });
        }
      }, [openConnectModal, status]);
      useEffect(() => {
        let active = true;
        getSession().then(session => { if (active) onSession(session); }).catch(() => { if (active) onSession(null); });
        return () => { active = false; };
      }, [address, chainId, connector, status]);
      useEffect(() => {
        if (wasOpen.current && !connectModalOpen && !getAccount(config).isConnected) onClose();
        wasOpen.current = connectModalOpen;
      }, [connectModalOpen]);
      useEffect(() => {
        if (!connectModalOpen) return;
        // 第三方官方弹窗在 window 处理 Esc / Tab，其余按键不传给游戏快捷键。
        window.dispatchEvent(new Event('blur'));
        const guard = event => { if (!['Escape', 'Tab'].includes(event.key)) event.stopPropagation(); };
        document.addEventListener('keydown', guard);
        return () => document.removeEventListener('keydown', guard);
      }, [connectModalOpen]);
      return null;
    }
    function WalletRoot() {
      const [lang, setLang] = useState(getLang);
      useEffect(() => onLangChange(setLang), []);
      return createElement(WagmiProvider, { config },
        createElement(QueryClientProvider, { client: queryClient },
          createElement(RainbowKitProvider, { theme: darkTheme(), modalSize: 'compact', initialChain: chain, locale: lang === 'zh' ? 'zh-CN' : 'en-US' },
            createElement(Bridge))));
    }
    try { root.render(createElement(WalletRoot)); }
    catch (error) { root.unmount(); host.remove(); reject(error); }
  });
}
