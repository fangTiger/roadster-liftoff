// 钱包界面只在用户连接时加载，公共榜单和游戏启动不依赖第三方 SDK。
export function createWalletConnection({ loadUI = async handlers => {
  const { mountWalletUI } = await import('./wallet-modal.js');
  return mountWalletUI(handlers);
} } = {}) {
  let initialization = null, inFlight = null, pending = null, session = null, sessionVersion = 0;
  const listeners = new Set();
  function onSession(next) {
    sessionVersion++;
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
      if (!initialization) {
        initialization = Promise.resolve().then(() => loadUI({ onSession, onClose }));
        initialization.catch(() => { initialization = null; });
      }
      const ui = await initialization;
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
    getProvider: () => session?.provider || null,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}

export const walletConnection = createWalletConnection();
