// 飞行导演：公路驾驶之外的三段流程
//   ascent  冲向太空（玩家操控）：按住空格爬升、W 加力、A/D 侧移；松开会减速下坠，推进剂耗尽或放弃则落回公路。
//           沿途：突破音障（蒸汽锥 + 音爆）→ 穿云 → 云海 → 平流层天空变暗 → 卡门线（100 km）进入太空
//   insert  入轨：自动把高度推到轨道，镜头转到巡航机位
//   orbit   轨道巡航：地球在脚下转动，老前辈迎面飘来，近距离时环绕运镜
//   reentry 再入返回：机头下压、等离子火光 → 穿云回到沙漠上空 → 推进器减速、交还公路驾驶
import * as THREE from 'three';

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
const BURN = .02;                // 每秒消耗推进剂（满箱约 50 秒，爬到卡门线约需 0.45）

const fmtAlt = m => m >= 10000 ? `${Math.round(m / 1000)} km` : m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
const layerOf = m => m < 12000 ? '对流层' : m < 50000 ? '平流层' : m < 85000 ? '中间层' : m < KARMAN ? '热层' : '卡门线以上 · 太空';

// 里程碑提示的 key → 成就事件名
const EVENT_OF = { boom: 'boom', clouds: 'clouds', strato: 'stratosphere', karman: 'karman', meet: 'meet', home: 'reentry_home' };

export function createFlight({ scene, camera, desert, space, clouds, cloudSea, sky, car, vehicle, hud, flash, music, engine, onEvent = () => {} }) {
  const st = { mode: 'drive', t: 0, jetHold: 0, orbitT: 0, meet: null, meetCooldown: 3, shown: {}, alt: 0, plasma: 0, flash: 0 };
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
    sky.setAltitude(alt); sky.uniforms.sunDir.value.copy(space.sunDir); sky.uniforms.opacity.value = 1;
    cloudSea.update(dt, Math.hypot(asc.vz, s.v) / 1000, car.root.position, alt, space.sunDir, sky.uniforms.hor.value);
    // 低空保留沙漠 HDR 的环境反射，30 km 后换成太空环境（黑色宇宙 + 蓝色地球）
    if (alt < 30000) scene.environmentIntensity = lerp(1, .25, ramp(alt, 1000, 30000));
    else if (!asc.envSwapped) { asc.envSwapped = true; scene.environment = space.bakeEnv(); scene.environmentRotation.set(0, 0, 0); scene.environmentIntensity = 1; }
  }
  function updateDesertLook(alt, dt) {
    car.root.position.y = alt;
    desert.advance(s.v * dt); desert.follow(car.root.position); desert.setAltitude(alt);
    desert.fog.density = .0011 + Math.max(0, alt - 15) * .000012;
    clouds.follow(car.root.position.x, 0); clouds.group.visible = alt > 250;
    sky.setAltitude(alt); sky.uniforms.sunDir.value.copy(desert.sunDir); sky.uniforms.opacity.value = ramp(alt, 20, 160);
  }

  // —— 触发：悬停 8 米以上、推进剂过半、持续按住空格 0.8 秒 ——
  function checkAscent(dt, inp) {
    if (st.mode !== 'drive') return false;
    st.jetHold = inp.jet && s.y > 8 && s.fuel > .5 ? st.jetHold + dt : 0;
    if (st.jetHold > .8) { start('ascent'); return true; }
    return false;
  }
  function start(mode) {
    st.mode = mode; st.t = 0;
    if (mode === 'ascent') {
      Object.assign(asc, { alt: s.y, vz: 12, roll: 0, world: 'desert', mach: 0, boom: 0 });
      x0 = s.x; camPos.copy(camera.position); camLook.copy(car.root.position).add(V(0, .6, -8));
      sky.dome.visible = true;
      for (const k of ['clouds', 'strato', 'karman', 'boom', 'lowfuel', 'home']) st.shown[k] = false;
      hud.toast('冲向太空', '按住空格持续爬升 · W 加力 · A/D 侧移 · 松开会下坠', 4200);
    }
    if (mode === 'orbit') { st.orbitT = 0; st.meetCooldown = 3; st.shown.meet = false; onEvent('orbit'); }
    if (mode === 'reentry') { music?.cue('road'); }
  }
  // 放弃爬升：交还给公路驾驶的物理，从当前高度自由下落（按住空格可缓冲）
  function abortToDrive() {
    sky.dome.visible = false; setFlash(0);
    Object.assign(s, { y: asc.alt, vy: Math.max(asc.vz, -30), airborne: true, lift: 0, x: car.root.position.x });
    car.chassis.rotation.set(0, 0, 0); car.root.rotation.z = 0; car.setVapor(0, 0);
    hud.setOverride(null); st.mode = 'drive'; st.jetHold = 0;
    onEvent('ascent_abort', { fuelEmpty: s.fuel <= 0 });
    hud.toast('爬升中止', s.fuel <= 0 ? '推进剂耗尽，正在下坠——按住空格缓冲落地' : '松开了推进器，正在下坠——按住空格缓冲落地', 3600);
  }

  // —— 爬升（玩家操控）——
  function updateAscent(dt, inp, now) {
    const t = (st.t += dt);
    const firing = inp.jet && s.fuel > 0, boost = firing && inp.throttle;
    const a = firing ? (40 + .3 * Math.max(asc.vz, 0)) * (boost ? 1.5 : 1) : -60 - .02 * Math.abs(asc.vz);
    asc.vz = Math.min(asc.vz + a * dt, V_CAP * (boost ? 1.04 : 1));
    if (firing) s.fuel = Math.max(0, s.fuel - BURN * (boost ? 1.8 : 1) * dt);
    asc.alt += asc.vz * dt;
    // 侧移与侧倾
    const side = (inp.left ? 1 : 0) - (inp.right ? 1 : 0);
    asc.roll += (side * .35 - asc.roll) * Math.min(1, dt * 3);
    car.root.position.x -= asc.roll * dt * 6;
    // 车头抬起像火箭一样向上，推力越大抬得越高
    const pitch = lerp(.15, .95, ease(t / 2.2)) * (firing ? 1 : .7);
    car.chassis.rotation.x += (pitch - car.chassis.rotation.x) * Math.min(1, dt * 3);
    car.root.rotation.z = asc.roll * .8; car.root.rotation.y *= Math.exp(-dt * 2);
    car.setThrust(firing ? (boost ? 1 : .8) : 0, now); car.setLift(firing ? lerp(1, .3, ease(t / 3)) : 0, now);
    // 音障：竖直速度接近 340 m/s 时出现蒸汽锥，跨过 1 马赫的瞬间音爆
    const mach = asc.alt < 15000 ? asc.vz / 340 : 0;
    if (asc.mach < 1 && mach >= 1) { asc.boom = 1; toast('boom', '突破音障', '1 马赫 · 音爆！'); }
    asc.mach = mach; asc.boom = Math.max(0, asc.boom - dt * 1.6);
    car.setVapor(bell(mach, .9, 1.35), now);

    // 世界：云层里切换场景；回落到云层以下切回沙漠
    if (asc.world === 'desert' && asc.alt >= SWITCH_ALT) toSpaceWorld();
    if (asc.world === 'space' && asc.alt < SWITCH_ALT) toDesertWorld(asc.alt);
    if (asc.world === 'desert') updateDesertLook(asc.alt, dt); else updateSpaceLook(asc.alt, dt);
    // 穿云白雾：在云层中段最浓
    setFlash(Math.max(bell(asc.alt, CLOUD_LO + 150, CLOUD_HI + 250) * .92, asc.boom * .25));
    if (asc.alt > CLOUD_HI + 200) toast('clouds', '穿出云层', '脚下是一片云海');
    if (asc.alt > 12000) toast('strato', '进入平流层', '天空正在变暗');
    if (s.fuel < .12 && s.fuel > 0) toast('lowfuel', '推进剂告急', '再不到卡门线就要掉下去了');

    // 镜头：车下后方仰拍，速度越快越远、越抖
    // 镜头：起飞头 2 秒在车后下方仰拍；之后转到车的左侧、略高于车，平视略俯，
    // 车头朝上像火箭一样爬升，脚下的云海与地球弧线留在画面下半部
    const sp = clamp01(asc.vz / 2500), sw = ease((t - 1.2) / 2.2);
    tmpP.copy(car.root.position).add(V(lerp(2.6, -7.5 - sp * 2, sw) + asc.roll * 2, lerp(-3.4, 1.6 + sp * .8, sw), lerp(8.2, 3.2, sw)));
    tmpL.copy(car.root.position).add(V(lerp(0, 1.2, sw), lerp(4.5, -.6, sw), lerp(-4, -.8, sw)));
    moveCam(dt, tmpP, tmpL, 3);
    shake(.02 + clamp01(a / 160) * .05 + asc.boom * .35, now);
    setFov(52 + sp * 16 + (boost ? 4 : 0), dt);
    engine.blur.uniforms.strength.value = asc.world === 'desert' ? clamp01((asc.vz - 80) / 500) * .06 : clamp01(asc.vz / 7000) * .03;

    st.alt = asc.alt;
    hud.setOverride({ label: layerOf(asc.alt), value: fmtAlt(asc.alt), alt: fmtAlt(asc.alt), spd: Math.round(Math.hypot(asc.vz, s.v) * 3.6).toLocaleString() });

    if (asc.alt >= KARMAN) { toast('karman', '卡门线 · 进入太空', '海拔 100 公里，你已离开地球大气层'); music?.cue('space'); start('insert'); return; }
    // 下坠回到低空：交还公路驾驶
    if (asc.world === 'desert' && asc.vz < 0 && asc.alt < 220) abortToDrive();
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
    hud.setOverride({ label: '轨道高度', value: fmtAlt(alt), alt: fmtAlt(alt), spd: Math.round(lerp(V_CAP * 3.6, 27600, u)).toLocaleString() });
    if (t > 4) start('orbit');
  }

  function updateOrbit(dt, inp, now) {
    st.orbitT += dt; st.alt = 412000;
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
    engine.blur.uniforms.strength.value = 0;
    hud.setOverride({ label: '轨道高度', value: '412 km', alt: '412 km', spd: (inp.throttle ? 27900 : 27600).toLocaleString() });
    if (inp.brake) start('reentry');
  }

  function updateReentry(dt, inp, now) {
    const t = (st.t += dt);
    let altM;
    if (t < 4.1) {
      // 第 1 段：机头下压，等离子火光包裹车头，地球越来越近，天空由黑转蓝
      const u = ease(t / 4.1); altM = lerp(412000, 9000, u * u);
      space.place(car.root.position, lerp(900, 90, u * u), FWD); aimEarth();
      sky.setAltitude(altM); sky.uniforms.opacity.value = 1;
      car.chassis.rotation.x = lerp(.04, -.32, ease(t / 1.5)); car.root.rotation.y *= .95;
      st.plasma = ease(t / 2.2); car.setThrust(0, now); car.setLift(0, now); car.setPlasma(st.plasma, now);
      tmpP.set(lerp(4.6, 5.5, u), lerp(1.9, 1.4, u), lerp(8.6, 7, u)); tmpL.set(0, lerp(-1.6, -.4, u), lerp(-2.5, -4, u));
      moveCam(dt, tmpP, tmpL, 2); shake(.05 + .12 * ease(t / 3), now);
      setFlash(ramp(t, 3.7, 4.05));
      if (t + dt >= 4.1) { x0 = s.x; toDesertWorld(430); }
    } else {
      // 第 2 段：回到沙漠上空，穿出云层，车底推进器点火减速，回到 12 米交还给公路驾驶
      const u = ease((t - 4.1) / 4.4), y = lerp(430, 12, 1 - Math.pow(1 - clamp01((t - 4.1) / 4.4), 2.2));
      car.root.position.set(x0, y, 0); updateDesertLook(y, dt);
      car.chassis.rotation.x = lerp(-.32, 0, ease((t - 4.4) / 2.5));
      st.plasma = 1 - ramp(t, 4.1, 5.2); car.setPlasma(st.plasma, now); car.setLift(ramp(t, 5.6, 6.2), now); car.setThrust(0, now);
      tmpP.set(x0 + lerp(3.5, .6, u), y + lerp(1.2, 1.5, u), lerp(8, 6.6, u)); tmpL.set(x0, y + .5, -8);
      moveCam(dt, tmpP, tmpL, 3); shake(.12 * (1 - ramp(t, 4.1, 6)), now);
      setFlash(1 - ramp(t, 4.12, 4.6));
      altM = y;
      if (t > 8.5) {
        // 交还：从 12 米开始自然落下，推进剂已用掉大半
        Object.assign(s, { y: 12, vy: -2, airborne: true, fuel: .25, lift: 0, x: x0 });
        car.chassis.rotation.x = 0; hud.setOverride(null); st.mode = 'drive'; st.jetHold = 0; sky.dome.visible = false;
        toast('home', '安全返航', '再入大气层，平稳回到公路');
        return;
      }
    }
    st.alt = altM;
    setFov(lerp(48, 56, ease(t / 3)) - ramp(t, 6, 8.5) * 6, dt);
    engine.blur.uniforms.strength.value = 0;
    hud.setOverride({ label: '再入高度', value: fmtAlt(altM), alt: fmtAlt(altM), spd: Math.round(lerp(27600, s.v * 3.6, ease(t / 8))).toLocaleString() });
  }

  function update(dt, inp, now) {
    if (st.mode === 'ascent') updateAscent(dt, inp, now);
    else if (st.mode === 'insert') updateInsert(dt, inp, now);
    else if (st.mode === 'orbit') updateOrbit(dt, inp, now);
    else if (st.mode === 'reentry') updateReentry(dt, inp, now);
    if (st.mode !== 'drive') sky.follow(camera);
  }
  const setMusic = m => { music = m; };
  return { state: st, checkAscent, update, start, setMusic };
}
