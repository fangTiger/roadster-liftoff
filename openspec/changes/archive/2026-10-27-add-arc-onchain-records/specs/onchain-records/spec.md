## ADDED Requirements

### Requirement: 往返纪念 NFT
系统 SHALL 允许完成过一次完整往返的玩家在 Arc 上铸造一枚往返纪念 NFT；每个钱包最多一枚，且不可转让。

#### Scenario: 首次铸造
- **WHEN** 未持有 NFT 的钱包提交一次有效往返成绩
- **THEN** 合约为其铸造一枚新编号的 NFT，并记录该成绩

#### Scenario: 不能重复铸造
- **WHEN** 已持有 NFT 的钱包再次提交
- **THEN** 不铸造新 NFT，只更新记录

#### Scenario: 不可转让
- **WHEN** 任何人调用转让或授权函数
- **THEN** 交易被拒绝

### Requirement: 往返最快成绩
系统 SHALL 为每个钱包保存往返最快用时，只在新成绩更快时更新，并拒绝低于物理下限的成绩。

#### Scenario: 成绩更快
- **WHEN** 提交的用时短于该钱包已有最好成绩
- **THEN** 最好成绩更新为新用时

#### Scenario: 成绩过快
- **WHEN** 提交的用时低于合约设定的下限
- **THEN** 交易被拒绝

#### Scenario: 下限只能调高
- **WHEN** 合约管理员尝试把下限调低
- **THEN** 交易被拒绝

### Requirement: 链上成就记录
系统 SHALL 以位图形式为每个钱包记录已解锁的成就，只增不减。

#### Scenario: 合并新成就
- **WHEN** 钱包提交包含新成就的位图
- **THEN** 链上位图与之按位或合并，已有成就保留

#### Scenario: 无效成就位
- **WHEN** 提交的位图包含第 20 位以上的位
- **THEN** 交易被拒绝

### Requirement: 游戏内铸造与更新
游戏 SHALL 在玩家安全返航后的成绩面板提供连接钱包并铸造或更新链上记录的入口，且没有可更新内容时不发交易。

#### Scenario: 未持有 NFT
- **WHEN** 玩家完成往返并连接了未持有 NFT 的钱包
- **THEN** 面板显示「铸造纪念 NFT」，成功后显示区块浏览器链接

#### Scenario: 无可更新内容
- **WHEN** 本局成绩不比链上更快且没有新成就
- **THEN** 面板提示链上记录已是最新，不发起交易

#### Scenario: 交易失败
- **WHEN** 余额不足、用户取消或网络错误
- **THEN** 面板显示对应原因，游戏继续正常运行

### Requirement: 链上记录面板
游戏 SHALL 提供链上记录面板，显示玩家自己的 NFT、链上成就，以及往返榜前 50 名，并标注为玩家自报成绩。

#### Scenario: 查看往返榜
- **WHEN** 玩家打开链上记录面板
- **THEN** 显示按往返用时升序排列的前 50 名，并注明「玩家自报成绩」

### Requirement: NFT 元数据与图片
网站 SHALL 为每枚 NFT 提供元数据与图片，图片由真车渲染底图和按链上数据合成的信息栏组成。

#### Scenario: 钱包读取 NFT
- **WHEN** 钱包或区块浏览器请求某枚 NFT 的元数据
- **THEN** 返回名称、描述（含非隶属声明）、图片地址和属性（往返用时、毫秒用时、成就数、铸造日期、网络），名称包含至少四位补零编号

#### Scenario: 成绩更新后图片变化
- **WHEN** 持有者更新了最好成绩
- **THEN** 之后请求的图片显示新的往返用时

#### Scenario: 无效或不存在的编号
- **WHEN** 请求编号不是正整数字符串，或 ownerOf 因 token 不存在而回退
- **THEN** 元数据、图片与展示页接口分别返回 JSON 400 或 JSON 404；RPC 故障返回不缓存的 JSON 503

#### Scenario: 版本图片与缓存
- **WHEN** 请求 `/api/nft/[id]`
- **THEN** 返回英文元数据、玩家自报 / 不可转让 / 非商业粉丝致敬与 Tesla、SpaceX 非隶属声明，图片地址为 `/api/nft/image/[id]?v=updatedAt`，缓存为 `public, s-maxage=60, stale-while-revalidate=300` 且允许跨域读取
- **WHEN** 请求上述图片地址
- **THEN** 返回 1024×1024 PNG，底图铺满、显示用时、成就数、UTC 铸造日期、钱包缩写和网络声明，缓存为 `public, s-maxage=86400, immutable`

#### Scenario: 动态展示
- **WHEN** 请求元数据
- **THEN** `animation_url` 为 `/api/nft/view/[id]?v=updatedAt`
- **WHEN** 请求上述展示页
- **THEN** 返回 HTML：循环播放轨道视频（只有白车、地球和星空，含喷焰与翻滚），叠加与静态图相同的信息栏，按链上成就位图点亮 20 格成就条；无效、不存在和 RPC 故障时与图片接口返回相同的 JSON 错误
