# MarsRoadsterRecords — 链上成绩合约

**链**：Arc Testnet  
**合约地址**：`0x18c352faaf9fab68b7c055f22fce77a5da8f6ead`  
**（旧地址，已废弃）**：`0x7dd708e15b21dd0de73e90f8e1fcab3ac0a40aaa`  
**标准**：ERC-721 + ERC-5192（灵魂绑定）+ Ownable（OpenZeppelin v5）  
**Solidity**：`^0.8.24`

---

## 概述

每位玩家最多持有 **一个不可转让的成绩 NFT**（ERC-5192 灵魂绑定）。  
游戏结束后，前端调用 `submit()` 上报本局成绩；合约只保存 **最佳往返时间** 和 **成就位图**，链上不保存截图或过程数据。  
玩家自付 Gas，无转账、无 payable 函数。

---

## 数据结构

```solidity
struct Record {
    uint32 tokenId;      // 0 = 该地址尚未铸造
    uint32 bestMs;       // 最快往返时间（毫秒）
    uint32 achievements; // 成就位图，仅 bit 0–19 有效
    uint40 mintedAt;     // 首次铸造时间戳（Unix 秒）
    uint40 updatedAt;    // 最近更新时间戳
}
```

---

## 构造函数

```solidity
constructor(
    address initialOwner,    // 合约所有者
    uint32  minRoundTripMs_, // 最短合法往返时间（毫秒）
    string  memory baseURI_  // NFT 元数据前缀，拼接 tokenId 得到完整 URI
)
```

**部署参数（Arc Testnet）**

| 参数 | 值 |
|------|-----|
| `initialOwner` | `0x5B12Ce46C7194aD57d143bC22847224047b1Ef42`（平台部署钱包） |
| `minRoundTripMs_` | `42000`（42 秒） |
| `baseURI_` | `https://mars-roadster.vercel.app/api/nft/` |

---

## 写入函数（玩家调用）

### `submit(uint32 roundTripMs, uint32 achievements)`

上报一局成绩。

| 条件 | 结果 |
|------|------|
| `roundTripMs < minRoundTripMs` | revert `TooFast(got, min)` |
| `achievements >> 20 != 0` | revert `InvalidAchievements(bits)` |
| 玩家无 NFT | 铸造 tokenId（从 1 递增），记录成绩，emit `Locked` + `Recorded(improved=true)` |
| 有 NFT 且时间更短 | 更新 `bestMs`，合并成就位，emit `Recorded(improved=true)` |
| 有 NFT 且时间更慢但成就位有新增 | 仅合并成就位，emit `Recorded(improved=false)` |
| 有 NFT 且无任何改善 | revert `NothingToUpdate()` |

**前端调用示例（viem）**

```typescript
import { getContract, createWalletClient, custom } from 'viem';
import { arcTestnet } from 'viem/chains';
import artifact from '../../contracts/out/MarsRoadsterRecords.sol/MarsRoadsterRecords.json';

const CONTRACT = {
  address: '0x18c352faaf9fab68b7c055f22fce77a5da8f6ead' as const,
  abi: artifact.abi,
} as const;

// 上报成绩
async function submitRecord(
  walletClient: WalletClient,
  roundTripMs: number,  // 整数毫秒，例如 185_420
  achievements: number  // 20 位位图
) {
  const hash = await walletClient.writeContract({
    ...CONTRACT,
    functionName: 'submit',
    args: [roundTripMs, achievements],
  });
  return hash;
}
```

> **注意**：调用前检查 `roundTripMs >= minRoundTripMs`（可从 `minRoundTripMs()` 读取）以避免 gas 浪费。

---

## 只读函数

| 函数 | 说明 |
|------|------|
| `recordOf(address)` | 返回玩家的 `Record` 结构体；`tokenId == 0` 表示尚未铸造 |
| `totalSupply()` | 已铸造的 NFT 总数 |
| `playerCount()` | 上过榜的玩家总数（与 `totalSupply()` 相等） |
| `players(uint256 start, uint256 count)` | 分页返回 `(address[], Record[])`；`start >= length` 时返回空数组 |
| `minRoundTripMs()` | 当前最短合法往返时间（毫秒） |
| `tokenURI(uint256 id)` | `baseURI + id`；不存在则 revert |
| `locked(uint256 id)` | ERC-5192：存在的 token 恒为 `true`；不存在则 revert |
| `supportsInterface(bytes4)` | `0x80ac58cd`（ERC-721）和 `0xb45a3c0e`（ERC-5192）均返回 `true` |

### 前端读取排行榜示例

```typescript
import { createPublicClient, http } from 'viem';
import { arcTestnet } from 'viem/chains';

const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(),
});

// 读取前 50 名玩家
const [addrs, recs] = await publicClient.readContract({
  ...CONTRACT,
  functionName: 'players',
  args: [0n, 50n],
}) as [string[], Record[]];
```

---

## 事件

| 事件 | 触发时机 |
|------|----------|
| `Recorded(address indexed player, uint256 indexed tokenId, uint32 roundTripMs, bool improved, uint32 achievements, uint32 bestMs)` | 每次 `submit` 成功 |
| `Locked(uint256 tokenId)` | 首次铸造（ERC-5192） |
| `MinRoundTripMsChanged(uint32 newMin)` | Owner 调用 `setMinRoundTripMs` |
| `BaseURIChanged(string newBaseURI)` | Owner 调用 `setBaseURI` |

---

## 自定义错误

| 错误 | 含义 |
|------|------|
| `TooFast(uint32 got, uint32 min)` | 提交时间低于最小阈值 |
| `InvalidAchievements(uint32 bits)` | 成就位图超出 bit 0–19 |
| `NothingToUpdate()` | 时间未改善且无新成就 |
| `Soulbound()` | 尝试转让、approve 或 setApprovalForAll |
| `MinCanOnlyIncrease()` | 尝试将 `minRoundTripMs` 降低 |

---

## Owner 专用函数

| 函数 | 说明 |
|------|------|
| `setMinRoundTripMs(uint32 v)` | 只能增大；防止刷榜 |
| `setBaseURI(string calldata newURI)` | 更新 NFT 元数据前缀 |

---

## 灵魂绑定机制

- `_update()` 仅允许 `from == address(0)`（铸造），其他情况 revert `Soulbound()`。  
- `approve()` 和 `setApprovalForAll()` 无条件 revert `Soulbound()`。  
- 一个地址只能持有一个 NFT（由 `submit()` 中 `tokenId == 0` 的判断保证）。

---

## 文件

| 路径 | 说明 |
|------|------|
| `contracts/MarsRoadsterRecords.sol` | 合约源码 |
| `contracts/test/MarsRoadsterRecords.t.sol` | Foundry 测试（25 个用例，含 fuzz） |
| `contracts/script/DeployMarsRoadsterRecords.s.sol` | Forge 部署脚本 |
| `contracts/out/MarsRoadsterRecords.sol/MarsRoadsterRecords.json` | 编译产物（ABI + bytecode） |
| `contracts/contract-metadata/MarsRoadsterRecords.json` | 部署元数据（地址、网络、explorer 链接） |

---

## 本地开发

```bash
# 编译
bun run contracts:build   # 等价于 forge build

# 测试
bun run contracts:test    # 等价于 forge test

# 使用 Forge 脚本部署（需设置 PRIVATE_KEY 环境变量）
forge script contracts/script/DeployMarsRoadsterRecords.s.sol \
  --rpc-url <RPC_URL> --broadcast --private-key $PRIVATE_KEY
```
