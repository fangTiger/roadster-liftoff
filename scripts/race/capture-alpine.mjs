// 本地验收：机器人只推进真实模拟，不改车的位置；每帧推进八个固定步，覆盖整圈场景。
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { buildTrack } from '../track/build.js';
import { TRACKS } from '../track/data/index.js';
const out = 'recordings/race-alpine'; await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const results = [];
try {
  for (const { def, difficulty } of TRACKS) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    const errors = [], warnings = [], statistics = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); if (e.type() === 'warning') warnings.push(e.text()); if (e.text().startsWith('阿尔卑斯场景渲染统计')) statistics.push(e.text()); });
    page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
    await page.goto(`${process.env.RACE_URL || 'http://127.0.0.1:8933'}/?race&capture&map=${difficulty}&sky=alps`);
    await page.waitForFunction(() => document.title === 'ready', null, { timeout: 120000 });
    await page.waitForTimeout(1500);
    const track = buildTrack(def), feature = type => track.features.find(f => f.type === type);
    const targets = difficulty === 'hard' ? [feature('gap').s - 14, feature('tunnel').s + 45, feature('ramp').s + 4, feature('slot').s - 12] : difficulty === 'normal' ? [track.length * .12, track.length * .33, feature('ramp').s + 4, track.length * .74] : [.12, .35, .60, .85].map(u => track.length * u);
    await page.evaluate(() => {
      const engine = window.__engine, gl = engine.renderer.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
      const original = engine.scene.onAfterRender;
      window.__alpineProbe = { frames: [], cpu: [], gpu: [], calls: [], triangles: [], pending: [], last: 0, ext: !!ext };
      engine.scene.onAfterRender = function (...args) { original?.apply(this, args); window.__alpineProbe.calls.push(engine.renderer.info.render.calls); window.__alpineProbe.triangles.push(engine.renderer.info.render.triangles); };
      window.__alpineFrame = () => new Promise(resolve => requestAnimationFrame(now => {
        const p = window.__alpineProbe;
        if (p.last) p.frames.push(now - p.last); p.last = now;
        for (let i = p.pending.length - 1; i >= 0; i--) { const query = p.pending[i]; if (gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) { if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) p.gpu.push(gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6); gl.deleteQuery(query); p.pending.splice(i, 1); } }
        const query = ext && p.pending.length < 6 ? gl.createQuery() : null;
        if (query) gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
        const start = performance.now(); window.__race.auto(8); p.cpu.push(performance.now() - start);
        if (query) { gl.endQuery(ext.TIME_ELAPSED_EXT); p.pending.push(query); }
        const s = window.__race.snap(); resolve({ lap: s.race.lap, s: s.car.near.s, path: s.car.near.path, step: s.step, checkpoints: s.race.nextCheckpoint, y: s.car.y });
      }));
    });
    let snapshot; const shots = [];
    for (let frame = 0; frame < 12000; frame++) {
      snapshot = await page.evaluate(() => window.__alpineFrame());
      if (snapshot.step > 600 && snapshot.lap === 1 && snapshot.path === 'main') {
        const index = targets.findIndex((s, i) => snapshot.s >= s && snapshot.s < s + 16 && !shots.includes(i));
        if (index >= 0) {
          const path = `${out}/${difficulty}-${String(index + 1).padStart(2, '0')}.png`; await page.screenshot({ path }); shots.push(index);
          await page.evaluate(() => { window.__alpineProbe.last = 0; }); console.log('截图', path, snapshot.s.toFixed(1));
        }
      }
      if (snapshot.lap >= 2) break;
    }
    const metrics = await page.evaluate(() => {
      const p = window.__alpineProbe, mean = a => a.reduce((x, y) => x + y, 0) / a.length, percentile = (a, q) => [...a].sort((x, y) => x - y)[Math.floor((a.length - 1) * q)];
      const gl = window.__engine.renderer.getContext(), dbg = gl.getExtension('WEBGL_debug_renderer_info');
      return { frames: p.frames.length, frameMs: mean(p.frames), frameP95Ms: percentile(p.frames, .95), cpuMs: mean(p.cpu), gpuMs: mean(p.gpu), callsMean: mean(p.calls), callsMax: Math.max(...p.calls), trianglesMean: mean(p.triangles), trianglesMax: Math.max(...p.triangles), gpu: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) };
    });
    const result = { map: difficulty, viewport: '1280×800', sky: 'alps', simulationStepsPerFrame: 8, metrics, shots: shots.map(i => `${difficulty}-${String(i + 1).padStart(2, '0')}.png`), snapshot, errors, warnings, statistics };
    results.push(result); await writeFile(`${out}/metrics.json`, JSON.stringify(results, null, 2));
    console.log('整圈结果', JSON.stringify(result));
    if (errors.length || shots.length !== 4 || snapshot.lap < 2) process.exitCode = 1;
    await page.close();
  }
} finally { await browser.close(); }
