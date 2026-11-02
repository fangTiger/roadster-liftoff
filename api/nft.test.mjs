import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { readFile, stat } from 'node:fs/promises';
import { ContractFunctionRevertedError } from 'viem';
import { createMetadataHandler } from './nft/[id].js';
import * as imageModule from './nft/image/[id].js';
const { createImageHandler } = imageModule;
import { createViewHandler } from './nft/view/[id].js';
import { createTokenReader, getServerConfig, TokenNotFoundError } from './_lib/chain.js';

const owner = '0x81d400000000000000000000000000000000707B';
const record = { tokenId: 1, firstTrack: 1, firstLapMs: 50000, achievements: 4095, mintedAt: 1793059200n, updatedAt: 1793060200n };
const best = { bestMs: 46830, updatedAt: 1793060200n, verified: false };
const readToken = async id => { assert.equal(id, 1n); return { owner, record, best }; };
const localFrame = async tier => `data:image/png;base64,${(await readFile(new URL(`../public/assets/nft/frame-${tier}.png`, import.meta.url))).toString('base64')}`;
const request = (id = '1', image = false) => new Request(`https://example.com/api/nft/${image ? 'image/' : ''}${id}`);

test('元数据完整、复用格式化、带更新版本及缓存与跨域头', async () => {
  const get = createMetadataHandler({ readToken, siteUrl: 'https://custom.example/', network: 'testnet' });
  const res = await get(request());
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /application\/json/);
  assert.equal(res.headers.get('cache-control'), 'public, s-maxage=60, stale-while-revalidate=300');
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
  const data = await res.json();
  assert.equal(data.name, 'Mars Roadster First Lap #0001');
  assert.equal(data.external_url, 'https://mars-roadster.vercel.app');
  assert.equal(data.image, 'https://custom.example/api/nft/image/1?v=1793060200');
  assert.equal(data.animation_url, 'https://custom.example/api/nft/view/1?v=1793060200');
  for (const text of ['first', 'lap', 'self-reported', 'non-transferable', 'non-commercial', 'Tesla', 'SpaceX']) assert.ok(data.description.includes(text));
  assert.deepEqual(data.attributes, [
    { trait_type: 'Track', value: 'Meadow Loop' },
    { trait_type: 'Tier', value: 'Bronze' },
    { trait_type: 'First lap', value: '50.00 s' },
    { trait_type: 'Best lap', value: '46.83 s' },
    { trait_type: 'Achievements', value: 12, max_value: 28, display_type: 'number' },
    { trait_type: 'Minted', value: 1793059200, display_type: 'date' },
    { trait_type: 'Network', value: 'Arc Testnet' },
  ]);
  const main = await createMetadataHandler({ readToken, network: 'mainnet' })(request());
  assert.equal((await main.json()).attributes.at(-1).value, 'Arc');
});

test('更新后的图片地址变化', async () => {
  const get = createMetadataHandler({ readToken: async () => ({ owner, record, best: { ...best, bestMs: 45000, updatedAt: 1793060300n } }) });
  assert.match((await (await get(request())).json()).image, /\?v=1793060300$/);
});

test('动态展示页：服务器写入链上数据、赛道底图、点亮对应成就格', async () => {
  const res = await createViewHandler({ readToken, siteUrl: 'https://custom.example/', network: 'mainnet' })(request());
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
  const html = await res.text();
  assert.ok(html.includes('src="https://custom.example/assets/nft/track-1.jpg"'));
  assert.ok(html.includes('FIRST LAP&nbsp;&nbsp;#0001'));
  assert.ok(html.includes('data-ms="50000">50.00 s'));
  assert.ok(html.includes('12/28'));
  assert.ok(html.includes('BEST LAP'));
  assert.ok(html.includes('46.83 s'));
  assert.ok(html.includes('Meadow Loop'));
  assert.ok(html.includes('0x81d4…707B'));
  assert.ok(html.includes('NON-TRANSFERABLE · ARC<'));
  // 4095 = 低 12 位全亮
  assert.equal((html.match(/<i class="on"/g) || []).length, 12);
  assert.equal((html.match(/<i[ >]/g) || []).length, 28);
});

for (const factory of [createMetadataHandler, createImageHandler, createViewHandler]) {
  test(`${factory.name} 拒绝非正整数字符串且不读链`, async () => {
    const get = factory({ readToken: async () => assert.fail('无效参数不得读链') });
    for (const id of ['0', '-1', '1.5', 'abc', '1e3', '0x1', '%20', '']) {
      const res = await get(request(id, factory === createImageHandler));
      assert.equal(res.status, 400, id);
      assert.ok((await res.json()).error);
    }
  });
  test(`${factory.name} 不存在返回 JSON 404，RPC 错误返回 503 且不缓存`, async () => {
    const missing = await factory({ readToken: async () => { throw new TokenNotFoundError(); } })(request());
    assert.equal(missing.status, 404);
    assert.ok((await missing.json()).error);
    const failed = await factory({ readToken: async () => { throw new Error('RPC timeout'); } })(request());
    assert.equal(failed.status, 503);
    assert.equal(failed.headers.get('cache-control'), 'no-store');
  });
}

test('服务器配置独立于 Vite，默认测试网且支持主网与地址', () => {
  assert.equal(getServerConfig({}).chain.id, 5042002);
  assert.equal(getServerConfig({}).address, '0xbcc98b9635113a0669F97ce4122f3e2C5490dc59');
  assert.equal(getServerConfig({ ARC_NETWORK: 'mainnet' }).address, '');
  const config = getServerConfig({ ARC_NETWORK: 'mainnet', RACING_ADDRESS: owner, SITE_URL: 'https://custom.example/' });
  assert.equal(config.chain.id, 5042);
  assert.equal(config.address, owner);
  assert.equal(config.siteUrl, 'https://custom.example');
});

test('链读取通过共享 ABI 顺序查 ownerOf 和 recordOf', async () => {
  const calls = [];
  const reader = createTokenReader({ address: owner, readContract: async args => {
    calls.push(args);
    return args.functionName === 'ownerOf' ? owner : args.functionName === 'recordOf' ? record : best;
  } });
  assert.deepEqual(await reader(1n), { owner, record, best });
  assert.deepEqual(calls.map(c => [c.functionName, c.args]), [['ownerOf', [1n]], ['recordOf', [owner]], ['bestOf', [owner, 1]]]);
  assert.ok(calls.every(c => c.address === owner && c.abi.some(item => item.name === 'ownerOf')));
});

test('ownerOf revert 为不存在，RPC 故障保留错误', async () => {
  const reader = createTokenReader({ address: owner, readContract: async () => { throw new ContractFunctionRevertedError({ abi: [], functionName: 'ownerOf' }); } });
  await assert.rejects(reader(999n), TokenNotFoundError);
  const failure = new Error('RPC timeout');
  await assert.rejects(createTokenReader({ address: owner, readContract: async () => { throw failure; } })(1n), error => error === failure);
});

test('图片实际渲染为 1024 方形 PNG，返回正确类型与短缓存', async () => {
  const base = await readFile(new URL('../public/assets/nft/base.jpg', import.meta.url));
  const get = createImageHandler({ readToken, frameImage: await localFrame('bronze'), baseImage: `data:image/jpeg;base64,${base.toString('base64')}` });
  const res = await get(request('1?v=1793060200', true));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/png');
  assert.equal(res.headers.get('cache-control'), 'public, s-maxage=60, stale-while-revalidate=300');
  const png = Buffer.from(await res.arrayBuffer());
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(png.readUInt32BE(16), 1024);
  assert.equal(png.readUInt32BE(20), 1024);
});

test('超出 Record uint32 编号范围的正整数直接判为不存在', async () => {
  const reader = createTokenReader({ address: owner, readContract: async () => assert.fail('超出编号范围不应读链') });
  await assert.rejects(reader(1n << 256n), TokenNotFoundError);
});

const palettes = {
  Gold: ['#f6d27a', '#c8902f'], Silver: ['#e6eef5', '#9fb3c4'], Bronze: ['#e3a77a', '#9a5b34'],
};
// 同时检查静态图元素树与真实 PNG，避免仅验证样式配置而漏掉渲染兼容性。
for (const [trackId, times] of [[1, [32000, 38000, 38001]], [2, [33000, 40000, 40001]], [3, [58000, 70000, 70001]]]) {
  for (const [index, tier] of ['Gold', 'Silver', 'Bronze'].entries()) {
    test(`赛道 ${trackId} 的 ${tier} 在三个接口保持一致`, async () => {
      const token = { owner, record: { ...record, firstTrack: trackId, firstLapMs: times[2] + 1000 }, best: { ...best, bestMs: times[index], verified: true } };
      const config = { ...token, id: 1n, network: 'mainnet', siteUrl: 'https://custom.example' };
      const tree = imageModule.renderImage(config), serialized = JSON.stringify(tree);
      assert.ok(serialized.includes(`/assets/nft/track-${trackId}.jpg`));
      const framePath = `/assets/nft/frame-${tier.toLowerCase()}.png`;
      const frame = tree.props.children.at(-1);
      assert.equal(frame.type, 'img');
      assert.equal(frame.props.src, `https://custom.example${framePath}`);
      assert.deepEqual([frame.props.width, frame.props.height], [1024, 1024]);
      assert.equal(frame.props.style.position, 'absolute');
      assert.ok(tree.props.children.some(child => child.props?.style?.backgroundColor === ({ Gold: 'rgba(225,164,39,0.08)', Silver: 'rgba(126,183,226,0.09)', Bronze: 'rgba(172,78,38,0.10)' })[tier]));
      assert.ok(serialized.includes(tier.toUpperCase()));
      for (const color of palettes[tier]) assert.ok(serialized.includes(color));
      assert.ok(serialized.includes('VERIFIED · NON-TRANSFERABLE · ARC'));
      assert.ok(serialized.includes(`${(times[index] / 1000).toFixed(2)} s`));
      const read = async () => token;
      const metadata = await (await createMetadataHandler({ readToken: read })(request())).json();
      assert.equal(metadata.attributes.find(a => a.trait_type === 'Tier').value, tier);
      assert.match(metadata.description, /verified by the server/);
      assert.doesNotMatch(metadata.description, /self-reported/);
      for (const text of ['non-transferable', 'non-commercial', 'Tesla', 'SpaceX']) assert.ok(metadata.description.includes(text));
      const html = await (await createViewHandler({ readToken: read })(request())).text();
      assert.ok(html.includes(`/assets/nft/track-${trackId}.jpg`));
      assert.ok(html.includes(tier.toUpperCase()));
      assert.ok(html.includes(`class="frame" src="https://mars-roadster.vercel.app${framePath}"`));
      assert.ok(html.indexOf('class="frame"') > html.indexOf('class="panel in"'));
      assert.doesNotMatch(html, /class="badge"|border-image:/);
      assert.match(html, /\.card\{[^}]*position:relative/);
      assert.doesNotMatch(html, /position:fixed/);
      for (const color of palettes[tier]) assert.ok(html.includes(color));
      assert.match(html, /VERIFIED · NON-TRANSFERABLE/);
      assert.doesNotMatch(html, /<video|loop\.mp4|ORBIT/);
      assert.match(html, /@keyframes zoom/);
      assert.match(html, /prefers-reduced-motion:reduce/);
      const base = await readFile(new URL('../public/assets/nft/base.jpg', import.meta.url));
      const res = await createImageHandler({ readToken: read, frameImage: await localFrame(tier.toLowerCase()), baseImage: `data:image/jpeg;base64,${base.toString('base64')}` })(request());
      assert.equal(res.status, 200);
      const png = Buffer.from(await res.arrayBuffer());
      assert.equal(png.readUInt32BE(16), 1024);
      assert.equal(png.readUInt32BE(20), 1024);
      // 使用真实装饰资源对比不透明金属像素，验证 Satori 最上层确实渲染了框。
      const frameFile = await readFile(new URL(`../public/assets/nft/frame-${tier.toLowerCase()}.png`, import.meta.url));
      for (const [left, top] of [[34, 300], [990, 700]]) {
        const region = { left, top, width: 1, height: 1 };
        const expected = await sharp(frameFile).extract(region).ensureAlpha().raw().toBuffer();
        assert.equal(expected[3], 255, '金属主体应不透明');
        const actual = await sharp(png).extract(region).ensureAlpha().raw().toBuffer();
        expected.forEach((channel, i) => assert.ok(Math.abs(actual[i] - channel) <= 3, `装饰框实际像素 ${actual} 应匹配资源 ${expected}`));
      }

    });
  }
}
for (const [firstTrack, firstLapMs, tier, image] of [[2, 33000, 'Gold', 'track-2.jpg'], [99, 1, 'Bronze', 'base.jpg']]) {
  test(`赛道 ${firstTrack} 无最快圈时使用首圈，未知赛道使用通用图与铜级`, async () => {
    const token = { owner, record: { ...record, firstTrack, firstLapMs }, best: { ...best, bestMs: 0 } };
    const read = async () => token;
    const data = await (await createMetadataHandler({ readToken: read })(request())).json();
    assert.equal(data.attributes.find(a => a.trait_type === 'Tier').value, tier);
    assert.equal(data.attributes.find(a => a.trait_type === 'Best lap').value, `${(firstLapMs / 1000).toFixed(2)} s`);
    assert.match(data.description, /self-reported by the player/);
    const html = await (await createViewHandler({ readToken: read })(request())).text();
    const tree = JSON.stringify(imageModule.renderImage({ ...token, id: 1n, siteUrl: 'https://custom.example', network: 'testnet' }));
    for (const output of [html, tree]) {
      assert.ok(output.includes(`/assets/nft/${image}`));
      assert.ok(output.includes(tier.toUpperCase()));
      assert.ok(output.includes(`${(firstLapMs / 1000).toFixed(2)} s`));
      assert.ok(output.includes('SELF-REPORTED · NON-TRANSFERABLE'));
    }
  });
}

for (const tier of ['gold', 'silver', 'bronze']) {
  test(`${tier} 边框为 1024 方形透明 PNG，金属主体不透明且体积不超过 400KB`, async () => {
    const file = new URL(`../public/assets/nft/frame-${tier}.png`, import.meta.url);
    const buffer = await readFile(file);
    const metadata = await sharp(buffer).metadata();
    assert.deepEqual([metadata.width, metadata.height, metadata.hasAlpha], [1024, 1024, true]);
    assert.ok((await stat(file)).size <= 400 * 1024);
    const center = await sharp(buffer).extract({ left: 200, top: 200, width: 624, height: 624 }).ensureAlpha().raw().toBuffer();
    assert.ok(center.every((value, i) => i % 4 !== 3 || value === 0), '中心画面区域必须完全透明');
    const source = await readFile(new URL(`../scripts/nft/frames/frame-${tier}.svg`, import.meta.url), 'utf8');
    assert.match(source, new RegExp(tier.toUpperCase()));
  });
}

test('金级外圈模糊光晕由 librsvg 实际渲染为半透明像素', async () => {
  const png = await readFile(new URL('../public/assets/nft/frame-gold.png', import.meta.url));
  const pixel = await sharp(png).extract({ left: 7, top: 300, width: 1, height: 1 }).ensureAlpha().raw().toBuffer();
  assert.ok(pixel[3] > 0 && pixel[3] < 128, '框外应有柔和半透明光晕');
  assert.ok(pixel[0] > pixel[2], '光晕应呈金色');
});
