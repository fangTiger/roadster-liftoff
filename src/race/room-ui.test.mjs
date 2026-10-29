import test from 'node:test';
import assert from 'node:assert/strict';
import { standings, invitationURL } from './room-ui.js';
test('实时排名按 lap×长度+s，自己高亮所需 id 保留，无状态仍有稳定位置',()=>{
 const players=[{id:'a',seat:0},{id:'b',seat:1},{id:'c',seat:2}],states=new Map([['a',{lap:1,s:900}],['b',{lap:2,s:1}]]);
 assert.deepEqual(standings(players,states,1000).map(p=>p.id),['b','a','c']);
});
test('邀请链接保留机器人与背景参数，清除单人 capture 和地图参数',()=>{
 const url=new URL(invitationURL('ABC234','https://game.example/?race&room&autopilot&map=hard&capture&sky=dawn'));assert.equal(url.searchParams.get('room'),'ABC234');assert.ok(url.searchParams.has('race'));assert.ok(url.searchParams.has('autopilot'));assert.equal(url.searchParams.get('sky'),'dawn');assert.equal(url.searchParams.has('capture'),false);assert.equal(url.searchParams.has('map'),false);
});
