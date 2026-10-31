// 主入口使用顶层 await；配置只取进程环境变量，不读取本地 .env 文件。
export default ({ command }) => ({
  envDir: false,
  build: { target: 'es2022' },
  ...(command === 'serve' ? { server: { proxy: {
    '/api': { target: 'http://127.0.0.1:8934' },
    '/rooms': { target: 'ws://localhost:8933', ws: true },
  } } } : {}),
});
