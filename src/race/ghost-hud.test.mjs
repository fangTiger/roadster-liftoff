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
test('道具赛顶部槽显示轮盘、道具与护盾倒计时，竞速赛不创建道具元素',async()=>{
 const {createHud}=await import('./hud.js'),previous={document:globalThis.document,innerWidth:globalThis.innerWidth,devicePixelRatio:globalThis.devicePixelRatio},elements=new Map(),created=[],context=new Proxy({},{get:()=>()=>{}});
 const element=()=>{const e={style:{},dataset:{},getContext:()=>context,remove(){},querySelector(selector){if(!elements.has(selector))elements.set(selector,element());return elements.get(selector);}};created.push(e);return e;};globalThis.document={createElement:element,head:{append(){}},body:{append(){}}};globalThis.innerWidth=1200;globalThis.devicePixelRatio=1;
 try{const track=buildTrack(def),s=createSession(track).snapshot,hud=createHud(track,'',{roomMode:true,itemsMode:true});assert.ok(created.some(e=>e.innerHTML?.includes('rh-item')));s.step=420;hud.update(s,{itemSlot:{kind:'nitro',readyAt:4},missileLocked:true});assert.equal(elements.get('.rh-missile-warning').hidden,false);assert.equal(elements.get('.rh-missile-warning').textContent,'导弹来袭');assert.equal(elements.get('.rh-item').dataset.rolling,'true');s.step=480;s.car.shieldTime=3;hud.update(s,{itemSlot:{kind:'nitro',readyAt:4}});assert.equal(elements.get('.rh-item').dataset.rolling,'false');assert.match(elements.get('.rh-item-label').textContent,/氮气/);assert.match(elements.get('.rh-shield-time').textContent,/3\.0/);assert.equal(elements.get('.rh-missile-warning').hidden,true);hud.destroy();created.length=0;createHud(track,'',{roomMode:true});assert.ok(created.every(e=>!e.innerHTML?.includes('rh-item')));}finally{Object.assign(globalThis,previous);}
});

test('小地图 rivals 可省略，按颜色画小圆点并在自己标记之前绘制',async()=>{
 const {createHud}=await import('./hud.js'),previous={document:globalThis.document,innerWidth:globalThis.innerWidth,devicePixelRatio:globalThis.devicePixelRatio},elements=new Map(),drawn=[];
 const context=new Proxy({arc(x,z,r){drawn.push({x,z,r,color:this.fillStyle,stroke:this.strokeStyle});},translate(){drawn.push('self');}},{get:(o,k)=>k in o?o[k]:()=>{}}),element=()=>({style:{},dataset:{},getContext:()=>context,remove(){},querySelector(q){if(!elements.has(q))elements.set(q,element());return elements.get(q);}});
 globalThis.document={createElement:element,head:{append(){}},body:{append(){}}};globalThis.innerWidth=1200;globalThis.devicePixelRatio=1;
 try{const track=buildTrack(def),hud=createHud(track),s=createSession(track).snapshot;assert.doesNotThrow(()=>hud.update(s));drawn.length=0;
  hud.update(s,{rivals:[{x:10,z:20,color:'#ef5350'},{x:40,z:50,color:'#ffd34d'}]});const dots=drawn.filter(d=>d.r===3.5);assert.equal(dots.length,2);assert.deepEqual(dots.map(d=>d.color),['#ef5350','#ffd34d']);assert.ok(dots.every(d=>d.stroke==='#002'));assert.ok(drawn.indexOf(dots[1])<drawn.indexOf('self'));assert.notEqual(dots[0].x,dots[1].x);hud.destroy();
 }finally{Object.assign(globalThis,previous);}
});
