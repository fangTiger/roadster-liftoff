// 普通地图「湖畔环线」：14 米路宽，有一个半径 30 米的发卡弯、爬坡后的坡顶小跳台、带锥桶的 S 弯和高速大弯；
// 没有断桥和滚石。南直道与东直道长度由闭合条件求出。
import { S, A, closeLoop, layTrack } from '../turtle.js';
const segments = closeLoop([
  /* 0 发车直道（向北） */ S(450, 0),
  /* 1 发卡弯：掉头向南 */ S(20, 0), A(30, 180, 0), S(110, 0),
  /* 4 右转向西，爬坡 */ A(50, -90, 0), S(180, 12),
  /* 6 坡顶小跳台：冲顶后落在下坡上 */
  { kind: 'S', len: 200, profile: s => s < 20 ? 12 + s / 20 * 1.5 : s < 55 ? 13.5 - (s - 20) / 35 * 9 : 4.5 - (s - 55) / 145 * 4.5 },
  /* 7 左转向南 */ A(70, 90, 0),
  /* 8 锥桶 S 弯 */ A(55, 40, 0), A(55, -80, 0), A(55, 40, 0),
  /* 11 南直道（长度待定） */ S(0, 0),
  /* 12 湖畔大弯：左转向东 */ A(110, 90, 0),
  /* 13 东直道（长度待定） */ S(0, 0),
  /* 14 终点弯 */ A(75, 90, 0),
], [11, 13]);
const sectionDefs = [
  [0, 0, 14, '发车直道', 'Starting Straight'], [1, 3, 15, '发卡弯', 'Hairpin'], [4, 5, 14, '爬坡', 'Hill Climb'],
  [6, 7, 14, '坡顶跳台', 'Crest Jump'], [8, 10, 13, '锥桶 S 弯', 'Cone Esses'], [11, 11, 14, '南直道', 'South Straight'],
  [12, 12, 14, '湖畔大弯', 'Lakeside Sweeper'], [13, 13, 14, '东直道', 'East Straight'], [14, 14, 14, '终点弯', 'Final Turn'],
];
const { points, sections, checkpoints } = layTrack(segments, sectionDefs);
const labels = sectionDefs.map(d => [d[3], d[4]]);
const features = [
  { type: 'boost', section: 1, u: .85, lateral: 0, length: 16, width: 9 },
  { type: 'boost', section: 6, u: .4, lateral: -3, length: 18, width: 4 },
  { type: 'boost', section: 8, u: .6, lateral: 3, length: 18, width: 4 },
  { type: 'cones', section: 5, u: .1, items: Array.from({ length: 10 }, (_, i) => ({ u: .2 + i * .065, lateral: i & 1 ? -3 : 3, kind: (i & 3) === 0 ? 'concrete' : 'cone', radius: (i & 3) === 0 ? 1.1 : .35 })) },
  { type: 'ramp', section: 4, u: .1, length: 15, rise: 1.5 },
  { type: 'coins', section: 4, u: .12, end: .45, count: 12, lateral: 0, height: 3 },
  { type: 'coins', section: 6, u: .1, end: .9, count: 18, lateral: 0, height: 1 },
  ...labels.map(([zh, en], i) => ({ type: 'landmarks', section: i + 1, u: .55, lateral: 22, name: { zh: ['发车拱门与计时塔', '旧轮胎堆', '电线杆', '木制瞭望塔', '岩石拱门', '湖边码头', '船屋', '风车', '花坛'][i], en } })),
];
export const lakesideLoop = { id: 2, key: 'lakeside-loop', difficulty: 'normal', name: { zh: '湖畔环线', en: 'Lakeside Loop' }, laps: 3, points, sections, checkpoints, features, branches: [], terrain: { seed: 523 } };
export default lakesideLoop;
