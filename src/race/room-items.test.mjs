import test from 'node:test';
import assert from 'node:assert/strict';
const module=await import('./room-items.js').catch(()=>({}));
const track={length:100,features:[],at:s=>({x:0,y:0,z:s,tx:0,tz:1,w:10,bank:0}),surfaceAt:()=>0};
function fixture(random=()=>.5){assert.equal(typeof module.createRoomItems,'function');const sent=[],events=[],effects=[],items=module.createRoomItems({track,send:m=>sent.push(m),random,onEvent:e=>events.push(e)}),car={...items.boxes[0],yaw:0,grounded:true},actor={id:'a',car,race:{lap:1,frozen:false,finished:false},time:3,rankFraction:0,applyEffect:kind=>effects.push(kind)};return {items,sent,events,effects,actor};}
test('箱子本地隐藏四秒，满槽仍消费但不替换，一秒后才可使用',()=>{
 const {items,actor,effects}=fixture();items.step(actor);assert.equal(items.slot('a').kind,'nitro');assert.equal(items.visible('a',items.boxes[0].id,3),false);assert.equal(items.use(actor),false);actor.time=4;assert.equal(items.use(actor),true);assert.deepEqual(effects,['nitro']);assert.equal(items.use(actor),false);
 actor.time=7;assert.equal(items.visible('a',items.boxes[0].id,7),true);items.step(actor);const kind=items.slot('a').kind;actor.car={...items.boxes[1],yaw:0,grounded:true};items.step(actor);assert.equal(items.slot('a').kind,kind);assert.equal(items.visible('a',items.boxes[1].id,7),false);
});
test('按实际名次抽取，机器人即时用氮气、护盾、水雷，抽到导弹保留',()=>{
 for(const [value,kind] of [[.01,'missile'],[.2,'mine'],[.5,'nitro'],[.9,'shield']]){const f=fixture(()=>value);f.actor.bot=true;f.items.step(f.actor);assert.equal(f.items.slot('a').kind,kind==='missile'?'missile':null);if(kind==='missile')assert.equal(f.items.use({...f.actor,time:10}),false);else if(kind==='mine'){assert.equal(f.sent[0].botId,'a');assert.equal(f.sent[0].z,f.actor.car.z-3);assert.equal(f.sent[0].placedAt,3);assert.equal(f.sent[0].itemId,'a-1');}else assert.deepEqual(f.effects,[kind]);}
 const f=fixture(()=>.4);f.actor.rankFraction=1;f.items.step(f.actor);assert.equal(f.items.slot('a').kind,'missile');
});
test('水雷消息去重、本地爆开不重播、远端消失爆开一次，到期清除',()=>{
 const f=fixture(),m={kind:'mine',itemId:'b-1',from:'b',x:0,z:0,placedAt:3};f.items.receive(m);f.items.receive(m);assert.equal(f.items.mines.size,1);f.actor.car={x:0,z:0,grounded:true};f.actor.time=3.59;f.items.step(f.actor);assert.equal(f.effects.length,0);f.actor.time=3.6;f.items.step(f.actor);assert.deepEqual(f.effects,['trap']);assert.deepEqual(f.sent,[{type:'mineHit',itemId:'b-1'}]);const count=f.events.filter(e=>e.type==='mineBurst').length;f.items.gone({itemId:'b-1',by:'a'});assert.equal(f.events.filter(e=>e.type==='mineBurst').length,count);f.items.receive(m);assert.equal(f.items.mines.size,0);
 f.items.receive({...m,itemId:'b-2'});f.items.gone({itemId:'b-2',by:'c'});f.items.gone({itemId:'b-2',by:'c'});assert.equal(f.events.filter(e=>e.type==='mineBurst').length,count+1);f.items.receive({...m,itemId:'b-3'});f.actor.time=33;f.items.step(f.actor);assert.equal(f.items.mines.size,0);
});
test('冻结、完赛、离地和禁锢时不拾取或使用，销毁清空本局',()=>{
 const f=fixture();f.actor.race.frozen=true;f.items.step(f.actor);assert.equal(f.items.slot('a').kind,null);f.actor.race.frozen=false;f.actor.car.grounded=false;f.items.step(f.actor);assert.equal(f.items.slot('a').kind,null);f.actor.car.grounded=true;f.items.step(f.actor);f.actor.time=5;f.actor.car.trapTime=1;assert.equal(f.items.use(f.actor),false);f.actor.car.trapTime=0;f.actor.race.finished=true;assert.equal(f.items.use(f.actor),false);f.items.dispose();assert.equal(f.items.slot('a').kind,null);
});
test('水雷仅在服务端接受回显后实体化，限流拒绝不会留下幽灵雷',()=>{
 const f=fixture(()=>.2);f.actor.bot=true;f.items.step(f.actor);assert.equal(f.sent[0].kind,'mine');assert.equal(f.items.mines.size,0);f.items.receive({...f.sent[0],from:'a'});assert.equal(f.items.mines.size,1);
});
