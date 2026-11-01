# home-hero Specification

## Purpose
首页电影感开场：加载完成后的 3D 运镜、逐字点亮的标题、带场景预览的模式卡片，以及底部链上实况条。
## Requirements
### Requirement: 首页电影感开场
系统 SHALL 在加载完成后展示电影感首页：实时 3D 背景运镜、逐字点亮的大标题与模式大卡片。

#### Scenario: 开场
- **WHEN** 资源加载完成
- **THEN** 背景镜头按预设缓慢运动，大标题逐字点亮并扫光，模式卡片依次淡入

#### Scenario: 减少动态效果
- **WHEN** 用户系统开启 prefers-reduced-motion
- **THEN** 关闭运镜与逐字动画，直接显示静态首页

### Requirement: 模式卡片
系统 SHALL 以大卡片展示可进入的模式，并在悬停时预览对应场景。

#### Scenario: 悬停预览
- **WHEN** 用户悬停或键盘聚焦某张模式卡片
- **THEN** 背景淡入该模式的实景画面（赛道预览图或太空循环视频），卡片高亮

#### Scenario: 进入模式
- **WHEN** 用户点击或按 Enter
- **THEN** 进入对应模式；「赛季」提示即将推出；多人房间按现有开关决定是否显示

#### Scenario: 手机宽度
- **WHEN** 视口宽度不超过 600px
- **THEN** 卡片纵向排列，无横向滚动

### Requirement: 链上实况条
系统 SHALL 在首页底部显示链上实况摘要。

#### Scenario: 有数据
- **WHEN** 合约可读
- **THEN** 显示已铸造数量、三条赛道当前最快圈与保持者、最新一次上链

#### Scenario: 无数据或失败
- **WHEN** 合约未配置、无记录或读取失败
- **THEN** 实况条隐藏，不影响首页其他内容

