// 钱包界面只在用户连接时加载，公共榜单和游戏启动不依赖第三方 SDK。
// 记住「上次已连接」：整页跳转后静默恢复会话，用户主动断开时清除。
const REMEMBER = 'roadster.wallet.connected';
const browserStorage = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };
export function createWalletConnection({ loadUI = async handlers => {
  const { mountWalletUI } = await import('./wallet-modal.js');
  return mountWalletUI(handlers);
}, storage = browserStorage() } = {}) {
  let initialization = null, inFlight = null, pending = null, session = null, sessionVersion = 0;
  const listeners = new Set();
  const remember = value => { try { if (value) storage?.setItem(REMEMBER, '1'); else storage?.removeItem(REMEMBER); } catch {} };
  function load() {
    if (!initialization) {
      initialization = Promise.resolve().then(() => loadUI({ onSession, onClose }));
      initialization.catch(() => { initialization = null; });
    }
    return initialization;
  }
  function onSession(next) {
    sessionVersion++;
    if (next?.account) remember(true);
    session = next;
    for (const listener of listeners) listener(next);
    if (next?.provider && next.account && pending) {
      const { resolve } = pending; pending = null; resolve(next.provider);
    }
  }
  function onClose() {
    if (!pending) return;
    const { reject } = pending; pending = null;
    reject(Object.assign(new Error('已取消钱包连接'), { code: 4001 }));
  }
  function connect() {
    if (inFlight) return inFlight;
    inFlight = (async () => {
      const ui = await load();
      const version = sessionVersion;
      const restored = await ui.getSession();
      if (version === sessionVersion) onSession(restored);
      if (session?.provider && session.account) return session.provider;
      return new Promise((resolve, reject) => {
        pending = { resolve, reject };
        try { ui.open(); } catch (error) { pending = null; reject(error); }
      });
    })().finally(() => { inFlight = null; });
    return inFlight;
  }
  return {
    connect,
    async disconnect() {
      if (!initialization) return;
      const ui = await initialization;
      await ui.disconnect();
      remember(false); onSession(null); onClose();
    },
    // 仅在上次已连接时加载钱包组件，由其自动重连；不弹窗，失败则清除标记。
    async restore() {
      let flagged = false; try { flagged = storage?.getItem(REMEMBER) === '1'; } catch {}
      if (!flagged || session?.account) return session?.provider || null;
      try {
        const ui = await load(), version = sessionVersion, restored = await ui.getSession();
        if (version === sessionVersion && restored) onSession(restored);
      } catch { remember(false); }
      return session?.provider || null;
    },
    getProvider: () => session?.provider || null,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}

export const walletConnection = createWalletConnection();
