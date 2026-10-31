import test from 'node:test';
import assert from 'node:assert/strict';
import * as rotation from './garage-motion.js';
const make=()=>{assert.equal(typeof rotation.createCarRotation,'function','缺少拖动旋转控制器');return rotation.createCarRotation();};
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} ≠ ${b}`);

test('拖动按水平像素跟手，无角度边界，可完整旋转且每台车独立',()=>{
 const a=make(),b=make();a.begin(100,0,1);a.move(200,.1);close(a.yaw,2.2);
 a.move(100+Math.PI*2/.012,.2);close(a.yaw,1+Math.PI*2);close(b.step(.2,.1,0),0);
 a.step(10,.05,3);close(a.yaw,1+Math.PI*2);assert.equal(a.active,true,'长按不应自动恢复');
});
test('松手惯性指数衰减，不随帧率改变总转角',()=>{
 const run=steps=>{const a=make();a.begin(0,0,0);a.move(100,.1);a.end(.1);const start=a.yaw;for(let i=1;i<=steps;i++)a.step(.1+i/steps,1/steps,0);return{delta:a.yaw-start,velocity:a.velocity};};
 const a=run(20),b=run(60);assert.ok(a.delta>0);close(a.delta,b.delta);close(a.velocity,b.velocity);assert.ok(a.velocity<.3);
});
test('松手三秒后平滑回到原朝向，再交还展示动画，重新拖动重置计时',()=>{
 const a=make();a.begin(0,0,0);a.move(100,.1);a.end(.3,true);const yaw=a.yaw;
 close(a.step(3.29,.05,0,true),yaw);close(a.step(3.3,.01,0,true),yaw);
 assert.ok(a.step(3.7,.4,0,true)<yaw);close(a.step(4.2,.5,0,true),0);assert.equal(a.active,false);close(a.step(4.3,.1,.2,true),.2);
 a.begin(0,5,.2);a.move(100,5.1);a.end(5.1,true);a.step(7,.1,0,true);a.begin(0,7,a.yaw);a.end(7,true);a.step(9.9,.1,0,true);assert.equal(a.active,true);
});
test('减少运动或停顿后松手没有惯性，取消也能恢复',()=>{
 for(const [end,reduced] of [[.1,true],[1,false]]){const a=make();a.begin(0,0,0);a.move(100,.1);a.end(end,reduced);const yaw=a.yaw;a.step(end+.1,.1,0,reduced);close(a.yaw,yaw);close(a.velocity,0);}
});
