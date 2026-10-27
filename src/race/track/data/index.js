// 三张地图对应三档难度；默认简单。id 即合约里的赛道编号
import meadowLoop from './meadow.js';
import lakesideLoop from './lakeside.js';
import alpineLoop from './alpine.js';
export const TRACKS = [
  { difficulty: 'easy', label: '简单', def: meadowLoop, desc: '宽路、大弯、平地，只有加速带和金币，适合第一次上手。' },
  { difficulty: 'normal', label: '普通', def: lakesideLoop, desc: '发卡弯、坡顶小跳台、锥桶 S 弯，开始需要刹车和漂移。' },
  { difficulty: 'hard', label: '困难', def: alpineLoop, desc: '盘山回头弯、飞越峡谷断桥、窄道捷径、滚石区，高手的赛道。' },
];
export const DEFAULT_DIFFICULTY = 'easy';
