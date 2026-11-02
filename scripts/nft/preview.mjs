// 九种本地预览：注入伪造数据与本地底图，不访问链或线上资源。
// 运行：node scripts/nft/preview.mjs；产物已由 .gitignore 排除。
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createImageHandler } from '../../api/nft/image/[id].js';
import { RACE_TRACKS } from '../../src/chain/tracks.js';

const output = new URL('../../docs/nft-preview/', import.meta.url);
await mkdir(output, { recursive: true });
for (const track of RACE_TRACKS) {
  const base = await readFile(new URL(`../../public/assets/nft/track-${track.id}.jpg`, import.meta.url));
  for (const [tier, bestMs] of [['gold', track.tiers.goldMs], ['silver', track.tiers.silverMs], ['bronze', track.tiers.silverMs + 1000]]) {
    const get = createImageHandler({
      network: 'mainnet',
      baseImage: `data:image/jpeg;base64,${base.toString('base64')}`,
      readToken: async () => ({
        owner: '0x81d400000000000000000000000000000000707B',
        record: { tokenId: 1, firstTrack: track.id, firstLapMs: track.tiers.silverMs + 2000, achievements: 4095, mintedAt: 1793059200n, updatedAt: 1793060200n },
        best: { bestMs, verified: true, updatedAt: 1793060300n },
      }),
    });
    const response = await get(new Request('http://localhost/api/nft/image/1'));
    if (!response.ok || response.headers.get('content-type') !== 'image/png') throw new Error(`预览生成失败：${response.status} ${await response.text()}`);
    const file = new URL(`track-${track.id}-${tier}.png`, output);
    await writeFile(file, Buffer.from(await response.arrayBuffer()));
    console.log(`预览图已生成：${file.pathname}`);
  }
}
