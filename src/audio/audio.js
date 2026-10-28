// 独立 ES 模块：音乐流式播放，音效全部由 Web Audio 合成。
const MUSIC_LEVEL = 0.65;
const SFX_LEVEL = 0.72;
const FADE_SECONDS = 2.5;
const NAMES = ['road', 'space', 'oldfriend'];
const EVENTS = ['launch', 'land', 'whiteout', 'achievement', 'horn', 'roll', 'coin', 'raceWall', 'raceBoost', 'raceBeep', 'raceGo', 'raceLap', 'raceFinish'];
const STORE = 'liftoff.audio.v1';
const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));
const db = value => 10 ** (value / 20);

export function createAudio({ urls, music = true } = {}) {
  for (const name of music ? NAMES : []) {
    if (!urls || typeof urls[name] !== 'string' || !urls[name]) throw new TypeError(`缺少音乐 URL：${name}`);
  }
  // 复制地址，避免调用者随后修改对象影响惰性初始化。
  const sources = { ...urls };
  let muted = false;
  let volume = 0.8;
  try {
    const saved = JSON.parse(globalThis.localStorage.getItem(STORE));
    if (typeof saved?.muted === 'boolean') muted = saved.muted;
    if (Number.isFinite(saved?.volume)) volume = clamp(saved.volume);
  } catch { /* 隐私模式及禁用存储时继续使用内存状态。 */ }

  let ctx, master, musicBus, musicDuck, sfxBus, musicHP, wet, panDepth;
  let motor, motorSine, whine, motorFilter, motorGain, evWhine, evWhine2, evGain, surge, hornGain, hornTimer;
  let tires, road, gravel, wind, hiss, roar, thrustGain, plasmaRumble, plasmaCrackle;
  let buffers, tracks, current = null, pendingCue = null, requestId = 0, ready = false, unlocking;
  let state = { mode: 'drive', landing: 0 };
  let landed = false;
  let previousLanding = 0;
  let previousMode = 'drive';
  const automation = new WeakMap();

  function persist() {
    try { globalThis.localStorage.setItem(STORE, JSON.stringify({ muted, volume })); } catch { /* 存储失败不影响声音。 */ }
  }

  // 保存自动化片段，旧版 Safari 无 cancelAndHoldAtTime 时也可连续重定向。
  function valueAt(param, time) {
    const record = automation.get(param);
    if (!record) return param.value;
    let value = record.value;
    let last = record.time;
    let target = value;
    let tau = 1;
    for (const e of record.events) {
      if (e.time > time) break;
      value = target + (value - target) * Math.exp(-(e.time - last) / tau);
      last = e.time; target = e.value; tau = e.tau;
    }
    return target + (value - target) * Math.exp(-Math.max(0, time - last) / tau);
  }

  function hold(param) {
    const now = ctx.currentTime;
    const value = valueAt(param, now);
    if (typeof param.cancelAndHoldAtTime === 'function') param.cancelAndHoldAtTime(now);
    else { param.cancelScheduledValues(now); param.setValueAtTime(value, now); }
    automation.set(param, { time: now, value, events: [] });
    return value;
  }

  function smooth(param, value, tau = 0.06) {
    const prior = automation.get(param);
    if (prior?.events.length === 1 && prior.events[0].value === value && prior.events[0].tau === tau) return;
    hold(param);
    param.setTargetAtTime(value, ctx.currentTime, tau);
    automation.get(param).events.push({ time: ctx.currentTime, value, tau });
  }

  function gain(value, destination) {
    const node = ctx.createGain(); node.gain.value = value;
    if (destination) node.connect(destination);
    return node;
  }

  function filter(type, frequency, destination, q = 0.7) {
    const node = ctx.createBiquadFilter(); node.type = type;
    node.frequency.value = Math.min(frequency, ctx.sampleRate * 0.45); node.Q.value = q;
    if (destination) node.connect(destination);
    return node;
  }

  function oscillator(type, frequency, destination) {
    const node = ctx.createOscillator(); node.type = type; node.frequency.value = frequency;
    node.connect(destination); node.start(); return node;
  }

  function makeNoise(kind) {
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let brown = 0, pinkA = 0, pinkB = 0, burst = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      brown = (brown + 0.025 * white) / 1.025;
      pinkA = 0.997 * pinkA + 0.03 * white;
      pinkB = 0.96 * pinkB + 0.12 * white;
      if (Math.random() < 35 / ctx.sampleRate) burst = 1;
      burst *= 0.985;
      data[i] = kind === 'brown' ? brown * 5 : kind === 'pink' ? (pinkA + pinkB + white * 0.12) * 0.65 : kind === 'crackle' ? white * burst : white;
    }
    // 低频噪声首尾短交叠，消除循环边界的直流跳变。
    const seam = Math.min(512, Math.floor(data.length / 8));
    for (let i = 0; i < seam; i++) {
      const t = i / seam;
      data[data.length - seam + i] = data[data.length - seam + i] * (1 - t) + data[i] * t;
    }
    return buffer;
  }

  function noiseLayer(kind, type, frequency, destination = sfxBus, q = 0.7) {
    const output = gain(0, destination);
    const tone = filter(type, frequency, output, q);
    const source = ctx.createBufferSource(); source.buffer = buffers[kind]; source.loop = true;
    source.connect(tone); source.start(0, Math.random() * 3);
    return { output, tone };
  }

  function initialize() {
    const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContextClass) throw new Error('此浏览器不支持 Web Audio');
    ctx = new AudioContextClass();
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -8; limiter.knee.value = 12; limiter.ratio.value = 12;
    limiter.attack.value = 0.003; limiter.release.value = 0.22;
    limiter.connect(ctx.destination);
    master = gain(0, limiter);
    musicBus = gain(MUSIC_LEVEL); sfxBus = gain(SFX_LEVEL, master);
    const musicOutput = ctx.createStereoPanner(); musicOutput.connect(master);
    musicDuck = gain(1, musicOutput);
    musicBus.connect(musicDuck);
    // 独立声像 LFO，不受帧率或标签页计时器节流影响。
    panDepth = gain(0, musicOutput.pan);
    oscillator('sine', 0.05, panDepth);
    musicHP = filter('highpass', 20, musicBus);
    wet = gain(0);
    const convolver = ctx.createConvolver();
    const impulse = ctx.createBuffer(2, ctx.sampleRate * 4, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < data.length; i++) {
        const t = i / ctx.sampleRate;
        data[i] = (Math.random() * 2 - 1) * Math.exp(-t * 2) * Math.min(1, t / 0.012);
      }
    }
    convolver.buffer = impulse; wet.connect(convolver); convolver.connect(musicBus);
    musicHP.connect(wet);

    tracks = (music ? NAMES : []).map(name => {
      const el = new Audio(); el.preload = 'auto'; el.crossOrigin = 'anonymous';
      el.loop = name !== 'oldfriend'; el.src = sources[name];
      el.addEventListener('error', () => console.warn(`音乐加载失败：${name}（请检查地址、网络及跨域设置）`));
      const output = gain(0, musicHP);
      const presence = filter('highshelf', 3200, output); presence.gain.value = 0;
      const lowpass = filter('lowpass', name === 'road' ? 2500 : 20000, presence);
      const source = ctx.createMediaElementSource(el); source.connect(lowpass);
      return { name, el, output, lowpass, presence };
    });
    tracks[2]?.el.addEventListener('ended', () => { if (current === 'oldfriend') void cue('space'); });

    buffers = Object.fromEntries(['white', 'pink', 'brown', 'crackle'].map(kind => [kind, makeNoise(kind)]));
    motorGain = gain(0, sfxBus); motorFilter = filter('bandpass', 400, motorGain, 0.6);
    const sawLevel = gain(0.26, motorFilter), sineLevel = gain(0.7, motorFilter);
    motor = oscillator('sawtooth', 80, sawLevel); motor.detune.value = -7;
    motorSine = oscillator('sine', 80, sineLevel); motorSine.detune.value = 7;
    whine = oscillator('sine', 240, gain(0.065, motorFilter));
    // 电机啸叫：电动超跑加速时最有辨识度的声音。频率随车速从约 300 Hz 升到 2.6 kHz，
    // 落在小扬声器也能放出来的频段（原有的 80–140 Hz 低频电机声在笔记本上几乎听不到）
    evGain = gain(0, sfxBus);
    evWhine = oscillator('sine', 300, evGain);
    evWhine2 = oscillator('triangle', 450, gain(0.32, evGain));
    // 起步推背的“涌动”声：中频噪声，只在大加速度时出现
    surge = noiseLayer('pink', 'bandpass', 700, sfxBus, 0.8);
    // 喇叭：两只方波双音（约 F#4 + A#4）经带通塑形，按住持续鸣响
    hornGain = gain(0, sfxBus);
    const hornTone = filter('lowpass', 3200, filter('bandpass', 1050, hornGain, 0.6));
    for (const f of [370, 466]) oscillator('square', f, gain(0.5, hornTone));
    tires = noiseLayer('white', 'bandpass', 1800, sfxBus, 2.2);
    road = noiseLayer('pink', 'bandpass', 900);
    gravel = noiseLayer('crackle', 'bandpass', 1900, sfxBus, 0.9);
    wind = noiseLayer('pink', 'lowpass', 450);
    const flutter = gain(0.88, sfxBus);
    const flutterSource = ctx.createBufferSource(); flutterSource.buffer = buffers.brown; flutterSource.loop = true;
    flutterSource.connect(filter('lowpass', 16, gain(0.4, flutter.gain))); flutterSource.start();
    thrustGain = gain(0, flutter);
    hiss = noiseLayer('white', 'highpass', 1500, thrustGain); hiss.output.gain.value = 0.28;
    roar = noiseLayer('brown', 'lowpass', 300, thrustGain); roar.output.gain.value = 0.9;
    plasmaRumble = noiseLayer('brown', 'bandpass', 85, sfxBus, 0.6);
    plasmaCrackle = noiseLayer('crackle', 'bandpass', 2600);
    smooth(master.gain, muted ? 0 : volume, 0.04);
  }

  // 采用短目标段逼近等功率圆弧，所有增益变化均通过 setTargetAtTime 平滑。
  // 预先调度至音频时钟，因此不依赖 update() 或后台标签页中的计时器。
  function crossfade(index) {
    const now = ctx.currentTime;
    const start = tracks.map(track => hold(track.output.gain));
    const norm = Math.hypot(...start);
    const unit = start.map(value => norm > 1e-6 ? value / norm : 0);
    const angle = Math.acos(clamp(unit[index], -1, 1));
    const sine = Math.sin(angle);
    const steps = 125;
    for (let step = 1; step <= steps; step++) {
      const t = step / steps;
      const a = norm < 1e-6 ? 0 : sine < 1e-6 ? 1 - t : Math.sin((1 - t) * angle) / sine;
      const b = norm < 1e-6 ? Math.sin(t * Math.PI / 2) : sine < 1e-6 ? t : Math.sin(t * angle) / sine;
      const radius = norm < 1e-6 ? 1 : norm + (1 - norm) * t;
      tracks.forEach((track, i) => {
        const value = (a * unit[i] + (i === index ? b : 0)) * radius;
        const time = now + (step - 1) * FADE_SECONDS / steps;
        const tau = 0.005;
        track.output.gain.setTargetAtTime(value, time, tau);
        automation.get(track.output.gain).events.push({ value, time, tau });
      });
    }
  }

  function play(track) {
    // 捕获同步异常及 Promise 拒绝，不让失败的播放污染游戏帧循环。
    try {
      return Promise.resolve(track.el.play()).then(() => true, error => {
        console.warn(`音乐无法播放：${track.name}`, error); return false;
      });
    } catch (error) { console.warn(`音乐无法播放：${track.name}`, error); return Promise.resolve(false); }
  }

  function unlock() {
    if (!ctx) initialize();
    // resume 与所有媒体 play 必须在用户手势调用栈中发起，不能先 await。
    const resumed = ctx.resume();
    if (!music) return resumed.then(() => { ready = true; update(0, state); });
    if (ready) {
      const track = tracks.find(t => t.name === current);
      const playing = track?.el.paused ? play(track) : Promise.resolve(true);
      return Promise.all([resumed, playing]).then(([, ok]) => { if (!ok) throw new Error('当前音乐播放失败，请再次点击解锁'); });
    }
    if (unlocking) { void resumed.catch(() => {}); return unlocking; }
    current = 'road';
    const pending = tracks.map(play);
    crossfade(0);
    // 非当前曲目缓冲较慢时，不阻塞公路首播及音效。
    void pending[2].then(() => { if (current !== 'oldfriend' && pendingCue !== 'oldfriend') tracks[2].el.pause(); });
    unlocking = Promise.all([resumed, pending[0]]).then(([, roadOK]) => {
      if (!roadOK) throw new Error('公路音乐播放失败，请检查地址后再次点击解锁');
      ready = true;
      update(0, state);
    }).finally(() => { unlocking = null; });
    return unlocking;
  }

  function cue(name) {
    if (!NAMES.includes(name)) throw new RangeError(`未知音乐 cue：${name}`);
    if (!music || !ready || name === current || name === pendingCue) return Promise.resolve(false);
    const id = ++requestId;
    pendingCue = name;
    const index = NAMES.indexOf(name);
    const track = tracks[index];
    // 淡出尚未结束时直接重用播放头，避免在可听音量下 seek 产生断点。
    if (name === 'oldfriend' && (track.el.ended || valueAt(track.output.gain, ctx.currentTime) < 0.001)) track.el.currentTime = 0;
    return play(track).then(ok => {
      if (id !== requestId) return false;
      pendingCue = null;
      if (!ok) return false;
      current = name;
      crossfade(index);
      return true;
    });
  }

  function update(dt, s = {}) {
    // 只读调用者状态；缺失字段回到安全默认值，防止 NaN 污染音频图。
    state = { ...s, mode: ['drive', 'ascent', 'orbit', 'reentry'].includes(s.mode) ? s.mode : 'drive', landing: clamp(s.landing) };
    if (!ready) return;
    const speed = clamp(s.speedKmh, 0, 600);
    const throttle = clamp(s.throttle), brake = clamp(s.brake), lift = clamp(s.lift);
    const offroad = clamp(s.offroad), plasma = clamp(s.plasma), altitude = clamp(s.altitude, 0, 1000000);
    const orbit = state.mode === 'orbit', ascent = state.mode === 'ascent', reentry = state.mode === 'reentry';
    const boost = clamp(s.boost), accel = clamp(s.accel);
    const thrust = Math.max(lift, boost * 0.8, s.jet ? Math.max(throttle, 0.35) : 0);
    const duck = lift > 0.1 || Boolean(s.jet);
    if (ascent || orbit || (reentry && previousMode !== 'reentry')) landed = false;
    if (state.landing > 0 && previousLanding === 0) landed = true;
    previousLanding = state.landing; previousMode = state.mode;
    const openness = landed ? 0 : orbit || reentry ? 1 : ascent ? clamp(altitude / 80000) : 0;
    if (music) smooth(tracks[0].lowpass.frequency, 2500 + clamp(speed / 250) * 17500, 0.14);
    if (music) smooth(tracks[0].presence.gain, 2 * clamp((speed - 200) / 50), 0.2);
    smooth(musicHP.frequency, 20 + 160 * openness, 0.35);
    smooth(wet.gain, openness * 0.42, landed ? 1 : 0.5);
    smooth(panDepth.gain, orbit ? 0.65 : 0, 0.6);
    // 独立增益级使推进器的 80/600 毫秒包络不受其他混音变化影响。
    smooth(musicBus.gain, MUSIC_LEVEL * db((orbit ? -3 : 0) - (reentry ? 8 * plasma : 0)), 0.15);
    smooth(musicDuck.gain, duck ? db(-6) : 1, duck ? 0.08 / 3 : 0.6 / 3);
    const pitch = 80 + clamp(speed / 400) * 820;
    smooth(motor.frequency, pitch, 0.08); smooth(motorSine.frequency, pitch, 0.08);
    smooth(whine.frequency, pitch * 3, 0.1); smooth(motorFilter.frequency, pitch * 1.7, 0.12);
    smooth(motorGain.gain, orbit ? 0 : (0.015 + 0.17 * throttle) * (1 - 0.4 * brake), 0.07);
    const sp = clamp(speed / 400), wf = 300 + 2300 * Math.pow(sp, 0.8);
    smooth(evWhine.frequency, wf, 0.05); smooth(evWhine2.frequency, wf * 1.5, 0.05);
    // 踩电门时最响；松开滑行时很轻；刹车时能量回收，啸叫随车速下降
    const evLevel = orbit ? 0 : throttle * (0.05 + 0.13 * Math.min(1, speed / 30)) + brake * 0.05 * clamp(speed / 120) + 0.012 * clamp(speed / 40);
    smooth(evGain.gain, evLevel, 0.06);
    smooth(surge.output.gain, orbit ? 0 : accel * throttle * 0.32, 0.05);
    smooth(surge.tone.frequency, 500 + sp * 1500, 0.1);
    smooth(tires.output.gain, clamp(s.tireSlip) * clamp(speed / 60) * .24, .04);
    smooth(tires.tone.frequency, 1300 + clamp(speed / 300) * 1700, .08);
    smooth(road.output.gain, orbit ? 0 : clamp(speed / 250) * 0.14, 0.15);
    smooth(gravel.output.gain, orbit ? 0 : offroad * clamp(speed / 80) * 0.48, 0.08);
    smooth(wind.output.gain, orbit ? 0 : clamp(speed / 350) * 0.2 + (ascent ? 0.23 : 0), 0.25);
    smooth(wind.tone.frequency, 450 + clamp(speed / 400) * 6500 + (ascent ? 2500 : 0), 0.2);
    smooth(thrustGain.gain, thrust * 0.65, 0.045);
    smooth(plasmaRumble.output.gain, plasma * (reentry ? 0.85 : 0.55), 0.12);
    smooth(plasmaCrackle.output.gain, plasma * plasma * 0.38, 0.06);
    // dt 由调用者提供；包络使用音频时钟，暂停或大帧间隔不会产生跳变。
    void dt;
  }

  // 短音源共用缓存，结束后显式断开所有局部节点，避免图节点残留。
  function shot({ kind = 'sine', frequency = 160, end = frequency, duration = 0.6, level = 0.3, delay = 0, type = 'lowpass', cutoff = 4000, cutoffEnd = cutoff }) {
    const start = ctx.currentTime + delay;
    const source = buffers[kind] ? ctx.createBufferSource() : ctx.createOscillator();
    if (buffers[kind]) source.buffer = buffers[kind];
    else { source.type = kind; source.frequency.value = frequency; source.frequency.setTargetAtTime(end, start, duration / 5); }
    const output = gain(0, sfxBus);
    const tone = filter(type, cutoff, output);
    tone.frequency.setTargetAtTime(cutoffEnd, start, duration / 4);
    source.connect(tone);
    output.gain.setTargetAtTime(level, start, 0.008);
    output.gain.setTargetAtTime(0, start + duration * 0.2, duration / 12);
    source.onended = () => { source.disconnect(); tone.disconnect(); output.disconnect(); };
    source.start(start); source.stop(start + duration + 0.12);
  }

  // opts.pitch：金币连吃时逐个升调（半音数）
  function event(name, opts = {}) {
    if (!EVENTS.includes(name)) throw new RangeError(`未知音效事件：${name}`);
    if (!ready) return;
    if (name === 'raceWall') {
      shot({ kind: 'brown', duration: .24, level: .4, cutoff: 900 });
      shot({ frequency: 95, end: 35, duration: .22, level: .22 });
    } else if (name === 'raceBoost') {
      shot({ kind: 'pink', duration: .65, level: .35, type: 'bandpass', cutoff: 350, cutoffEnd: 6500 });
    } else if (name === 'raceBeep' || name === 'raceGo') {
      shot({ frequency: name === 'raceGo' ? 1320 : 880, duration: name === 'raceGo' ? .75 : .18, level: .18 });
    } else if (name === 'raceLap') {
      [880, 1320].forEach((frequency, i) => shot({ frequency, duration: .4, level: .13, delay: i * .12 }));
    } else if (name === 'raceFinish') {
      // 大调号角加宽频人群般的欢呼，全部合成并走原有主音量。
      [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5].forEach((frequency, i) => {
        shot({ kind: 'triangle', frequency, duration: .8, level: .15, delay: i * .22 });
        shot({ frequency: frequency / 2, duration: .9, level: .1, delay: i * .22 });
      });
      shot({ kind: 'pink', duration: 2.6, level: .18, type: 'bandpass', cutoff: 750, cutoffEnd: 2400 });
    } else if (name === 'launch') {
      shot({ kind: 'white', duration: 0.8, level: 0.7, type: 'bandpass', cutoff: 180, cutoffEnd: 5500 });
      shot({ frequency: 75, end: 38, duration: 0.35, level: 0.48 });
    } else if (name === 'land') {
      landed = true;
      const impact = clamp(state.landing);
      shot({ frequency: 110, end: 32, duration: 0.55, level: impact * 0.8, cutoff: 350 });
      shot({ kind: 'brown', duration: 0.3, level: impact * 0.85, cutoff: 550 });
      smooth(wet.gain, 0, 1);
    } else if (name === 'whiteout') {
      shot({ kind: 'pink', duration: 1.8, level: 0.8, type: 'highpass', cutoff: 400, cutoffEnd: 7000 });
    } else if (name === 'achievement') {
      [880, 1108.73, 1318.51, 1760].forEach((frequency, i) => shot({ frequency, duration: 1.1, level: 0.14, delay: i * 0.11, cutoff: 6000 }));
    } else if (name === 'coin') {
      // 金币：两个上行的明亮短音（B5 → E6），连吃时逐个升高
      const k = Math.pow(2, (opts.pitch || 0) / 12);
      shot({ kind: 'square', frequency: 987.77 * k, duration: 0.08, level: 0.06, cutoff: 5200 });
      shot({ kind: 'square', frequency: 1318.51 * k, duration: 0.32, level: 0.06, delay: 0.065, cutoff: 5200 });
      shot({ frequency: 1318.51 * k * 2, duration: 0.3, level: 0.05, delay: 0.065, cutoff: 9000 });
    } else if (name === 'roll') {
      // 翻滚：一阵掠过车身的风声
      shot({ kind: 'pink', duration: 1.1, level: 0.55, type: 'bandpass', cutoff: 300, cutoffEnd: 2600 });
    } else {
      // 单次鸣笛（触屏或旧调用）：按下 0.35 秒后松开
      horn(true); clearTimeout(hornTimer); hornTimer = setTimeout(() => horn(false), 350);
    }
  }

  // 喇叭：按下时持续鸣响，松开后短暂衰减
  function horn(on) {
    if (!ready || !hornGain) return;
    smooth(hornGain.gain, on ? 0.34 : 0, on ? 0.008 : 0.035);
  }

  function setMuted(value) { muted = Boolean(value); persist(); if (ctx) smooth(master.gain, muted ? 0 : volume, 0.025); }
  function toggleMuted() { setMuted(!muted); return muted; }
  function setVolume(value) { volume = clamp(value); persist(); if (ctx) smooth(master.gain, muted ? 0 : volume, 0.04); }

  return { unlock, cue, update, event, horn, setMuted, toggleMuted, setVolume, get muted() { return muted; } };
}
