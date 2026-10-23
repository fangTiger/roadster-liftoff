# 实施与验证

- [x] 阅读项目、技能及规范；检查 OpenSpec（项目未初始化）与 Graphify（无产物）。
- [x] 明确总线、流式音乐、合成音效、异常及兼容性设计。
- [x] 先编写并执行失败的行为测试。
- [x] 实现 audio.js：解锁、流式播放、平滑切换及持久化。
- [x] 实现动态混音、连续音效及自清理事件。
- [x] 实现所有控制项的独立演示页。
- [x] 编写中文 API、集成与限制说明。
- [x] 执行语法及行为验证，检查范围并核对需求。

## 验证证据

- `node --check src/audio/audio.js`：通过。
- `node --test src/audio/audio.test.mjs`：9 项通过，0 项失败；新增缺陷均先观察失败，再修复。
- `node_modules/.bin/vite build --outDir /tmp/liftoff-audio-build --emptyOutDir`：通过；仅有现有 three.js 相关大包提示。产物在临时目录。
- Chromium：真实 MP3、音频非零输出、全部状态/事件、自动返回、静音/存储、逐帧节点复用与手机/桌面布局通过，无控制台错误。
- 本机缓存 Firefox：真实 MP3、音频输出、全部状态/事件、自动返回、静音/存储、节点复用及桌面布局通过，无控制台错误。
- Safari/WebKit：当前 Playwright 缺少匹配版本；旧缓存创建页面时协议不兼容，未完成实测。不安装浏览器。
- 只读审查发现的 3 项问题已修复并经二次审查确认；不保证任意 MP3 的采样级无缝，限制已在规范和 README 说明。
