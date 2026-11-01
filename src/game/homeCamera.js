// 首页专用展示镜头：不推进车辆物理，不累计里程、燃料或成绩。
export const HOME_KEYFRAMES = [
  { at: 0, position: [-6.8, 1.4, 9.5], look: [0, -1.2, -1], fov: 46 },
  { at: 12, position: [-4.2, .85, 7.5], look: [0, -1.2, -.6], fov: 43 },
  { at: 26, position: [4.8, 2.4, 8.8], look: [0, -1.2, -1.5], fov: 48 },
  { at: 42, position: [-6.8, 1.4, 9.5], look: [0, -1.2, -1], fov: 46 },
];

export function sampleHomeCamera(seconds, frames = HOME_KEYFRAMES) {
  const duration = frames.at(-1).at;
  const time = Math.max(0, Number.isFinite(seconds) ? seconds : 0) % duration;
  const index = frames.findIndex((frame, i) => i < frames.length - 1 && time < frames[i + 1].at);
  const a = frames[Math.max(0, index)], b = frames[Math.max(0, index) + 1];
  const fraction = (time - a.at) / (b.at - a.at), u = fraction * fraction * (3 - 2 * fraction);
  const mix = (x, y) => x + (y - x) * u;
  return { position: a.position.map((x, i) => mix(x, b.position[i])), look: a.look.map((x, i) => mix(x, b.look[i])), fov: mix(a.fov, b.fov) };
}

export function createHomeCamera({ camera, car, desert, vehicle, rig, motionQuery = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)') }) {
  let active = false, time = 0, restoreWorld = null;
  function update(dt) {
    if (!active) return;
    const moving = !motionQuery?.matches;
    if (moving) {
      time += Math.max(0, dt);
      if (dt > 0) desert.advance(2.2 * dt, dt);
      for (const wheel of car.wheels) wheel.spin.rotation.x -= 2.2 / wheel.radius * dt;
    }
    // 世界沿用公路的跑步机滚动，车身始终沿当前车道前进。
    car.root.position.set(desert.centerAt(0) + 1.8, 0, 0);
    car.root.rotation.y = -Math.asin(Math.max(-.5, Math.min(.5, desert.slopeAt(0))));
    car.setThrust(.32, time);
    const shot = sampleHomeCamera(time), p = car.root.position;
    camera.position.set(p.x + shot.position[0], p.y + shot.position[1], p.z + shot.position[2]);
    camera.lookAt(p.x + shot.look[0], p.y + shot.look[1], p.z + shot.look[2]);
    camera.fov = shot.fov; camera.updateProjectionMatrix();
    desert.follow(p, camera); desert.setAltitude(0);
  }
  return {
    start() { if (active) return; active = true; time = 0; restoreWorld = desert.captureDisplayState(); update(0); },
    update,
    stop() {
      if (!active) return;
      active = false;
      // 展示世界复位，正式驾驶仍从原来的直道开始。
      restoreWorld?.(); restoreWorld = null;
      const s = vehicle.state;
      car.root.position.set(s.x, s.y, 0); car.root.rotation.y = s.yaw;
      car.setThrust(0, time);
      desert.follow(car.root.position, camera); rig.syncChase();
    },
  };
}
