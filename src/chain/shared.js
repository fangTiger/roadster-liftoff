import { defineChain } from 'viem';

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

export const TESTNET_RACING_ADDRESS = '0xfdce518af1ebaaaec98c5ce4aa05ac5e00f1d1d9';

// 静态 V2 ABI；逐项一致性由 shared.test.mjs 对照部署产物验证。
export const recordsAbi = [
  {"type": "function", "name": "verifier", "inputs": [], "outputs": [{"name": "", "type": "address"}], "stateMutability": "view"},
  {"type": "function", "name": "setVerifier", "inputs": [{"name": "newVerifier", "type": "address"}], "outputs": [], "stateMutability": "nonpayable"},
  {"type": "function", "name": "LAP_TYPEHASH", "inputs": [], "outputs": [{"name": "", "type": "bytes32"}], "stateMutability": "view"},
  {"type": "function","name": "bestOf","inputs": [{"name": "player","type": "address"},{"name": "trackId","type": "uint8"}],"outputs": [{"name": "","type": "tuple","components": [{"name": "bestMs","type": "uint32"},{"name": "updatedAt","type": "uint40"},{"name": "verified","type": "bool"}]}],"stateMutability": "view"},
  {"type": "function","name": "locked","inputs": [{"name": "tokenId","type": "uint256"}],"outputs": [{"name": "","type": "bool"}],"stateMutability": "view"},
  {"type": "function","name": "owner","inputs": [],"outputs": [{"name": "","type": "address"}],"stateMutability": "view"},
  {"type": "function","name": "ownerOf","inputs": [{"name": "tokenId","type": "uint256"}],"outputs": [{"name": "","type": "address"}],"stateMutability": "view"},
  {"type": "function","name": "playerCount","inputs": [],"outputs": [{"name": "","type": "uint256"}],"stateMutability": "view"},
  {"type": "function","name": "players","inputs": [{"name": "trackId","type": "uint8"},{"name": "start","type": "uint256"},{"name": "count","type": "uint256"}],"outputs": [{"name": "addrs","type": "address[]"},{"name": "recs","type": "tuple[]","components": [{"name": "tokenId","type": "uint32"},{"name": "firstTrack","type": "uint8"},{"name": "firstLapMs","type": "uint32"},{"name": "achievements","type": "uint32"},{"name": "mintedAt","type": "uint40"},{"name": "updatedAt","type": "uint40"}]},{"name": "trackBests","type": "tuple[]","components": [{"name": "bestMs","type": "uint32"},{"name": "updatedAt","type": "uint40"},{"name": "verified","type": "bool"}]}],"stateMutability": "view"},
  {"type": "function","name": "recordOf","inputs": [{"name": "player","type": "address"}],"outputs": [{"name": "","type": "tuple","components": [{"name": "tokenId","type": "uint32"},{"name": "firstTrack","type": "uint8"},{"name": "firstLapMs","type": "uint32"},{"name": "achievements","type": "uint32"},{"name": "mintedAt","type": "uint40"},{"name": "updatedAt","type": "uint40"}]}],"stateMutability": "view"},
  {"type": "function","name": "setTrack","inputs": [{"name": "trackId","type": "uint8"},{"name": "qualifyMs","type": "uint32"},{"name": "minLapMs","type": "uint32"}],"outputs": [],"stateMutability": "nonpayable"},
  {"type": "function","name": "submit","inputs": [{"name": "trackId","type": "uint8"},{"name": "lapMs","type": "uint32"},{"name": "achievements","type": "uint32"},{"name": "deadline","type": "uint64"},{"name": "signature","type": "bytes"}],"outputs": [],"stateMutability": "nonpayable"},
  {"type": "function","name": "tokenURI","inputs": [{"name": "tokenId","type": "uint256"}],"outputs": [{"name": "","type": "string"}],"stateMutability": "view"},
  {"type": "function","name": "totalSupply","inputs": [],"outputs": [{"name": "","type": "uint256"}],"stateMutability": "view"},
  {"type": "function","name": "trackOf","inputs": [{"name": "trackId","type": "uint8"}],"outputs": [{"name": "","type": "tuple","components": [{"name": "qualifyMs","type": "uint32"},{"name": "minLapMs","type": "uint32"}]}],"stateMutability": "view"},
  {"type": "event","name": "Approval","inputs": [{"name": "owner","type": "address","indexed": true},{"name": "approved","type": "address","indexed": true},{"name": "tokenId","type": "uint256","indexed": true}],"anonymous": false},
  {"type": "event","name": "ApprovalForAll","inputs": [{"name": "owner","type": "address","indexed": true},{"name": "operator","type": "address","indexed": true},{"name": "approved","type": "bool","indexed": false}],"anonymous": false},
  {"type": "event","name": "BaseURIChanged","inputs": [{"name": "baseURI","type": "string","indexed": false}],"anonymous": false},
  {"type": "event","name": "EIP712DomainChanged","inputs": [],"anonymous": false},
  {"type": "event","name": "FirstLap","inputs": [{"name": "player","type": "address","indexed": true},{"name": "tokenId","type": "uint256","indexed": true},{"name": "trackId","type": "uint8","indexed": true},{"name": "lapMs","type": "uint32","indexed": false}],"anonymous": false},
  {"type": "event","name": "LapRecorded","inputs": [{"name": "player","type": "address","indexed": true},{"name": "trackId","type": "uint8","indexed": true},{"name": "lapMs","type": "uint32","indexed": false},{"name": "improved","type": "bool","indexed": false},{"name": "bestMs","type": "uint32","indexed": false},{"name": "achievements","type": "uint32","indexed": false},{"name": "verified","type": "bool","indexed": false}],"anonymous": false},
  {"type": "event","name": "Locked","inputs": [{"name": "tokenId","type": "uint256","indexed": false}],"anonymous": false},
  {"type": "event","name": "OwnershipTransferred","inputs": [{"name": "previousOwner","type": "address","indexed": true},{"name": "newOwner","type": "address","indexed": true}],"anonymous": false},
  {"type": "event","name": "TrackSet","inputs": [{"name": "trackId","type": "uint8","indexed": true},{"name": "qualifyMs","type": "uint32","indexed": false},{"name": "minLapMs","type": "uint32","indexed": false}],"anonymous": false},
  {"type": "event","name": "Transfer","inputs": [{"name": "from","type": "address","indexed": true},{"name": "to","type": "address","indexed": true},{"name": "tokenId","type": "uint256","indexed": true}],"anonymous": false},
  {"type": "event","name": "VerifierChanged","inputs": [{"name": "verifier","type": "address","indexed": false}],"anonymous": false},
  {"type": "error","name": "BadSignature","inputs": []},
  {"type": "error","name": "ECDSAInvalidSignature","inputs": []},
  {"type": "error","name": "ECDSAInvalidSignatureLength","inputs": [{"name": "length","type": "uint256"}]},
  {"type": "error","name": "ECDSAInvalidSignatureS","inputs": [{"name": "s","type": "bytes32"}]},
  {"type": "error","name": "ERC721IncorrectOwner","inputs": [{"name": "sender","type": "address"},{"name": "tokenId","type": "uint256"},{"name": "owner","type": "address"}]},
  {"type": "error","name": "ERC721InsufficientApproval","inputs": [{"name": "operator","type": "address"},{"name": "tokenId","type": "uint256"}]},
  {"type": "error","name": "ERC721InvalidApprover","inputs": [{"name": "approver","type": "address"}]},
  {"type": "error","name": "ERC721InvalidOperator","inputs": [{"name": "operator","type": "address"}]},
  {"type": "error","name": "ERC721InvalidOwner","inputs": [{"name": "owner","type": "address"}]},
  {"type": "error","name": "ERC721InvalidReceiver","inputs": [{"name": "receiver","type": "address"}]},
  {"type": "error","name": "ERC721InvalidSender","inputs": [{"name": "sender","type": "address"}]},
  {"type": "error","name": "ERC721NonexistentToken","inputs": [{"name": "tokenId","type": "uint256"}]},
  {"type": "error","name": "Expired","inputs": []},
  {"type": "error","name": "InvalidConfig","inputs": []},
  {"type": "error","name": "InvalidShortString","inputs": []},
  {"type": "error","name": "MinCanOnlyIncrease","inputs": []},
  {"type": "error","name": "NotQualified","inputs": [{"name": "got","type": "uint32"},{"name": "qualify","type": "uint32"}]},
  {"type": "error","name": "NothingToUpdate","inputs": []},
  {"type": "error","name": "OwnableInvalidOwner","inputs": [{"name": "owner","type": "address"}]},
  {"type": "error","name": "OwnableUnauthorizedAccount","inputs": [{"name": "account","type": "address"}]},
  {"type": "error","name": "Soulbound","inputs": []},
  {"type": "error","name": "StringTooLong","inputs": [{"name": "str","type": "string"}]},
  {"type": "error","name": "TooFast","inputs": [{"name": "got","type": "uint32"},{"name": "min","type": "uint32"}]},
  {"type": "error","name": "TrackClosed","inputs": [{"name": "trackId","type": "uint8"}]},
];
