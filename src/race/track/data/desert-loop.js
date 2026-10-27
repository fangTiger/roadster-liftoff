// 阿尔卑斯环线（原沙漠环线，2026-10-28 场景换成瑞士阿尔卑斯山谷）：用「直线 + 圆弧」描述走线，每个弯的半径直接指定，避免手摆控制点产生折角。
// 方向角 θ：前方向量 (sin θ, cos θ)，正角向 +x 转（从车后看是向左）。整圈转角合计 360°，逆时针（从游戏画面方向看）。
// 盐湖与滚石区两段直线的长度由闭合条件反算（首尾位置重合）。
import { sin, cos } from '../../sim/fmath.js';
const D = Math.PI / 180;
const S = (len, y) => ({ kind: 'S', len, y }), A = (r, deg, y) => ({ kind: 'A', r, deg, y });
// y：该段末端的路面高度（段内线性过渡）；profile：自定义高度曲线（段内弧长 → 高度）
const segments = [
  /* 0  发车直道 */ S(460, 0),
  /* 1  发卡弯 */ S(30, 0), A(28, 180, 0), S(110, 0),
  /* 4  盘山回头弯：右转向西，之字形爬上东台地 */ A(40, -90, 0), S(50, 0), S(120, 9), A(24, 180, 13), S(120, 22), A(24, -180, 26), S(110, 30),
  /* 11 峡谷断桥 */ S(280, 30),
  /* 12 巨石 S 弯 */ A(70, 90, 30), A(70, 35, 32), A(70, -70, 28), A(70, 35, 30),
  /* 16 穿山隧道 */ S(280, 30),
  /* 17 坡顶跳台：小坡冲顶后从台地南缘飞下，落在下坡上 */
  { kind: 'S', len: 300, profile: s => s < 30 ? 30 + s / 30 : s < 45 ? 31 + (s - 30) / 15 * 2 : s < 90 ? 33 - (s - 45) / 45 * 25 : 8 - (s - 90) / 210 * 8 },
  A(80, 90, 0),
  /* 19 干盐湖 */ S(637.9615242270604, 0),
  /* 20 窄道捷径弯 */ A(110, 90, 0),
  /* 21 滚石区 */ S(212.15276489158106, 0),
  /* 22 收尾高速 S 弯 */ A(170, 60, 0), S(60, 0), A(170, -60, 0),
];
// 每个赛段由哪些走线段组成，以及路宽
const sectionDefs = [
  [0, 0, 13, '发车直道', 'Starting Straight'], [1, 3, 15, '发卡弯', 'Hairpin'], [4, 10, 12, '盘山回头弯', 'Mesa Switchbacks'],
  [11, 11, 12, '峡谷断桥', 'Gorge Bridge'], [12, 15, 11, '巨石 S 弯', 'Boulder Esses'], [16, 16, 11, '穿山隧道', 'Mountain Tunnel'],
  [17, 18, 13, '坡顶跳台', 'Mesa Jump'], [19, 19, 30, '谷底高速段', 'Valley Straight'], [20, 20, 13, '窄道捷径', 'Narrow Cut'],
  [21, 21, 13, '滚石区', 'Rockfall Run'], [22, 24, 14, '高速大弯', 'Final Sweepers'],
];
// 走线展开：直线每 12 m 一个控制点、圆弧每 6 m 一个；frames 记录每段的起点、方向与弧长，供分支和地形定位
const raw = [], segStart = [], frames = [];
{
  let x = 0, z = 0, th = 0, y = 0;
  segments.forEach((g, i) => {
    segStart[i] = raw.length; const y0 = y, len = g.kind === 'S' ? g.len : Math.abs(g.deg * D) * g.r;
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
}
// 末点与起点重合（闭合曲线由 build 自动接回 0 号点），去掉；起点放在下标 0
raw.pop(); raw.unshift({ x: 0, z: 0, y: 0, seg: 0 });
// segStart[i]：第 i 段起点在 points 中的下标（插入 0 号点后，第 i 段第一个新点的旧下标恰好就是起点下标）
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
// 分支：断桥南侧下到河床再爬回的慢道；捷径弯内侧的弦线窄道
const rb = [pointNear(11, 40), pointNear(11, 240)], rs = [pointNear(20, 22), pointNear(20, 151)];
const branches = [
  { id: 'riverbed', from: rb[0], to: rb[1], points: [points[rb[0]], frame(11, 70, -14, 29), frame(11, 104, -30, 17), frame(11, 138, -34, 6), frame(11, 172, -30, 17), frame(11, 206, -14, 29), points[rb[1]]] },
  { id: 'narrow-cut', from: rs[0], to: rs[1], points: [points[rs[0]], ...[.3, .5, .7].map(u => { const a = points[rs[0]], b = points[rs[1]]; return { x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u, y: 0, w: 4.2, bank: 0 }; }), points[rs[1]]] },
];
const labels = sectionDefs.map(d => [d[3], d[4]]);
const features = [
  { type: 'gap', section: 4, u: .45, end: .54, depth: 25 },
  { type: 'boost', section: 1, u: .86, lateral: 0, length: 16, width: 9 },
  { type: 'boost', section: 8, u: .3, lateral: -9, length: 20, width: 3 },
  { type: 'boost', section: 8, u: .65, lateral: 9, length: 20, width: 3 },
  { type: 'boost', section: 11, u: .9, lateral: -3, length: 14, width: 3 },
  { type: 'cones', section: 5, u: .15, items: Array.from({ length: 12 }, (_, i) => ({ u: .3 + i * .05, lateral: i & 1 ? -2.6 : 2.6, kind: (i & 3) === 0 ? 'concrete' : 'cone', radius: (i & 3) === 0 ? 1.1 : .35 })) },
  // 窄道捷径：弯道内侧弦线上两块巨石之间只留 3 米（车宽 2 米），对准了才钻得过去
  { type: 'slot', section: 9, u: .5, path: 'narrow-cut', pathU: .5, width: 3, rockRadius: 4, height: 7 },
  { type: 'ramp', section: 7, u: 30 / 425.66, length: 15, rise: 2 },
  { type: 'rockfall', section: 10, u: .35, period: 5, phase: 1.2, radius: 1.1, lateralFrom: -20, lateralTo: 20, duration: 2.5 },
  { type: 'rockfall', section: 10, u: .75, period: 7, phase: 3, radius: .7, lateralFrom: 22, lateralTo: -22, duration: 3, kind: 'tumbleweed' },
  { type: 'tunnel', section: 6, u: .06, end: .94, height: 7 },
  { type: 'coins', section: 7, u: .11, end: .3, count: 14, lateral: 0, height: 4 },
  { type: 'coins', section: 8, u: .15, end: .85, count: 20, lateral: 9, height: 1 },
  { type: 'coins', section: 9, u: .15, end: .85, count: 14, lateral: 0, height: 1 },
  { type: 'coins', section: 3, u: .3, end: .7, count: 12, lateral: 0, height: 1 },
  ...labels.map(([zh, en], i) => ({ type: 'landmarks', section: i + 1, u: .55, lateral: 22, name: { zh: ['发车拱门与计时塔', '旧轮胎堆', '输电塔', '断桥残骸', '岩石拱门', '隧道警示条', '木制瞭望塔', '干草垛', '双子巨石', '落石警示牌', '风车'][i], en } })),
];
// 沿走线的带状区域（台地、盐湖）：左右两侧偏移点围成多边形
function corridor(parts, left, right) {
  const l = [], r = [];
  for (const [seg, a, b] of parts) for (let s = a; s <= b; s += 15) { const p = frame(seg, Math.min(s, frames[seg].len), left), q = frame(seg, Math.min(s, frames[seg].len), -right); l.push([p.x, p.z]); r.push([q.x, q.z]); }
  return [...l, ...r.reverse()];
}
const len = i => frames[i].len;
const gapFrom = .45 * 280, gapTo = .54 * 280;
const canyon = (() => { const c = []; for (const [a, l] of [[gapFrom - 1, 170], [gapTo + 1, 170], [gapTo + 1, -170], [gapFrom - 1, -170]]) { const p = frame(11, a, l); c.push([p.x, p.z]); } return c; })();
export const desertLoop = {
  id: 1, key: 'alpine-loop', name: { zh: '阿尔卑斯环线', en: 'Alpine Loop' }, laps: 3, points, sections, checkpoints, features, branches,
  terrain: {
    seed: 1031,
    plateaus: [
      // 东台地：断桥东半段，之字形最上一段的西头
      { poly: corridor([[10, 60, len(10)], [11, 0, gapFrom - 12]], 60, 60), height: 30 },
      // 西台地：断桥西半段、巨石 S 弯、隧道，到跳台坡顶
      { poly: corridor([[11, gapTo + 12, len(11)], [12, 0, len(12)], [13, 0, len(13)], [14, 0, len(14)], [15, 0, len(15)], [16, 0, len(16)], [17, 0, 40]], 55, 55), height: 30 },
    ],
    canyon: { poly: canyon, height: 5 },
    salt: { poly: corridor([[19, 0, len(19)]], 90, 90), height: 0 },
  },
};
export default desertLoop;
