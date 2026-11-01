// 多人房间开关：开发环境始终开启；生产环境需显式设置 VITE_ROOMS_ENABLED=1（房间服务托管方确定前保持隐藏）。
export function roomsEnabledFor(env = {}) {
  return !!env.DEV || env.VITE_ROOMS_ENABLED === '1';
}
export const roomsEnabled = roomsEnabledFor(import.meta.env ?? {});
