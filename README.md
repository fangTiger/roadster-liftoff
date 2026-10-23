# 离地 LIFTOFF

在浏览器里驾驶一辆带推进器的 Roadster：沙漠公路上 0.8 秒破百，点燃推进器离地起飞，一路冲出大气层，在地球轨道上与 2018 年的"老前辈"同框。

Built with **Arc Studio** + **Claude Code**。

## 本地运行

```bash
npm install
npm run dev
```

开发阶段可用 `?view=road|chase|lift|space` 切换验证镜头。

## 分工

- **Claude Code**：3D 渲染、车辆模型处理、三个场景、镜头系统、推进器特效、大气层过渡、画面调优。
- **Arc Studio**：合成音效、成就系统、手机触控适配、素材致谢页；最终代码同步回 Arc Studio 项目。

## 素材与声明

第三方模型与贴图的作者和授权见 [CREDITS.md](CREDITS.md)。本项目为独立的粉丝致敬作品，与 Tesla、SpaceX 无关联。
