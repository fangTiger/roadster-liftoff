## ADDED Requirements

### Requirement: 影子同场
竞速模式 SHALL 允许玩家选择一个影子与自己同场行驶：无、我的最佳，或排行榜上已核实的某位玩家。

#### Scenario: 我的最佳
- **WHEN** 玩家在某地图完赛且最快单圈好于本地记录
- **THEN** 整局录像保存为该地图的「我的最佳」，下次可选作影子

#### Scenario: 影子行驶
- **WHEN** 玩家选择了影子并发车
- **THEN** 半透明的影子车按录像同步行驶，不参与碰撞，不影响玩家的成绩

#### Scenario: 时间差
- **WHEN** 玩家通过一道检查点
- **THEN** HUD 显示与影子在同一检查点的时间差，领先为绿色、落后为红色

### Requirement: 服务器核实成绩
系统 SHALL 用与浏览器相同的模拟代码重放玩家的按键录像，核实圈速与竞速成就后签名，供链上提交。

#### Scenario: 核实通过
- **WHEN** 玩家提交一局完整的三圈录像
- **THEN** 服务器重放得到与客户端一致的最快单圈，返回 EIP-712 签名，并保存该录像供他人作影子

#### Scenario: 录像无效
- **WHEN** 录像的模拟版本或赛道哈希不符、未完赛、过长或被篡改
- **THEN** 接口返回错误且不签名

#### Scenario: 密集按键录像
- **WHEN** 合法核实请求为 100 KB，且录像通过原有重放规则
- **THEN** 请求正常核实；超过 128 KB 的请求无论声明长度或真实流长度均返回 413

### Requirement: 本地联调
系统 SHALL 提供默认监听本机 8934 的 Node HTTP 接口服务，挂载 verify、ghost 和 NFT 接口；Vite 开发模式 SHALL 代理 /api。

#### Scenario: 本地文件录像
- **WHEN** GHOST_STORE=file
- **THEN** 录像按 chainId、trackId、地址隔离保存在忽略提交的 .local-data/ghosts 下，重启后可读，只保留更快录像；未指定时继续使用 Blob

#### Scenario: 开发自动驾驶
- **WHEN** 开发环境 URL 含 e2eAutopilot=1
- **THEN** 本机车可由 hard 机器人逐物理步驾驶，录像照常核实；生产构建不包含此开关或开发模块

#### Scenario: 测试网端到端工具
- **WHEN** 审查者以 PLAYER_KEY 环境变量运行脚本
- **THEN** 脚本连接注入钱包、选择草甸、完成三圈、核实并提交，检查 bestOf verified=true，在独立无钱包页面下载影子并确认同场；逐步输出结果和交易哈希，失败时截图，绝不输出私钥
- **AND** 无私钥模式只运行到连接钱包之前

#### Scenario: 影子列表
- **WHEN** 玩家打开某地图的影子选项
- **THEN** 列出排行榜前 20 名中已核实且有录像的玩家
