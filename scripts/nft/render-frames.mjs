// 将手写矢量装饰渲染为 Satori 与浏览器通用的透明 PNG；不请求外部资源。
// 运行：node scripts/nft/render-frames.mjs
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const output = new URL('../../public/assets/nft/', import.meta.url);
await mkdir(output, { recursive: true });
for (const tier of ['gold', 'silver', 'bronze']) {
  const svg = await readFile(new URL(`./frames/frame-${tier}.svg`, import.meta.url));
  const png = await sharp(svg).resize(1024, 1024).ensureAlpha().png({ compressionLevel: 9, palette: true, quality: 100, effort: 10 }).toBuffer();
  const meta = await sharp(png).metadata();
  assert.ok(meta.hasAlpha && meta.width === 1024 && meta.height === 1024, '边框尺寸或透明通道不正确');
  assert.ok(png.length <= 400 * 1024, '边框超过 400KB');
  const center = await sharp(png).extract({ left: 200, top: 200, width: 624, height: 624 }).ensureAlpha().raw().toBuffer();
  assert.ok(center.every((value, i) => i % 4 !== 3 || value === 0), '装饰不得覆盖中心画面');
  const file = new URL(`frame-${tier}.png`, output);
  await writeFile(file, png);
  console.log(`已生成 ${tier} 边框：${file.pathname}，${png.length} 字节，中心透明`);
}
