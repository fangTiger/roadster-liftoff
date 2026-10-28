import { RACE_TRACKS } from '../../../src/chain/tracks.js';
import { ImageResponse } from '../../_lib/og.js';
import { bitsToCount, formatMs, shortAddr } from '../../../src/chain/records.js';
import { getServerConfig, createTokenReader, getTokenId, jsonResponse, tokenErrorResponse } from '../../_lib/chain.js';

// 直接构造元素对象，保持普通 .js 文件可由 Node 运行，无需 JSX 转译。
const element = (type, style, ...children) => ({ type, props: { style: { display: 'flex', ...style }, children } });
const column = (label, value) => element('div', { display: 'flex', flexDirection: 'column', gap: 15 },
  element('div', { fontSize: 12, letterSpacing: 2, color: '#9bb6ca' }, label),
  element('div', { fontSize: 21, color: '#edf7ff', fontFeatureSettings: '"tnum"' }, value));

export function createImageHandler(options = {}) {
  return async request => {
    const id = getTokenId(request);
    if (id === null) return jsonResponse({ error: 'Invalid token ID' }, 400);
    try {
      const config = { ...getServerConfig(), ...options };
      const { owner, record, best } = await (config.readToken || createTokenReader(config))(id);
      const baseImage = config.baseImage || `${config.siteUrl.replace(/\/+$/, '')}/assets/nft/base.jpg`;
      const tree = element('div', {
        display: 'flex', width: 1024, height: 1024, position: 'relative', color: 'white', backgroundColor: '#030c16', fontFamily: 'sans-serif',
      },
      { type: 'img', props: { src: baseImage, width: 1024, height: 1024, style: { position: 'absolute', top: 0, left: 0, objectFit: 'cover' } } },
      element('div', { display: 'flex', position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(180deg, rgba(1,8,19,0.52) 0%, rgba(1,8,19,0) 35%, rgba(1,8,19,0.18) 100%)' }),
      element('div', { display: 'flex', flexDirection: 'column', position: 'absolute', top: 54, left: 58, gap: 15 },
        element('div', { fontSize: 19, letterSpacing: 7, color: '#c7e3f5' }, 'MARS ROADSTER'),
        element('div', { fontSize: 30, letterSpacing: 3, fontWeight: 700 }, `FIRST LAP  #${id.toString().padStart(4, '0')}`)),
      element('div', {
        display: 'flex', flexDirection: 'column', position: 'absolute', left: 36, right: 36, bottom: 36,
        padding: '30px 30px 20px', border: '1px solid rgba(165,218,255,0.42)', borderRadius: 6,
        backgroundImage: 'linear-gradient(120deg, rgba(4,17,31,0.94), rgba(13,34,52,0.85))',
      },
      element('div', { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
        element('div', { display: 'flex', flexDirection: 'column', gap: 4 },
          element('div', { fontSize: 12, letterSpacing: 3, color: '#9bb6ca' }, 'FIRST LAP'),
          element('div', { fontSize: 56, fontWeight: 700, letterSpacing: -2, fontFeatureSettings: '"tnum"' }, formatMs(record.firstLapMs))),
        element('div', { display: 'flex', gap: 18, paddingLeft: 20, borderLeft: '1px solid rgba(165,218,255,0.25)' },
          column('BEST LAP', formatMs(best.bestMs)),
          column('ACHIEVEMENTS', `${bitsToCount(record.achievements)}/28`),
          column('MINTED', new Date(Number(record.mintedAt) * 1000).toISOString().slice(0, 10)),
          column('PILOT', shortAddr(owner)))),
      element('div', { fontSize: 19, color: '#c7e3f5', marginTop: 14 }, RACE_TRACKS.find(track => track.id === Number(record.firstTrack))?.english || `Track ${record.firstTrack}`),
      element('div', { gap: 5, marginTop: 16 }, ...Array.from({ length: 28 }, (_, i) => element('div', { flex: 1, height: 5, backgroundColor: Number(record.achievements) >>> i & 1 ? '#7fe3ff' : '#294052' }))),
      element('div', { display: 'flex', marginTop: 22, paddingTop: 15, borderTop: '1px solid rgba(165,218,255,0.18)', fontSize: 10, letterSpacing: 2, color: '#88a6bb' },
        `SELF-REPORTED · NON-TRANSFERABLE · ${config.network === 'mainnet' ? 'ARC' : 'ARC TESTNET'}`)));
      // 先消费渲染流，确保渲染失败时能返回不缓存的错误响应。
      const image = new ImageResponse(tree, { width: 1024, height: 1024 });
      return new Response(await image.arrayBuffer(), { headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        'Access-Control-Allow-Origin': '*',
      } });
    } catch (error) {
      return tokenErrorResponse(error);
    }
  };
}

export async function GET(request) {
  return createImageHandler()(request);
}
