# MarsRoadsterRacing — 圈速成绩合约

**链**：Arc Testnet  
**标准**：ERC-721 + ERC-5192（灵魂绑定）+ EIP-712（可选签名验证）+ Ownable（OpenZeppelin v5）  
**Solidity**：`^0.8.24`

---

## 概述

每位玩家最多持有**一个不可转让的首圈 NFT**（ERC-5192 灵魂绑定）。  
游戏结束后前端调用 `submit()` 上报成绩；合约为每条赛道独立记录最佳单圈时间。  
玩家自付 Gas，无转账、无 payable 函数。  
`verifier` 地址为零时为自报模式；配置签名地址后，提交需附带服务端 EIP-712 签名。

---

## 数据结构

```solidity
struct Player {
    uint32 tokenId;      // 0 = 尚未铸造
    uint8  firstTrack;   // 首次铸造时的赛道
    uint32 firstLapMs;   // 首次铸造时的成绩（永不改变）
    uint32 achievements; // 成就位图，全 32 位有效
    uint40 mintedAt;
    uint40 updatedAt;
}

struct Best {
    uint32 bestMs;    // 该赛道最佳成绩（毫秒）；0 = 未跑过
    uint40 updatedAt;
    bool   verified;  // 是否经过服务端签名验证
}

struct Track {
    uint32 qualifyMs; // 准入门槛（毫秒）；0 = 赛道关闭
    uint32 minLapMs;  // 物理下限（防作弊）；只能增大
}
```

---

## 部署参数

| 参数 | 说明 |
|------|------|
| `initialOwner` | 合约 owner，可调用 `setTrack` / `setVerifier` / `setBaseURI` |
| `baseURI_` | NFT 元数据 API 前缀，如 `https://mars-roadster.vercel.app/api/nft/` |

部署后**不自动开放赛道**，需 owner 调用 `setTrack(trackId, qualifyMs, minLapMs)` 开放。

---

## API

### `submit(uint8 trackId, uint32 lapMs, uint32 achievements, uint64 deadline, bytes calldata signature)`

提交一圈成绩。

- 自报模式（`verifier == address(0)`）：`deadline` 和 `signature` 传任意值均可（通常传 `0` 和 `""`）。
- 签名模式（`verifier != address(0)`）：`deadline` 必须 > `block.timestamp`，`signature` 是服务端对 EIP-712 `Lap` 结构体的签名。

**首次铸造条件**：`lapMs <= track.qualifyMs`（速度够快才能解锁 NFT）。  
**已有 token 后**：可向任意开放赛道提交，成绩高于 `qualifyMs` 也接受（只要有改进）。

**回滚条件**：

| 错误 | 原因 |
|------|------|
| `TrackClosed(trackId)` | 赛道未开放（`qualifyMs == 0`） |
| `TooFast(got, min)` | `lapMs < track.minLapMs`（触发物理下限） |
| `NotQualified(got, qualify)` | 首次铸造时 `lapMs > track.qualifyMs` |
| `NothingToUpdate()` | 非新 bestMs 且 achievements 无新 bit |
| `Expired()` | 签名模式下 `block.timestamp > deadline` |
| `BadSignature()` | 签名恢复地址 ≠ `verifier` |

---

### 查询函数

| 函数 | 说明 |
|------|------|
| `recordOf(address)` | 返回 `Player` 结构体 |
| `bestOf(address, uint8 trackId)` | 返回指定赛道的 `Best` 结构体 |
| `trackOf(uint8 trackId)` | 返回 `Track` 结构体 |
| `totalSupply()` | 已铸造 token 总数 |
| `playerCount()` | 玩家总数 |
| `players(uint8 trackId, uint256 start, uint256 count)` | 分页查询，返回 `(addrs, players, trackBests)` |
| `lapTypehash()` | EIP-712 `Lap` 结构体的类型哈希 |
| `domainSeparator()` | EIP-712 域分隔符 |
| `tokenURI(uint256 id)` | 返回 `baseURI + id` |
| `locked(uint256 id)` | ERC-5192：已铸造 token 始终返回 `true` |

---

### Owner 函数

| 函数 | 说明 |
|------|------|
| `setTrack(uint8 trackId, uint32 qualifyMs, uint32 minLapMs)` | 开放或修改赛道；`qualifyMs=0` 关闭赛道；`minLapMs` 只能增大 |
| `setVerifier(address)` | 设置服务端签名地址；`address(0)` 为自报模式 |
| `setBaseURI(string)` | 更新 NFT 元数据 URI 前缀 |

---

## 事件

| 事件 | 触发时机 |
|------|---------|
| `FirstLap(player, tokenId, trackId, lapMs)` | 首次铸造成功 |
| `LapRecorded(player, trackId, lapMs, improved, bestMs, achievements, verified)` | 每次 `submit` 成功 |
| `Locked(tokenId)` | 首次铸造（ERC-5192 必须） |
| `TrackSet(trackId, qualifyMs, minLapMs)` | owner 设置赛道 |
| `VerifierChanged(verifier)` | owner 更改签名地址 |
| `BaseURIChanged(baseURI)` | owner 更改 URI |

---

## EIP-712 签名格式

服务端（Node.js 示例）：

```typescript
import { signTypedData } from 'viem/accounts';

const domain = {
  name: 'MarsRoadsterRacing',
  version: '1',
  chainId: 5042002,           // Arc Testnet
  verifyingContract: CONTRACT_ADDRESS,
};

const types = {
  Lap: [
    { name: 'player',       type: 'address' },
    { name: 'trackId',      type: 'uint8'   },
    { name: 'lapMs',        type: 'uint32'  },
    { name: 'achievements', type: 'uint32'  },
    { name: 'deadline',     type: 'uint64'  },
  ],
};

const signature = await signTypedData({
  privateKey: VERIFIER_PRIVATE_KEY,
  domain,
  types,
  primaryType: 'Lap',
  message: { player, trackId, lapMs, achievements, deadline },
});
```

前端用 `lapTypehash()` 和 `domainSeparator()` 可在链上验证域参数是否匹配。

---

## 游戏接入示例

```typescript
// 自报模式（verifier == address(0)）
await contract.write.submit([
  trackId,       // uint8
  lapMs,         // uint32，毫秒
  achievements,  // uint32，成就位图
  0n,            // deadline（自报模式忽略）
  '0x',          // signature（自报模式忽略）
]);

// 签名模式：先从服务端获取签名
const { deadline, signature } = await fetchServerSignature({ player, trackId, lapMs, achievements });
await contract.write.submit([trackId, lapMs, achievements, deadline, signature]);
```

---

## 赛道设置示例

```solidity
// 开放赛道 1：qualify = 2 min，物理下限 = 1 min
setTrack(1, 120_000, 60_000);

// 关闭赛道 1
setTrack(1, 0, 60_000);   // qualifyMs = 0

// 收紧物理下限（只能增大）
setTrack(1, 120_000, 65_000);
```

---

## ABI 文件

`contracts/out/MarsRoadsterRacing.sol/MarsRoadsterRacing.json`
