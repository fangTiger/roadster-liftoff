// 链上展示共用的赛道名称；编号与竞速 TRACKS 一致。
export const RACE_TRACKS = [
  { id: 1, name: '草甸环线', english: 'Meadow Loop', tiers: { goldMs: 32000, silverMs: 38000 } },
  { id: 2, name: '湖畔环线', english: 'Lakeside Loop', tiers: { goldMs: 33000, silverMs: 40000 } },
  { id: 3, name: '阿尔卑斯环线', english: 'Alpine Loop', tiers: { goldMs: 58000, silverMs: 70000 } },
];

// 等级只依赖赛道配置与圈速；未知赛道保守回退为铜级。
export function nftTier(trackId, bestMs) {
  const tiers = RACE_TRACKS.find(track => track.id === Number(trackId))?.tiers;
  if (!tiers) return 'bronze';
  if (Number(bestMs) <= tiers.goldMs) return 'gold';
  return Number(bestMs) <= tiers.silverMs ? 'silver' : 'bronze';
}
