import test from 'node:test';
import assert from 'node:assert/strict';
const stubBrowser=()=>({update(){},setStatus(){},open(){},close(){},destroy(){}});
import { standings, invitationURL } from './room-ui.js';
test('实时排名按 lap×长度+s，自己高亮所需 id 保留，无状态仍有稳定位置',()=>{
 const players=[{id:'a',seat:0},{id:'b',seat:1},{id:'c',seat:2}],states=new Map([['a',{lap:1,s:900}],['b',{lap:2,s:1}]]);
 assert.deepEqual(standings(players,states,1000).map(p=>p.id),['b','a','c']);
});
test('邀请链接保留机器人与背景参数，清除单人 capture 和地图参数',()=>{
 const url=new URL(invitationURL('ABC234','https://game.example/?race&room&autopilot&map=hard&capture&sky=dawn'));assert.equal(url.searchParams.get('room'),'ABC234');assert.ok(url.searchParams.has('race'));assert.ok(url.searchParams.has('autopilot'));assert.equal(url.searchParams.get('sky'),'dawn');assert.equal(url.searchParams.has('capture'),false);assert.equal(url.searchParams.has('map'),false);
});
test('房主再来一局只回大厅，等待客人准备后手动开赛，普通返回不准备',async()=>{
 const {mountRoomUI}=await import('./room-ui.js'),{setLang}=await import('../i18n/i18n.js'),previous=globalThis.document,elements=new Map(),handlers=new Map(),sent=[];let returned=0;
 const element=()=>({dataset:{},style:{},append(){},replaceChildren(){},remove(){},focus(){},setAttribute(){},querySelector:q=>get(q),querySelectorAll:()=>[get('[data-rm-track="1"]')]});
 const get=q=>{if(!elements.has(q))elements.set(q,element());return elements.get(q);};get('[data-rm-track="1"]').dataset.rmTrack='1';
 globalThis.document={createElement:element,body:{append(){}},addEventListener(){},removeEventListener(){}};
 const client={id:'a',on(type,fn){handlers.set(type,fn);return ()=>{};},send:m=>sent.push(m)};
 try{
  const ui=mountRoomUI({browserFactory:stubBrowser,client,onReturn:()=>returned++});handlers.get('connection')({connected:true});handlers.get('room')({code:'ABC234',phase:'lobby',hostId:'a',trackId:1,players:[{id:'a',seat:0,name:'甲',ready:false,connected:true}]});
  handlers.get('results')({results:[]});assert.equal(ui.view,'results');assert.equal(get('[data-rm-rematch]').textContent,'再来一局');setLang('en');assert.equal(get('[data-rm-rematch]').textContent,'Race again');assert.equal(get('[data-rm-return]').textContent,'Back to lobby');setLang('zh');get('[data-rm-rematch]').onclick();assert.equal(ui.view,'lobby');assert.equal(returned,1);assert.deepEqual(sent,[]);
  assert.equal(get('[data-rm-track="1"]').disabled,false);get('[data-rm-track="1"]').onclick();assert.deepEqual(sent.at(-1),{type:'pickTrack',trackId:1});
  handlers.get('results')({results:[]});const before=sent.length;get('[data-rm-return]').onclick();assert.equal(sent.length,before);assert.equal(returned,2);ui.destroy();
 }finally{globalThis.document=previous;}
});

test('大厅房主选择难度增删机器人，机器人中英文命名，权限、满员与阶段控制',async()=>{
 const {mountRoomUI}=await import('./room-ui.js'),{setLang}=await import('../i18n/i18n.js'),previous=globalThis.document,elements=new Map(),handlers=new Map(),sent=[];
 const element=()=>({children:[],dataset:{},style:{},append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;},remove(){},setAttribute(k,v){this[k]=v;},querySelector:q=>get(q),querySelectorAll:()=>[get('[data-rm-track="1"]')]});
 const get=q=>{if(!elements.has(q))elements.set(q,element());return elements.get(q);};get('[data-rm-track="1"]').dataset.rmTrack='1';globalThis.document={createElement:element,body:{append(){}},addEventListener(){},removeEventListener(){}};
 const client={id:'a',on(type,fn){handlers.set(type,fn);return ()=>{};},send:m=>sent.push(m)},room={code:'ABC234',phase:'lobby',hostId:'a',trackId:1,players:[{id:'a',name:'甲',connected:true},{id:'b1',bot:true,difficulty:'normal',ownerId:'a',ready:true,connected:true}]};
 try{const ui=mountRoomUI({browserFactory:stubBrowser,client});handlers.get('connection')({connected:true});handlers.get('room')(room);assert.equal(get('[data-rm-bots]').hidden,false);assert.equal(get('[data-rm-add-bot]').textContent,'加机器人');get('[data-rm-difficulty]').value='hard';get('[data-rm-add-bot]').onclick();assert.deepEqual(sent.at(-1),{type:'addBot',difficulty:'hard'});
 const row=get('[data-rm-players]').children[1];assert.equal(row.children[1].textContent,'机器人·普通');assert.ok(row.children[2].textContent.includes('机器人'));assert.equal(row.children[3].textContent,'×');row.children[3].onclick();assert.deepEqual(sent.at(-1),{type:'removeBot',botId:'b1'});
 setLang('en');assert.equal(get('[data-rm-add-bot]').textContent,'Add bot');assert.equal(get('[data-rm-players]').children[1].children[1].textContent,'Bot · Normal');
 handlers.get('results')({results:[{id:'b1',bot:true,difficulty:'normal',rank:1,elapsed:120,bestLap:40}]});assert.equal(get('[data-rm-result-rows]').children[0].children[1].textContent,'Bot · Normal');
 handlers.get('room')({...room,players:Array(6).fill(room.players[1])});assert.equal(get('[data-rm-add-bot]').disabled,true);
 handlers.get('room')({...room,phase:'countdown'});assert.equal(get('[data-rm-add-bot]').disabled,true);assert.equal(get('[data-rm-players]').children[1].children[3],undefined);
 handlers.get('room')({...room,hostId:'other',trackId:3});assert.equal(get('[data-rm-bots]').hidden,true);assert.equal(get('[data-rm-players]').children[1].children[3],undefined);
 assert.match(get('[data-rm-track-summary]').innerHTML,/hard\.webp/,'非房主收起选择器时仍有实景缩略图');
 assert.match(get('[data-rm-track-summary]').innerHTML,/Alpine Loop/);assert.match(get('[data-rm-track-summary]').innerHTML,/Hard/);assert.match(get('[data-rm-track-summary]').innerHTML,/4007 m/);
 setLang('zh');assert.match(get('[data-rm-track-summary]').innerHTML,/阿尔卑斯/);assert.match(get('[data-rm-track-summary]').innerHTML,/困难/);
 assert.equal(get('[data-rm-track="1"]').disabled,true);ui.destroy();
 }finally{setLang('zh');globalThis.document=previous;}
});
test('大厅模式按钮只许房主操作，跟随 room 模式及语言',async()=>{
 const {mountRoomUI}=await import('./room-ui.js'),previous=globalThis.document,elements=new Map(),handlers=new Map(),sent=[];
 const element=()=>({dataset:{},style:{},append(){},replaceChildren(){},remove(){},setAttribute(k,v){this[k]=v;},querySelector:q=>get(q),querySelectorAll:q=>q==='[data-rm-mode]'?['items','speed'].map(m=>get('[data-rm-mode="'+m+'"]')):[get('[data-rm-track="1"]')]});const get=q=>{if(!elements.has(q))elements.set(q,element());return elements.get(q);};get('[data-rm-track="1"]').dataset.rmTrack='1';for(const m of ['items','speed'])get('[data-rm-mode="'+m+'"]').dataset.rmMode=m;globalThis.document={createElement:element,body:{append(){}},addEventListener(){},removeEventListener(){}};
 try{const client={id:'a',on(t,fn){handlers.set(t,fn);return ()=>{};},send:m=>sent.push(m)},ui=mountRoomUI({browserFactory:stubBrowser,client}),room={phase:'lobby',hostId:'a',mode:'items',players:[]};handlers.get('connection')({connected:true});handlers.get('room')(room);const speed=get('[data-rm-mode="speed"]');assert.equal(speed.textContent,'竞速赛');assert.equal(speed.disabled,false);speed.onclick();assert.deepEqual(sent.at(-1),{type:'pickMode',mode:'speed'});handlers.get('room')({...room,mode:'speed',hostId:'b'});assert.equal(speed.disabled,true);assert.equal(speed['aria-pressed'],'true');handlers.get('room')({...room,phase:'countdown'});assert.equal(speed.disabled,true);ui.destroy();}finally{globalThis.document=previous;}
});

test('仅房间大厅挂载展厅，room/连接/语言同步，开赛离开销毁，名牌沿用难度和移除协议',async()=>{
 const {mountRoomUI}=await import('./room-ui.js'),previous=globalThis.document,oldWindow=globalThis.window,elements=new Map(),handlers=new Map(),sent=[],calls=[];let options;
 const element=()=>({dataset:{},style:{setProperty(){}},classList:{toggle(){}},append(){},prepend(){},replaceChildren(){},remove(){},focus(){},setAttribute(){},getBoundingClientRect:()=>({width:342,height:300}),querySelector:q=>get(q),querySelectorAll:()=>[get('[data-rm-track="1"]')]});
 const get=q=>{if(!elements.has(q))elements.set(q,element());return elements.get(q);};get('[data-rm-track="1"]').dataset.rmTrack='1';
 globalThis.document={createElement:element,body:{append(){}},addEventListener(){},removeEventListener(){}};globalThis.window={innerWidth:1440,addEventListener(){},removeEventListener(){}};
 const client={id:'a',on(type,fn){handlers.set(type,fn);return()=>{};},send:m=>sent.push(m),leave(){}};
 try{
  const ui=mountRoomUI({browserFactory:stubBrowser,client,garageFactory:opts=>{options=opts;calls.push('mount');return{update:(...args)=>calls.push(['update',...args]),resize(){},dispose:()=>calls.push('dispose')};}});
  assert.deepEqual(calls,[]);
  const room={code:'ABC234',phase:'lobby',hostId:'a',players:[{id:'a',seat:0,name:'甲'}]};handlers.get('room')(room);handlers.get('connection')({connected:true});
  assert.equal(calls.filter(c=>c==='mount').length,1);assert.equal(calls.at(-1)[3],true);
  get('[data-rm-difficulty]').value='hard';options.onAddBot();options.onRemoveBot('b1');assert.deepEqual(sent,[{type:'addBot',difficulty:'hard'},{type:'removeBot',botId:'b1'}]);
  ui.racing();assert.equal(calls.at(-1),'dispose');handlers.get('room')(room);assert.equal(calls.filter(c=>c==='mount').length,1);
  handlers.get('results')({results:[]});get('[data-rm-return]').onclick();assert.equal(calls.filter(c=>c==='mount').length,2);
  get('[data-rm-leave]').onclick();assert.equal(calls.at(-1),'dispose');ui.destroy();
 }finally{globalThis.document=previous;globalThis.window=oldWindow;}
});


// 保留可观测的 DOM 状态与文档事件，验证交互和销毁，不依赖 WebGL。
function uiFixture() {
 const previous=globalThis.document,elements=new Map(),handlers=new Map(),listeners=new Map(),sent=[];
 const element=()=>({children:[],dataset:{},style:{},open:false,hidden:false,append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;},remove(){},setAttribute(k,v){this[k]=v;},removeAttribute(k){delete this[k];},focus(){this.focused=true;},contains(target){return this===target||this.children.some(child=>child.contains?.(target));},querySelector:q=>get(q),querySelectorAll:()=>[get('[data-rm-track="1"]')]});
 const get=q=>{if(!elements.has(q))elements.set(q,element());return elements.get(q);};get('[data-rm-track="1"]').dataset.rmTrack='1';
 globalThis.document={createElement:element,body:{append(){}},addEventListener:(type,fn)=>listeners.set(type,fn),removeEventListener:(type,fn)=>{if(listeners.get(type)===fn)listeners.delete(type);}};
 const client={id:'a',on(type,fn){handlers.set(type,fn);return ()=>handlers.delete(type);},send:m=>sent.push(m)};
 const room={code:'ABC234',phase:'lobby',hostId:'a',trackId:1,players:[{id:'a',name:'甲',seat:0,ready:false,connected:true}]};
 return {get,client,room,sent,listeners,emit:(type,m)=>handlers.get(type)(m),restore(){globalThis.document=previous;}};
}

test('当前地图只显示服务器 trackId，不给空值假定草甸',async()=>{
 const {mountRoomUI}=await import('./room-ui.js'),f=uiFixture();let ui;
 try{ui=mountRoomUI({browserFactory:stubBrowser,client:f.client});f.emit('room',{...f.room,trackId:null});assert.doesNotMatch(f.get('[data-rm-track-summary]').innerHTML,/草甸|easy.webp/);assert.equal(f.get('[data-rm-laps]').textContent,'');
 f.emit('room',f.room);assert.match(f.get('[data-rm-track-summary]').innerHTML,/草甸/);
 }finally{ui?.destroy();f.restore();}
});

test('三档机器人下拉框仅保留简单普通困难，名牌、排名和结算随中英文同步',async()=>{
 const source=await (await import('node:fs/promises')).readFile(new URL('./room-ui.js',import.meta.url),'utf8');
 assert.deepEqual([...source.matchAll(/<option value="([^"]+)" data-rm-difficulty-option/g)].map(m=>m[1]),['easy','normal','hard']);
 const {mountRoomUI}=await import('./room-ui.js'),{setLang}=await import('../i18n/i18n.js'),f=uiFixture();let ui;
 try{
  ui=mountRoomUI({browserFactory:stubBrowser,client:f.client});f.emit('connection',{connected:true});
  const bot={id:'b1',seat:1,bot:true,difficulty:'hard',ownerId:'a',connected:true,ready:true};f.emit('room',{...f.room,players:[...f.room.players,bot]});
  for(const [difficulty,label] of [['easy','简单'],['normal','普通'],['hard','困难']])assert.equal(f.get(`[data-rm-difficulty-option="${difficulty}"]`).textContent,label);
  f.get('[data-rm-difficulty]').value='hard';f.get('[data-rm-add-bot]').onclick();assert.deepEqual(f.sent.at(-1),{type:'addBot',difficulty:'hard'});
  assert.equal(f.get('[data-rm-players]').children[1].children[1].textContent,'机器人·困难');
  ui.update([bot],new Map(),1000);assert.equal(f.get('[data-rm-ranks]').children[0].children[2].textContent,'机器人·困难');
  setLang('en');assert.equal(f.get('[data-rm-difficulty-option="hard"]').textContent,'Hard');assert.equal(f.get('[data-rm-players]').children[1].children[1].textContent,'Bot · Hard');
  f.emit('results',{results:[{...bot,rank:1,elapsed:105,bestLap:35}]});assert.equal(f.get('[data-rm-result-rows]').children[0].children[1].textContent,'Bot · Hard');
 }finally{ui?.destroy();setLang('zh');f.restore();}
});

test('房主开始比赛按钮、人数与准备原因、中英文切换、房主名牌和访客准备',async()=>{
 const {mountRoomUI}=await import('./room-ui.js'),{setLang}=await import('../i18n/i18n.js'),f=uiFixture();let ui;
 try{
  ui=mountRoomUI({browserFactory:stubBrowser,client:f.client});f.emit('connection',{connected:true});f.emit('room',f.room);
  const button=f.get('[data-rm-ready]'),reason=f.get('[data-rm-start-reason]');assert.equal(button.textContent,'开始比赛');assert.equal(button.disabled,true);assert.equal(reason.textContent,'至少需要 2 名参赛者');
  const players=[...f.room.players,{id:'b',name:'乙',connected:true,ready:false},{id:'c',name:'丙',connected:true,ready:false},{id:'b1',bot:true,connected:true,ready:false}];
  f.emit('room',{...f.room,players});assert.equal(reason.textContent,'等待 2 人准备');assert.equal(button.disabled,true);
  setLang('en');assert.equal(button.textContent,'Start race');assert.equal(reason.textContent,'Waiting for 2 players to get ready');
  f.emit('room',{...f.room,players:players.map(p=>({...p,ready:p.id!=='a'}))});assert.equal(button.disabled,false);assert.equal(reason.hidden,true);button.onclick();assert.deepEqual(f.sent.at(-1),{type:'start'});
  setLang('zh');assert.equal(f.get('[data-rm-players]').children[0].children[2].textContent,'房主');
  f.emit('room',{...f.room,hostId:'b',players});assert.equal(button.textContent,'准备');assert.equal(button.disabled,false);button.onclick();assert.deepEqual(f.sent.at(-1),{type:'ready',on:true});
  f.emit('room',{...f.room,hostId:'b',players:players.map(p=>({...p,ready:true}))});assert.equal(button.textContent,'取消准备');button.onclick();assert.deepEqual(f.sent.at(-1),{type:'ready',on:false});
  f.emit('results',{results:[]});f.get('[data-rm-rematch]').onclick();assert.deepEqual(f.sent.at(-1),{type:'ready',on:true});
 }finally{ui?.destroy();setLang('zh');f.restore();}
});

test('断线玩家优先显示等待重连，宽限期不被人数或准备原因掩盖',async()=>{
 const {mountRoomUI}=await import('./room-ui.js'),{setLang}=await import('../i18n/i18n.js'),f=uiFixture();let ui;
 try{ui=mountRoomUI({browserFactory:stubBrowser,client:f.client});f.emit('connection',{connected:true});f.emit('room',{...f.room,players:[...f.room.players,{id:'b',name:'乙',connected:false,ready:false},{id:'c',name:'丙',connected:true,ready:false}]});
 assert.equal(f.get('[data-rm-ready]').disabled,true);assert.equal(f.get('[data-rm-start-reason]').textContent,'等待 乙 重连');setLang('en');assert.equal(f.get('[data-rm-start-reason]').textContent,'Waiting for 乙 to reconnect');
 }finally{ui?.destroy();setLang('zh');f.restore();}
});

test('选图自动收起，弹框内部不关闭，房主和非房主均可点外部、Esc、关闭按钮并清理监听',async()=>{
 const {mountRoomUI}=await import('./room-ui.js'),{setLang}=await import('../i18n/i18n.js'),f=uiFixture();let ui;
 try{
  ui=mountRoomUI({browserFactory:stubBrowser,client:f.client});f.emit('connection',{connected:true});f.emit('room',f.room);
  const details=f.get('.rm-track-details'),picker=f.get('.rm-track-picker'),close=f.get('[data-rm-track-close]');
  const open=()=>{details.open=true;details.ontoggle();assert.equal(picker.hidden,false);};
  open();f.get('[data-rm-track="1"]').onclick();assert.equal(details.open,false);assert.equal(picker.hidden,true);assert.deepEqual(f.sent.at(-1),{type:'pickTrack',trackId:1});
  for(const hostId of ['a','b']){
   f.emit('room',{...f.room,hostId});open();f.listeners.get('pointerdown')({target:picker});assert.equal(details.open,true);f.listeners.get('pointerdown')({target:details});assert.equal(details.open,true);f.listeners.get('pointerdown')({target:{}});assert.equal(details.open,false);
   open();f.listeners.get('keydown')({key:'Enter'});assert.equal(details.open,true);f.listeners.get('keydown')({key:'Escape',preventDefault(){}});assert.equal(details.open,false);assert.equal(f.get('[data-rm-track-summary]').focused,true);
   open();assert.equal(close['aria-label'],'关闭地图选择');assert.equal(close.disabled,false);close.onclick();assert.equal(details.open,false);
  }
  setLang('en');assert.equal(close['aria-label'],'Close track picker');ui.destroy();ui=null;assert.equal(f.listeners.size,0);
 }finally{ui?.destroy();setLang('zh');f.restore();}
});

test('音乐阶段随进入大厅、倒计时、比赛、返回和离开更新，销毁停止',async()=>{
 const {mountRoomUI}=await import('./room-ui.js'),f=uiFixture(),phases=[];f.client.leave=()=>{};let ui;
 try{ui=mountRoomUI({browserFactory:stubBrowser,client:f.client,setMusicPhase:phase=>phases.push(phase)});assert.equal(phases.at(-1),'off');
 f.emit('room',f.room);assert.equal(phases.at(-1),'lobby');f.emit('room',{...f.room,phase:'countdown'});assert.equal(phases.at(-1),'countdown');
 ui.racing();assert.equal(phases.at(-1),'racing');f.emit('results',{results:[]});assert.equal(phases.at(-1),'off');
 f.emit('room',f.room);assert.equal(phases.at(-1),'off');f.get('[data-rm-return]').onclick();assert.equal(phases.at(-1),'lobby');
 f.get('[data-rm-leave]').onclick();assert.equal(phases.at(-1),'off');ui.destroy();ui=null;assert.equal(phases.at(-1),'off');
 }finally{ui?.destroy();f.restore();}
});

test('加锁房邀请附带当前密码，公开房不保留地址中的旧密码',()=>{
 const locked=new URL(invitationURL('ABC234','https://game.example/?race&room&pw=0000','2468',true));assert.equal(locked.searchParams.get('pw'),'2468');
 const open=new URL(invitationURL('ABC234','https://game.example/?pw=0000'));assert.equal(open.searchParams.has('pw'),false);
});

test('列表连接不自动建房，回调带昵称与创建参数，错误和成功只结算当前加入',async()=>{
 const {mountRoomUI}=await import('./room-ui.js'),f=uiFixture(),attempts=[],updates=[];let callbacks,browsed=0,ui;
 f.client.browse=()=>browsed++;f.client.connect=m=>attempts.push(m);
 f.get('[data-rm-name]').value='  新车手  ';
 try{
  ui=mountRoomUI({client:f.client,browserFactory:options=>{callbacks=options;return {...stubBrowser(),update:m=>updates.push(m)};}});
  assert.equal(browsed,1);assert.deepEqual(attempts,[]);assert.equal(f.get('[data-rm-browser-page]').hidden,false);assert.equal(f.get('[data-rm-lobby]').hidden,true);
  f.emit('rooms',{rooms:[{code:'ABC234',locked:true}],online:1});assert.equal(updates.at(-1).online,1);
  const failed=callbacks.onJoin({code:'ABC234',password:'0000'});assert.deepEqual(attempts.at(-1),{name:'新车手',roomCode:'ABC234',password:'0000'});
  f.emit('error',{code:'BAD_PASSWORD'});assert.deepEqual(await failed,{ok:false,code:'BAD_PASSWORD'});
  const joined=callbacks.onCreate({name:'夜间竞速',locked:true,password:'2468'});assert.deepEqual(attempts.at(-1),{name:'新车手',create:{name:'夜间竞速',locked:true,password:'2468'}});
  f.emit('room',{...f.room,name:'夜间竞速',locked:true});assert.deepEqual(await joined,{ok:true});assert.equal(f.get('#rm-title').textContent,'🔒 夜间竞速');assert.equal(f.get('[data-rm-browser-page]').hidden,true);
 }finally{ui?.destroy();f.restore();}
});

test('手机可见展厅标题与大厅标题同步显示房名和锁',async()=>{
 const {mountRoomUI}=await import('./room-ui.js'),f=uiFixture();let ui;
 try{ui=mountRoomUI({client:f.client,browserFactory:stubBrowser});f.emit('room',{...f.room,name:'好友的房间',locked:true});
 assert.equal(f.get('[data-rm-garage-title]').textContent,'🔒 好友的房间');
 }finally{ui?.destroy();f.restore();}
});
