// 飞行导演：公路驾驶之外的三段流程
//   ascent  冲向太空（玩家操控）：按住空格爬升、W 加力、A/D 侧移；松开会减速并缓缓降落，按 S 主动俯冲，推进剂耗尽或放弃则落回公路。
//           沿途：突破音障（蒸汽锥 + 音爆）→ 穿云 → 云海 → 平流层天空变暗 → 卡门线（100 km）进入太空
//   insert  入轨：自动把高度推到轨道，镜头转到巡航机位
//   orbit   轨道巡航：地球在脚下转动，老前辈迎面飘来，近距离时环绕运镜
//   reentry 再入返回：机头下压、等离子火光 → 穿云回到沙漠上空 → 推进器减速、交还公路驾驶；途中按住空格可中止再入、接回爬升
import * as THREE from 'three';
import { descentSpeed } from './vehicle.js';
import { t as tr } from '../i18n/i18n.js';   // 取名 tr：本文件里 t 是各段流程的计时变量

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp01 = x => Math.max(0, Math.min(1, x));
const ease = x => { x = clamp01(x); return x * x * (3 - 2 * x); };
const lerp = THREE.MathUtils.lerp;
const ramp = (t, a, b) => clamp01((t - a) / (b - a));
const bell = (x, a, b) => Math.sin(Math.PI * clamp01((x - a) / (b - a)));

// 爬升参数（米、秒）
const SWITCH_ALT = 820;          // 在云层里切换到太空场景
const CLOUD_LO = 450, CLOUD_HI = 900;
const KARMAN = 100000;
const V_CAP = 7800;              // 末速约 28,000 km/h
const BURN = .018;               // 每秒消耗推进剂（满箱约 55 秒，爬到卡门线约需 0.4）

const fmtAlt = m => m >= 10000 ? `${Math.round(m / 1000)} km` : m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
const layerOf = m => tr(m < 12000 ? 'layer.troposphere' : m < 50000 ? 'layer.stratosphere' : m < 85000 ? 'layer.mesosphere' : m < KARMAN ? 'layer.thermosphere' : 'layer.space');

// 里程碑提示的 key → 成就事件名
const EVENT_OF = { boom: 'boom', clouds: 'clouds', strato: 'stratosphere', karman: 'karman', meet: 'meet', home: 'reentry_home' };

export function createFlight({ scene, camera, desert, space, clouds, cloudSea, sky, car, vehicle, hud, flash, music, engine, onEvent = () => {} }) {
  const st = { rcs: { strafe: 0, yaw: 0 }, mode: 'drive', t: 0, jetHold: 0, orbitT: 0, meet: null, meetCooldown: 3, shown: {}, alt: 0, plasma: 0, flash: 0 };
  const asc = { alt: 0, vz: 0, roll: 0, world: 'desert', mach: 0, boom: 0, envSwapped: false };
  const camPos = V(), camLook = V(), tmpP = V(), tmpL = V();
  const s = vehicle.state;
  const FWD = V(0, 0, -1);
  let x0 = 0;

  const setFlash = k => { st.flash = clamp01(k); flash.style.opacity = st.flash.toFixed(3); };
  function moveCam(dt, pos, look, k = 3) {
    const a = 1 - Math.exp(-dt * k); camPos.lerp(pos, a); camLook.lerp(look, a);
    camera.position.copy(camPos); camera.lookAt(camLook);
  }
  // 爬升专用：镜头相对车身的偏移做平滑，镜头本身随车移动。直接追绝对位置时车每秒上升几百米，弹簧镜头会被甩掉、车飞出画面
  const offP = V(), offL = V();
  function moveRel(dt, p, l, k = 3) {
    const a = 1 - Math.exp(-dt * k); offP.lerp(p, a); offL.lerp(l, a);
    const c = car.root.position;
    camPos.copy(c).add(offP); camLook.copy(c).add(offL);
    camera.position.copy(camPos); camera.lookAt(camLook);
  }
  function shake(amount, t) { camera.position.x += Math.sin(t * 61) * amount; camera.position.y += Math.sin(t * 47 + 1) * amount; }
  function setFov(f, dt) { camera.fov += (f - camera.fov) * Math.min(1, dt * 3); camera.updateProjectionMatrix(); }
  function toast(key, a, b) { if (!st.shown[key]) { st.shown[key] = true; hud.toast(a, b, 3800); if (EVENT_OF[key]) onEvent(EVENT_OF[key]); } }
  function aimEarth() { space.aimEarth(car.root.position.clone().addScaledVector(FWD, 2600).sub(space.center).normalize()); }
  // 太空场景里的高度（场景单位 ≈ 公里），低空额外加 3，保证地球表面在云海之下
  const hVis = alt => alt / 1000 + 3;

  // —— 场景切换（都发生在云层里，被云雾遮住）——
  function toSpaceWorld() {
    const off = car.root.position.clone();
    desert.setVisible(false); clouds.group.visible = false; space.group.visible = true;
    car.root.position.set(0, 0, 0); camPos.sub(off); camLook.sub(off);
    scene.background = new THREE.Color('#000'); car.setHeadlights(.35);
    asc.world = 'space'; asc.envSwapped = false;
  }
  function toDesertWorld(y) {
    space.group.visible = false; space.oldFriend.visible = false; cloudSea.sea.visible = false;
    desert.setVisible(true); clouds.group.visible = true; car.setHeadlights(1);
    scene.environmentIntensity = 1;
    const off = V(x0, y, 0).sub(car.root.position);
    car.root.position.set(x0, y, 0); camPos.add(off); camLook.add(off);
    asc.world = 'desert';
  }
  // 太空侧的天空、云海、光照随高度更新
  function updateSpaceLook(alt, dt) {
    space.place(car.root.position, alt >= KARMAN ? lerp(hVis(KARMAN), 900, ease((alt - KARMAN) / 312000)) : hVis(alt), FWD);
    aimEarth();
    space.atm.material.uniforms.fade.value = ramp(alt, 60000, 140000);
    space.skyLight.intensity = 1.3 * (1 - ramp(alt, 2000, 40000));
    sky.setAltitude(alt); sky.uniforms.sunDir.value.copy(space.sunDir); sky.uniforms.opacity.value = 1; sky.uniforms.groundK.value = 0;
    cloudSea.update(dt, Math.hypot(asc.vz, s.v) / 1000, car.root.position, alt, space.sunDir, sky.uniforms.hor.value);
    // 低空保留沙漠 HDR 的环境反射，30 km 后换成太空环境（黑色宇宙 + 蓝色地球）
    if (alt < 30000) scene.environmentIntensity = lerp(1, .25, ramp(alt, 1000, 30000));
    else if (!asc.envSwapped) { asc.envSwapped = true; scene.environment = space.bakeEnv(true); scene.environmentRotation.set(0, 0, 0); scene.environmentIntensity = 1; }
  }
  function updateDesertLook(alt, dt) {
    car.root.position.y = alt;
    sky.setAltitude(alt); sky.uniforms.sunDir.value.copy(desert.sunDir); sky.uniforms.opacity.value = ramp(alt, 20, 160); sky.uniforms.groundK.value = 1;
    desert.advance(s.v * dt, dt); desert.follow(car.root.position, camera); desert.setAltitude(alt, sky.uniforms.hor.value);
    clouds.follow(car.root.position.x, 0); clouds.group.visible = alt > 250;
  }

  // —— 触发：按下空格那一刻推进剂够 LAUNCH_FUEL 就锁定，离地 6 米以上、继续按住 0.4 秒冲向太空 ——
  // 之前要求悬停全程推进剂都过半，悬停本身每秒烧掉 16%，实际从地面起跳要 80% 以上才行，玩家按住空格却没反应、也没有提示
  const LAUNCH_FUEL = .7;
  function checkAscent(dt, inp) {
    if (st.mode !== 'drive') return false;
    if (!inp.jet) { st.armed = null; st.jetHold = 0; st.lowHold = 0; return false; }
    if (st.armed == null) { st.armed = s.fuel >= LAUNCH_FUEL; st.pressFuel = s.fuel; }
    st.jetHold = st.armed && s.y > 6 && s.vy > -1 ? st.jetHold + dt : 0;   // 下降途中不触发，避免刚中止又被拉回去
    if (st.jetHold > .4) { start('ascent'); return true; }
    // 推进剂不够还一直按着：提示还差多少（只在悬停超过 1.2 秒时提示，普通小跳不打扰）
    st.lowHold = !st.armed && s.y > 6 ? (st.lowHold || 0) + dt : 0;
    if (st.lowHold > 1.2 && st.lowHold - dt <= 1.2) hud.toast(tr('toast.lowFuelLaunch'), tr('toast.lowFuelLaunchSub', { have: Math.round(st.pressFuel * 100), need: LAUNCH_FUEL * 100 }), 3600);
    return false;
  }
  function start(mode) {
    st.mode = mode; st.t = 0;
    if (mode === 'ascent') {
      Object.assign(asc, { alt: s.y, vz: 12, roll: 0, world: 'desert', mach: 0, boom: 0 });
      x0 = s.x; camPos.copy(camera.position); camLook.copy(car.root.position).add(V(0, .6, -8));
      offP.copy(camPos).sub(car.root.position); offL.copy(camLook).sub(car.root.position);
      sky.dome.visible = true;
      for (const k of ['clouds', 'strato', 'karman', 'boom', 'lowfuel', 'home']) st.shown[k] = false;
      hud.toast(tr('toast.ascent'), tr('toast.ascentSub'), 4200);
    }
    if (mode === 'orbit') { st.orbitT = 0; st.meetCooldown = 3; st.shown.meet = false; onEvent('orbit'); }
    if (mode === 'reentry') {
      music?.cue('road'); asc.world = 'space'; asc.alt = 412000; asc.vz = 0; st.shown.home = false; sky.dome.visible = true;
      st.reArm = false;                                       // 先松开空格再按下才算中止，避免一直按着空格时刚再入就被拉回去
      hud.toast(tr('toast.reentry'), tr('toast.reentrySub'), 3800);
    }
  }
  // 放弃爬升：交还给公路驾驶的物理，从当前高度自由下落（按住空格可缓冲）
  function abortToDrive() {
    sky.dome.visible = false; setFlash(0);
    Object.assign(s, { y: asc.alt, vy: Math.max(asc.vz, -descentSpeed(asc.alt) * 1.1), airborne: true, lift: 0, x: car.root.position.x });
    car.chassis.rotation.set(0, 0, 0); car.root.rotation.z = 0; car.setVapor(0, 0);
    hud.setOverride(null); st.mode = 'drive'; st.jetHold = 0; st.armed = false;   // 要松开空格重新按下才能再冲
    onEvent('ascent_abort', { fuelEmpty: s.fuel <= 0 });
    hud.toast(tr('toast.abort'), tr(s.fuel <= 0 ? 'toast.abortEmpty' : 'toast.abortRelease'), 3600);
  }

  // 中止再入：推进器全开止住下坠，从当前高度接回爬升（按住空格可冲回太空，松开或按 S 落回公路）
  function resumeAscent() {
    st.mode = 'ascent'; st.t = 3.5;                         // 跳过起飞仰拍，直接用爬升侧面机位
    asc.vz = Math.max(asc.vz, 2);                           // 再入的下降速度是演出用的，接回时直接止住下坠、开始上升
    asc.roll = 0; asc.boom = 0; asc.mach = asc.alt < 15000 ? asc.vz / 340 : 0;
    if (asc.world === 'space') x0 = desert.centerAt(0) + 1.8;   // 之后若落回云层以下，出现在公路上空
    offP.copy(camPos).sub(car.root.position); offL.copy(camLook).sub(car.root.position);
    hud.toast(tr('toast.reentryAbort'), tr('toast.reentryAbortSub'), 3600);
  }

  // —— 爬升（玩家操控）——
  function updateAscent(dt, inp, now) {
    const t = (st.t += dt);
    const dive = inp.brake;                                 // S：主动俯冲，比松开推进器落得更快
    const firing = inp.jet && !dive && s.fuel > 0, boost = firing && inp.throttle;
    // 松开推进器：先减速，再按与公路段相同的下降速度曲线落回（高处快、近地慢），不再瞬间猛坠
    // 回落速度与再入返回同一条曲线（v = 0.38·h + 3，高处封顶），高处快、近地慢，一直缓降到 30 米再交还公路驾驶
    const vt = -Math.min((RE.k2 * asc.alt + RE.c2) * (dive ? 2.2 : 1), dive ? 6000 : 3000);
    // 不推进时向目标下降速度收敛：上升越快减速越猛（按 S 更猛），不会靠惯性一路冲上卡门线；下坠过快时车底推进器托住
    const lo = -(dive ? 400 + 1.2 * Math.max(asc.vz, 0) : 150 + .45 * Math.max(asc.vz, 0)), hi = 40 + .45 * Math.max(-asc.vz, 0);
    const a = firing ? (40 + .3 * Math.max(asc.vz, 0)) * (boost ? 1.5 : 1) : THREE.MathUtils.clamp((dive ? 2 : 1.5) * (vt - asc.vz), lo, hi);
    asc.vz = Math.min(asc.vz + a * dt, V_CAP * (boost ? 1.04 : 1));
    if (firing) s.fuel = Math.max(0, s.fuel - BURN * (boost ? 1.8 : 1) * dt);
    asc.alt += asc.vz * dt;
    // 侧移与侧倾
    const side = (inp.left ? 1 : 0) - (inp.right ? 1 : 0);
    asc.roll += (side * .35 - asc.roll) * Math.min(1, dt * 3);
    st.rcs.strafe = side; st.rcs.yaw = 0;                                  // 侧移靠两侧姿态喷口
    car.root.position.x -= asc.roll * dt * 6;
    // 回落到沙漠上空且没在侧移时，慢慢对准公路右侧车道，免得落在路外的草地上
    if (asc.world === 'desert' && asc.vz < 0 && !side) { const tx = desert.centerAt(-s.v * .5) + 1.8; car.root.position.x += (tx - car.root.position.x) * Math.min(1, dt * lerp(.4, 2.5, ramp(asc.alt, 800, 250))); }
    // 车头抬起像火箭一样向上，推力越大抬得越高
    const falling = !firing && asc.vz < 0 && asc.world === 'desert';
    const pitch = dive ? -.3 * (falling ? ramp(asc.alt, 30, 300) : 1)            // 俯冲时机头朝下
      : lerp(.15, .95, ease(t / 2.2)) * (firing ? 1 : .7) * (falling ? ramp(asc.alt, 40, 400) : 1);   // 快落地时放平车身
    car.chassis.rotation.x += (pitch - car.chassis.rotation.x) * Math.min(1, dt * 3);
    car.root.rotation.z = asc.roll * .8; car.root.rotation.y *= Math.exp(-dt * 2);
    car.setThrust(firing ? (boost ? 1 : .8) : 0, now); car.setLift(firing ? lerp(1, .3, ease(t / 3)) : asc.vz < 0 ? .4 : 0, now);   // 下降时车底推进器小火托底
    // 音障：竖直速度接近 340 m/s 时出现蒸汽锥，跨过 1 马赫的瞬间音爆
    const mach = asc.alt < 15000 ? asc.vz / 340 : 0;
    if (asc.mach < 1 && mach >= 1) { asc.boom = 1; toast('boom', tr('ms.boom'), tr('ms.boomSub')); }
    asc.mach = mach; asc.boom = Math.max(0, asc.boom - dt * 1.6);
    car.setVapor(bell(mach, .9, 1.35), now);
    if (st.plasma > 0) { st.plasma = Math.max(0, st.plasma - dt * 1.5); car.setPlasma(st.plasma, now); }   // 从再入中止接回时，等离子火光渐熄

    // 世界：云层里切换场景；回落到云层以下切回沙漠
    if (asc.world === 'desert' && asc.alt >= SWITCH_ALT) toSpaceWorld();
    if (asc.world === 'space' && asc.alt < SWITCH_ALT) { x0 = desert.centerAt(0) + 6; toDesertWorld(asc.alt); }
    if (asc.world === 'desert') updateDesertLook(asc.alt, dt); else updateSpaceLook(asc.alt, dt);
    // 穿云白雾：在云层中段最浓
    setFlash(Math.max(bell(asc.alt, CLOUD_LO + 150, CLOUD_HI + 250) * .92, asc.boom * .25));
    if (asc.alt > CLOUD_HI + 200) toast('clouds', tr('ms.clouds'), tr('ms.cloudsSub'));
    if (asc.alt > 12000) toast('strato', tr('ms.strato'), tr('ms.stratoSub'));
    if (s.fuel < .12 && s.fuel > 0) toast('lowfuel', tr('ms.lowfuel'), tr('ms.lowfuelSub'));

    // 镜头：车下后方仰拍，速度越快越远、越抖
    // 镜头：起飞头 2 秒在车后下方仰拍；之后转到车的左侧、略高于车，平视略俯，
    // 车头朝上像火箭一样爬升，脚下的云海与地球弧线留在画面下半部
    const sp = clamp01(asc.vz / 2500), sw = ease((t - 1.2) / 2.2);
    // 推力越大镜头越往下“掉”一点，表现推背；车始终留在画面里
    const lag = clamp01(a / 160) * 1.4;
    tmpP.set(lerp(2.6, -7.5 - sp * 2, sw) + asc.roll * 2, lerp(-3.4, 1.6 + sp * .8, sw) - lag, lerp(8.2, 3.2, sw));
    tmpL.set(lerp(0, 1.2, sw), lerp(4.5, -.6, sw) + lag * .4, lerp(-4, -.8, sw));
    moveRel(dt, tmpP, tmpL, 3);
    shake(.02 + clamp01(a / 160) * .05 + asc.boom * .35, now);
    setFov(52 + sp * 16 + (boost ? 4 : 0), dt);
    engine.blur.uniforms.strength.value = asc.world === 'desert' ? clamp01((asc.vz - 80) / 500) * .06 : clamp01(asc.vz / 7000) * .03;

    st.alt = asc.alt;
    hud.setOverride({ label: layerOf(asc.alt), value: fmtAlt(asc.alt), alt: fmtAlt(asc.alt), spd: Math.round(Math.hypot(asc.vz, s.v) * 3.6).toLocaleString() });

    if (asc.alt >= KARMAN) { toast('karman', tr('ms.karman'), tr('ms.karmanSub')); music?.cue('space'); start('insert'); return; }
    // 下坠回到低空：交还公路驾驶
    if (asc.world === 'desert' && asc.vz < 0 && asc.alt < 30) abortToDrive();
  }

  // —— 入轨：自动把高度推到 412 km，镜头转到巡航机位 ——
  function updateInsert(dt, inp, now) {
    const t = (st.t += dt), u = ease(t / 4);
    const alt = lerp(KARMAN, 412000, u);
    asc.alt = alt; st.alt = alt; updateSpaceLook(alt, dt);
    car.chassis.rotation.x = lerp(car.chassis.rotation.x, .04, Math.min(1, dt * 2)); car.root.rotation.z *= Math.exp(-dt * 2);
    car.setThrust(lerp(.8, .18, u), now); car.setLift(0, now); car.setVapor(0, now);
    tmpP.set(lerp(-9.5, 4.6, u), lerp(2.4, 1.9, u), lerp(3.2, 8.6, u)); tmpL.set(lerp(1.2, -.4, u), lerp(-.6, -1.6, u), lerp(-.8, -2.5, u));
    moveCam(dt, tmpP, tmpL, 2.4); setFov(lerp(64, 46, u), dt); setFlash(0);
    engine.blur.uniforms.strength.value = 0;
    hud.setOverride({ label: tr('hud.orbitAlt'), value: fmtAlt(alt), alt: fmtAlt(alt), spd: Math.round(lerp(V_CAP * 3.6, 27600, u)).toLocaleString() });
    if (t > 4) start('orbit');
  }

  function updateOrbit(dt, inp, now) {
    st.orbitT += dt; st.alt = 412000;
    s.fuel = Math.min(1, s.fuel + dt * .05);                // 轨道上慢慢补充推进剂，留够中止再入、冲回太空的量
    // 地球在脚下缓缓转动，表现向前飞行
    space.earth.rotateOnWorldAxis(V(1, 0, 0), dt * .0035 * (inp.throttle ? 2.2 : 1));
    car.setThrust(inp.throttle ? .8 : .18, now); car.setLift(0, now);
    const yawT = (inp.left ? .25 : 0) - (inp.right ? .25 : 0);
    st.rcs.yaw = clamp01(Math.abs(yawT - car.root.rotation.y) * 8) * Math.sign(yawT - car.root.rotation.y); st.rcs.strafe = 0;   // 转向时对角两个喷口点火，转到位就熄
    car.root.rotation.y += (yawT - car.root.rotation.y) * Math.min(1, dt * 2);
    car.root.rotation.z = Math.sin(now * .5) * .02 - yawT * .15; car.chassis.rotation.x = .04 + Math.sin(now * .4) * .01;
    // 老前辈：每隔一段时间从正前方迎面飘来，从车旁擦肩而过
    const old = space.oldFriend;
    if (!st.meet && (st.meetCooldown -= dt) <= 0) { st.meet = { z: -160 }; old.visible = true; }
    let camMode = 'chase';
    if (st.meet) {
      st.meet.z += dt * (st.meet.z > -40 && st.meet.z < 30 ? 6 : 18);
      old.position.set(6.5, 1.6 + Math.sin(now * .7) * .3, st.meet.z); old.rotation.set(-.1 + Math.sin(now * .3) * .05, .35 + now * .05, .22);
      if (st.meet.z > -40 && st.meet.z < 30) { camMode = 'meet'; toast('meet', tr('ms.meet'), tr('ms.meetSub')); music?.cue('oldfriend'); }
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
    engine.blur.uniforms.strength.value = 0;
    hud.setOverride({ label: tr('hud.orbitAlt'), value: '412 km', alt: '412 km', spd: (inp.throttle ? 27900 : 27600).toLocaleString() });
    if (inp.brake) start('reentry');
  }

  // —— 再入返回（约 24 秒，与爬升对称）——
  //   离轨：机头下压、反推点火（2.5 秒）
  //   太空段：高度按指数衰减从 395 km 落到云顶，等离子火光在 140–20 km 之间最亮，脚下的云海越来越近，天空由黑转蓝
  //   沙漠段：从云层里穿出，下降速度随高度递减（v = 0.38·h + 3），车底推进器点火减速，看着沙漠和弯道一点点放大，
  //           落到 6 米交还公路驾驶（之后由公路段的缓降物理接着落地）
  const RE = { deorbit: 2.5, k: .6, a0: 395000, k2: .38, c2: 3, hand: 6 };
  function updateReentry(dt, inp, now) {
    const t = (st.t += dt);
    if (!inp.jet) st.reArm = true;
    if (st.reArm && inp.jet && s.fuel > .05 && asc.alt > 12) { resumeAscent(); return; }
    let altM;
    if (asc.world === 'space') {
      if (t < RE.deorbit) {
        const u = ease(t / RE.deorbit);
        altM = lerp(412000, RE.a0, u); asc.vz = -lerp(0, RE.k * RE.a0, u);
        car.setThrust(.7 * bell(t, 0, RE.deorbit), now);
      } else {
        altM = RE.a0 * Math.exp(-RE.k * (t - RE.deorbit)); asc.vz = -RE.k * altM;
        car.setThrust(0, now);
      }
      asc.alt = altM; updateSpaceLook(altM, dt);
      car.chassis.rotation.x = lerp(car.chassis.rotation.x, -.32, Math.min(1, dt * 1.2)); car.root.rotation.y *= Math.exp(-dt * 2); car.root.rotation.z *= Math.exp(-dt * 2);
      st.plasma = ramp(altM, 140000, 95000) * (1 - ramp(altM, 45000, 18000)); car.setLift(0, now); car.setPlasma(st.plasma, now);
      const u = ease(t / 6);
      tmpP.set(lerp(4.6, 5.2, u), lerp(1.9, 1.5, u), lerp(8.6, 7.4, u)); tmpL.set(0, lerp(-1.6, -.6, u), lerp(-2.5, -4, u));
      moveCam(dt, tmpP, tmpL, 2); shake(.03 + .14 * st.plasma, now);
      setFlash(altM < CLOUD_HI + 250 ? bell(altM, CLOUD_LO + 150, CLOUD_HI + 250) * .92 : 0);
      if (altM <= SWITCH_ALT) {
        x0 = desert.centerAt(0) + 9; toDesertWorld(SWITCH_ALT); asc.alt = SWITCH_ALT;          // 出云时偏在路旁，下降途中再对准车道
        offP.copy(camPos).sub(car.root.position); offL.copy(camLook).sub(car.root.position);
      }
    } else {
      // 沙漠段：dh/dt = -(k2·h + c2)，高处快、近地慢
      const vz = RE.k2 * asc.alt + RE.c2;
      asc.alt = Math.max(RE.hand, asc.alt - vz * dt); asc.vz = -vz; altM = asc.alt;
      s.v += (33 - s.v) * Math.min(1, dt * .25);                         // 水平速度收到约 120 km/h，落地时正好接着开
      // 横向慢慢对准公路右侧车道
      const tx = desert.centerAt(-s.v * .5) + 1.8; car.root.position.x += (tx - car.root.position.x) * Math.min(1, dt * lerp(.5, 3, ramp(asc.alt, 400, 40)));
      x0 = car.root.position.x;
      updateDesertLook(altM, dt);
      const low = ramp(altM, 260, 20);                                 // 0：刚出云层，1：贴近地面
      car.chassis.rotation.x = lerp(car.chassis.rotation.x, lerp(-.18, 0, low), Math.min(1, dt * 1.5)); car.root.rotation.y = 0;
      st.plasma = Math.max(0, st.plasma - dt * 1.5); car.setPlasma(st.plasma, now); car.setThrust(0, now);
      car.setLift(lerp(.35, 1, ramp(altM, 300, 60)), now, altM + .16);
      // 镜头：先在车后上方俯瞰脚下的沙漠与弯道，越接近地面越回到平常的追随机位
      tmpP.set(lerp(2.8, .6, low), lerp(3.4, 1.5, low), lerp(10, 6.6, low)); tmpL.set(0, lerp(-3.5, .5, low), lerp(-10, -8, low));
      moveRel(dt, tmpP, tmpL, 2.5); shake(.04 * (1 - low), now);
      setFlash(bell(altM, CLOUD_LO + 150, CLOUD_HI + 250) * .92);
      if (altM <= RE.hand) {
        // 交还：从 6 米接着缓降落地，推进剂已用掉大半
        Object.assign(s, { y: altM, vy: -vz, airborne: true, fuel: .25, lift: 0, x: car.root.position.x, yaw: 0 });
        car.chassis.rotation.x = 0; hud.setOverride(null); st.mode = 'drive'; st.jetHold = 0; st.armed = false; sky.dome.visible = false; setFlash(0); st.plasma = 0;
        toast('home', tr('ms.home'), tr('ms.homeSub'));
        return;
      }
    }
    st.alt = altM;
    setFov(lerp(48, 56, ease(t / 3)) - (asc.world === 'desert' ? ramp(altM, 200, 10) * 6 : 0), dt);
    engine.blur.uniforms.strength.value = 0;
    const kmh = asc.world === 'space' ? Math.max(Math.abs(asc.vz), 7800 * Math.exp(-t / 8)) * 3.6 : Math.hypot(asc.vz, s.v) * 3.6;
    hud.setOverride({ label: tr('hud.reentryAlt'), value: fmtAlt(altM), alt: fmtAlt(altM), spd: Math.round(kmh).toLocaleString() });
  }

  function update(dt, inp, now) {
    st.rcs.strafe = st.rcs.yaw = 0;
    if (st.mode === 'ascent') updateAscent(dt, inp, now);
    else if (st.mode === 'insert') updateInsert(dt, inp, now);
    else if (st.mode === 'orbit') updateOrbit(dt, inp, now);
    else if (st.mode === 'reentry') updateReentry(dt, inp, now);
    if (st.mode !== 'drive') sky.follow(camera);
  }
  const setMusic = m => { music = m; };
  return { state: st, checkAscent, update, start, setMusic };
}
