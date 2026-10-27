import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { buildTrack, trackHash, ROAD, ROCK, GAP } from './build.js';
import def from './data/desert-loop.js';
let track;
test('生成闭合约四公里赛道，耗时低于 1.5 秒', () => {
  const start = performance.now(); track = buildTrack(def);
  assert.ok(performance.now() - start < 1500);
  assert.ok(track.length >= 3800 && track.length <= 4200, track.length);
  const a = track.samples, n = a.length / 7;
  assert.equal(a[0], a[(n - 1) * 7]); assert.equal(a[1], a[(n - 1) * 7 + 1]);
  for (let i = 1; i < n - 1; i++) assert.ok(Math.abs(Math.hypot(a[i * 7] - a[(i - 1) * 7], a[i * 7 + 1] - a[(i - 1) * 7 + 1]) - 1) < .04);
  assert.equal(track.checkpointGates.length, 11);
});
test('最近投影、路面高度、缺口及台地岩壁', () => {
  for (let i = 17; i < track.length; i += 79) {
    const a = track.samples, k = i * 7, x = a[k] - a[k + 4] * 2, z = a[k + 1] + a[k + 3] * 2;
    const p = track.nearest(x, z);
    // 汇流区的另一路可能更近，允许选择实际更近的支路。
    if(p.path!=='main') {assert.ok(p.distance<2.01);continue;}
    assert.ok(Math.abs(p.s - i) < .2, `${i}: ${p.s}`);
    assert.ok(Math.abs(p.lateral - 2) < .1);
    if (track.surfaceAt(a[k], a[k + 1]) !== GAP) {
      assert.equal(track.surfaceAt(a[k], a[k + 1]), ROAD);
      assert.ok(Math.abs(track.heightAt(a[k], a[k + 1]) - a[k + 2]) < .6);
    }
  }
  const gap = track.features.find(f => f.type === 'gap'), p = track.at((gap.from + gap.to) / 2);
  assert.equal(track.surfaceAt(p.x, p.z), GAP); assert.ok(track.heightAt(p.x, p.z) < p.y - 15);
  // 台地多边形的顶点正好在边缘上，且离路面足够远
  const [vx, vz] = def.terrain.plateaus[1].poly[3];
  assert.equal(track.surfaceAt(vx, vz), ROCK);
});
test('分支接回主线、局部查询与检查点覆盖分支', () => {
  for (const branch of track.branches) {
    const first = branch.at(0), last = branch.at(branch.length);
    const a = track.at(branch.from), b = track.at(branch.to);
    assert.ok(Math.hypot(first.x - a.x, first.z - a.z) < .01);
    assert.ok(Math.hypot(last.x - b.x, last.z - b.z) < .01);
    const p = branch.at(branch.length / 2), n = track.nearest(p.x, p.z);
    assert.equal(n.path, branch.id); assert.ok(Math.abs(n.lateral) < .01);
    assert.ok(track.nearest(p.x, p.z, n).path === branch.id);
  }
  assert.ok(track.walls.length > 30);
});
test('定义和关键生成结果哈希稳定，修改定义改变哈希', () => {
  const hash = trackHash(def); assert.match(hash, /^[0-9a-f]{8}$/);
  assert.equal(hash, 'dbee306d');
  assert.equal(hash, trackHash(structuredClone(def)));
  const other = structuredClone(def); other.points[4].y += .1;
  assert.notEqual(hash, trackHash(other));
});
test('远离道路的查询仍返回真正最近线段',()=>{
  for(const [x,z] of [[1000,1000],[-1500,-900],[0,900]]) {
    const p=track.nearest(x,z);let best=Infinity;
    for(const path of [{samples:track.samples},...track.branches]) {
      const a=path.samples;
      for(let i=0;i<a.length/7-1;i++) {
        const k=i*7,dx=a[k+7]-a[k],dz=a[k+8]-a[k+1],u=Math.max(0,Math.min(1,((x-a[k])*dx+(z-a[k+1])*dz)/(dx*dx+dz*dz)));
        best=Math.min(best,Math.hypot(x-a[k]-dx*u,z-a[k+1]-dz*u));
      }
    }
    assert.ok(Math.abs(p.distance-best)<1e-8);
  }
});
test('主线与两条分支的行驶中心线不被墙体封堵',()=>{
  const cross=(ax,az,bx,bz)=>ax*bz-az*bx;
  for(const path of [{id:'main',samples:track.samples},...track.branches]) {
    const a=path.samples;
    for(let i=0;i<a.length/7-1;i++) for(const wall of track.walls) {
      const k=i*7,dx=a[k+7]-a[k],dz=a[k+8]-a[k+1],ex=wall.b.x-wall.a.x,ez=wall.b.z-wall.a.z,den=cross(dx,dz,ex,ez);
      if(Math.abs(den)<1e-10)continue;
      const ax=wall.a.x-a[k],az=wall.a.z-a[k+1],t=cross(ax,az,ex,ez)/den,u=cross(ax,az,dx,dz)/den;
      assert.ok(!(t>=0&&t<=1&&u>=0&&u<=1),`${path.id} 在 ${i} m 与 ${wall.type} 相交`);
    }
  }
});

test('固定种子随机路点的弧长、横向偏移与提示查询',()=>{
  let seed=731;
  for(let i=0;i<120;i++) {
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;const s=(seed/4294967296)*track.length,p=track.at(s);
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;const lateral=(seed/4294967296-.5)*6;
    const x=p.x-p.tz*lateral,z=p.z+p.tx*lateral,n=track.nearest(x,z),local=track.nearest(x,z,n);
    assert.equal(local.path,n.path);assert.ok(Math.abs(local.s-n.s)<1e-8);
    if(n.path==='main') {assert.ok(Math.abs(n.s-s)<.2);assert.ok(Math.abs(n.lateral-lateral)<.05);}
  }
});
test('分支地形压平，跨过检查点的分支得到额外门线',()=>{
  for(const branch of track.branches) for(let s=15;s<branch.length-15;s+=17) {
    const p=branch.at(s);assert.ok(Math.abs(track.heightAt(p.x,p.z)-p.y)<.6);
  }
  // 把慢道终点挪到断桥段检查点之后，检查点应同时覆盖慢道
  const copy=structuredClone(def),after=def.checkpoints[3].point+2;copy.branches[0].to=after;copy.branches[0].points[copy.branches[0].points.length-1]={...copy.points[after]};
  const modified=buildTrack(copy);assert.equal(modified.checkpointGates[3].lines.length,2);
});
