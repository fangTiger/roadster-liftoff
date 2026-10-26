import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ContractFunctionRevertedError } from 'viem';
import { createMetadataHandler } from './nft/[id].js';
import { createImageHandler } from './nft/image/[id].js';
import { createTokenReader, getServerConfig, TokenNotFoundError } from './_lib/chain.js';

const owner = '0x81d400000000000000000000000000000000707B';
const record = { tokenId: 1, bestMs: 46830, achievements: 4095, mintedAt: 1793059200n, updatedAt: 1793060200n };
const readToken = async id => { assert.equal(id, 1n); return { owner, record }; };
const request = (id = '1', image = false) => new Request(`https://example.com/api/nft/${image ? 'image/' : ''}${id}`);

test('元数据完整、复用格式化、带更新版本及缓存与跨域头', async () => {
  const get = createMetadataHandler({ readToken, siteUrl: 'https://custom.example/', network: 'testnet' });
  const res = await get(request());
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /application\/json/);
  assert.equal(res.headers.get('cache-control'), 'public, s-maxage=60, stale-while-revalidate=300');
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
  const data = await res.json();
  assert.equal(data.name, 'Mars Roadster Round Trip #0001');
  assert.equal(data.external_url, 'https://mars-roadster.vercel.app');
  assert.equal(data.image, 'https://custom.example/api/nft/image/1?v=1793060200');
  for (const text of ['ground', 'orbit', 'self-reported', 'non-transferable', 'non-commercial', 'Tesla', 'SpaceX']) assert.ok(data.description.includes(text));
  assert.deepEqual(data.attributes, [
    { trait_type: 'Round trip', value: '46.83 s' },
    { trait_type: 'Round trip (ms)', value: 46830, display_type: 'number' },
    { trait_type: 'Achievements', value: 12, max_value: 20, display_type: 'number' },
    { trait_type: 'Minted', value: 1793059200, display_type: 'date' },
    { trait_type: 'Network', value: 'Arc Testnet' },
  ]);
  const main = await createMetadataHandler({ readToken, network: 'mainnet' })(request());
  assert.equal((await main.json()).attributes.at(-1).value, 'Arc');
});

test('更新后的图片地址变化', async () => {
  const get = createMetadataHandler({ readToken: async () => ({ owner, record: { ...record, updatedAt: 1793060300n } }) });
  assert.match((await (await get(request())).json()).image, /\?v=1793060300$/);
});

for (const factory of [createMetadataHandler, createImageHandler]) {
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
  const config = getServerConfig({ ARC_NETWORK: 'mainnet', RECORDS_ADDRESS: owner, SITE_URL: 'https://custom.example/' });
  assert.equal(config.chain.id, 5042);
  assert.equal(config.address, owner);
  assert.equal(config.siteUrl, 'https://custom.example');
});

test('链读取通过共享 ABI 顺序查 ownerOf 和 recordOf', async () => {
  const calls = [];
  const reader = createTokenReader({ address: owner, readContract: async args => {
    calls.push(args);
    return args.functionName === 'ownerOf' ? owner : record;
  } });
  assert.deepEqual(await reader(1n), { owner, record });
  assert.deepEqual(calls.map(c => [c.functionName, c.args]), [['ownerOf', [1n]], ['recordOf', [owner]]]);
  assert.ok(calls.every(c => c.address === owner && c.abi.some(item => item.name === 'ownerOf')));
});

test('ownerOf revert 为不存在，RPC 故障保留错误', async () => {
  const reader = createTokenReader({ address: owner, readContract: async () => { throw new ContractFunctionRevertedError({ abi: [], functionName: 'ownerOf' }); } });
  await assert.rejects(reader(999n), TokenNotFoundError);
  const failure = new Error('RPC timeout');
  await assert.rejects(createTokenReader({ address: owner, readContract: async () => { throw failure; } })(1n), error => error === failure);
});

test('图片实际渲染为 1024 方形 PNG，返回正确类型与不可变缓存', async () => {
  const base = await readFile(new URL('../public/assets/nft/base.jpg', import.meta.url));
  const get = createImageHandler({ readToken, baseImage: `data:image/jpeg;base64,${base.toString('base64')}` });
  const res = await get(request('1?v=1793060200', true));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/png');
  assert.equal(res.headers.get('cache-control'), 'public, s-maxage=86400, immutable');
  const png = Buffer.from(await res.arrayBuffer());
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(png.readUInt32BE(16), 1024);
  assert.equal(png.readUInt32BE(20), 1024);
});

test('超出 Record uint32 编号范围的正整数直接判为不存在', async () => {
  const reader = createTokenReader({ address: owner, readContract: async () => assert.fail('超出编号范围不应读链') });
  await assert.rejects(reader(1n << 256n), TokenNotFoundError);
});
