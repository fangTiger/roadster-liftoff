# 车库展厅

`room-ui.js` 在已入房且 `view === 'lobby'` 时自动挂载，房间/连接/语言变化时更新，开赛、离开或销毁 UI 时释放。页面入口加载 `garage.css`。`demo.html` 使用同一个场景和真实 Roadster 模型，供独立调试。

## API

```js
const garage = createGarage({
  container,
  loadCar, // 返回独立 THREE.Object3D；推荐 createGarageCarLoader().load
  t,
  reserve: { right: 386, bottom: 0 }, // 被面板遮挡的像素区域
  onAddBot,
  onRemoveBot,
});
garage.update(room, selfId, connected);
garage.resize({ right: 0, bottom: drawerHeight });
garage.dispose();
```

离开大厅、不可见容器、后台标签页暂停动画。`resize()` 无参数时沿用 reserve。宽度不足 900px 的展区采用 1050px 横向可滚动舞台，手机面板放在底部；右侧和底部 reserve 始终从展区扣除。名牌从各展台前沿下方定位，按前后顺序联合分配位置，优先横移再下移，避让所有车辆及已放置的名牌。车身投影使用各可见零件的局部八角点，排除隐藏的原车特效。

RoomEnvironment 生成 PMREM 环境，ACES 色调映射，像素比上限 1.5，不开启阴影贴图和后期泛光。六席共享展台几何与光池纹理，车辆相对各自镜头视线固定左前方 40 度，准备时先闪前灯，再转身展示尾焰并复位；减少运动模式关闭转身和入离场动画。空位加机器人使用面板中的当前难度，× 使用既有 removeBot 协议。

弧形 LED 屏与地图卡片使用同一套游戏内实拍 WebP（1920×1080，每张不超过 350 KB）。屏幕按全景比例裁切实景，四边渐隐、底边宽幅雾化，配合屏幕与地面微光；纹理启用 sRGB、mipmap 与设备最大各向异性。面板在邀请码下显示当前图的缩略图、名称、长度、难度，选择器收起时吸顶常驻，非房主也能看到。展开后保留三张大卡片与既有房主选图权限。

`garage-cars.js` 缓存一次 `createCar()` 源车，各座位克隆几何、材质、纹理，并只给 `car_main_paint` 上色；车库不会改动比赛用的车。席位代际检查丢弃过时加载结果，销毁后返回的模型也会释放。自定义 `loadCar` 可提供 `root.userData.dispose()`，未提供则自动遍历释放独立资源。

## 验证

```bash
node --test src/race/lobby/*.test.mjs src/race/room-ui.test.mjs
node scripts/race/capture-garage.mjs
SCENARIO=bots node scripts/rooms-e2e.mjs
node scripts/rooms-e2e.mjs
```

截图脚本需要 Vite 8932 和房间服务 8933 正在运行，输出到用户指定的 `scratchpad/lobby-3/`（可用 `GARAGE_SHOTS` 覆盖）。测试直接导入生产函数，覆盖相机边界、前脸朝向、准备时序、联合名牌避让、车漆隔离、异步乱序与释放。截图脚本等待真实车模投影齐全，检查六牌与六车全部 36 对矩形、名牌两两不重叠、上下边界；覆盖桌面、非房主、准备点击前至转身复位、手机与真实触屏，并检查当前图完整位于滚动面板可视范围。性能诊断只在 `garageCapture` 参数存在时暴露。
