# 第 2 批交付与复验

- 3.1：车辆物理、机关、会话及统计已实现；回归用例位于各模块旁。
- 3.2：RLE 录制、严格解码、Node/Chrome 重跑比对和黄金记录已实现。
- 3.3：灰盒、键盘、镜头、HUD、完整三圈及逐步截图入口已实现。
- 3.4：机器人和浏览器验证已做；人工驾驶手感与用户确认仍待进行。
- 4.x：本批仅提供机关灰盒；不表示正式场景素材、美术、性能调优等第 3 批任务完成。

按照用户“仅修改 src/main.js 与 race.test.mjs 两个既有文件”的范围约束，未修改既有 OpenSpec tasks.md；此文件记录本批实际状态，原 3.1–3.3 勾选尚待在允许修改规范时同步。

复验：

```sh
node --test $(git ls-files -co --exclude-standard | grep -E '\.test\.mjs$')
npx vite build
node scripts/race/update-golden.mjs
npx vite --host 127.0.0.1 --port 8932
node scripts/race/capture-greybox.mjs
```

入口：`/?race`；逐帧入口：`/?race&capture`。后者有 `window.__race.step(bits,n)`、`auto(n)`、`snap()`、`cam('follow'|'orbit')`、`render()` 与 `replay()`；普通局可调用 `window.__raceReplay()` 导出已录制的输入。

物理取舍：平面胶囊 + 独立高度，不模拟四轮悬架与惯性张量。恒功率加平方风阻；曲率受速度和抓地制约。最近投影在重叠路幅切换时不生成虚假起跳速度。翻滚使用平滑关键帧，在两次侧立各停留 0.20 秒，以便长车身在高速下完整穿过八米长的窄缝；无法容纳时退回入口并去除前向速度。槽内失败恢复可能有明显位置修正，需要人工评估。

风险与未验证：用户尚未试开；Firefox、Safari、手机性能未验证；未接正式音效、成就系统或链上接口（后续批次）。
