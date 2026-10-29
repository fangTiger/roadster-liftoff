import test from 'node:test';
import assert from 'node:assert/strict';
import T from './tuning.js';
import { resolveContacts } from './contact.js';
const car=(extra={})=>({id:'self',x:0,z:0,yaw:0,vx:0,vz:30,...extra});
const speed=c=>Math.hypot(c.vx,c.vz);
// 模拟两台电脑在同一时刻各自结算自己的车
const both=(a,b,opts={})=>{const oldA={...a},oldB={...b};return [resolveContacts(a,[oldB],opts),resolveContacts(b,[oldA],opts)];};
test('侧面贴身：各推半个穿透深度，只消除一半相对接近速度，不增速，对方不变',()=>{
 const a=car({vx:4}),b=car({id:'b',x:1.8}),before=structuredClone(b);
 const events=resolveContacts(a,[b]);
 assert.ok(Math.abs(a.x+.1)<1e-10);assert.ok(a.vx>0&&a.vx<4);assert.ok(speed(a)<=Math.hypot(4,30));
 assert.equal(events.length,1);assert.equal(events[0].impact,4);assert.equal(events[0].rear,false);assert.deepEqual(b,before);
 const away=car({vx:-4});resolveContacts(away,[b]);assert.equal(away.vx,-4);assert.equal(away.vz,30);
});
test('同向跟车轻微重叠：后车不会被刹停，只降到接近前车的速度',()=>{
 const rear=car({z:-4.3,vz:31}),front=car({id:'front',vz:30});
 resolveContacts(rear,[front]);assert.ok(rear.vz>29,`后车速度 ${rear.vz}`);
});
test('追尾：后车掉速多于前车，前车不被顶着加速',()=>{
 const rear=car({z:-4,vz:40}),front=car({id:'front',vz:20});
 const [er,ef]=both(rear,front);
 assert.equal(er[0].rear,true);assert.equal(ef[0].rear,false);
 assert.ok(40-speed(rear)>20-speed(front));assert.ok(speed(front)<=20);
 const side=car({x:1.8,vz:40});assert.equal(resolveContacts(side,[car({id:'front',vz:20})]).some(e=>e.rear),false);
});
test('持续贴身只在接触开始时扣速一次，冷却过后再接触重新结算',()=>{
 const cooldown=Math.round(T.contactCooldown/T.dt),other=car({id:'b',x:1.8,vx:-3});
 const a=car({vx:3});assert.equal(resolveContacts(a,[other],{step:0}).length,1);

 for(let i=1;i<=10;i++){a.x=0;a.vx=3;assert.equal(resolveContacts(a,[other],{step:i}).length,0);}
 a.x=0;a.vx=3;assert.equal(resolveContacts(a,[other],{step:10+cooldown+1}).length,1);
});
test('被追尾方在网络延迟下连续多步看到重叠，也只掉一次速',()=>{
 const front=car({id:'front',vz:20}),rear=car({id:'rear',z:-4,vz:40});
 for(let step=0;step<8;step++){front.z=0;resolveContacts(front,[rear],{step});}
 assert.ok(speed(front)>20*(1-T.contactLoss)-1e-9,`前车速度 ${speed(front)}`);
});
test('完全重合且相对静止的两车按身份各自结算，必须反向分开',()=>{
 let a=car({id:'a',vz:0}),b=car({id:'b',vz:0});
 for(let i=0;i<4;i++)both(a,b,{step:i});
 assert.ok(Math.hypot(a.x-b.x,a.z-b.z)>=T.width-1e-12);
 const left=car({vz:0}),right=car({vz:0});resolveContacts(left,[car({id:'b',vz:0})],{id:'a'});resolveContacts(right,[car({id:'a',vz:0})],{id:'b'});assert.ok(left.x*right.x<0);
});
test('迎面、斜向、中心线相交及完全重合：有限且不增速，每步推出总距离有上限',()=>{
 for(const other of [car({id:'b',z:3.5,yaw:Math.PI,vz:-30}),car({id:'b',x:1,z:1,yaw:Math.PI/4,vx:-20}),car({id:'b',yaw:Math.PI/2,vx:30,vz:0}),car({id:'b'})]){
  const c=car({vx:6}),before={...c};resolveContacts(c,[other]);assert.ok(speed(c)<=speed(before)+1e-12);assert.ok(Math.hypot(c.x-before.x,c.z-before.z)<=T.contactPushMax+1e-12);assert.ok(Number.isFinite(c.x+c.z+c.vx+c.vz));
 }
 const c=car();resolveContacts(c,[car({id:'a',x:1}),car({id:'b',z:1}),car({id:'c',x:-1})]);assert.ok(Math.hypot(c.x,c.z)<=T.contactPushMax+1e-12);
});
test('无接触不改状态；低冲击不发事件；输入相同逐位相同，其他车顺序不影响结果',()=>{
 const a=car(),before={...a};assert.deepEqual(resolveContacts(a,[car({x:10})]),[]);assert.deepEqual(a,before);
 assert.deepEqual(resolveContacts(car({vx:.5}),[car({x:1.8})]),[]);
 const others=[car({id:'b',x:1.8}),car({id:'a',z:3.5})],b=car(),c=car();
 assert.deepEqual(resolveContacts(b,others),resolveContacts(c,[...others].reverse()));assert.deepEqual(b,c);
});
