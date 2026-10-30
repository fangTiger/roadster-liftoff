import test from 'node:test';
import assert from 'node:assert/strict';
const items=await import('./items.js').catch(()=>({}));
import { buildTrack,ROAD } from '../track/build.js';
import { TRACKS } from '../track/data/index.js';
for(const {def} of TRACKS)test(`地图 ${def.id} 的十二个道具箱确定、均匀且位于 ROAD`,()=>{
 assert.equal(typeof items.itemBoxes,'function');const track=buildTrack(def),boxes=items.itemBoxes(track);assert.equal(boxes.length,12);assert.deepEqual(boxes,items.itemBoxes(track));assert.equal(new Set(boxes.map(b=>b.id)).size,12);
 for(let row=0;row<3;row++){
  const group=boxes.slice(row*4,row*4+4);assert.ok(group[0].s>=track.length*[.22,.52,.8][row]);
  for(const b of group){assert.equal(track.surfaceAt(b.x,b.z),ROAD);assert.ok(Math.abs(track.nearest(b.x,b.z).lateral)<track.at(b.s).w/2);}
  const spacing=Math.hypot(group[1].x-group[0].x,group[1].z-group[0].z);for(let i=2;i<4;i++)assert.ok(Math.abs(Math.hypot(group[i].x-group[i-1].x,group[i].z-group[i-1].z)-spacing)<1e-8);
 }
});
test('道具箱向前避开特殊路段与非 ROAD 行',()=>{
 const track={length:100,features:[{type:'gap',from:21,to:25},{type:'slot',s:52,from:52,to:52,rockRadius:4}],at:s=>({x:0,z:s,y:0,w:10,tx:0,tz:1,bank:0}),surfaceAt:(x,z)=>z<27?6:ROAD};
 assert.equal(typeof items.itemBoxes,'function');const boxes=items.itemBoxes(track);assert.ok(boxes[0].s>=27);assert.ok(boxes[4].s>56);
});
test('抽取线性权重与排名单调性，固定随机源可复现四种道具',()=>{
 assert.equal(typeof items.rollItem,'function');let previous;
 for(let p=0;p<=1.001;p+=.1){const counts={missile:0,mine:0,nitro:0,shield:0};for(let i=0;i<10000;i++)counts[items.rollItem(p,()=> (i+.5)/10000)]++;
  const expected={missile:.05+.4*p,mine:.4-.3*p,nitro:.25+.1*p,shield:.3-.2*p};for(const k of Object.keys(counts))assert.ok(Math.abs(counts[k]/10000-expected[k])<.0002);
  if(previous){for(const k of ['missile','nitro'])assert.ok(counts[k]>=previous[k]);for(const k of ['mine','shield'])assert.ok(counts[k]<=previous[k]);}previous=counts;
 }
});
test('水雷生效、本人豁免、闭合半径与存活时间边界',()=>{
 assert.equal(typeof items.mineHits,'function');const mine={from:'a',x:0,z:0,placedAt:10},car={x:1.6,z:0};
 assert.equal(items.mineHits(mine,car,'b',10.599),false);assert.equal(items.mineHits(mine,car,'b',10.6),true);assert.equal(items.mineHits(mine,car,'a',11.499),false);assert.equal(items.mineHits(mine,car,'a',11.5),true);
 assert.equal(items.mineHits(mine,{x:1.6001,z:0},'b',12),false);assert.equal(items.mineHits(mine,car,'b',39.999),true);assert.equal(items.mineHits(mine,car,'b',40),false);assert.equal(items.mineAlive(mine,40),false);
});
test('道具箱避开跳台全长、落石和成排锥桶的实际区域',()=>{
 const track={length:100,features:[{type:'ramp',from:20,to:20,length:10},{type:'cones',from:50,to:50,items:[{s:51},{s:56}]},{type:'rockfall',from:80,to:80}],at:s=>({x:0,z:s,y:0,w:10,tx:0,tz:1,bank:0}),surfaceAt:()=>ROAD};const boxes=items.itemBoxes(track);assert.ok(boxes[0].s>30);assert.ok(boxes[4].s>56);assert.ok(boxes[8].s>83);
});

test('导弹选最近领先者，包含 200 米边界，排除落后、同进度、完赛、ghost、stale 和离线',()=>{
 assert.equal(typeof items.pickMissileTarget,'function');const self={id:'a',lap:1,s:10},near={id:'b',lap:1,s:30},far={id:'c',lap:1,s:210};
 assert.equal(items.pickMissileTarget(self,[far,near,self],1000),near);
 assert.equal(items.pickMissileTarget(self,[far],1000),far);
 for(const patch of [{s:211},{s:9},{s:10},{s:20,finished:true},{s:20,ghost:true},{s:20,stale:true},{s:20,connected:false}])assert.equal(items.pickMissileTarget(self,[{...near,...patch}],1000),null);
});
test('导弹跨圈按累计进度选敌，不将圈后车辆误判为前车',()=>{
 assert.equal(typeof items.pickMissileTarget,'function');const self={id:'a',lap:2,s:980},next={id:'b',lap:3,s:5};assert.equal(items.pickMissileTarget(self,[{id:'c',lap:2,s:990},next],1000).id,'c');assert.equal(items.pickMissileTarget(self,[next,{id:'d',lap:2,s:5}],1000),next);
});
test('导弹轨迹从发射点沿朝向出发，以 smoothstep 追逐当前显示位置，无目标直飞',()=>{
 assert.equal(typeof items.missilePosition,'function');const m={x:1,z:2,yaw:0,firedAt:10},target={x:21,y:4,z:42};
 assert.deepEqual(items.missilePosition(m,target,10),{x:1,y:1.5,z:2});
 assert.deepEqual(items.missilePosition(m,target,11.5),{x:21,y:4.8,z:42});
 const p=items.missilePosition(m,target,10.75);assert.equal(p.x,11);assert.ok(Math.abs(p.z-52)<1e-8);assert.ok(Math.abs(items.missilePosition(m,null,11.5).z-122)<1e-8);
});

test('水雷按目标速度预判、跟随横向并限宽，确定且不改入参',()=>{
 assert.equal(typeof items.mineThrowTarget,'function');const track={length:1000,at:s=>({x:0,z:s,tx:0,tz:1,w:10}),surfaceAt:(x)=>Math.abs(x)<=4?ROAD:2},self={s:10,x:0,z:10},target={s:100,x:-2,z:100,vx:0,vz:30},before=structuredClone(target);
 assert.deepEqual(items.mineThrowTarget(self,target,track),{x:-2,z:130});assert.deepEqual(items.mineThrowTarget(self,target,track),items.mineThrowTarget(self,target,track));assert.deepEqual(target,before);
 assert.deepEqual(items.mineThrowTarget(self,{...target,x:-20,vz:100},track),{x:-4,z:145});assert.deepEqual(items.mineThrowTarget(self,{...target,x:20,vz:0},track),{x:4,z:112});
 const p=items.mineThrowTarget(self,target,track);assert.equal(track.surfaceAt(p.x,p.z),ROAD);
});
test('水雷无目标沿自己横向前投 40 米，绕回起点，非路面横向收缩',()=>{
 assert.equal(typeof items.mineThrowTarget,'function');const track={length:100,at:s=>({x:s,z:0,tx:1,tz:0,w:10}),surfaceAt:(x,z)=>Math.abs(z)<=1?ROAD:2},self={s:90,x:90,z:3};
 const p=items.mineThrowTarget(self,null,track);assert.equal(p.x,30);assert.ok(p.z>0&&p.z<=1);assert.equal(track.surfaceAt(p.x,p.z),ROAD);
});
test('水雷在实际赛道上前投，落点均在路面，中心线断口继续前移',()=>{
 assert.equal(typeof items.mineThrowTarget,'function');
 for(const {def} of TRACKS){const track=buildTrack(def);for(let s=0;s<track.length;s+=37){const p=track.at(s),self={...p,s},target={...p,s,vx:p.tx*30,vz:p.tz*30},landing=items.mineThrowTarget(self,target,track);assert.equal(track.surfaceAt(landing.x,landing.z),ROAD);}}
});
