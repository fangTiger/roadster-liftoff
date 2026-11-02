# NFT 等级线自动驾驶实测

实测日期：2026-11-02。模拟版本 `SIM_VERSION = 1`，固定步长 `DT = 1/120` 秒。

直接在 Node 中对每条赛道建立独立的 `createSession(track, { laps: 3 })`，使用 `src/race/sim/autopilot.js` 的默认参数逐步驾驶，直至完成三圈。使用正常发车、倒计时、车辆性能与赛道物理，不注入车辆位置，不修改调参，不访问链。圈速由模拟器的 `race.lapTimes` 提供，每圈秒数乘以 1000 后四舍五入为毫秒，最快圈取三圈原始秒数最小值后换算。

| 赛道 | 地图参数 / 编号 | 赛道哈希 | 第一圈（ms） | 第二圈（ms） | 第三圈（ms） | 最快单圈（ms） | 当前金 / 银线（ms） | 当前等级 |
|---|---|---|---:|---:|---:|---:|---|---|
| 草甸环线 | easy / 1 | cbea3c2e | 53517 | 52500 | 52517 | **52500** | 43500 / 51000 | 铜 |
| 湖畔环线 | normal / 2 | b514c44b | 56850 | 55842 | 55842 | **55842** | 46500 / 54600 | 铜 |
| 阿尔卑斯环线 | hard / 3 | 9d7da50e | 99325 | 99100 | 98625 | **98625** | 81000 / 95000 | 铜 |

默认自动驾驶三条赛道均未达到银线。这组结果仅代表默认自动驾驶策略，不能作为玩家极限圈速。**保留已批准的初始等级线，未按实测自行修改；是否调整由审查者确认。**

在仓库根目录运行以下命令可以复现：

```bash
node --input-type=module <<'JS'
import { TRACKS } from './src/race/track/data/index.js';
import { buildTrack, trackHash } from './src/race/track/build.js';
import { createSession } from './src/race/sim/session.js';
import { autopilot } from './src/race/sim/autopilot.js';
import { DT, SIM_VERSION } from './src/race/sim/physics.js';
for (const { difficulty, def } of TRACKS) {
  const track = buildTrack(def), session = createSession(track, { laps: 3 });
  for (let i = 0; i < 120 * 900 && !session.race.finished; i++) {
    session.step(autopilot(session, track));
  }
  if (!session.race.finished || session.race.lapTimes.length !== 3) {
    throw new Error('自动驾驶未完成三圈');
  }
  console.log({ id: def.id, difficulty, version: SIM_VERSION, dt: DT,
    trackHash: trackHash(def), lapMs: session.race.lapTimes.map(s => Math.round(s * 1000)),
    fastestMs: Math.round(Math.min(...session.race.lapTimes) * 1000) });
}
JS
```

## 审查者定稿（2026-11-02）

默认自动驾驶不漂移、不走最佳线，明显慢于真人，不能作为等级依据。改用两组参考：

| 赛道 | 困难机器人最快单圈（3 个随机种子） | 真实玩家最快圈 |
|---|---|---|
| 草甸 | 29358 / 29575 / 29625 ms | 测试网 28442、37483、41442 ms |
| 湖畔 | 30567 / 30808 / 30858 ms | 主网 31025 ms |
| 阿尔卑斯 | 54042 / 54408 / 54575 ms | 暂无 |

规则：金 = 困难机器人圈速 × 1.08，银 = 困难机器人圈速 × 1.3，取整到秒。

| 赛道 | 金（ms） | 银（ms） |
|---|---|---|
| 草甸 | 32000 | 38000 |
| 湖畔 | 33000 | 40000 |
| 阿尔卑斯 | 58000 | 70000 |

按此划分，测试网草甸三档各有玩家（28.4 秒金、37.5 秒银、41.4 秒铜），主网湖畔已铸造的 31.0 秒为金。
