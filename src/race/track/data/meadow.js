// 简单地图「草甸环线」：宽路（16 米）、平地、大半径弯道，只有一个半径 45 米的回头弯；没有断桥、跳台、滚石，
// 只有加速带和金币。适合第一次上手。南直道与东直道长度由闭合条件求出。
import { S, A, closeLoop, layTrack } from '../turtle.js';
const segments = closeLoop([
  /* 0 发车直道（向北） */ S(420, 0),
  /* 1 一号弯：左转向西 */ A(70, 90, 0),
  /* 2 西直道 */ S(200, 0),
  /* 3 草甸 S 弯 */ A(110, 50, 0), A(110, -50, 0),
  /* 5 坡道 */ S(160, 0),
  /* 6 回头弯：左转向南 */ A(45, 90, 0),
  /* 7 南直道（长度待定） */ S(0, 0),
  /* 8 平缓大 S 弯 */ A(160, 25, 0), A(160, -25, 0),
  /* 10 三号弯：左转向东 */ A(90, 90, 0),
  /* 11 东直道（长度待定） */ S(0, 0),
  /* 12 终点弯：左转回到发车直道 */ A(80, 90, 0),
], [7, 11]);
const sectionDefs = [
  [0, 0, 16, '发车直道', 'Starting Straight'], [1, 2, 16, '一号弯', 'Turn One'], [3, 5, 16, '草甸 S 弯', 'Meadow Esses'],
  [6, 6, 17, '回头弯', 'Hairpin'], [7, 9, 16, '南面大 S 弯', 'South Sweepers'], [10, 10, 16, '三号弯', 'Turn Three'],
  [11, 11, 16, '东直道', 'East Straight'], [12, 12, 16, '终点弯', 'Final Turn'],
];
const { points, sections, checkpoints } = layTrack(segments, sectionDefs);
const labels = sectionDefs.map(d => [d[3], d[4]]);
const features = [
  { type: 'boost', section: 1, u: .7, lateral: 0, length: 16, width: 10 },
  { type: 'boost', section: 5, u: .5, lateral: 0, length: 16, width: 10 },
  { type: 'boost', section: 7, u: .5, lateral: -3, length: 16, width: 6 },
  { type: 'coins', section: 3, u: .1, end: .9, count: 16, lateral: 0, height: 1 },
  { type: 'coins', section: 5, u: .1, end: .9, count: 16, lateral: 4, height: 1 },
  ...labels.map(([zh, en], i) => ({ type: 'landmarks', section: i + 1, u: .55, lateral: 24, name: { zh: ['发车拱门与计时塔', '干草垛', '木栅栏', '旧谷仓', '牛铃小屋', '风车', '木制瞭望塔', '花坛'][i], en } })),
];
export const meadowLoop = { id: 1, key: 'meadow-loop', difficulty: 'easy', name: { zh: '草甸环线', en: 'Meadow Loop' }, laps: 3, points, sections, checkpoints, features, branches: [], terrain: { seed: 271 } };
export default meadowLoop;
