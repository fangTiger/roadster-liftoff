import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import * as f from './fmath.js';
test('三角近似精度、象限与周期', () => {
  for (let i = -20000; i <= 20000; i++) {
    const a = i * .013;
    assert.ok(Math.abs(f.sin(a) - Math.sin(a)) < 1e-7);
    assert.ok(Math.abs(f.cos(a) - Math.cos(a)) < 1e-7);
    const x = Math.cos(a), y = Math.sin(a);
    assert.ok(Math.abs(f.atan2(y, x) - Math.atan2(y, x)) < 1e-6);
    assert.ok(Math.abs(f.sin(a + 2 * Math.PI) - f.sin(a)) < 1e-12);
  }
  assert.equal(f.atan2(0, 0), 0);
  assert.equal(f.clamp(2, 0, 1), 1); assert.equal(f.lerp(2, 4, .5), 3);
  assert.equal(f.smoothstep(0, 1, .5), .5);
});
test('噪声范围、连续性与逐位重复', () => {
  for (let i = -100; i < 100; i++) {
    const a = f.fbm2(i / 13, i / 7, 42, 5);
    assert.ok(a >= 0 && a <= 1); assert.equal(a, f.fbm2(i / 13, i / 7, 42, 5));
    assert.ok(Math.abs(f.valueNoise2(i, .3, 2) - f.valueNoise2(i + 1e-7, .3, 2)) < 1e-6);
  }
  assert.notEqual(f.hash2(1, 2, 3), f.hash2(2, 1, 3));
});
test('模拟与赛道源码禁止非确定性数学及计时', async () => {
  async function scan(dir) {
    for (const file of await readdir(dir, { withFileTypes: true })) {
      const path = `${dir}/${file.name}`;
      if (file.isDirectory()) await scan(path);
      else if (!path.endsWith('.test.mjs')) {
        const source = await readFile(path, 'utf8');
        assert.doesNotMatch(source, /Math\s*(?:\.\s*(?:sin|cos|tan|atan|atan2|asin|acos|exp|log|pow|hypot|cbrt|random)\b|\[)|\*\*|%|\bDate\b|performance\s*\./, path);
      }
    }
  }
  await scan(new URL('../sim', import.meta.url).pathname);
  await scan(new URL('../track', import.meta.url).pathname);
});
