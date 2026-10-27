// 用「直线 + 圆弧」描述闭合赛道：每个弯的半径直接指定，避免手摆控制点产生折角。
// 方向角 θ：前方向量 (sin θ, cos θ)，正角向 +x 转（从车后看是向左）。整圈转角合计 ±360°。
// 只用 fmath 和基本运算，生成结果确定。
import { sin, cos } from '../sim/fmath.js';
const D = Math.PI / 180;
// y：该段末端的路面高度（段内线性过渡）；profile：自定义高度曲线（段内弧长 → 高度）
export const S = (len, y) => ({ kind: 'S', len, y }), A = (r, deg, y) => ({ kind: 'A', r, deg, y });
const segLength = g => g.kind === 'S' ? g.len : Math.abs(g.deg * D) * g.r;
// 闭合：两段直线（下标 i、j，方向不平行）的长度未知，其余段确定。直线不改变朝向，终点对这两个长度是线性的，直接解二元一次方程
export function closeLoop(segments, [i, j]) {
  let x = 0, z = 0, th = 0; const dir = {};
  segments.forEach((g, k) => {
    if (k === i || k === j) { dir[k] = [sin(th), cos(th)]; return; }
    if (g.kind === 'S') { x += sin(th) * g.len; z += cos(th) * g.len; }
    else { const d = g.deg * D, ch = 2 * g.r * sin(Math.abs(d) / 2), mid = th + d / 2; x += sin(mid) * ch; z += cos(mid) * ch; th += d; }
  });
  const [ax, az] = dir[i], [bx, bz] = dir[j], det = ax * bz - bx * az;
  const li = (-x * bz + bx * z) / det, lj = (-ax * z + az * x) / det;
  if (!(li > 0 && lj > 0)) throw new Error(`走线无法闭合：${li.toFixed(1)} / ${lj.toFixed(1)}`);
  return segments.map((g, k) => k === i ? { ...g, len: li } : k === j ? { ...g, len: lj } : g);
}
// 展开走线：直线每 12 m 一个控制点、圆弧每 6 m 一个；sectionDefs 为 [起始段, 结束段, 路宽, 中文名, 英文名]
export function layTrack(segments, sectionDefs) {
  const raw = [], segStart = [], frames = [];
  let x = 0, z = 0, th = 0, y = 0;
  segments.forEach((g, i) => {
    segStart[i] = raw.length; const y0 = y, len = segLength(g);
    const n = Math.max(g.kind === 'S' ? 1 : 2, Math.round(len / (g.kind === 'S' ? 12 : 6)));
    frames[i] = { x, z, th, len, y0, seg: g };
    for (let k = 1; k <= n; k++) {
      const s = len * k / n;
      if (g.kind === 'S') { x += sin(th) * len / n; z += cos(th) * len / n; }
      else { const d = g.deg * D / n, mid = th + d / 2, ch = 2 * g.r * sin(Math.abs(d) / 2); x += sin(mid) * ch; z += cos(mid) * ch; th += d; }
      y = g.profile ? g.profile(s) : y0 + (g.y - y0) * s / len;
      raw.push({ x, z, y, seg: i });
    }
    if (g.profile) y = g.profile(len);
  });
  // 末点与起点重合（闭合曲线由 build 自动接回 0 号点），去掉；起点放在下标 0。
  // 插入 0 号点后，segStart[i]（第 i 段第一个新点的旧下标）恰好就是第 i 段起点的下标
  raw.pop(); raw.unshift({ x: 0, z: 0, y: 0, seg: 0 });
  const sectionOfSeg = s => sectionDefs.findIndex(([a, b]) => s >= a && s <= b);
  // 路宽：赛段宽度，在赛段交界前后 3 个控制点内平滑过渡
  const width = raw.map(p => sectionDefs[sectionOfSeg(p.seg)][2]);
  const points = raw.map((p, i) => {
    let sum = 0; for (let k = -3; k <= 3; k++) { const j = i + k; sum += width[j < 0 ? j + raw.length : j >= raw.length ? j - raw.length : j]; }
    return { x: p.x, z: p.z, y: p.y, w: sum / 7, bank: 0 };
  });
  const sections = sectionDefs.map(([a, b, , zh, en], i) => ({ id: i + 1, name: { zh, en }, from: segStart[a], to: b + 1 < segments.length ? segStart[b + 1] : points.length }));
  const checkpoints = sections.map(s => ({ id: s.id, point: s.to === points.length ? 0 : s.to }));
  // 在第 seg 段起点后 along 米、横向 lateral 米处取点（lateral 正向与 build.js 的 offset 一致：(x - tz*l, z + tx*l)）
  function frame(seg, along, lateral = 0, y) {
    const f = frames[seg], g = f.seg;
    let x = f.x, z = f.z, th = f.th;
    if (g.kind === 'S') { x += sin(th) * along; z += cos(th) * along; }
    else { const a = Math.sign(g.deg) * along / g.r, ch = 2 * g.r * sin(Math.abs(a) / 2), mid = th + a / 2; x += sin(mid) * ch; z += cos(mid) * ch; th += a; }
    const tx = sin(th), tz = cos(th);
    return { x: x - tz * lateral, z: z + tx * lateral, y, w: 8, bank: 0 };
  }
  const pointNear = (seg, along) => { const f = frames[seg]; return segStart[seg] + Math.round(along / f.len * ((segStart[seg + 1] ?? points.length) - segStart[seg])); };
  const len = i => frames[i].len;
  // 沿走线的带状区域（台地、湖面等）：左右两侧偏移点围成多边形
  function corridor(parts, left, right) {
    const l = [], r = [];
    for (const [seg, a, b] of parts) for (let s = a; s <= b; s += 15) { const p = frame(seg, Math.min(s, len(seg)), left), q = frame(seg, Math.min(s, len(seg)), -right); l.push([p.x, p.z]); r.push([q.x, q.z]); }
    return [...l, ...r.reverse()];
  }
  return { points, sections, checkpoints, frames, segStart, frame, pointNear, len, corridor };
}
