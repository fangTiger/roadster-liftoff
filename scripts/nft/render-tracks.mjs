// 复用已运行的 Vite，真实自动驾驶到取景点；不启动服务，也不访问链。
// 运行：node scripts/nft/render-tracks.mjs
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { TRACKS } from '../../src/race/track/data/index.js';

const base = 'http://localhost:8932';
const output = new URL('../../public/assets/nft/', import.meta.url);
// 主线距离（米）：草甸 S 弯、湖畔锥桶 S 弯、阿尔卑斯峡谷断桥。
const viewpoints = { easy: 750, normal: 1290, hard: 1410 };
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
await mkdir(output, { recursive: true });
try {
  for (const { difficulty, def } of TRACKS) {
    assert.equal(def.id, { easy: 1, normal: 2, hard: 3 }[difficulty], '赛道编号映射发生变化');
    const page = await browser.newPage({ viewport: { width: 1080, height: 1080 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    // 场景会尝试只读赛道配置；截图只用本地资源，拦截所有外部请求。
    await page.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
    await page.goto(`${base}/?race&capture&map=${difficulty}&sky=sunset`);
    await page.waitForFunction(() => document.title === 'ready', null, { timeout: 120000 });
    await page.locator('#race-loading').waitFor({ state: 'detached' });
    await page.addStyleTag({ content: 'body > *:not(canvas){display:none!important} canvas{display:block!important}' });
    const state = await page.evaluate(distance => {
      for (let i = 0; i < 3000; i++) {
        const state = window.__race.auto(8);
        if (state.step > 600 && state.race.lap === 1 && state.car.near.path === 'main' && state.car.near.s >= distance && state.car.near.s < distance + 30) return { step: state.step, distance: state.car.near.s };
        if (state.race.finished) break;
      }
      throw new Error('自动驾驶未到达取景点');
    }, viewpoints[difficulty]);
    assert.deepEqual(errors, [], '竞速页面出现异常');
    const png = await page.locator('canvas[data-engine]').screenshot();
    // 顶部压暗，为 NFT 标题留出稳定的对比度；其余区域保留原始场景。
    const shade = Buffer.from('<svg width="1080" height="1080"><defs><linearGradient id="shade" x2="0" y2="1"><stop stop-color="#010813" stop-opacity=".62"/><stop offset=".38" stop-color="#010813" stop-opacity="0"/></linearGradient></defs><rect width="1080" height="1080" fill="url(#shade)"/></svg>');
    let jpeg, quality = 88;
    do {
      jpeg = await sharp(png).composite([{ input: shade }]).jpeg({ quality, mozjpeg: true }).toBuffer();
      quality -= 4;
    } while (jpeg.length > 250 * 1024 && quality >= 40);
    assert.ok(jpeg.length <= 250 * 1024, '底图超过 250KB');
    const file = new URL(`track-${def.id}.jpg`, output);
    await writeFile(file, jpeg);
    console.log(`已生成 ${def.name.zh}：${file.pathname}，1080×1080，${jpeg.length} 字节，取景步 ${state.step}，主线 ${state.distance.toFixed(1)} 米`);
    await page.close();
  }
} finally {
  await browser.close();
}
