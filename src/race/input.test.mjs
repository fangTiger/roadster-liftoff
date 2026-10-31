import test from 'node:test';
import assert from 'node:assert/strict';
import * as B from './sim/input-bits.js';
const input=await import('./input.js').catch(()=>({}));
test('实时键位按地图限制空格，油门、漂移与重置不变，切图不复用旧映射',()=>{
 assert.equal(typeof input.createKeyMap,'function');
 for(const id of [1,2,3]){const map=input.createKeyMap(id);assert.equal(map.Space||0,id===3?B.JET:0);assert.equal(map.KeyW,B.THROTTLE);assert.equal(map.ShiftLeft,B.DRIFT);assert.equal(map.KeyT,B.RESET);}
 const hard=input.createKeyMap(3);input.createKeyMap(1);assert.equal(hard.Space,B.JET);
});
