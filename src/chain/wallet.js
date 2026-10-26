import { createPublicClient, createWalletClient, custom, http } from 'viem';
import { chain, recordsAbi, recordsAddress } from './config.js';
import { sortLeaderboard } from './records.js';

// 可注入客户端以验证钱包流程；默认读取始终走公共 HTTP RPC。
export function createRecordsWallet({ publicClient = createPublicClient({ chain, transport: http() }), getProvider = () => typeof window !== 'undefined' ? window.ethereum : null, address = recordsAddress, getWalletClient = provider => createWalletClient({ chain, transport: custom(provider) }) } = {}) {
  let provider = null, walletClient = null;
  const state = { account: null, chainId: null, phase: '' };
  const listeners = new Set();
  const emit = () => { for (const fn of listeners) fn({ ...state }); };
  const fail = code => Object.assign(new Error(code), { code });
  function requireContract() { if (!address) throw fail('unavailable'); }
  function attach() {
    const next = getProvider();
    if (!next) throw fail('no_wallet');
    if (provider === next) return;
    provider?.removeListener?.('accountsChanged', accountsChanged);
    provider?.removeListener?.('chainChanged', chainChanged);
    provider?.removeListener?.('disconnect', disconnected);
    provider = next;
    walletClient = getWalletClient(provider);
    provider.on?.('accountsChanged', accountsChanged);
    provider.on?.('chainChanged', chainChanged);
    provider.on?.('disconnect', disconnected);
  }
  function accountsChanged(accounts) { state.account = accounts[0] || null; emit(); }
  function chainChanged(id) { state.chainId = Number(id); emit(); }
  function disconnected() { state.account = null; state.chainId = null; emit(); }
  async function connect() {
    requireContract(); attach();
    accountsChanged(await provider.request({ method: 'eth_requestAccounts' }));
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
  async function submit(ms, bits) {
    requireContract(); attach();
    if (state.phase) throw fail('busy');
    if (!state.account) throw fail('no_wallet');
    const account = state.account;
    try {
      state.phase = 'simulating'; emit();
      await assertSession(account);
      const { request } = await publicClient.simulateContract({ address, abi: recordsAbi, functionName: 'submit', args: [ms, bits], account });
      await assertSession(account);
      state.phase = 'signing'; emit();
      const hash = await walletClient.writeContract(request);
      state.phase = 'confirming'; emit();
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== 'success') throw fail('reverted');
      return receipt.transactionHash || hash;
    } finally { state.phase = ''; emit(); }
  }
  async function readLeaderboard() {
    const count = Math.min(2000, Number(await read('playerCount'))), addrs = [], recs = [];
    for (let start = 0; start < count; start += 100) {
      const [pageAddrs, pageRecs] = await read('players', [BigInt(start), BigInt(Math.min(100, count - start))]);
      addrs.push(...pageAddrs); recs.push(...pageRecs);
      if (!pageAddrs.length) break;
    }
    return sortLeaderboard(addrs, recs);
  }
  return {
    get state() { return { ...state }; },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    connect, submit, readLeaderboard,
    readRecord: addr => read('recordOf', [addr]),
    readTokenURI: id => read('tokenURI', [BigInt(id)]),
  };
}
export const wallet = createRecordsWallet();
export const connect = (...args) => wallet.connect(...args);
export const readRecord = (...args) => wallet.readRecord(...args);
export const submit = (...args) => wallet.submit(...args);
export const readLeaderboard = (...args) => wallet.readLeaderboard(...args);
