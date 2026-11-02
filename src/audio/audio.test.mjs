import { test } from 'node:test';
import assert from 'node:assert/strict';

// 用最小原生接口替身验证调度；实际解码及听感仍需浏览器验证。
const nodes = [];
const media = [];
const storage = new Map();
class Param {
  value = 0;
  calls = [];
  setTargetAtTime(value, time, tau) { assert.ok(Number.isFinite(value)); assert.ok(tau > 0); this.calls.push({ from: this.value, value, time, tau }); this.value = value; }
  setValueAtTime(value) { this.value = value; }
  cancelScheduledValues() {}
  cancelAndHoldAtTime() {}
}
class Node {
  constructor(type) {
    this.type = type; this.gain = new Param(); this.frequency = new Param(); this.Q = new Param();
    this.detune = new Param(); this.pan = new Param(); this.threshold = new Param();
    this.knee = new Param(); this.ratio = new Param(); this.attack = new Param(); this.release = new Param();
    nodes.push(this);
  }
  connect(other) { (this.connections ??= []).push(other); return other; }
  disconnect() { this.disconnected = true; }
  start() { this.started = true; }
  stop() { this.stopped = true; this.onended?.(); }
}
class Context {
  currentTime = 0; sampleRate = 8000; state = 'suspended'; destination = new Node('destination');
  constructor() { Context.instances.push(this); }
  static instances = [];
  createGain() { return new Node('gain'); }
  createBiquadFilter() { return new Node('filter'); }
  createOscillator() { return new Node('oscillator'); }
  createBufferSource() { return new Node('bufferSource'); }
  createStereoPanner() { return new Node('panner'); }
  createConvolver() { return new Node('convolver'); }
  createDynamicsCompressor() { return new Node('compressor'); }
  createMediaElementSource(el) { const n = new Node('media'); n.mediaElement = el; return n; }
  createBuffer(channels, length) { const a = Array.from({ length: channels }, () => new Float32Array(length)); return { getChannelData: i => a[i], length }; }
  resume() { this.state = 'running'; return Promise.resolve(); }
}
class Media {
  currentTime = 0; paused = true; listeners = {};
  constructor() { media.push(this); }
  play() { this.paused = false; this.plays = (this.plays || 0) + 1; return Promise.resolve(); }
  pause() { this.paused = true; }
  addEventListener(name, fn) { this.listeners[name] = fn; }
  dispatch(name) { this.listeners[name]?.(); }
  load() {}
}
globalThis.AudioContext = Context;
globalThis.Audio = Media;
globalThis.localStorage = { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) };
const module = await import('./audio.js').catch(() => ({}));
const urls = { road: 'road.mp3', space: 'space.mp3', oldfriend: 'oldfriend.mp3' };

test('工厂提供完整 API，解锁前无上下文与媒体播放', () => {
  assert.equal(typeof module.createAudio, 'function', '缺少音频工厂');
  const a = module.createAudio({ urls });
  for (const k of ['unlock', 'cue', 'update', 'event', 'setMuted', 'toggleMuted', 'setVolume']) assert.equal(typeof a[k], 'function');
  a.update(1 / 60, { mode: 'drive', speedKmh: 120 }); a.event('horn'); a.cue('space');
  assert.equal(Context.instances.length, 0); assert.equal(media.length, 0);
});
test('首次解锁播放 road，重复解锁保留 cue，oldfriend 结束回到 space', async () => {
  assert.equal(typeof module.createAudio, 'function', '缺少音频工厂');
  const a = module.createAudio({ urls }); await a.unlock();
  const tracks = media.slice(-3); assert.equal(tracks[0].paused, false);
  assert.equal(tracks[0].loop, true); assert.equal(tracks[1].loop, true); assert.equal(tracks[2].loop, false);
  await a.cue('oldfriend'); const plays = tracks[2].plays;
  await a.cue('oldfriend'); assert.equal(tracks[2].plays, plays);
  await a.unlock(); assert.equal(tracks[2].plays, plays);
  const before = tracks[1].plays; tracks[2].dispatch('ended'); await Promise.resolve();
  assert.ok(tracks[1].plays > before);
});
test('所有状态与事件可调度；逐帧不创建节点；一次性音源断开', async () => {
  assert.equal(typeof module.createAudio, 'function', '缺少音频工厂');
  const a = module.createAudio({ urls }); await a.unlock(); const count = nodes.length;
  for (const mode of ['drive', 'ascent', 'orbit', 'reentry']) {
    for (let i = 0; i < 100; i++) a.update(1 / 60, { mode, speedKmh: 400, throttle: 1, brake: 1, jet: true, lift: 1, altitude: 100000, offroad: 1, landing: 1, plasma: 1 });
  }
  assert.equal(nodes.length, count);
  for (const name of ['launch', 'land', 'whiteout', 'achievement', 'horn']) a.event(name);
  assert.ok(nodes.length > count);
  for (const n of nodes.slice(count).filter(n => n.started)) assert.ok(n.stopped && n.disconnected);
  assert.throws(() => a.cue('bad'), /cue|音乐|未知/);
});
test('静音与音量持久化，并容忍存储禁用', () => {
  assert.equal(typeof module.createAudio, 'function', '缺少音频工厂');
  const a = module.createAudio({ urls }); a.setMuted(true); a.setVolume(0.35);
  assert.equal(module.createAudio({ urls }).muted, true);
  assert.equal(a.toggleMuted(), false);
  const previous = globalThis.localStorage;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw Error('禁止存储'); } });
  const b = module.createAudio({ urls }); b.setMuted(true); b.setVolume(NaN); assert.equal(b.muted, true);
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: previous });
});

test('其他歌曲尚未缓冲时不阻塞公路与音效解锁', async () => {
  const original = Media.prototype.play;
  Media.prototype.play = function () {
    if (this.src === 'space.mp3') return new Promise(() => {});
    return original.call(this);
  };
  try {
    const a = module.createAudio({ urls });
    const result = await Promise.race([a.unlock().then(() => 'ready'), new Promise(resolve => setTimeout(() => resolve('blocked'), 60))]);
    assert.equal(result, 'ready', '非当前歌曲不应阻塞解锁');
  } finally { Media.prototype.play = original; }
});

test('并发切歌失败应保留实际播放曲，之后仍能选择曾经等待的目标', async t => {
  const warning = t.mock.method(console, 'warn', () => {});
  const a = module.createAudio({ urls }); await a.unlock();
  const tracks = media.slice(-3);
  let resolveSpace;
  const originalSpace = tracks[1].play.bind(tracks[1]);
  tracks[1].play = () => new Promise(resolve => { resolveSpace = resolve; });
  tracks[2].play = () => Promise.reject(Error('模拟播放失败'));
  const pending = a.cue('space');
  assert.equal(await a.cue('oldfriend'), false);
  resolveSpace(); await pending;
  tracks[1].play = originalSpace;
  assert.equal(await a.cue('space'), true, '等待中的歌曲不应被误标为当前曲');
  assert.equal(warning.mock.calls.length, 1);
});

test('速度滤波、两类压低、轨道静音与着陆回干符合参数要求', async () => {
  const first = nodes.length; const a = module.createAudio({ urls }); await a.unlock();
  const graph = nodes.slice(first);
  const mediaNodes = graph.filter(n => n.type === 'media');
  const roadIndex = graph.indexOf(mediaNodes[0]);
  const lowpass = graph.slice(0, roadIndex).findLast(n => n.type === 'lowpass');
  a.update(.016, { mode: 'drive', speedKmh: 250, lift: 1 });
  assert.equal(lowpass.frequency.calls.at(-1).value, 20000);
  const duck = graph.find(n => n.gain.calls.at(-1)?.value === 10 ** (-6 / 20));
  assert.ok(duck); assert.equal(duck.gain.calls.at(-1).tau, .08 / 3);
  a.update(.016, { mode: 'orbit' });
  assert.equal(duck.gain.calls.at(-1).value, 1); assert.equal(duck.gain.calls.at(-1).tau, .6 / 3);
  const wet = graph.find(n => n.gain.calls.at(-1)?.value === .42);
  assert.ok(wet);
  assert.ok(graph.some(n => n.gain.calls.at(-1)?.value === .65 * 10 ** (-3 / 20)));
  a.update(.016, { mode: 'reentry', plasma: 1, landing: 0 });
  assert.ok(graph.some(n => n.gain.calls.at(-1)?.value === .65 * 10 ** (-8 / 20)));
  a.update(.016, { mode: 'reentry', plasma: 0, landing: .8 }); a.event('land');
  assert.equal(wet.gain.calls.at(-1).value, 0); assert.equal(wet.gain.calls.at(-1).tau, 1);
});

test('老友曲仍在可听淡出期间重入时不直接跳转播放头', async () => {
  const a = module.createAudio({ urls }); await a.unlock();
  const tracks = media.slice(-3); const ctx = Context.instances.at(-1);
  await a.cue('oldfriend'); ctx.currentTime += 3;
  tracks[2].currentTime = 17;
  await a.cue('space'); ctx.currentTime += .3;
  await a.cue('oldfriend');
  assert.equal(tracks[2].currentTime, 17, '可听曲目 seek 会造成声音断点');
});

test('交叉淡化保持近似等功率，缺少 cancelAndHoldAtTime 时仍能连续中断', async () => {
  const first = nodes.length; const a = module.createAudio({ urls }); await a.unlock();
  const graph = nodes.slice(first);
  const outputs = graph.flatMap((n, i) => n.type === 'media' ? [graph[i - 3].gain] : []);
  const ctx = Context.instances.at(-1); ctx.currentTime = 5;
  await a.cue('space');
  function at(param, now) {
    let v = 0, target = 0, last = 0, tau = 1;
    for (const e of param.calls) {
      if (e.time > now) break;
      v = target + (v - target) * Math.exp(-(e.time - last) / tau);
      last = e.time; target = e.value; tau = e.tau;
    }
    return target + (v - target) * Math.exp(-(now - last) / tau);
  }
  for (const t of [0.25, .75, 1.25, 1.75, 2.25, 2.5]) {
    const power = outputs.reduce((sum, p) => sum + at(p, 5 + t) ** 2, 0);
    assert.ok(Math.abs(power - 1) < .015, `交叉淡化功率异常：${power}`);
  }
  const original = Param.prototype.cancelAndHoldAtTime;
  Param.prototype.cancelAndHoldAtTime = undefined;
  try { ctx.currentTime = 6; assert.equal(await a.cue('oldfriend'), true); }
  finally { Param.prototype.cancelAndHoldAtTime = original; }
});

test('竞速音效只用合成，静音沿用主总线，轮胎层每帧复用', async () => {
 const a = module.createAudio({ music: false }); const beforeMedia = media.length;
 await a.unlock(); assert.equal(media.length, beforeMedia);
 const first = nodes.length;
 for (const speedKmh of [0, 100, 300]) a.update(.016, { speedKmh, throttle: 1, tireSlip: .8 });
 assert.equal(nodes.length, first);
 for (const name of ['raceWall','raceBoost','raceBeep','raceGo','raceLap','raceFinish']) {
  const before = nodes.length; a.event(name); assert.ok(nodes.length > before);
 }
 a.setMuted(true); assert.equal(a.muted, true);
 assert.equal(JSON.parse(storage.get('liftoff.audio.v1')).muted, true);
});
test('车辆接触合成短促低频闷响，冲击越大音量越大',async()=>{
 const a=module.createAudio({music:false});await a.unlock();
 const shot=impact=>{const start=nodes.length;a.event('raceContact',{impact});return nodes.slice(start);};
 const soft=shot(2),hard=shot(20),level=graph=>Math.max(...graph.flatMap(n=>n.gain.calls.map(c=>c.value)));
 assert.ok(level(hard)>level(soft));assert.ok(hard.some(n=>n.type==='bufferSource'));assert.ok(hard.some(n=>n.type==='sine'));assert.ok(hard.filter(n=>n.started).every(n=>n.stopped&&n.disconnected));
});
test('尾流使用短促上扬的合成音并释放节点',async()=>{
 const a=module.createAudio({music:false});await a.unlock();const first=nodes.length;a.event('raceDraft');const graph=nodes.slice(first),osc=graph.find(n=>n.started&&n.frequency.calls.length);
 assert.ok(osc);assert.ok(osc.frequency.calls[0].value>osc.frequency.calls[0].from);assert.ok(osc.frequency.calls[0].tau<.1);assert.ok(graph.filter(n=>n.started).every(n=>n.stopped&&n.disconnected));
});
test('七类道具音效使用现有总线合成、音量适中并释放节点',async()=>{
 const a=module.createAudio({music:false});await a.unlock();for(const name of ['racePickup','raceRoulette','raceNitro','raceShield','raceShieldBreak','raceMine','raceBubble','raceMissile','raceMissileWarning','raceExplosion']){const first=nodes.length;a.event(name);const graph=nodes.slice(first);assert.ok(graph.some(n=>n.started));assert.ok(graph.filter(n=>n.started).every(n=>n.stopped&&n.disconnected));assert.ok(Math.max(...graph.flatMap(n=>n.gain.calls.map(c=>c.value)))<=.3);}
});

 test('大厅准备通过现有音频总线合成短低频轰鸣，避免误触喇叭',async()=>{
 const audio=module.createAudio({urls,music:false});await audio.unlock();const before=nodes.length;
 audio.event('garageReady');const sources=nodes.slice(before).filter(n=>n.started);
 assert.equal(sources.length,2);assert.ok(sources.some(n=>n.type==='sawtooth'&&n.frequency.value<150));
 for(const source of sources)assert.ok(source.stopped&&source.disconnected);
 audio.setMuted(true);assert.equal(audio.muted,true);
 });

test('大厅音乐按需加载、循环，复用总线，倒计时在一秒内淡出并回大厅重播',async t=>{
 storage.clear();t.mock.timers.enable({apis:['setTimeout']});
 const before=media.length,a=module.createAudio({music:false,urls:{lobby:'lobby.m4a'}});
 await a.unlock();assert.equal(media.length,before,'未进大厅不加载曲目');
 assert.equal(typeof a.setLobbyPhase,'function','缺少大厅音乐阶段接口');a.setLobbyPhase('lobby');await a.unlock();
 const track=media.at(-1);assert.equal(track.src,'lobby.m4a');assert.equal(track.loop,true);assert.equal(track.paused,false);
 const source=nodes.findLast(n=>n.type==='media'),output=nodes[nodes.indexOf(source)-1];
 assert.ok(output.gain.calls.at(-1).value>0&&output.gain.calls.at(-1).value<=.3);
 a.setLobbyPhase('countdown');assert.equal(output.gain.calls.at(-1).value,0);assert.ok(output.gain.calls.at(-1).tau<=.15);
 t.mock.timers.tick(900);assert.equal(track.paused,true);a.setLobbyPhase('racing');await a.unlock();assert.equal(track.paused,true);
 a.setLobbyPhase('lobby');await a.unlock();assert.equal(track.paused,false);a.setLobbyPhase('off');assert.equal(track.paused,true);
});
test('大厅遵守静音和独立音乐设置，持久化并容忍禁用存储',async()=>{
 storage.clear();const a=module.createAudio({music:false,urls:{lobby:'lobby.m4a'}});
 assert.equal(typeof a.setMusicEnabled,'function','缺少音乐设置');a.setMuted(true);const before=media.length;a.setLobbyPhase('lobby');await a.unlock();assert.equal(media.length,before);
 a.setMuted(false);await a.unlock();const track=media.at(-1);assert.equal(track.paused,false);a.setMusicEnabled(false);assert.equal(track.paused,true);assert.equal(a.muted,false);
 assert.equal(module.createAudio({music:false}).musicEnabled,false);a.setMusicEnabled(true);await a.unlock();assert.equal(track.paused,false);
 a.setMuted(true);assert.equal(track.paused,true);a.setMuted(false);await a.unlock();assert.equal(track.paused,false);
 const previous=globalThis.localStorage;Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw Error('禁止存储');}});
 try{a.setMusicEnabled(false);assert.equal(a.musicEnabled,false);}finally{Object.defineProperty(globalThis,'localStorage',{configurable:true,writable:true,value:previous});a.setLobbyPhase('off');storage.clear();}
});
test('自动播放被拒后下一次手势重试，播放尚未完成时离开不会晚到重播',async t=>{
 storage.clear();t.mock.method(console,'warn',()=>{});const a=module.createAudio({music:false,urls:{lobby:'lobby.m4a'}});await a.unlock();
 assert.equal(typeof a.setLobbyPhase,'function');const original=Media.prototype.play;let blocked=true;
 Media.prototype.play=function(){if(blocked)return Promise.reject(Error('自动播放限制'));return original.call(this);};
 try{a.setLobbyPhase('lobby');await a.unlock();blocked=false;await a.unlock();const track=media.at(-1);assert.equal(track.paused,false);
 a.setLobbyPhase('off');let finish;track.play=()=>new Promise(resolve=>{finish=()=>{track.paused=false;resolve();};});
 a.setLobbyPhase('lobby');a.setLobbyPhase('off');finish();await Promise.resolve();await Promise.resolve();assert.equal(track.paused,true);
 }finally{Media.prototype.play=original;a.setLobbyPhase('off');storage.clear();}
});

test('倒计时中重复解锁保留淡出，快速返回大厅取消旧停止定时器',async t=>{
 storage.clear();t.mock.timers.enable({apis:['setTimeout']});const a=module.createAudio({music:false,urls:{lobby:'lobby.m4a'}});
 a.setLobbyPhase('lobby');await a.unlock();const track=media.at(-1);a.setLobbyPhase('countdown');t.mock.timers.tick(200);
 await a.unlock();assert.equal(track.paused,false,'手势不应硬停正在淡出的曲目');t.mock.timers.tick(600);assert.equal(track.paused,true);
 a.setLobbyPhase('lobby');await a.unlock();a.setLobbyPhase('countdown');t.mock.timers.tick(100);a.setLobbyPhase('lobby');await a.unlock();t.mock.timers.tick(1000);assert.equal(track.paused,false,'旧倒计时不能暂停重新进入大厅的播放');a.setLobbyPhase('off');storage.clear();
});

test('比赛音乐懒加载、双媒体循环、均衡、避让与暂停结算包络共用设置',async t=>{
 storage.clear();t.mock.timers.enable({apis:['setTimeout','setInterval']});
 const first=nodes.length,before=media.length,a=module.createAudio({music:false,urls:{race:'rush.m4a'}});await a.unlock();assert.equal(media.length,before);
 assert.equal(typeof a.setRacePhase,'function');a.setRacePhase('countdown');assert.equal(media.length,before);
 a.setRacePhase('racing');await a.unlock();const decks=media.slice(before);assert.equal(decks.length,2);assert.equal(decks[0].paused,false);assert.ok(decks.every(d=>d.preload==='none'&&!d.loop));
 const graph=nodes.slice(first);assert.ok(graph.some(n=>n.type==='highshelf'&&n.frequency.value===2500&&n.gain.value===-4));assert.ok(graph.some(n=>n.type==='highshelf'&&n.frequency.value===Math.min(6000,Context.instances.at(-1).sampleRate*.45)&&n.gain.value===-3));
 assert.ok(graph.some(n=>n.gain.calls.at(-1)?.value===.28*.6&&n.gain.calls.at(-1)?.tau===1.5/5));
 a.setRaceDucking(true);const duck=graph.find(n=>n.gain.calls.at(-1)?.value===.5);assert.ok(duck);assert.equal(duck.gain.calls.at(-1).tau,.08/5);
 a.setRaceDucking(false);assert.equal(duck.gain.calls.at(-1).value,1);assert.equal(duck.gain.calls.at(-1).tau,.6/5);
 a.setRacePhase('paused');assert.ok(graph.some(n=>n.type==='lowpass'&&n.frequency.calls.at(-1)?.value===1200));assert.ok(graph.some(n=>n.gain.calls.at(-1)?.value===.28*.6*.3));
 a.setRacePhase('racing');await a.unlock();decks[0].duration=155;decks[0].currentTime=154.81;t.mock.timers.tick(25);await Promise.resolve();await Promise.resolve();assert.equal(decks[1].paused,false);t.mock.timers.tick(220);assert.equal(decks[0].paused,true);
 a.setMusicEnabled(false);assert.ok(decks.every(d=>d.paused));a.setMusicEnabled(true);await a.unlock();assert.ok(decks.some(d=>!d.paused));a.setMuted(true);assert.ok(decks.every(d=>d.paused));a.setMuted(false);await a.unlock();
 a.setRacePhase('finished');await a.unlock();assert.ok(decks.some(d=>!d.paused));t.mock.timers.tick(1000);assert.ok(decks.every(d=>d.paused));a.setRacePhase('off');
});
test('截图与自动化环境不创建比赛音乐媒体，离开后迟到 play 不复活',async t=>{
 storage.clear();t.mock.timers.enable({apis:['setTimeout','setInterval']});
 const previous=globalThis.location;globalThis.location={search:'?capture'};
 const before=media.length,a=module.createAudio({music:false,urls:{race:'rush.m4a'}});a.setRacePhase('racing');await a.unlock();assert.equal(media.length,before);globalThis.location=previous;
 const b=module.createAudio({music:false,urls:{race:'rush.m4a'}});b.setRacePhase('racing');await b.unlock();const track=media.at(-2);b.setRacePhase('off');let finish;track.play=()=>new Promise(resolve=>{finish=()=>{track.paused=false;resolve();};});b.setRacePhase('racing');b.setRacePhase('off');finish();await Promise.resolve();await Promise.resolve();assert.equal(track.paused,true);
});

test('离开后快速重入，未完成的 play 不得暂停新一局音乐',async t=>{
 storage.clear();t.mock.timers.enable({apis:['setTimeout','setInterval']});const a=module.createAudio({music:false,urls:{race:'rush.m4a'}});a.setRacePhase('racing');await a.unlock();const track=media.at(-2);a.setRacePhase('off');
 let finish;track.play=()=>new Promise(resolve=>{finish=()=>{track.paused=false;resolve();};});a.setRacePhase('racing');a.setRacePhase('off');a.setRacePhase('racing');finish();await Promise.resolve();await Promise.resolve();assert.equal(track.paused,false);a.setRacePhase('off');
});

test('比赛发车长淡入不被重复手势打断，离开后重播从零淡入',async t=>{
 storage.clear();t.mock.timers.enable({apis:['setTimeout','setInterval']});const first=nodes.length,a=module.createAudio({music:false,urls:{race:'rush.m4a'}});a.setRacePhase('racing');await a.unlock();
 const level=nodes.slice(first).find(n=>n.gain.calls.at(-1)?.value===.28*.6),count=level.gain.calls.length;await a.unlock();assert.equal(level.gain.calls.length,count);assert.equal(level.gain.calls.at(-1).tau,1.5/5);
 Context.instances.at(-1).currentTime+=2;a.setRacePhase('off');a.setRacePhase('racing');await a.unlock();assert.equal(level.gain.calls.at(-1).tau,1.5/5);assert.equal(level.gain.calls.at(-1).from,0);a.setRacePhase('off');
});

test('推进器只经过一次比赛避让，有效音乐增益为基础音量的一半',async t=>{
 storage.clear();t.mock.timers.enable({apis:['setTimeout','setInterval']});const first=nodes.length,a=module.createAudio({music:false,urls:{race:'rush.m4a'}});a.setRacePhase('racing');await a.unlock();a.setRaceDucking(true);a.update(.01,{jet:true,fuel:1});
 let node=nodes.slice(first).find(n=>n.type==='media'),level=1;while(node){if(node.type==='gain')level*=node.gain.value;node=node.connections?.[0];}
 assert.ok(Math.abs(level-(.28*.6*.5*.65*.8))<1e-10,`实际音乐链路增益 ${level}`);a.setRacePhase('off');
});

test('still 与 webdriver 环境即使用户解锁也不创建音乐媒体',async()=>{
 storage.clear();const location=globalThis.location,navigator=Object.getOwnPropertyDescriptor(globalThis,'navigator');
 try{for(const [search,webdriver] of [['?still',false],['',true]]){globalThis.location={search};Object.defineProperty(globalThis,'navigator',{configurable:true,value:{webdriver}});const before=media.length,a=module.createAudio({music:false,urls:{race:'rush.m4a',lobby:'lobby.m4a'}});a.setRacePhase('racing');a.setLobbyPhase('lobby');await a.unlock();assert.equal(media.length,before);a.setRacePhase('off');}}
 finally{globalThis.location=location;if(navigator)Object.defineProperty(globalThis,'navigator',navigator);else delete globalThis.navigator;}
});
