// 赛道定义当前未提供资格线时，沿用 set-tracks 脚本的默认建议（毫秒）。
export const DEFAULT_QUALIFY_MS = { easy: 60000, normal: 80000, hard: 120000 };
export function qualifyTime(entry, chainTrack) {
  const value = chainTrack?.qualifyMs ?? entry.qualifyMs ?? entry.def.qualifyMs ?? DEFAULT_QUALIFY_MS[entry.difficulty];
  return Number(value);
}
