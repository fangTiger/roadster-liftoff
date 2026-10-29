import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTrack } from './track/build.js';
import def from './track/data/meadow.js';
import { createSession } from './sim/session.js';
import { DT } from './sim/physics.js';

test('HUD 领先绿、落后红、约两秒后隐藏，缺失时不显示，完赛显示总时间差', async () => {
  const { createHud } = await import('./hud.js');
  const previous = { document: globalThis.document, innerWidth: globalThis.innerWidth, devicePixelRatio: globalThis.devicePixelRatio };
  const elements = new Map(), context = new Proxy({}, { get: () => () => {} });
  const element = () => ({ style: {}, dataset: {}, getContext: () => context, querySelector(selector) { if (!elements.has(selector)) elements.set(selector, element()); return elements.get(selector); } });
  globalThis.document = { createElement: element, head: { append() {} }, body: { append() {} } };
  globalThis.innerWidth = 1200; globalThis.devicePixelRatio = 1;
  try {
    const track = buildTrack(def), hud = createHud(track), s = createSession(track).snapshot;
    hud.update(s, { delta: -1.23, deltaStep: 0 });
    const delta = elements.get('.rh-delta');
    assert.equal(delta.textContent, '−1.23'); assert.equal(delta.dataset.tone, 'ahead'); assert.equal(delta.hidden, false);
    hud.update(s, { delta: .85, deltaStep: 0 });
    assert.equal(delta.textContent, '+0.85'); assert.equal(delta.dataset.tone, 'behind');
    hud.update({ ...s, step: Math.ceil(2 / DT) }, { delta: .85, deltaStep: 0 }); assert.equal(delta.hidden, true);
    hud.update(s, { delta: null }); assert.equal(delta.hidden, true);
    hud.update({ ...s, race: { ...s.race, finished: true, bestLap: 50, lapTimes: [50, 51, 52] } }, { totalDelta: -1.23 });
    assert.match(elements.get('.rh-result').innerHTML, /与影子总时间差.*−1.23/);
  } finally { Object.assign(globalThis, previous); }
});

test('房间 HUD 完赛等待统一结算，不显示单人成绩与重新选图提示',async()=>{
 const {createHud}=await import('./hud.js');const previous={document:globalThis.document,innerWidth:globalThis.innerWidth,devicePixelRatio:globalThis.devicePixelRatio},elements=new Map(),context=new Proxy({},{get:()=>()=>{}});
 const element=()=>({style:{},dataset:{},getContext:()=>context,remove(){},querySelector(selector){if(!elements.has(selector))elements.set(selector,element());return elements.get(selector);}});
 globalThis.document={createElement:element,head:{append(){}},body:{append(){}}};globalThis.innerWidth=1200;globalThis.devicePixelRatio=1;
 try{const track=buildTrack(def),hud=createHud(track,'',{roomMode:true}),s=createSession(track).snapshot;hud.update({...s,race:{...s.race,finished:true,bestLap:50,lapTimes:[50,51,52]}});assert.equal(elements.get('.rh-result').hidden,true);assert.match(elements.get('.rh-notice').textContent,/等待其他玩家/);hud.destroy();}finally{Object.assign(globalThis,previous);}
});
test('仅房间 HUD 显示尾流槽，读取并限制充能，充满事件闪亮 0.3 秒',async()=>{
 const {createHud}=await import('./hud.js'),previous={document:globalThis.document,innerWidth:globalThis.innerWidth,devicePixelRatio:globalThis.devicePixelRatio},elements=new Map(),context=new Proxy({},{get:()=>()=>{}});
 const element=()=>({style:{},dataset:{},getContext:()=>context,remove(){},querySelector(selector){if(!elements.has(selector))elements.set(selector,element());return elements.get(selector);}});
 globalThis.document={createElement:element,head:{append(){}},body:{append(){}}};globalThis.innerWidth=1200;globalThis.devicePixelRatio=1;
 try{
  const track=buildTrack(def),s=createSession(track).snapshot,solo=createHud(track);solo.update(s);assert.equal(elements.get('.rh-draft').hidden,true);solo.destroy();
  const hud=createHud(track,'',{roomMode:true});s.car.draft=.5;hud.update(s);assert.equal(elements.get('.rh-draft').hidden,false);assert.equal(elements.get('.rh-draft meter').value,.5);assert.match(elements.get('.rh-draft span').textContent,/尾流/);
  s.car.draft=2;hud.update(s);assert.equal(elements.get('.rh-draft meter').value,1);s.car.draft=-1;hud.update(s);assert.equal(elements.get('.rh-draft meter').value,0);
  s.car.draft=0;s.step=900;s.events=[{type:'draft',step:900}];hud.update(s);assert.equal(elements.get('.rh-draft').dataset.flash,'true');assert.equal(elements.get('.rh-draft meter').value,1);
  s.step=936;hud.update(s);assert.equal(elements.get('.rh-draft').dataset.flash,'false');assert.equal(elements.get('.rh-draft meter').value,0);hud.destroy();
 }finally{Object.assign(globalThis,previous);}
});
