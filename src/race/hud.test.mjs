import test from 'node:test';
import assert from 'node:assert/strict';
import { createHud } from './hud.js';
import { setLang } from '../i18n/i18n.js';
import { buildTrack } from './track/build.js';
import { TRACKS } from './track/data/index.js';
import { createSession } from './sim/session.js';
function fixture(run){
 const previous={document:globalThis.document,innerWidth:globalThis.innerWidth,devicePixelRatio:globalThis.devicePixelRatio},elements=new Map(),created=[],context=new Proxy({},{get:()=>()=>{}});
 const element=()=>{const e={style:{},dataset:{},remove(){},getContext:()=>context,querySelector(q){if(!elements.has(q))elements.set(q,element());return elements.get(q);}};created.push(e);return e;};
 globalThis.document={createElement:element,head:{append(){}},body:{append(){}}};globalThis.innerWidth=1200;globalThis.devicePixelRatio=1;
 try{run(elements,created);}finally{setLang('zh');Object.assign(globalThis,previous);}
}
test('三张图单人和房间 HUD 的推进剂与双语按键提示按地图变化，保留漂移和反打',()=>fixture((elements,created)=>{
 for(const {def} of TRACKS)for(const roomMode of [false,true]){
  elements.clear();created.length=0;const track=buildTrack(def),state=createSession(track).snapshot,hud=createHud(track,'',{trackId:def.id,roomMode});
  const markup=created.find(e=>e.id==='race-hud').innerHTML;
  assert.equal(/class="rh-fuel"/.test(markup),def.id===3);
  for(const lang of ['zh','en']){setLang(lang);hud.update(state);assert.equal(/推进剂|Propellant|Fuel/i.test(elements.get('.rh-drift').textContent),def.id===3);assert.equal(/推进器|Thrusters/.test(elements.get('footer').textContent),def.id===3);if(roomMode)assert.match(elements.get('footer').textContent,/表情|Emotes/);}
  setLang('zh');state.car.drifting=true;state.car.driftTier=2;hud.update(state);assert.match(elements.get('.rh-drift').textContent,/▮▮/);state.car.drifting=false;state.car.counterWindow=.2;hud.update(state);assert.match(elements.get('.rh-drift').textContent,/油门/);hud.destroy();
 }
}));
test('道具槽四种内联 SVG 随轮盘切换，稳定后与道具一致',()=>fixture(elements=>{
 const track=buildTrack(TRACKS[0].def),state=createSession(track).snapshot,hud=createHud(track,'',{trackId:1,roomMode:true,itemsMode:true}),icons=new Set();
 for(let i=0;i<4;i++){state.step=i*10;hud.update(state,{itemSlot:{kind:'nitro',readyAt:4}});const svg=elements.get('.rh-item-icon').innerHTML;assert.match(svg,/<svg/);icons.add(svg);}assert.equal(icons.size,4);
 for(const kind of ['missile','mine','nitro','shield']){state.step=600;hud.update(state,{itemSlot:{kind,readyAt:4}});assert.match(elements.get('.rh-item-icon').innerHTML,new RegExp(`data-item="${kind}"`));}hud.destroy();
}));
