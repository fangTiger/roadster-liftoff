import { RACE_TRACKS, nftTier } from '../../src/chain/tracks.js';

// 三个接口共用赛道、等级与最快圈兜底，确保钱包和展示页内容一致。
const TIER_STYLES = {
  gold: { label: 'Gold', light: '#f6d27a', dark: '#c8902f' },
  silver: { label: 'Silver', light: '#e6eef5', dark: '#9fb3c4' },
  bronze: { label: 'Bronze', light: '#e3a77a', dark: '#9a5b34' },
};
export function nftPresentation(record, best) {
  const track = RACE_TRACKS.find(value => value.id === Number(record.firstTrack));
  const bestMs = Number(best.bestMs) || Number(record.firstLapMs);
  const tier = nftTier(record.firstTrack, bestMs);
  return {
    bestMs, tier, ...TIER_STYLES[tier],
    trackName: track?.english || `Track ${record.firstTrack}`,
    imagePath: `/assets/nft/${track ? `track-${track.id}` : 'base'}.jpg`,
    verification: best.verified ? 'VERIFIED' : 'SELF-REPORTED',
  };
}
