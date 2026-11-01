import test from 'node:test';
import assert from 'node:assert/strict';
import { createWallMonitor } from './bot-wall-monitor.mjs';

const wall={a:{x:0,z:-10},b:{x:0,z:10}};
const car={x:1.00001,z:0,y:0,yaw:0,roll:0,vx:0,vz:1,near:{y:0,s:0},lap:1};
test('同向轻蹭墙无须冲击事件也能记录持续两秒接触',()=>{
 const monitor=createWallMonitor({walls:[wall],features:[]});
 for(let step=0;step<240;step++)monitor.sample({...car,z:step/120});
 assert.equal(monitor.metrics.wallContactSteps,240);assert.equal(monitor.metrics.wallContactEpisodes,1);assert.equal(monitor.metrics.maxWallContactDuration,2);
 monitor.sample({...car,x:2});monitor.sample(car);
 assert.equal(monitor.metrics.wallContactEpisodes,2);assert.equal(monitor.metrics.maxWallContactDuration,2);
});
test('空间桶跨界不漏接触，车身头尾与端点也按胶囊检测',()=>{
 const monitor=createWallMonitor({walls:[{a:{x:16,z:0},b:{x:16,z:4}}],features:[]});
 monitor.sample({...car,x:14,z:2,yaw:Math.PI/2});
 assert.equal(monitor.metrics.wallContactSteps,1);
 monitor.sample({...car,x:13,z:2,yaw:Math.PI/2});
 assert.equal(monitor.metrics.wallContactSteps,1);
});
test('水泥墩使用半径且仅统计车身低于障碍高度时接触',()=>{
 const monitor=createWallMonitor({walls:[],features:[{type:'cones',items:[{kind:'concrete',x:0,z:0,radius:1.1}]}]});
 monitor.sample({...car,x:2.10001});assert.equal(monitor.metrics.wallContactSteps,1);
 monitor.sample({...car,x:2.10001,y:2});assert.equal(monitor.metrics.wallContactSteps,1);
 monitor.sample({...car,x:2.2});assert.equal(monitor.metrics.wallContactSteps,1);
});
