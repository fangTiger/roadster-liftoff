import test from 'node:test';
import assert from 'node:assert/strict';
import * as draft from './draft.js';
import T from './tuning.js';
const car=()=>({x:0,z:0,yaw:0,vx:0,vz:30,boostTime:0});
const other=(patch={})=>({id:'b',x:0,z:10,yaw:0,vx:0,vz:30,...patch});
test('尾流模块提供确定性更新函数',()=>assert.equal(typeof draft.updateDraft,'function'));
for(const [name,patch,self] of [['太近',{z:3}],['太远',{z:26}],['在后方',{z:-10}],['横向过大',{x:1.6}],['角度过大',{yaw:Math.PI/6}],['车速不够',{}, {vz:20}]])test(`尾流${name}不充能`,()=>{
 const c={...car(),...self};assert.deepEqual(draft.updateDraft(c,[other(patch)],T.dt),[]);assert.equal(c.draft,0);
});
test('约 1.2 秒充满只给一次加速、清槽，保留更长加速，不修改前车',()=>{
 const c=car(),others=[other(),other({id:'c',z:12})],before=structuredClone(others),events=[];
 for(let i=0;i<144;i++)events.push(...draft.updateDraft(c,others,T.dt));
 assert.deepEqual(events,[{type:'draft'}]);assert.equal(c.draft,0);assert.equal(c.boostTime,.8);assert.deepEqual(others,before);
 draft.updateDraft(c,others,T.dt);assert.ok(c.draft>0&&c.draft<.01);
 c.draft=.99;c.boostTime=2;draft.updateDraft(c,others,.02);assert.equal(c.boostTime,2);
});
test('离开后两倍回落至零，缺少 others 时不新增字段',()=>{
 const c=car();draft.updateDraft(c);assert.equal(Object.hasOwn(c,'draft'),false);
 draft.updateDraft(c,[other()],.3);assert.equal(c.draft,.25);
 draft.updateDraft(c,[],.1);assert.ok(Math.abs(c.draft-1/12)<1e-12);
 draft.updateDraft(c,[],1);assert.equal(c.draft,0);
});
test('距离端点可充能，转向后的车头坐标与跨越正负 π 的航向有效',()=>{
 for(const z of [4,25]){const c=car();draft.updateDraft(c,[other({z})],.1);assert.ok(c.draft>0);}
 const c={...car(),yaw:Math.PI/2};draft.updateDraft(c,[other({x:10,z:0,yaw:Math.PI/2})],.1);assert.ok(c.draft>0);
 const wrapped={...car(),yaw:Math.PI-.01};draft.updateDraft(wrapped,[other({z:-10,yaw:-Math.PI+.01})],.1);assert.ok(wrapped.draft>0);
});
