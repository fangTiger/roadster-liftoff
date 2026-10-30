import test from 'node:test';
import assert from 'node:assert/strict';
const module=await import('./room-items.js').catch(()=>({}));
const track={length:100,features:[],at:s=>({x:0,y:0,z:s,tx:0,tz:1,w:10,bank:0}),surfaceAt:()=>0};
function fixture(random=()=>.5){assert.equal(typeof module.createRoomItems,'function');const sent=[],events=[],effects=[],items=module.createRoomItems({track,send:m=>sent.push(m),random,onEvent:e=>events.push(e)}),car={...items.boxes[0],yaw:0,grounded:true,near:{s:22}},actor={id:'a',car,race:{lap:1,frozen:false,finished:false},time:3,rankFraction:0,applyEffect:kind=>effects.push(kind)};return {items,sent,events,effects,actor};}
test('箱子本地隐藏四秒，满槽仍消费但不替换，一秒后才可使用',()=>{
 const {items,actor,effects}=fixture();items.step(actor);assert.equal(items.slot('a').kind,'nitro');assert.equal(items.visible('a',items.boxes[0].id,3),false);assert.equal(items.use(actor),false);actor.time=4;assert.equal(items.use(actor),true);assert.deepEqual(effects,['nitro']);assert.equal(items.use(actor),false);
 actor.time=7;assert.equal(items.visible('a',items.boxes[0].id,7),true);items.step(actor);const kind=items.slot('a').kind;actor.car={...items.boxes[1],yaw:0,grounded:true};items.step(actor);assert.equal(items.slot('a').kind,kind);assert.equal(items.visible('a',items.boxes[1].id,7),false);
});
test('机器人保留道具直到规则成立并经过反应时间，导弹无目标继续持有',()=>{
 for(const [value,kind] of [[.01,'missile'],[.2,'mine'],[.5,'nitro'],[.9,'shield']]){
  const f=fixture(()=>value);Object.assign(f.actor,{bot:true,difficulty:'hard'});f.items.step(f.actor);assert.equal(f.items.slot('a').kind,kind);
  f.actor.time=kind==='mine'?9.1:kind==='shield'?11.1:3.1;f.items.step(f.actor);assert.equal(f.items.slot('a').kind,kind);
  f.actor.time+=1.3;f.items.step(f.actor);assert.equal(f.items.slot('a').kind,kind==='missile'?kind:null);
  if(kind==='mine'){assert.equal(f.sent[0].botId,'a');assert.equal(f.sent[0].itemId,'a-1');}else if(kind!=='missile')assert.deepEqual(f.effects,[kind]);
 }
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
 const f=fixture(()=>.2);f.items.step(f.actor);f.actor.time=4;f.items.use(f.actor);assert.equal(f.sent[0].kind,'mine');assert.equal(f.items.mines.size,0);f.items.receive({...f.sent[0],from:'a'});assert.equal(f.items.mines.size,1);
});


test('真人导弹发射含模拟时间、朝向和目标，无目标也可直飞，实体等回显且去重',()=>{
 const f=fixture(()=>.01);f.items.step(f.actor);f.actor.time=4;f.actor.cars=[{id:'b',lap:1,s:40}];f.actor.car.near={s:20};assert.equal(f.items.use(f.actor),true);
 assert.deepEqual(f.sent[0],{type:'item',kind:'missile',itemId:'a-1',target:'b',x:f.actor.car.x,z:f.actor.car.z,yaw:0,firedAt:4});assert.equal(f.items.missiles.size,0);
 f.items.receive({...f.sent[0],from:'a'});f.items.receive({...f.sent[0],from:'a'});assert.equal(f.items.missiles.size,1);
 f.items.slot('a').kind='missile';f.actor.cars=[];assert.equal(f.items.use(f.actor),true);assert.equal(f.sent[1].target,null);
});
test('导弹按模拟时钟命中一次，护盾由效果队列抵消，hitAt 仅爆开一次',async()=>{
 const {applyEffects}=await import('./sim/effects.js');
 for(const shield of [false,true]){const f=fixture(),m={kind:'missile',itemId:'b-1',from:'b',target:'a',x:0,z:0,yaw:0,firedAt:3};f.actor.car.shieldTime=shield?5:0;f.actor.car.vx=50;f.actor.car.vz=0;f.actor.car.x=1000;
  f.items.receive(m);assert.equal(f.items.locked('a'),true);f.actor.time=4.499;f.items.step(f.actor);assert.deepEqual(f.effects,[]);f.actor.time=4.5;f.items.step(f.actor);f.items.step(f.actor);assert.deepEqual(f.effects,['spin']);assert.deepEqual(f.sent,[{type:'hit',itemId:'b-1',shielded:shield}]);
  const events=applyEffects(f.actor.car,f.effects.map(kind=>({kind})));assert.equal(f.actor.car.spinTime,shield?0:1.2);assert.equal(events[0].type,shield?'shieldBreak':'effect');assert.equal(f.items.locked('a'),false);
  f.items.hit({itemId:m.itemId,by:'a',shielded:shield});f.items.hit({itemId:m.itemId,by:'a',shielded:shield});assert.equal(f.events.filter(e=>e.type==='missileBurst').length,1);
 }
});
test('目标掉线、离开、完赛、stale 或 ghost 导弹永久失效，到点所有端清除，无目标也到点清除',()=>{
 for(const patch of [{connected:false},{finished:true},{stale:true},{ghost:true}]){const f=fixture(),m={kind:'missile',itemId:'b-1',target:'a',x:0,z:0,yaw:0,firedAt:3};f.actor.car.x=1000;f.actor.cars=[{id:'a',...patch}];f.items.receive(m);f.items.tick(4,f.actor.cars);assert.equal(f.items.locked('a'),false);f.actor.cars=[{id:'a'}];f.actor.time=4.5;f.items.step(f.actor);f.items.tick(4.5,f.actor.cars);assert.deepEqual(f.effects,[]);assert.equal(f.items.missiles.size,0);}
 const f=fixture();for(const target of [null,'gone'])f.items.receive({kind:'missile',itemId:'b-'+(target?2:1),target,firedAt:3});f.items.tick(4.5,[]);assert.equal(f.items.missiles.size,0);assert.equal(f.sent.length,0);
});
test('机器人锁定后延迟开盾，失去条件取消计时，有目标才延迟发弹',()=>{
 const f=fixture(()=>0);Object.assign(f.actor,{bot:true,difficulty:'hard',cars:[]});f.actor.car.near={s:10};f.items.slot('a').kind='shield';f.items.slot('a').pickedAt=3;f.items.receive({kind:'missile',itemId:'b-1',target:'a',firedAt:3});f.items.step(f.actor);assert.equal(f.items.slot('a').kind,'shield');f.actor.time=3.3;f.items.step(f.actor);assert.deepEqual(f.effects,['shield']);
 f.items.slot('a').kind='missile';f.actor.time=5;f.items.step(f.actor);assert.equal(f.sent.length,0);f.actor.cars=[{id:'b',lap:1,s:30}];f.items.step(f.actor);f.actor.time=5.1;f.actor.cars=[];f.items.step(f.actor);f.actor.time=6;f.actor.cars=[{id:'b',lap:1,s:30}];f.items.step(f.actor);assert.equal(f.sent.length,0);f.actor.time=6.3;f.items.step(f.actor);assert.equal(f.sent[0].target,'b');assert.equal(f.sent[0].botId,'a');
});

test('同一步多发导弹只消耗一次护盾，后续命中仍打转',()=>{
 const f=fixture();f.actor.car.x=1000;f.actor.car.shieldTime=5;for(const itemId of ['b-1','b-2'])f.items.receive({kind:'missile',itemId,target:'a',firedAt:3});f.actor.time=4.5;f.items.step(f.actor);assert.deepEqual(f.sent.map(m=>m.shielded),[true,false]);assert.deepEqual(f.effects,['spin','spin']);
});

test('真人水雷默认向前追踪目标，后退输入保留车后三米，消息携带出手点',()=>{
 for(const back of [false,true]){const f=fixture();f.items.slot('a').kind='mine';Object.assign(f.actor,{back,cars:[{id:'b',lap:1,s:40,x:-2,z:40,vx:0,vz:20}]});f.actor.car={x:0,z:20,yaw:0,near:{s:20}};f.items.use(f.actor);
  assert.deepEqual(f.sent[0],{type:'item',kind:'mine',itemId:'a-1',x:back?0:-2,z:back?17:60,...(back?{}:{ox:0,oz:20}),placedAt:3});
 }
 const f=fixture();f.items.slot('a').kind='mine';f.actor.car={x:-1,z:20,yaw:0,near:{s:20}};f.items.use(f.actor);assert.equal(f.sent[0].z,60);assert.equal(f.sent[0].x,-1);
});
test('机器人水雷前车优先向前，后车触发向后，持有超时向前',()=>{
 const front={id:'b',lap:1,s:40,x:0,z:40,vx:0,vz:20},back={id:'c',lap:1,s:10,x:0,z:10};
 for(const [cars,held,expected] of [[[front,back],0,60],[[back],0,17],[[back],7,60],[[],7,60]]){
  const f=fixture();Object.assign(f.actor,{bot:true,cars,time:10});f.actor.car={x:0,z:20,yaw:0,near:{s:20}};Object.assign(f.items.slot('a'),{kind:'mine',pickedAt:10-held});f.items.use(f.actor);assert.equal(f.sent[0].z,expected);assert.equal(f.sent[0].botId,'a');
 }
});
