// 主入口使用顶层 await，构建目标设为 ES2022
export default { build: { target: 'es2022' }, server: { proxy: { '/rooms': { target: 'ws://localhost:8933', ws: true } } } };
