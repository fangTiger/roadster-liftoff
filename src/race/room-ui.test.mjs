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
test('结算页再来一局回大厅并发送 ready on，普通返回不准备，房主仍可换图',async()=>{
 const {mountRoomUI}=await import('./room-ui.js'),{setLang}=await import('../i18n/i18n.js'),previous=globalThis.document,elements=new Map(),handlers=new Map(),sent=[];let returned=0;
 const element=()=>({dataset:{},style:{},append(){},replaceChildren(){},remove(){},setAttribute(){},querySelector:q=>get(q),querySelectorAll:()=>[get('[data-rm-track="1"]')]});
 const get=q=>{if(!elements.has(q))elements.set(q,element());return elements.get(q);};get('[data-rm-track="1"]').dataset.rmTrack='1';
 globalThis.document={createElement:element,body:{append(){}}};
 const client={id:'a',on(type,fn){handlers.set(type,fn);return ()=>{};},send:m=>sent.push(m)};
 try{
  const ui=mountRoomUI({client,onReturn:()=>returned++});handlers.get('connection')({connected:true});handlers.get('room')({code:'ABC234',phase:'lobby',hostId:'a',trackId:1,players:[{id:'a',seat:0,name:'甲',ready:false,connected:true}]});
  handlers.get('results')({results:[]});assert.equal(ui.view,'results');assert.equal(get('[data-rm-rematch]').textContent,'再来一局');setLang('en');assert.equal(get('[data-rm-rematch]').textContent,'Race again');assert.equal(get('[data-rm-return]').textContent,'Back to lobby');setLang('zh');get('[data-rm-rematch]').onclick();assert.equal(ui.view,'lobby');assert.equal(returned,1);assert.deepEqual(sent,[{type:'ready',on:true}]);
  assert.equal(get('[data-rm-track="1"]').disabled,false);get('[data-rm-track="1"]').onclick();assert.deepEqual(sent.at(-1),{type:'pickTrack',trackId:1});
  handlers.get('results')({results:[]});const before=sent.length;get('[data-rm-return]').onclick();assert.equal(sent.length,before);assert.equal(returned,2);ui.destroy();
 }finally{globalThis.document=previous;}
});

test('大厅房主选择难度增删机器人，机器人中英文命名，权限、满员与阶段控制',async()=>{
 const {mountRoomUI}=await import('./room-ui.js'),{setLang}=await import('../i18n/i18n.js'),previous=globalThis.document,elements=new Map(),handlers=new Map(),sent=[];
 const element=()=>({children:[],dataset:{},style:{},append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;},remove(){},setAttribute(k,v){this[k]=v;},querySelector:q=>get(q),querySelectorAll:()=>[get('[data-rm-track="1"]')]});
 const get=q=>{if(!elements.has(q))elements.set(q,element());return elements.get(q);};get('[data-rm-track="1"]').dataset.rmTrack='1';globalThis.document={createElement:element,body:{append(){}}};
 const client={id:'a',on(type,fn){handlers.set(type,fn);return ()=>{};},send:m=>sent.push(m)},room={code:'ABC234',phase:'lobby',hostId:'a',trackId:1,players:[{id:'a',name:'甲',connected:true},{id:'b1',bot:true,difficulty:'normal',ownerId:'a',ready:true,connected:true}]};
 try{const ui=mountRoomUI({client});handlers.get('connection')({connected:true});handlers.get('room')(room);assert.equal(get('[data-rm-bots]').hidden,false);assert.equal(get('[data-rm-add-bot]').textContent,'加机器人');get('[data-rm-difficulty]').value='hard';get('[data-rm-add-bot]').onclick();assert.deepEqual(sent.at(-1),{type:'addBot',difficulty:'hard'});
 const row=get('[data-rm-players]').children[1];assert.equal(row.children[1].textContent,'机器人·普通');assert.ok(row.children[2].textContent.includes('机器人'));assert.equal(row.children[3].textContent,'×');row.children[3].onclick();assert.deepEqual(sent.at(-1),{type:'removeBot',botId:'b1'});
 setLang('en');assert.equal(get('[data-rm-add-bot]').textContent,'Add bot');assert.equal(get('[data-rm-players]').children[1].children[1].textContent,'Bot · Normal');
 handlers.get('results')({results:[{id:'b1',bot:true,difficulty:'normal',rank:1,elapsed:120,bestLap:40}]});assert.equal(get('[data-rm-result-rows]').children[0].children[1].textContent,'Bot · Normal');
 handlers.get('room')({...room,players:Array(6).fill(room.players[1])});assert.equal(get('[data-rm-add-bot]').disabled,true);
 handlers.get('room')({...room,phase:'countdown'});assert.equal(get('[data-rm-add-bot]').disabled,true);assert.equal(get('[data-rm-players]').children[1].children[3],undefined);
 handlers.get('room')({...room,hostId:'other'});assert.equal(get('[data-rm-bots]').hidden,true);assert.equal(get('[data-rm-players]').children[1].children[3],undefined);ui.destroy();
 }finally{setLang('zh');globalThis.document=previous;}
});
test('大厅模式按钮只许房主操作，跟随 room 模式及语言',async()=>{
 const {mountRoomUI}=await import('./room-ui.js'),previous=globalThis.document,elements=new Map(),handlers=new Map(),sent=[];
 const element=()=>({dataset:{},style:{},append(){},replaceChildren(){},remove(){},setAttribute(k,v){this[k]=v;},querySelector:q=>get(q),querySelectorAll:q=>q==='[data-rm-mode]'?['items','speed'].map(m=>get('[data-rm-mode="'+m+'"]')):[get('[data-rm-track="1"]')]});const get=q=>{if(!elements.has(q))elements.set(q,element());return elements.get(q);};get('[data-rm-track="1"]').dataset.rmTrack='1';for(const m of ['items','speed'])get('[data-rm-mode="'+m+'"]').dataset.rmMode=m;globalThis.document={createElement:element,body:{append(){}}};
 try{const client={id:'a',on(t,fn){handlers.set(t,fn);return ()=>{};},send:m=>sent.push(m)},ui=mountRoomUI({client}),room={phase:'lobby',hostId:'a',mode:'items',players:[]};handlers.get('connection')({connected:true});handlers.get('room')(room);const speed=get('[data-rm-mode="speed"]');assert.equal(speed.textContent,'竞速赛');assert.equal(speed.disabled,false);speed.onclick();assert.deepEqual(sent.at(-1),{type:'pickMode',mode:'speed'});handlers.get('room')({...room,mode:'speed',hostId:'b'});assert.equal(speed.disabled,true);assert.equal(speed['aria-pressed'],'true');handlers.get('room')({...room,phase:'countdown'});assert.equal(speed.disabled,true);ui.destroy();}finally{globalThis.document=previous;}
});
