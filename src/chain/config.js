import { defineChain, parseAbi } from 'viem';

const mainnet = import.meta.env?.VITE_ARC_NETWORK === 'mainnet';
export const chain = defineChain({
  id: mainnet ? 5042 : 5042002,
  name: mainnet ? 'Arc' : 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: [mainnet ? 'https://rpc.mainnet.arc.io' : 'https://rpc.testnet.arc.io'] } },
  blockExplorers: { default: { name: 'Arcscan', url: mainnet ? 'https://explorer.arc.io' : 'https://testnet.arcscan.app' } },
  testnet: !mainnet,
});
export const recordsAddress = (import.meta.env?.VITE_RECORDS_ADDRESS || '').trim();
export const enabled = !!recordsAddress;
export const faucetUrl = mainnet ? null : 'https://faucet.circle.com';
// ABI 只包含游戏侧约定的接口；结构体字段名与部署合约保持一致。
export const recordsAbi = parseAbi([
  'struct Record { uint32 tokenId; uint32 bestMs; uint32 achievements; uint40 mintedAt; uint40 updatedAt; }',
  'function submit(uint32 roundTripMs, uint32 achievements)',
  'function recordOf(address) view returns (Record)',
  'function totalSupply() view returns (uint256)',
  'function playerCount() view returns (uint256)',
  'function players(uint256 start, uint256 count) view returns (address[] addrs, Record[] recs)',
  'function minRoundTripMs() view returns (uint32)',
  'function tokenURI(uint256) view returns (string)',
  'event Recorded(address indexed player, uint256 indexed tokenId, uint32 roundTripMs, bool improved, uint32 achievements, uint32 bestMs)',
  'error TooFast(uint32 got, uint32 min)',
  'error InvalidAchievements(uint32 bits)',
  'error NothingToUpdate()',
  'error Soulbound()',
  'error MinCanOnlyIncrease()',
]);
