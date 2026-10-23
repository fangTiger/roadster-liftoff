// 飞行导演：在"公路驾驶"之外接管三段电影式流程
//   ascent  冲出大气层：仰拍爬升 → 穿云白闪（白闪最亮时切到太空场景）→ 天空变黑、地球弧线出现
//   orbit   轨道巡航：地球在脚下缓缓转动，老前辈迎面飘来，近距离时环绕运镜
//   reentry 再入返回：机头下压、等离子火光 → 穿云白闪切回沙漠 → 推进器减速、交还给公路驾驶
import * as THREE from 'three';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp01 = x => Math.max(0, Math.min(1, x));
const ease = x => { x = clamp01(x); return x * x * (3 - 2 * x); };
const lerp = THREE.MathUtils.lerp;
const ramp = (t, a, b) => clamp01((t - a) / (b - a));

export function createFlight({ scene, camera, desert, space, clouds, car, vehicle, hud, flash, music }) {
  const st = { mode: 'drive', t: 0, jetHold: 0, orbitT: 0, meet: null, meetCooldown: 6, shown: {} };
  const camPos = V(), camLook = V(), tmpP = V(), tmpL = V();
  const s = vehicle.state;
  const deepBlue = new THREE.Color('#2b5596'), black = new THREE.Color('#000');
  const FWD = V(0, 0, -1);
  let y0 = 0, x0 = 0;

  const setFlash = k => { flash.style.opacity = k.toFixed(3); };
  function moveCam(dt, pos, look, k = 3) {
    const a = 1 - Math.exp(-dt * k); camPos.lerp(pos, a); camLook.lerp(look, a);
    camera.position.copy(camPos); camera.lookAt(camLook);
  }
  function shake(amount, t) { camera.position.x += Math.sin(t * 61) * amount; camera.position.y += Math.sin(t * 47 + 1) * amount; }
  function setFov(f, dt) { camera.fov += (f - camera.fov) * Math.min(1, dt * 3); camera.updateProjectionMatrix(); }
  function toast(key, a, b) { if (!st.shown[key]) { st.shown[key] = true; hud.toast(a, b, 3800); } }

  // 进入太空：隐藏沙漠与云层，显示地球；在白闪最亮时调用，看不到切换
  function enterSpace() {
    desert.setVisible(false); clouds.group.visible = false; space.group.visible = true;
    const off = car.root.position.clone(); car.root.position.set(0, 0, 0); camPos.sub(off); camLook.sub(off);
    space.place(car.root.position, 90, FWD); aimEarth(); scene.environment = space.bakeEnv(); scene.environmentRotation.set(0, 0, 0);
    scene.background = deepBlue.clone(); car.setHeadlights(.15);
  }
  function aimEarth() { space.aimEarth(car.root.position.clone().addScaledVector(FWD, 2600).sub(space.center).normalize()); }
  function leaveSpace() {
    space.group.visible = false; space.oldFriend.visible = false; scene.background = null;
    desert.setVisible(true); clouds.group.visible = true; car.setHeadlights(1);
  }

  // 公路驾驶时检查是否触发冲出大气层：悬停在 8 米以上、推进剂过半、持续按住空格 0.8 秒
  function checkAscent(dt, inp) {
    if (st.mode !== 'drive') return false;
    st.jetHold = inp.jet && s.y > 8 && s.fuel > .5 ? st.jetHold + dt : 0;
    if (st.jetHold > .8) { start('ascent'); return true; }
    return false;
  }
  function start(mode) {
    st.mode = mode; st.t = 0;
    if (mode === 'ascent') { y0 = s.y; x0 = s.x; camPos.copy(camera.position); camLook.copy(car.root.position).add(V(0, .6, -8)); music?.cue('space'); }
    if (mode === 'orbit') { st.orbitT = 0; st.meetCooldown = 3; }
    if (mode === 'reentry') { music?.cue('road'); }
  }

  function updateAscent(dt, inp, now) {
    const t = (st.t += dt);
    let altKm;
    if (t < 3.6) {
      // 第 1 段：沙漠上空加速爬升，机头抬起，镜头转为从下方仰拍
      const y = y0 + 4 * t + 26 * t * t;
      car.root.position.set(x0, y, 0); car.root.rotation.y = s.yaw * (1 - ease(t));
      car.chassis.rotation.x = .42 * ease(t / 1.5);
      car.setThrust(1, now); car.setLift(1 - ramp(t, 1.8, 3), now);
      desert.advance(s.v * dt); desert.follow(car.root.position); desert.setAltitude(y);
      desert.fog.density = .0011 + Math.max(0, y - 15) * .00005;
      clouds.group.visible = y > 60; clouds.follow(x0, 0);
      const k = ease(t / 2.2);
      tmpP.set(x0 + lerp(.5, 3, k), y + lerp(1.4, -4.5, k), lerp(7, 9, k)); tmpL.set(x0, y + lerp(.6, 3, k), lerp(-8, -6, k));
      moveCam(dt, tmpP, tmpL, 4); shake(.04 + ramp(t, 2.6, 3.5) * .12, now);
      setFlash(ramp(t, 3.2, 3.55));
      altKm = y / 1000;
      if (t + dt >= 3.6) enterSpace();
    } else {
      // 第 2 段：已在太空，白闪退去；地球从近处的蓝色"地面"变成脚下的弧线，天空由深蓝变黑
      const u = ease((t - 3.6) / 6.4), h = lerp(90, 900, u);
      space.place(car.root.position, h, FWD); aimEarth();
      scene.background.copy(deepBlue).lerp(black, ease((t - 3.6) / 3.2));
      space.setFade(1); space.group.children[0].material.opacity = .85 * ease((t - 5.5) / 2.5);   // 星空渐显
      car.chassis.rotation.x = lerp(.42, .04, ease((t - 3.8) / 4)); car.root.rotation.z = Math.sin(now * .6) * .02;
      car.setThrust(lerp(1, .18, ease((t - 4.5) / 3)), now); car.setLift(0, now);
      tmpP.set(lerp(3, 4.6, u), lerp(-4.5, 1.9, u), lerp(9, 8.6, u)); tmpL.set(lerp(0, -.4, u), lerp(3, -1.6, u), lerp(-6, -2.5, u));
      moveCam(dt, tmpP, tmpL, 2.2); shake(.1 * (1 - ramp(t, 3.6, 5.5)), now);
      setFlash(1 - ramp(t, 3.62, 4.15));
      altKm = lerp(4, 412, u);
      if (t > 4.2) toast('space', '冲出大气层', '欢迎来到近地轨道');
      if (t > 10) start('orbit');
    }
    setFov(lerp(50, 58, ramp(t, 0, 3)) - ramp(t, 4, 9) * 10, dt);
    hud.setOverride({ alt: altKm < 1 ? `${Math.round(altKm * 1000)} m` : `${altKm.toFixed(altKm < 10 ? 1 : 0)} km`, spd: Math.round(lerp(s.v * 3.6, 27600, ease(t / 9))).toLocaleString() });
  }

  function updateOrbit(dt, inp, now) {
    const t = (st.orbitT += dt);
    // 地球在脚下缓缓转动，表现向前飞行
    space.earth.rotateOnWorldAxis(V(1, 0, 0), dt * .0035 * (inp.throttle ? 2.2 : 1));
    car.setThrust(inp.throttle ? .8 : .18, now); car.setLift(0, now);
    const yawT = (inp.left ? .25 : 0) - (inp.right ? .25 : 0);
    car.root.rotation.y += (yawT - car.root.rotation.y) * Math.min(1, dt * 2);
    car.root.rotation.z = Math.sin(now * .5) * .02 - yawT * .15; car.chassis.rotation.x = .04 + Math.sin(now * .4) * .01;
    // 老前辈：每隔一段时间从正前方迎面飘来，从车旁擦肩而过
    const old = space.oldFriend;
    if (!st.meet && (st.meetCooldown -= dt) <= 0) { st.meet = { z: -160 }; old.visible = true; }
    let camMode = 'chase';
    if (st.meet) {
      st.meet.z += dt * (st.meet.z > -40 && st.meet.z < 30 ? 6 : 18);
      old.position.set(6.5, 1.6 + Math.sin(now * .7) * .3, st.meet.z); old.rotation.set(-.1 + Math.sin(now * .3) * .05, .35 + now * .05, .22);
      if (st.meet.z > -40 && st.meet.z < 30) { camMode = 'meet'; toast('meet', '与前辈同框', '2018 年被送上太空的老前辈，还在这里'); music?.cue('oldfriend'); }
      if (st.meet.z > 120) { st.meet = null; old.visible = false; st.meetCooldown = 40; music?.cue('space'); }
    }
    if (camMode === 'meet') {
      // 环绕运镜：镜头绕两车中点慢慢转，把两辆车和地球同时框进画面
      const mid = V(3.2, .9, st.meet.z * .5), a = now * .18;
      tmpP.set(mid.x + Math.cos(a) * 11, mid.y + 2.2, mid.z + Math.sin(a) * 11); tmpL.copy(mid).add(V(0, -.6, 0));
      moveCam(dt, tmpP, tmpL, 1.2);
    } else {
      tmpP.set(4.6 + yawT * 3, 1.9, 8.6); tmpL.set(-.4, -1.6, -2.5);
      moveCam(dt, tmpP, tmpL, 2);
    }
    setFov(inp.throttle ? 50 : 46, dt);
    hud.setOverride({ alt: '412 km', spd: (inp.throttle ? 27900 : 27600).toLocaleString() });
    if (inp.brake) start('reentry');
  }

  function updateReentry(dt, inp, now) {
    const t = (st.t += dt);
    let altM;
    if (t < 4.1) {
      // 第 1 段：机头下压，等离子火光从车头包裹全车，地球越来越近，天空由黑转蓝
      const u = ease(t / 4.1), h = lerp(900, 90, u * u);
      space.place(car.root.position, h, FWD);
      scene.background.copy(black).lerp(deepBlue, ease((t - 1.5) / 2.5));
      car.chassis.rotation.x = lerp(.04, -.32, ease(t / 1.5)); car.root.rotation.y *= .95;
      car.setThrust(0, now); car.setLift(0, now); car.setPlasma(ease(t / 2.2), now);
      tmpP.set(lerp(4.6, 5.5, u), lerp(1.9, 1.4, u), lerp(8.6, 7, u)); tmpL.set(0, lerp(-1.6, -.4, u), lerp(-2.5, -4, u));
      moveCam(dt, tmpP, tmpL, 2); shake(.05 + .12 * ease(t / 3), now);
      setFlash(ramp(t, 3.7, 4.05));
      altM = lerp(412000, 9000, u * u);
      if (t + dt >= 4.1) {
        leaveSpace(); x0 = s.x; y0 = 430;
        car.root.position.set(x0, y0, 0); camPos.add(V(x0, y0, 0)); camLook.add(V(x0, y0, 0));
      }
    } else {
      // 第 2 段：回到沙漠上空，穿出云层，车底推进器点火减速，回到 12 米交还给公路驾驶
      const u = ease((t - 4.1) / 4.4), y = lerp(430, 12, 1 - Math.pow(1 - clamp01((t - 4.1) / 4.4), 2.2));
      car.root.position.set(x0, y, 0); clouds.follow(x0, 0); clouds.group.visible = y > 60;
      desert.advance(s.v * dt); desert.follow(car.root.position); desert.setAltitude(y);
      desert.fog.density = .0011 + Math.max(0, y - 15) * .00005;
      car.chassis.rotation.x = lerp(-.32, 0, ease((t - 4.4) / 2.5));
      car.setPlasma(1 - ramp(t, 4.1, 5.2), now); car.setLift(ramp(t, 5.6, 6.2), now); car.setThrust(0, now);
      tmpP.set(x0 + lerp(3.5, .6, u), y + lerp(1.2, 1.5, u), lerp(8, 6.6, u)); tmpL.set(x0, y + .5, -8);
      moveCam(dt, tmpP, tmpL, 3); shake(.12 * (1 - ramp(t, 4.1, 6)), now);
      setFlash(1 - ramp(t, 4.12, 4.6));
      altM = y;
      if (t > 8.5) {
        // 交还：从 12 米开始自然落下，推进剂已用掉大半
        Object.assign(s, { y: 12, vy: -2, airborne: true, fuel: .25, lift: 0 });
        car.chassis.rotation.x = 0; hud.setOverride(null); st.mode = 'drive'; st.jetHold = 0;
        toast('home', '安全返航', '再入大气层，平稳回到公路');
        return;
      }
    }
    setFov(lerp(48, 56, ease(t / 3)) - ramp(t, 6, 8.5) * 6, dt);
    hud.setOverride({ alt: altM >= 1000 ? `${Math.round(altM / 1000)} km` : `${Math.round(altM)} m`, spd: Math.round(lerp(27600, s.v * 3.6, ease(t / 8))).toLocaleString() });
  }

  function update(dt, inp, now) {
    if (st.mode === 'ascent') updateAscent(dt, inp, now);
    else if (st.mode === 'orbit') updateOrbit(dt, inp, now);
    else if (st.mode === 'reentry') updateReentry(dt, inp, now);
  }
  return { state: st, checkAscent, update, start };
}
