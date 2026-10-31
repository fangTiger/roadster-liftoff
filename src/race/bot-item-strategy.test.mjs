import test from 'node:test';
import assert from 'node:assert/strict';
const strategy=await import('./bot-item-strategy.js').catch(()=>({}));
const straight={length:1000,branches:[],at:s=>({x:0,z:s,tx:0,tz:1,w:10}),surfaceAt:()=>0};
const actor=()=>({id:'a',race:{lap:1},car:{x:0,z:0,yaw:0,vx:0,vz:50,steer:0,grounded:true,near:{s:0,path:'main'}}});
const use=(kind,a,cars=[],track=straight,held=30,locked=false)=>{assert.equal(typeof strategy.smartBotShouldUseItem,'function');return strategy.smartBotShouldUseItem(kind,a,cars,track,held,locked);};
// 切线角在 40 米处达到最大变化率，代表一个前方弯心。
const corner={...straight,at:s=>{const angle=.6/(1+Math.exp(-(s-40)/8));return {x:0,z:s,tx:Math.sin(angle),tz:Math.cos(angle),w:10};}};

test('高档导弹只在目标位于车头瞄准锥内且横滑和转向稳定时使用',()=>{
 const a=actor(),front={id:'b',lap:1,s:60,x:0,z:60};assert.equal(use('missile',a,[front]),true);
 for(const patch of [{x:25},{x:0,z:-60}])assert.equal(use('missile',a,[{...front,...patch}]),false);
 for(const patch of [{vx:15},{steer:.6},{drifting:true},{grounded:false}]){const b=actor();Object.assign(b.car,patch);assert.equal(use('missile',b,[front]),false);}
 assert.equal(use('missile',a,[{...front,finished:true}]),false);assert.equal(use('missile',a,[]),false);
});
test('高档护盾只响应锁定，不因持有超时浪费',()=>{
 assert.equal(use('shield',actor(),[],straight,300,false),false);assert.equal(use('shield',actor(),[],straight,0,true),true);
});
test('高档氮气只在出弯直道或纯直道使用，落后也不在弯中强用',()=>{
 const a=actor();assert.equal(use('nitro',a),true);Object.assign(a,{rank:6,count:6});assert.equal(use('nitro',a,[],corner),false);
 a.car.near.path='shortcut';assert.equal(use('nitro',a),false);
 for(const patch of [{steer:.6},{drifting:true},{vx:15},{grounded:false}]){const b=actor();Object.assign(b.car,patch);assert.equal(use('nitro',b),false);}
});
test('高档水雷只在前方弯心前的主线路面投掷，不因前后车或超时乱放',()=>{
 const a=actor();assert.equal(use('mine',a,[{id:'b',lap:1,s:150,x:0,z:150}],straight,300),false);
 assert.equal(use('mine',a,[],corner),true);const p=strategy.smartBotMineTarget(a,corner);assert.ok(p.z>=8&&p.z<40);assert.equal(p.x,0);
 assert.equal(use('mine',a,[],{...corner,surfaceAt:()=>1}),false);a.car.near.path='shortcut';assert.equal(use('mine',a,[],corner),false);
});
