// 公路走向：按行驶里程 D（米）给出路中心的横向位置。世界是“跑步机”，不旋转，
// 弯道表现为路中心随里程左右摆动；路面、虚线、路肩、路边物体、金币都按同一条曲线摆放。
// 起步 600 米是直道（留给 0–100 计时），之后渐入左右交替的大半径弯道（最小半径约 1.3 公里，最大偏角约 9°）
export const ROAD_X = .55;

const TAU = Math.PI * 2;
const W1 = TAU / 1800, A1 = 30;            // 主弯：约 1.8 公里一个来回
const W2 = TAU / 900, A2 = 8, P2 = 1.3;    // 次弯：叠加在主弯上，让弯道长短不一

// 渐入系数及其导数（600–1300 米之间从直道平滑过渡到弯道）
function ampOf(D) {
  const u = Math.max(0, Math.min(1, (D - 600) / 700));
  return [u * u * (3 - 2 * u), D > 600 && D < 1300 ? 6 * u * (1 - u) / 700 : 0];
}
const wave = D => A1 * Math.sin(W1 * D) + A2 * Math.sin(W2 * D + P2);
const waveD = D => A1 * W1 * Math.cos(W1 * D) + A2 * W2 * Math.cos(W2 * D + P2);

// 路中心横向坐标
export function roadCenter(D) { return ROAD_X + ampOf(D)[0] * wave(D); }
// 路的横向斜率 dx/dD（向 -Z 行驶时每前进 1 米路中心横移多少米）
export function roadSlope(D) { const [a, da] = ampOf(D); return a * waveD(D) + da * wave(D); }
