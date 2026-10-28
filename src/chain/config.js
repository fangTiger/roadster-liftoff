import { getArcChain, TESTNET_RACING_ADDRESS } from './shared.js';
export { recordsAbi } from './shared.js';

export function getRacingConfig(env = {}) {
  const mainnet = env.VITE_ARC_NETWORK === 'mainnet';
  return {
    chain: getArcChain(mainnet ? 'mainnet' : 'testnet'),
    address: (env.VITE_RACING_ADDRESS || '').trim() || (mainnet ? '' : TESTNET_RACING_ADDRESS),
  };
}
const config = getRacingConfig(import.meta.env);
export const chain = config.chain;
export const recordsAddress = config.address;
export const enabled = !!recordsAddress;
export const faucetUrl = chain.testnet ? 'https://faucet.circle.com' : null;
