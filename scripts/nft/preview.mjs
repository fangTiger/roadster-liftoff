import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createImageHandler } from '../../api/nft/image/[id].js';

// 本地底图转为 data URL，预览不依赖线上站点或真实链。
const base = await readFile(new URL('../../public/assets/nft/base.jpg', import.meta.url));
const GET = createImageHandler({
  network: 'testnet',
  baseImage: `data:image/jpeg;base64,${base.toString('base64')}`,
  readToken: async () => ({
    owner: '0x81d400000000000000000000000000000000707B',
    record: { tokenId: 1, bestMs: 46830, achievements: 4095, mintedAt: 1793059200n, updatedAt: 1793060200n },
  }),
});
const response = await GET(new Request('http://localhost/api/nft/image/1?v=1793060200'));
if (!response.ok || response.headers.get('content-type') !== 'image/png') {
  throw new Error(`预览生成失败：${response.status} ${await response.text()}`);
}
const output = new URL('../../recordings/nft-preview.png', import.meta.url);
await mkdir(new URL('.', output), { recursive: true });
await writeFile(output, Buffer.from(await response.arrayBuffer()));
console.log(`预览图已生成：${output.pathname}`);
