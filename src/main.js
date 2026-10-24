// Mars Roadster 入口：?still=xxx 打开效果验证镜头，否则进入游戏
if (/[?&]still=/.test(location.search)) import('./stills.js');
else import('./game/index.js');
