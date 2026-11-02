// 链上展示共用的赛道名称；编号与竞速 TRACKS 一致。
export const RACE_TRACKS = [
  { id: 1, name: '草甸环线', english: 'Meadow Loop', tiers: { goldMs: 43500, silverMs: 51000 } },
  { id: 2, name: '湖畔环线', english: 'Lakeside Loop', tiers: { goldMs: 46500, silverMs: 54600 } },
  { id: 3, name: '阿尔卑斯环线', english: 'Alpine Loop', tiers: { goldMs: 81000, silverMs: 95000 } },
];

// 等级只依赖赛道配置与圈速；未知赛道保守回退为铜级。
export function nftTier(trackId, bestMs) {
  const tiers = RACE_TRACKS.find(track => track.id === Number(trackId))?.tiers;
  if (!tiers) return 'bronze';
  if (Number(bestMs) <= tiers.goldMs) return 'gold';
  return Number(bestMs) <= tiers.silverMs ? 'silver' : 'bronze';
}
