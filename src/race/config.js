// 赛道定义当前未提供资格线时，同步当前测试网配置（毫秒）。
export const DEFAULT_QUALIFY_MS = { easy: 58000, normal: 62000, hard: 108000 };
export function qualifyTime(entry, chainTrack) {
  const value = chainTrack?.qualifyMs ?? entry.qualifyMs ?? entry.def.qualifyMs ?? DEFAULT_QUALIFY_MS[entry.difficulty];
  return Number(value);
}
