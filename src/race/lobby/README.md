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

`update(null)`、非 lobby 阶段、不可见容器、后台标签页暂停动画。`resize()` 无参数时沿用 reserve。宽度不足 900px 的展区采用 1050px 横向可滚动舞台，手机面板放在底部；右侧和底部 reserve 始终从展区扣除。名牌按舞台中每个展台的投影定位，宽度按实际投影间距限制。

RoomEnvironment 生成 PMREM 环境，ACES 色调映射，像素比上限 1.5，不开启阴影贴图和后期泛光。六席共享展台几何与光池纹理，车辆慢速旋转，准备切换点亮环与光池；减少运动模式关闭旋转和入离场动画。空位加机器人使用面板中的当前难度，× 使用既有 removeBot 协议。

`garage-cars.js` 缓存一次 `createCar()` 源车，各座位克隆几何、材质、纹理，并只给 `car_main_paint` 上色；车库不会改动比赛用的车。席位代际检查丢弃过时加载结果，销毁后返回的模型也会释放。自定义 `loadCar` 可提供 `root.userData.dispose()`，未提供则自动遍历释放独立资源。

## 验证

```bash
node --test src/race/lobby/*.test.mjs src/race/room-ui.test.mjs
node scripts/race/capture-garage.mjs
SCENARIO=bots node scripts/rooms-e2e.mjs
node scripts/rooms-e2e.mjs
```

截图脚本需要 Vite 8932 和房间服务 8933 正在运行，输出到用户指定的 `scratchpad/visuals-2/`（可用 `GARAGE_SHOTS` 覆盖）。测试直接导入生产函数，覆盖相机边界、席位差分、车漆隔离、异步乱序与释放；截图脚本使用真实建房/加入/加删机器人操作，并检查名牌边界、像素比与页面报错。
