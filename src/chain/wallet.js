import { createPublicClient, createWalletClient, custom, http } from 'viem';
import { chain, recordsAbi, recordsAddress } from './config.js';
import { sortLeaderboard } from './records.js';
import { walletConnection } from './wallet-connection.js';

// 可注入客户端以验证钱包流程；默认读取始终走公共 HTTP RPC。
export function createRecordsWallet({ publicClient = createPublicClient({ chain, transport: http() }), getProvider = walletConnection.getProvider, connectProvider = getProvider, subscribeSession = null, address = recordsAddress, getWalletClient = provider => createWalletClient({ chain, transport: custom(provider) }) } = {}) {
  let provider = null, walletClient = null, providerListeners = {};
  const state = { account: null, chainId: null, phase: '' };
  const listeners = new Set();
  const emit = () => { for (const fn of listeners) fn({ ...state }); };
  const fail = code => Object.assign(new Error(code), { code });
  function requireContract() { if (!address) throw fail('unavailable'); }
  function attach(next) {
    if (provider === next) return;
    for (const [event, fn] of Object.entries(providerListeners)) provider?.removeListener?.(event, fn);
    provider = next;
    providerListeners = {};
    if (!provider) { walletClient = null; return; }
    walletClient = getWalletClient(provider);
    // 已排队的旧连接器事件也必须忽略。
    for (const [event, fn] of Object.entries({ accountsChanged, chainChanged, disconnect: disconnected })) {
      providerListeners[event] = (...args) => { if (provider === next) fn(...args); };
      provider.on?.(event, providerListeners[event]);
    }
  }
  function accountsChanged(accounts) { state.account = accounts[0] || null; emit(); }
  function chainChanged(id) { state.chainId = Number(id); emit(); }
  function disconnected() { state.account = null; state.chainId = null; emit(); }
  subscribeSession?.(session => {
    attach(session?.provider || null);
    state.account = session?.account || null;
    state.chainId = session?.chainId ?? null;
    emit();
  });
  async function connect() {
    requireContract();
    const selected = await connectProvider();
    if (!selected) throw fail('no_wallet');
    attach(selected);
    accountsChanged(await provider.request({ method: 'eth_accounts' }));
    if (!state.account) throw fail('no_wallet');
    const chainId = `0x${chain.id.toString(16)}`;
    if (Number(await provider.request({ method: 'eth_chainId' })) !== chain.id) {
      try { await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] }); }
      catch (err) {
        if (Number(err.code ?? err.cause?.code ?? err.data?.originalError?.code) !== 4902) throw err;
        await provider.request({ method: 'wallet_addEthereumChain', params: [{ chainId, chainName: chain.name, nativeCurrency: chain.nativeCurrency, rpcUrls: chain.rpcUrls.default.http, blockExplorerUrls: [chain.blockExplorers.default.url] }] });
        await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] });
      }
    }
    chainChanged(await provider.request({ method: 'eth_chainId' }));
    if (state.chainId !== chain.id) throw fail('wrong_network');
    accountsChanged(await provider.request({ method: 'eth_accounts' }));
    if (!state.account) throw fail('no_wallet');
    return state.account;
  }
  function read(functionName, args = []) {
    requireContract();
    return publicClient.readContract({ address, abi: recordsAbi, functionName, args });
  }
  async function assertSession(account) {
    const accounts = await provider.request({ method: 'eth_accounts' });
    accountsChanged(accounts);
    chainChanged(await provider.request({ method: 'eth_chainId' }));
    if (state.chainId !== chain.id) throw fail('wrong_network');
    if (state.account?.toLowerCase() !== account.toLowerCase()) throw fail('account_changed');
  }
  async function submit(trackId, ms, bits) {
    requireContract();
    attach(await getProvider());
    if (state.phase) throw fail('busy');
    if (!state.account) throw fail('no_wallet');
    const account = state.account;
    try {
      state.phase = 'simulating'; emit();
      await assertSession(account);
      const { request } = await publicClient.simulateContract({ address, abi: recordsAbi, functionName: 'submit', args: [trackId, ms, bits, 0n, '0x'], account });
      await assertSession(account);
      state.phase = 'signing'; emit();
      const hash = await walletClient.writeContract(request);
      state.phase = 'confirming'; emit();
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== 'success') throw fail('reverted');
      return receipt.transactionHash || hash;
    } finally { state.phase = ''; emit(); }
  }
  async function readLeaderboard(trackId) {
    const count = BigInt(await read('playerCount')), addrs = [], bests = [];
    for (let start = 0n; start < count; start += 100n) {
      const size = count - start < 100n ? count - start : 100n;
      const [pageAddrs, , pageBests] = await read('players', [trackId, start, size]);
      addrs.push(...pageAddrs); bests.push(...pageBests);
      if (!pageAddrs.length) break;
    }
    return sortLeaderboard(addrs, bests);
  }
  return {
    get state() { return { ...state }; },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    connect, submit, readLeaderboard,
    readRecord: addr => read('recordOf', [addr]),
    readBest: (addr, trackId) => read('bestOf', [addr, trackId]),
    readTrack: trackId => read('trackOf', [trackId]),
    readTokenURI: id => read('tokenURI', [BigInt(id)]),
  };
}
export const wallet = createRecordsWallet({ connectProvider: walletConnection.connect, subscribeSession: walletConnection.subscribe });
export const connect = (...args) => wallet.connect(...args);
export const readRecord = (...args) => wallet.readRecord(...args);
export const submit = (...args) => wallet.submit(...args);
export const readLeaderboard = (...args) => wallet.readLeaderboard(...args);
