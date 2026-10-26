import { getArcChain } from './shared.js';
export { recordsAbi } from './shared.js';

const mainnet = import.meta.env?.VITE_ARC_NETWORK === 'mainnet';
export const chain = getArcChain(mainnet ? 'mainnet' : 'testnet');
export const recordsAddress = (import.meta.env?.VITE_RECORDS_ADDRESS || '').trim();
export const enabled = !!recordsAddress;
export const faucetUrl = mainnet ? null : 'https://faucet.circle.com';
