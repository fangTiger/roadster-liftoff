import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'vite';

test('真实生产构建剔除开发自动驾驶开关、模块与诊断入口', { timeout: 120000 }, async () => {
  const result = await build({ envDir: false, logLevel: 'silent', build: { write: false } });
  const chunks = (Array.isArray(result) ? result : [result]).flatMap(output => output.output).filter(output => output.type === 'chunk');
  const source = chunks.map(chunk => chunk.code).join('\n');
  assert.doesNotMatch(source, /e2eAutopilot|__ghostE2e|e2e-driver/);
  const race = await import('node:fs/promises').then(fs => fs.readFile(new URL('../../src/race/index.js', import.meta.url), 'utf8'));
  assert.match(race, /import\.meta\.env\.DEV/);
  assert.match(race, /e2eAutopilot/);
});
