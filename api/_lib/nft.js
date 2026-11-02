import { RACE_TRACKS, nftTier } from '../../src/chain/tracks.js';

// 三个接口共用赛道、等级与最快圈兜底，确保钱包和展示页内容一致。
const TIER_STYLES = {
  gold: { label: 'Gold', light: '#f6d27a', dark: '#c8902f', tint: 'rgba(225,164,39,0.08)', panelGradient: 'linear-gradient(120deg, rgba(32,25,13,0.95), rgba(54,40,18,0.88))' },
  silver: { label: 'Silver', light: '#e6eef5', dark: '#9fb3c4', tint: 'rgba(126,183,226,0.09)', panelGradient: 'linear-gradient(120deg, rgba(13,24,37,0.95), rgba(29,46,65,0.88))' },
  bronze: { label: 'Bronze', light: '#e3a77a', dark: '#9a5b34', tint: 'rgba(172,78,38,0.10)', panelGradient: 'linear-gradient(120deg, rgba(33,20,16,0.95), rgba(56,34,25,0.88))' },
};
export function nftPresentation(record, best) {
  const track = RACE_TRACKS.find(value => value.id === Number(record.firstTrack));
  const bestMs = Number(best.bestMs) || Number(record.firstLapMs);
  const tier = nftTier(record.firstTrack, bestMs);
  return {
    bestMs, tier, ...TIER_STYLES[tier],
    framePath: `/assets/nft/frame-${tier}.png`,
    trackName: track?.english || `Track ${record.firstTrack}`,
    imagePath: `/assets/nft/${track ? `track-${track.id}` : 'base'}.jpg`,
    verification: best.verified ? 'VERIFIED' : 'SELF-REPORTED',
  };
}
