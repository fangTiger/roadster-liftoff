# Mars Roadster（离地）

在浏览器里驾驶一辆带推进器的 Roadster：沙漠公路上 0.8 秒破百，点燃推进器离地起飞，一路冲出大气层，在地球轨道上与 2018 年的"老前辈"同框。

Built with **Arc Studio** + **Claude Code**。

## 本地运行

```bash
npm install
npm run dev
```

- 游戏：打开首页即可，W 加速、S 刹车、A/D 转向；按住空格冲上太空，爬升途中按 S 俯冲返回，再入途中按住空格可冲回太空。
- 效果验证镜头：`/?still=road|chase|lift|space`。
- 录制演示视频：先 `npm run dev -- --host 127.0.0.1 --port 8932`，再 `node scripts/record.mjs recordings/frames 'http://127.0.0.1:8932/?capture' 18`，最后 `python3 scripts/encode.py recordings/frames recordings/demo.mp4`。

## 素材与声明

作者：Captain@mycndota。第三方模型与贴图的作者和授权见 [CREDITS.md](CREDITS.md)。本项目为独立的粉丝致敬作品，与 Tesla、SpaceX 无关联。
