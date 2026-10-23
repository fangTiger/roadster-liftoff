// 车辆运动：发布会参数（0–100 km/h 约 0.82 秒、极速约 400 km/h）的简化纵向模型 + 车道内横向转向
// 世界采用“跑步机”方式：车只在 X 方向移动，前进距离交给世界去滚动
export const KMH = 3.6;
const A_LAUNCH = 34;              // 起步加速度 m/s²（约 3.5g）
const P_SPEC = A_LAUNCH * 27.78;  // 恒功率段：a = P / v，100 km/h 后衔接
const V_MAX = 111;                // 极速约 400 km/h
const DRAG = P_SPEC / V_MAX ** 3; // 风阻系数，使极速处功率与阻力平衡
const BRAKE = 14, ROLL = .35;

export function createVehicle({ roadX, roadHalf }) {
  const s = {
    v: 0, a: 0, x: roadX + 1.8, yaw: 0, steer: 0, dist: 0, wheelAngle: 0, offroad: 0,
    launch: { timing: false, t: 0, best: null, last: null },
  };
  function step(dt, input) {
    const { throttle, brake, left, right } = input;
    // 0–100 计时：从静止踩下油门开始（要在本帧加速之前判断）
    const L = s.launch;
    if (throttle && s.v < .5 && !L.timing) { L.timing = true; L.t = 0; }
    // 纵向
    let a = -DRAG * s.v * s.v - (s.v > .1 ? ROLL : 0);
    if (throttle) a += Math.min(A_LAUNCH, P_SPEC / Math.max(s.v, 1));
    if (brake) a -= s.v > .5 ? BRAKE : 0;
    const edge = Math.abs(s.x - roadX) - roadHalf;            // 驶出路面后进入碎石路肩
    s.offroad = Math.max(0, Math.min(1, edge / 1.5));
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
    const dz = Math.cos(s.yaw) * s.v * dt; s.dist += dz;
    return dz;
  }
  return { state: s, step };
}
