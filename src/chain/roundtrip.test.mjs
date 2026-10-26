import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoundTrip } from './roundtrip.js';

test('仅 drive → ascent 开始，按模拟秒累加并四舍五入毫秒', () => {
  const timer = createRoundTrip();
  timer.tick(10); timer.onEvent('reentry_home');
  assert.equal(timer.best, null);
  timer.onMode('drive', 'ascent'); timer.tick(46.8304); timer.onEvent('reentry_home');
  assert.equal(timer.last, 46830); assert.equal(timer.best, 46830);
  timer.tick(5); timer.onEvent('reentry_home'); assert.equal(timer.last, 46830);
});
test('起飞中止作废，本局最快保留，最后一次独立记录', () => {
  const timer = createRoundTrip();
  timer.onMode('drive', 'ascent'); timer.tick(2); timer.onEvent('ascent_abort');
  timer.tick(10); timer.onEvent('reentry_home'); assert.equal(timer.last, null);
  for (const seconds of [50, 60, 40]) { timer.onMode('drive', 'ascent'); timer.tick(seconds); timer.onEvent('reentry_home'); }
  assert.equal(timer.best, 40000); assert.equal(timer.last, 40000);
  timer.onMode('drive', 'ascent'); timer.tick(100); timer.onEvent('reentry_home');
  assert.equal(timer.last, 100000); assert.equal(timer.best, 40000);
});
test('再入冲回太空不重置计时，暂停期间未 tick 不计时', () => {
  const timer = createRoundTrip();
  timer.onMode('drive', 'ascent'); timer.tick(20);
  timer.onMode('ascent', 'orbit'); timer.tick(10);
  timer.onMode('orbit', 'reentry'); timer.tick(5);
  timer.onMode('reentry', 'ascent'); timer.tick(10);
  timer.tick(0); timer.tick(-5); timer.tick(NaN);
  timer.onEvent('reentry_home'); assert.equal(timer.best, 45000);
});
test('没有 drive 起飞时不能生成有效往返', () => {
  const timer = createRoundTrip(); timer.onMode('reentry', 'ascent'); timer.tick(20); timer.onEvent('reentry_home');
  assert.equal(timer.best, null);
});
