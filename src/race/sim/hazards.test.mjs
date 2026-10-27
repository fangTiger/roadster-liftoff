import test from 'node:test';
import assert from 'node:assert/strict';
import { createHazards } from './hazards.js';
test('落石按步数周期出现，方向、休止与相位可重现',()=>{
 const h=createHazards({features:[{type:'rockfall',x:0,z:0,y:3,tx:0,tz:1,period:5,phase:0,duration:2,lateralFrom:-10,lateralTo:10,radius:1}]});
 assert.deepEqual(h.positions(60),h.positions(660));assert.equal(h.positions(360).length,0);assert.equal(h.positions(60)[0].direction,1);
});
