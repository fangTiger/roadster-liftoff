// 把 Poly Haven 的 16K HDR 全景烘焙成赛道天空分块：按 three.js ACESFilmic（与渲染器相同的曝光）色调映射，转 sRGB，
// 地平线以上 4 块 4096²（天空和远山，保留全分辨率），地平线以下 4 块 2048²（多被三维地面遮住），另出一张 4096×2048 预览先加载。
// 用法：node scripts/race/bake-sky.mjs <输入.hdr> <输出目录> [曝光=0.85]
import fs from 'node:fs';
import sharp from 'sharp';
const [input, out, exposureArg] = process.argv.slice(2), exposure = Number(exposureArg || .85);
fs.mkdirSync(out, { recursive: true });
const buf = fs.readFileSync(input);
// 解析文件头
let pos = 0, line = '', W = 0, H = 0;
while (true) { const c = buf[pos++]; if (c === 10) { if (/^-Y \d+ \+X \d+/.test(line)) { const m = line.match(/-Y (\d+) \+X (\d+)/); H = +m[1]; W = +m[2]; break; } line = ''; } else line += String.fromCharCode(c); }
console.log('尺寸', W, H);
const rgb = Buffer.alloc(W * H * 3), scan = new Uint8Array(W * 4);
// sRGB 编码查找表（输入 0..1 量化到 4096 级）
const LUT = new Uint8Array(4097);
for (let i = 0; i <= 4096; i++) { const v = i / 4096; LUT[i] = Math.round(255 * (v <= .0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - .055)); }
const fit = v => (v * (v + .0245786) - .000090537) / (v * (.983729 * v + .4329510) + .238081);
const k = exposure / .6;
for (let y = 0; y < H; y++) {
  // 新式 RLE 扫描线：2 2 hi lo，然后四个通道分别游程编码
  if (buf[pos] !== 2 || buf[pos + 1] !== 2) throw new Error('不支持的扫描线格式 ' + y);
  pos += 4;
  for (let ch = 0; ch < 4; ch++) {
    let x = 0;
    while (x < W) {
      let n = buf[pos++];
      if (n > 128) { n -= 128; const v = buf[pos++]; for (let i = 0; i < n; i++) scan[(x++) * 4 + ch] = v; }
      else for (let i = 0; i < n; i++) scan[(x++) * 4 + ch] = buf[pos++];
    }
  }
  for (let x = 0; x < W; x++) {
    const e = scan[x * 4 + 3], o = (y * W + x) * 3;
    if (!e) { rgb[o] = rgb[o + 1] = rgb[o + 2] = 0; continue; }
    const f = Math.pow(2, e - 136) * k;
    const r = scan[x * 4] * f, g = scan[x * 4 + 1] * f, b = scan[x * 4 + 2] * f;
    // ACES 输入矩阵 → RRT/ODT 拟合 → 输出矩阵（与 three.js ACESFilmicToneMapping 一致）
    const ir = fit(.59719 * r + .35458 * g + .04823 * b), ig = fit(.07600 * r + .90834 * g + .01566 * b), ib = fit(.02840 * r + .13383 * g + .83777 * b);
    const or = 1.60475 * ir - .53108 * ig - .07367 * ib, og = -.10208 * ir + 1.10813 * ig - .00605 * ib, ob = -.00327 * ir - .07276 * ig + 1.07602 * ib;
    rgb[o] = LUT[Math.round(Math.min(1, Math.max(0, or)) * 4096)]; rgb[o + 1] = LUT[Math.round(Math.min(1, Math.max(0, og)) * 4096)]; rgb[o + 2] = LUT[Math.round(Math.min(1, Math.max(0, ob)) * 4096)];
  }
  if (y % 1024 === 0) console.log('解码行', y);
}
const raw = { raw: { width: W, height: H, channels: 3 }, limitInputPixels: false };
const tile = W / 4;
for (let i = 0; i < 4; i++) {
  await sharp(rgb, raw).extract({ left: i * tile, top: 0, width: tile, height: H / 2 }).jpeg({ quality: 86, mozjpeg: true }).toFile(`${out}/sky-top-${i}.jpg`);
  await sharp(rgb, raw).extract({ left: i * tile, top: H / 2, width: tile, height: H / 2 }).resize(2048, 2048).jpeg({ quality: 82, mozjpeg: true }).toFile(`${out}/sky-bottom-${i}.jpg`);
}
await sharp(rgb, raw).resize(4096, 2048).jpeg({ quality: 82, mozjpeg: true }).toFile(`${out}/sky-preview.jpg`);
console.log('完成');
