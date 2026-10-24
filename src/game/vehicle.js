// 车辆运动：发布会参数（0–100 km/h 约 0.82 秒、极速约 400 km/h）的简化纵向模型 + 车道内横向转向
// 世界采用“跑步机”方式：车只在 X 方向移动，前进距离交给世界去滚动
export const KMH = 3.6;
const A_LAUNCH = 34;              // 起步加速度 m/s²（约 3.5g）
const P_SPEC = A_LAUNCH * 27.78;  // 恒功率段：a = P / v，100 km/h 后衔接
const V_MAX = 111;                // 极速约 400 km/h
const DRAG = P_SPEC / V_MAX ** 3; // 风阻系数，使极速处功率与阻力平衡
const BRAKE = 14, ROLL = .35;
// 离地：底部推进器提供向上推力，推进剂有限、落地回充
// 普通跳跃限高约 12 米：全景照片投影的地面只在低空成立，冲上太空由第三段的爬升流程接管
const G = 9.81, LIFT = 21, FUEL_BURN = .16, FUEL_REGEN = .09, ALT_CAP = 10;
// 下降辅助：松开空格后不再自由落体，车底推进器自动托住车身，下降速度随高度递减（高处快、近地慢），
// 落地前再收一次速度做缓冲；不消耗推进剂。爬升中止后从几百米落回也走同一条速度曲线
const DESC_V0 = 2.2, DESC_K = .7, ASSIST_MAX = 30;
export const descentSpeed = y => (DESC_V0 + DESC_K * Math.max(0, y)) * (1 + Math.max(0, y) / 20000);

const THREE_clamp = x => Math.max(0, Math.min(1, x));

export function createVehicle({ roadX, roadHalf }) {
  const s = {
    v: 0, a: 0, x: roadX + 1.8, yaw: 0, steer: 0, dist: 0, wheelAngle: 0, offroad: 0,
    y: 0, vy: 0, fuel: 1, lift: 0, assist: 0, airborne: false, airTime: 0, hops: 0, landing: 0, impact: 0, touchdown: false, maxAlt: 0, rolling: false,
    launch: { timing: false, t: 0, best: null, last: null },
  };
  function step(dt, input) {
    const { throttle, brake, left, right, jet } = input;
    // 0–100 计时：从静止踩下油门开始（要在本帧加速之前判断）
    const L = s.launch;
    if (throttle && s.v < .5 && !L.timing) { L.timing = true; L.t = 0; }
    // 纵向
    let a = -DRAG * s.v * s.v - (s.v > .1 ? ROLL : 0);
    if (throttle) a += Math.min(A_LAUNCH, P_SPEC / Math.max(s.v, 1));
    if (brake) a -= s.v > .5 ? BRAKE : 0;
    const edge = Math.abs(s.x - roadX) - roadHalf;            // 驶出路面后进入碎石路肩
    s.offroad = s.y > .2 ? 0 : Math.max(0, Math.min(1, edge / 1.5));
    a -= s.offroad * (2 + .02 * s.v * s.v);
    s.v = Math.max(0, s.v + a * dt); s.a = a;
    if (!throttle && !brake && s.v < .3) s.v = 0;
    if (L.timing) { L.t += dt; if (s.v * KMH >= 100) { L.timing = false; L.last = L.t; L.best = L.best == null ? L.t : Math.min(L.best, L.t); } else if (!throttle) L.timing = false; }
    // 横向：转向输入平滑，高速时灵敏度降低，松手自动回正
    const target = (left ? 1 : 0) - (right ? 1 : 0);
    s.steer += (target - s.steer) * Math.min(1, dt * 6);
    const gain = 1.1 / (1 + s.v / 22);
    s.yaw += s.steer * gain * dt * Math.min(1, s.v / 4);
    s.yaw -= s.yaw * Math.min(1, dt * (target ? .8 : 2.6));
    s.yaw = Math.max(-.32, Math.min(.32, s.yaw));
    s.x -= Math.sin(s.yaw) * s.v * dt;
    const lim = roadHalf + 7;
    if (Math.abs(s.x - roadX) > lim) { s.x = roadX + Math.sign(s.x - roadX) * lim; s.yaw *= .5; }
    // 垂直：按住空格且有推进剂时点火，接近高度上限推力衰减
    const firing = jet && s.fuel > 0;
    s.lift += ((firing ? 1 : 0) - s.lift) * Math.min(1, dt * 10);
    // 推力：低空全力；接近限高时按位置与速度收推力，平稳悬停而不是冲过头
    const hover = G + 4 * (ALT_CAP - s.y) - 2.6 * s.vy;
    const lift = s.lift * Math.max(0, Math.min(LIFT, s.y < ALT_CAP * .45 ? LIFT : hover));
    // 下降辅助：下落快于目标速度时自动补推力；翻滚期间额外托住，保证车身转一圈不会擦地
    const vt = -descentSpeed(s.y);
    let assist = s.y > .01 && s.vy < vt ? Math.min(ASSIST_MAX, G + 4 * (vt - s.vy)) : 0;
    if (s.rolling && s.y > .01) assist = Math.max(assist, G + 3 * (0 - s.vy));
    s.assist += (assist / LIFT - s.assist) * Math.min(1, dt * 12);
    s.vy += (Math.max(lift, assist) - G) * dt;
    if (firing) s.fuel = Math.max(0, s.fuel - FUEL_BURN * dt);
    s.y += s.vy * dt;
    s.landing = Math.max(0, s.landing - dt * 2.5);
    s.touchdown = false;
    if (s.y <= 0) {
      if (s.airborne && s.vy < -.3) { s.landing = Math.min(1, -s.vy / 6); s.impact = -s.vy; s.touchdown = true; }
      s.y = 0; s.vy = Math.max(0, s.vy);
      if (s.airborne) { s.airborne = false; s.airTime = 0; }
      if (!firing) s.fuel = Math.min(1, s.fuel + FUEL_REGEN * dt);
    } else if (s.y > .05 && !s.airborne) { s.airborne = true; s.hops++; }
    if (s.airborne) { s.airTime += dt; s.maxAlt = Math.max(s.maxAlt, s.y); }
    const dz = Math.cos(s.yaw) * s.v * dt; s.dist += dz;
    return dz;
  }
  return { state: s, step };
}
