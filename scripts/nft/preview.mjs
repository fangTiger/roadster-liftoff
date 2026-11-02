// 九种本地预览：注入伪造数据与本地底图，不访问链或线上资源。
// 运行：node scripts/nft/preview.mjs；产物已由 .gitignore 排除。
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { createImageHandler } from '../../api/nft/image/[id].js';
import { RACE_TRACKS } from '../../src/chain/tracks.js';

const output = new URL('../../docs/nft-preview/', import.meta.url);
await mkdir(output, { recursive: true });
const tiles = [];
for (const track of RACE_TRACKS) {
  const base = await readFile(new URL(`../../public/assets/nft/track-${track.id}.jpg`, import.meta.url));
  for (const [tier, bestMs] of [['gold', track.tiers.goldMs], ['silver', track.tiers.silverMs], ['bronze', track.tiers.silverMs + 1000]]) {
    const frame = await readFile(new URL(`../../public/assets/nft/frame-${tier}.png`, import.meta.url));
    const get = createImageHandler({
      network: 'mainnet',
      baseImage: `data:image/jpeg;base64,${base.toString('base64')}`,
      frameImage: `data:image/png;base64,${frame.toString('base64')}`,
      readToken: async () => ({
        owner: '0x81d400000000000000000000000000000000707B',
        record: { tokenId: 1, firstTrack: track.id, firstLapMs: track.tiers.silverMs + 2000, achievements: 4095, mintedAt: 1793059200n, updatedAt: 1793060200n },
        best: { bestMs, verified: true, updatedAt: 1793060300n },
      }),
    });
    const response = await get(new Request('http://localhost/api/nft/image/1'));
    if (!response.ok || response.headers.get('content-type') !== 'image/png') throw new Error(`预览生成失败：${response.status} ${await response.text()}`);
    const file = new URL(`track-${track.id}-${tier}.png`, output);
    const png = Buffer.from(await response.arrayBuffer());
    await writeFile(file, png);
    // 行为赛道 1/2/3，列为金/银/铜；以 512px 保留宝石和文字细节。
    tiles.push({ input: await sharp(png).resize(512, 512).toBuffer(), left: (tiles.length % 3) * 512, top: Math.floor(tiles.length / 3) * 512 });
    console.log(`预览图已生成：${file.pathname}`);
  }
}
const grid = new URL('grid.jpg', output);
await sharp({ create: { width: 1536, height: 1536, channels: 3, background: '#030c16' } }).composite(tiles).jpeg({ quality: 92, mozjpeg: true }).toFile(grid.pathname);
await sharp(grid.pathname).resize(768, 768).jpeg({ quality: 92, mozjpeg: true }).toFile(new URL('grid-256.jpg', output).pathname);
console.log(`预览拼图已生成：${grid.pathname}`);
