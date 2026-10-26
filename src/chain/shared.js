import { defineChain, parseAbi } from 'viem';

// 前端与服务器共享纯链定义，不读取环境变量。
export function getArcChain(network = 'testnet') {
  const mainnet = network === 'mainnet';
  return defineChain({
    id: mainnet ? 5042 : 5042002,
    name: mainnet ? 'Arc' : 'Arc Testnet',
    nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
    rpcUrls: { default: { http: [mainnet ? 'https://rpc.mainnet.arc.io' : 'https://rpc.testnet.arc.io'] } },
    blockExplorers: { default: { name: 'Arcscan', url: mainnet ? 'https://explorer.arc.io' : 'https://testnet.arcscan.app' } },
    testnet: !mainnet,
  });
}

// ABI 包含游戏侧与 NFT 接口约定的读写方法；结构体字段名与部署合约保持一致。
export const recordsAbi = parseAbi([
  'struct Record { uint32 tokenId; uint32 bestMs; uint32 achievements; uint40 mintedAt; uint40 updatedAt; }',
  'function submit(uint32 roundTripMs, uint32 achievements)',
  'function recordOf(address) view returns (Record)',
  'function totalSupply() view returns (uint256)',
  'function playerCount() view returns (uint256)',
  'function players(uint256 start, uint256 count) view returns (address[] addrs, Record[] recs)',
  'function minRoundTripMs() view returns (uint32)',
  'function ownerOf(uint256) view returns (address)',
  'function tokenURI(uint256) view returns (string)',
  'event Recorded(address indexed player, uint256 indexed tokenId, uint32 roundTripMs, bool improved, uint32 achievements, uint32 bestMs)',
  'error TooFast(uint32 got, uint32 min)',
  'error InvalidAchievements(uint32 bits)',
  'error NothingToUpdate()',
  'error Soulbound()',
  'error MinCanOnlyIncrease()',
]);
