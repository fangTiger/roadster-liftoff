import test from 'node:test';
import assert from 'node:assert/strict';
import { mountRoomRace } from './room-race.js';
test('房间循环等待 startAt、每帧追 240 步、15Hz 上报并可靠补发完赛',async()=>{
 let now=1000,snapshot={step:0,car:{x:0,y:0,z:0,yaw:0,pitch:0,vx:0,vz:0,steer:0,drifting:false,boostTime:0,near:{s:0}},race:{lap:1,finished:false}},steps=0;
 const handlers=new Map(),sent=[],client={id:'a',serverNow:()=>now,on(type,fn){handlers.set(type,fn);return ()=>{};},send:m=>{sent.push(m);return true;},leave(){}},ui={room:{phase:'countdown',players:[{id:'a',seat:0},{id:'b',seat:1}]},racing(){},update(){},destroy(){},fail(){assert.fail('不应加载失败');}};
 const scene={add(){}},remote={root:{},update(){},dispose(){}};
 const loop=mountRoomRace({engine:{scene,render(){}},params:new URLSearchParams(),client,ui,requestFrame:()=>{},createRemote:async()=>remote,setup:async()=>{},clear(){},simulate(){snapshot={...snapshot,step:snapshot.step+1};steps++;},getState:()=>snapshot,getTrack:()=>({length:1000,at:s=>({x:0,y:0,z:s,tx:0,tz:1,bank:0})}),getBits:()=>0,render(){}});
 await handlers.get('start')({startAt:2500,trackId:1,laps:3,grid:[{id:'a',seat:0},{id:'b',seat:1}]});loop.frame(0);assert.equal(steps,0);
 now=12500;ui.room.phase='racing';loop.frame(100);assert.equal(steps,240);assert.equal(sent.filter(m=>m.type==='state').length,1);loop.frame(110);assert.equal(steps,480);assert.equal(sent.filter(m=>m.type==='state').length,1);
 now+=67;loop.frame(180);assert.equal(sent.filter(m=>m.type==='state').length,2);
 snapshot.race={lap:3,finished:true,elapsed:117,bestLap:38,lapTimes:[38,39,40]};loop.frame(200);assert.equal(sent.at(-1).type,'finish');now+=1001;loop.frame(210);assert.equal(sent.filter(m=>m.type==='finish').length,2);
 handlers.get('results')({results:[]});const before=steps;loop.frame(220);assert.equal(steps,before);loop.destroy();
});
test('加载期间已收到结算时，迟到的 setup 不得覆盖结果或恢复比赛',async()=>{
 let finishSetup,racing=0,cleared=0;const handlers=new Map(),client={id:'a',serverNow:()=>1000,on(type,fn){handlers.set(type,fn);return ()=>{};},send(){},leave(){}},ui={room:{players:[]},view:'results',racing(){racing++;},update(){},destroy(){},fail(){assert.fail('不应加载失败');}};
 const loop=mountRoomRace({engine:{scene:{add(){}},render(){}},params:new URLSearchParams(),client,ui,requestFrame:()=>{},setup:()=>new Promise(resolve=>{finishSetup=resolve;}),clear(){cleared++;},simulate(){assert.fail('结果后不应推进');},getState:()=>({step:0}),getTrack:()=>({length:1000}),getBits:()=>0,render(){}});
 const pending=handlers.get('start')({startAt:2500,trackId:1,laps:3,grid:[{id:'a',seat:0}]});await Promise.resolve();handlers.get('results')({results:[]});finishSetup();await pending;assert.equal(racing,0);assert.equal(cleared,2);loop.frame(0);loop.destroy();
});
test('远端模型加载途中玩家离开，迟到的模型必须释放而非加回场景',async()=>{
 let finishRemote,added=0,disposed=0;const handlers=new Map(),client={id:'a',on(type,fn){handlers.set(type,fn);return ()=>{};},leave(){}},ui={room:{players:[{id:'b',name:'乙',seat:1}]},racing(){},destroy(){},fail(){assert.fail('不应加载失败');}};
 const loop=mountRoomRace({engine:{scene:{add(){added++;}},render(){}},params:new URLSearchParams(),client,ui,requestFrame:()=>{},setup:async()=>{},clear(){},createRemote:()=>new Promise(resolve=>{finishRemote=resolve;}),getTrack:()=>({length:1000,at:s=>({x:0,z:s,tx:0,tz:1})})});
 const pending=handlers.get('start')({startAt:2500,trackId:1,laps:3,grid:[{id:'a',seat:0},{id:'b',seat:1}]});await Promise.resolve();await Promise.resolve();handlers.get('left')({id:'b'});finishRemote({root:{},dispose(){disposed++;}});await pending;assert.equal(added,0);assert.equal(disposed,1);loop.destroy();
});
test('按远端 step 建立 simT，为当前步提供接触位置，过滤保护、离地和掉线，必发本地 air/ghost',async()=>{
 let now=3600,startOptions,rendered,snapshot={step:132,car:{x:0,y:0,z:0,yaw:0,pitch:0,vx:0,vz:0,steer:0,grounded:false,near:{s:0}},race:{lap:1,finished:false}};
 const handlers=new Map(),sent=[],client={id:'a',serverNow:()=>now,on(type,fn){handlers.set(type,fn);return ()=>{};},send:m=>sent.push(m),leave(){}},ui={room:{players:[{id:'a'},{id:'b'}]},racing(){},update(){},destroy(){},fail(){assert.fail('加载失败');}};
 const loop=mountRoomRace({engine:{scene:{add(){}},render(){}},params:new URLSearchParams(),client,ui,requestFrame:()=>{},setup:async(_,opts)=>{startOptions=opts;},clear(){},createRemote:async()=>({root:{},update:s=>{rendered=s;},dispose(){}}),getTrack:()=>({length:1000,at:s=>({x:0,y:0,z:s,tx:0,tz:1})}),getState:()=>snapshot,getGhost:()=>true,getBits:()=>0,simulate(){snapshot={...snapshot,step:snapshot.step+1};},render(){}});
 await handlers.get('start')({startAt:2500,trackId:1,laps:3,grid:[{id:'a',seat:0},{id:'b',seat:1}]});
 assert.equal(startOptions.contactId,'a');
 const peer={id:'b',seq:1,step:120,serverT:3590,x:10,y:0,z:0,yaw:0,pitch:0,vx:20,vz:0,steer:0,lap:1,s:10,ghost:false,air:false};
 handlers.get('peer')(peer);assert.equal(startOptions.contacts(132)[0].x,12);assert.equal(startOptions.contacts(240)[0].x,15);
 loop.frame(0);assert.equal(rendered.x,10);assert.equal(sent[0].air,true);assert.equal(sent[0].ghost,true);
 for(const patch of [{ghost:true},{air:true}]){handlers.get('peer')({...peer,seq:++peer.seq,...patch});assert.deepEqual(startOptions.contacts(132),[]);}
 handlers.get('peer')({...peer,seq:10});now=6591;assert.deepEqual(startOptions.contacts(132),[]);
 handlers.get('left')({id:'b'});assert.deepEqual(startOptions.contacts(132),[]);loop.destroy();
});
test('比赛数字键只发合法表情，忽略输入焦点；广播显示自己的与远端车顶，结算和销毁清理',async()=>{
 const THREE=await import('three'),previous=globalThis.document,text=[];
 globalThis.document={createElement:()=>({getContext:()=>({clearRect(){},fillText:s=>text.push(s)})})};
 const handlers=new Map(),sent=[],listeners=new Map(),selfRoot=new THREE.Group(),peerRoot=new THREE.Group(),scene=new THREE.Scene();scene.add(selfRoot);
 let now=2500,paused=false,snapshot={step:0,car:{x:0,y:0,z:0,yaw:0,pitch:0,vx:0,vz:0,steer:0,grounded:true,near:{s:0}},race:{lap:1,frozen:true,finished:false}};
 const inputTarget={addEventListener:(type,fn)=>listeners.set(type,fn),removeEventListener:(type,fn)=>{if(listeners.get(type)===fn)listeners.delete(type);}},client={id:'a',serverNow:()=>now,on(type,fn){handlers.set(type,fn);return ()=>handlers.delete(type);},send:m=>sent.push(m),leave(){}},ui={room:{players:[]},view:'lobby',racing(){this.view='racing';},update(){},destroy(){},fail(){assert.fail('不应加载失败');}};
 const loop=mountRoomRace({engine:{scene,render(){}},selfRoot,inputTarget,params:new URLSearchParams(),client,ui,requestFrame:()=>{},setup:async()=>{},clear(){},createRemote:async()=>({root:peerRoot,update(){},dispose(){peerRoot.removeFromParent();}}),getTrack:()=>({length:1000,at:s=>({x:0,y:0,z:s,tx:0,tz:1})}),getState:()=>snapshot,getBits:()=>0,simulate(){snapshot.step++;},render(){},isPaused:()=>paused});
 const press=(code,target={},repeat=false)=>listeners.get('keydown')?.({code,target,repeat,preventDefault(){}});
 try{
  press('Digit1');assert.equal(sent.length,0);
  await handlers.get('start')({startAt:2500,trackId:1,laps:3,grid:[{id:'a',seat:0},{id:'b',seat:1}]});press('Digit1');assert.equal(sent.length,0);
  snapshot.race.frozen=false;ui.room.phase='racing';
  for(const tagName of ['INPUT','TEXTAREA','SELECT'])press('Digit1',{tagName});press('Digit1',{isContentEditable:true});press('Digit1',{},true);press('Numpad1');press('Digit7');paused=true;press('Digit1');paused=false;assert.equal(sent.length,0);
  for(let id=1;id<=6;id++)press('Digit'+id);assert.deepEqual(sent,Array.from({length:6},(_,i)=>({type:'emote',id:i+1})));assert.equal(selfRoot.children.length,0);
  handlers.get('emote')({from:'a',id:1});handlers.get('emote')({from:'b',id:6});handlers.get('emote')({from:'stranger',id:1});assert.deepEqual(text,['👍','🙏']);assert.ok(selfRoot.children.some(c=>c.isSprite));assert.ok(peerRoot.children.some(c=>c.isSprite));
  loop.frame(0);loop.frame(2000);assert.equal(selfRoot.children[0].visible,false);assert.equal(peerRoot.children[0].visible,false);
  handlers.get('emote')({from:'a',id:2});handlers.get('emote')({from:'b',id:3});
  handlers.get('results')({results:[]});assert.equal(selfRoot.children.length,0);assert.equal(peerRoot.children.length,0);const before=sent.length;press('Digit1');assert.equal(sent.length,before);
  loop.destroy();assert.equal(listeners.size,0);assert.equal(handlers.size,0);
 }finally{globalThis.document=previous;}
});

test('房主机器人同目标步数推进，直接参与接触，15Hz 代发并重试完赛直到结算',async()=>{
 const {buildTrack}=await import('./track/build.js'),{default:def}=await import('./track/data/meadow.js'),{createSession}=await import('./sim/session.js'),{gridSpawn}=await import('./grid.js');
 const track=buildTrack(def),handlers=new Map(),sent=[],shown=new Map(),players=[{id:'a',seat:0},{id:'b1',seat:1,bot:true,ownerId:'a',difficulty:'normal',connected:true},{id:'b2',seat:2,bot:true,ownerId:'a',difficulty:'hard',connected:true},{id:'remote',seat:3}];
 let now=2500,session,step=0,options;
 const client={id:'a',serverNow:()=>now,on(type,fn){handlers.set(type,fn);return ()=>{};},send:m=>sent.push(m),leave(){}},ui={room:{hostId:'a',players},view:'lobby',racing(){this.view='racing';},update(){},destroy(){},fail(){assert.fail('加载失败');}};
 const loop=mountRoomRace({engine:{scene:{add(){}},render(){}},params:new URLSearchParams('autopilot'),client,ui,requestFrame:()=>{},setup:async(_,opts)=>{options=opts;session=createSession(track,{...opts,spawn:gridSpawn(track,opts.seat)});},clear(){},getTrack:()=>track,getState:()=>({step,car:session.car,race:session.race}),getGhost:()=>session.ghost,getBits:()=>0,simulate(bits){session.step(bits);step++;},render(){},createRemote:async player=>({root:{},update:s=>shown.set(player.id,s),dispose(){}})});
 await handlers.get('start')({startAt:2500,trackId:1,laps:3,grid:players.map(({id,seat})=>({id,seat}))});
 loop.frame(0);assert.equal(sent.filter(m=>m.type==='botState').length,2);assert.deepEqual(options.contacts(0).filter(p=>p.id.startsWith('b')).map(p=>p.id),['b1','b2']);assert.equal(options.contacts(0).find(p=>p.id==='b1').x,gridSpawn(track,1).x);
 now+=20;loop.frame(20);assert.equal(sent.filter(m=>m.type==='botState').length,2);
 now+=80;loop.frame(100);assert.equal(sent.filter(m=>m.type==='botState').length,4);assert.ok(sent.filter(m=>m.type==='botState').slice(-2).every(m=>m.step===step));
 const remote={id:'remote',seq:1,step,serverT:now,x:10,y:0,z:0,yaw:0,pitch:0,vx:20,vz:0,steer:0,lap:1,s:10,ghost:false,air:false};handlers.get('peer')(remote);assert.equal(options.contacts(step+12).find(p=>p.id==='remote').x,12);
 for(let i=0;i<120;i++){now+=2000;loop.frame(now);const states=sent.filter(m=>m.type==='botState').slice(-2);assert.ok(states.every(m=>m.step===step));}
 assert.ok(sent.some(m=>m.type==='botFinish'&&m.botId==='b1'));assert.ok(sent.some(m=>m.type==='botFinish'&&m.botId==='b2'));assert.ok(shown.get('b1'));assert.ok(shown.get('b2'));
 const before=sent.filter(m=>m.type==='botFinish').length;now+=1000;loop.frame(now);assert.equal(sent.filter(m=>m.type==='botFinish').length,before+2);
 handlers.get('results')({results:[]});const total=sent.length;now+=1000;loop.frame(now);assert.equal(sent.length,total);loop.destroy();
});
test('房主身份移交后停止旧机器人代发',async()=>{
 const {buildTrack}=await import('./track/build.js'),{default:def}=await import('./track/data/meadow.js');const track=buildTrack(def),handlers=new Map(),sent=[];
 let now=2500,snapshot={step:0,car:{x:0,y:0,z:0,yaw:0,pitch:0,vx:0,vz:0,steer:0,grounded:true,near:{s:0}},race:{lap:1,finished:false}};
 const players=[{id:'a',seat:0},{id:'b1',seat:1,bot:true,ownerId:'a',difficulty:'normal',connected:true}],client={id:'a',serverNow:()=>now,on(t,fn){handlers.set(t,fn);return ()=>{};},send:m=>sent.push(m),leave(){}},ui={room:{hostId:'a',players},racing(){},update(){},destroy(){},fail(){assert.fail('加载失败');}};
 const loop=mountRoomRace({engine:{scene:{add(){}},render(){}},params:new URLSearchParams(),client,ui,requestFrame:()=>{},setup:async()=>{},clear(){},getTrack:()=>track,getState:()=>snapshot,getBits:()=>0,simulate(){snapshot.step++;},render(){},createRemote:async()=>({root:{},update(){},dispose(){}})});
 await handlers.get('start')({startAt:2500,trackId:1,laps:3,grid:players});loop.frame(0);assert.equal(sent.filter(m=>m.type==='botState').length,1);
 handlers.get('room')({hostId:'other',players:players.map(p=>p.bot?{...p,connected:false}:p),phase:'racing'});now+=1000;loop.frame(1000);assert.equal(sent.filter(m=>m.type==='botState').length,1);loop.destroy();
});

test('非房主开局只按 peer 渲染机器人，不代发状态或完赛',async()=>{
 const handlers=new Map(),sent=[],shown=new Map(),players=[{id:'a',seat:0},{id:'b',seat:1},{id:'b1',seat:2,bot:true,ownerId:'a',difficulty:'normal',connected:true}];let now=2500,step=0;
 const snapshot={car:{x:0,y:0,z:0,yaw:0,pitch:0,vx:0,vz:0,steer:0,grounded:true,near:{s:0}},race:{lap:1,finished:false}},client={id:'b',serverNow:()=>now,on(t,fn){handlers.set(t,fn);return ()=>{};},send:m=>sent.push(m),leave(){}},ui={room:{hostId:'a',players},racing(){},update(){},destroy(){},fail(){assert.fail('加载失败');}};
 const loop=mountRoomRace({engine:{scene:{add(){}},render(){}},params:new URLSearchParams(),client,ui,requestFrame:()=>{},setup:async()=>{},clear(){},getTrack:()=>({length:1000,at:s=>({x:0,y:0,z:s,tx:0,tz:1})}),getState:()=>({...snapshot,step}),getBits:()=>0,simulate(){step++;},render(){},createRemote:async p=>({root:{},update:s=>shown.set(p.id,s),dispose(){}})});
 await handlers.get('start')({startAt:2500,trackId:1,laps:3,grid:players});handlers.get('peer')({id:'b1',seq:1,step:0,serverT:2500,x:123,y:0,z:0,vx:0,vz:0});now+=1000;loop.frame(0);assert.equal(shown.get('b1').x,123);assert.ok(sent.length>0);assert.ok(sent.every(m=>!['botState','botFinish'].includes(m.type)));loop.destroy();
});
test('异步加载期间原房主断线并恢复，不复活已经 DNF 的机器人',async()=>{
 const {buildTrack}=await import('./track/build.js'),{default:def}=await import('./track/data/meadow.js'),track=buildTrack(def),handlers=new Map(),sent=[],players=[{id:'a',seat:0},{id:'b1',seat:1,bot:true,ownerId:'a',difficulty:'normal',connected:true}];let finishSetup;
 const snapshot={step:0,car:{x:0,y:0,z:0,yaw:0,pitch:0,vx:0,vz:0,steer:0,grounded:true,near:{s:0}},race:{lap:1,finished:false}},client={id:'a',serverNow:()=>2500,on(t,fn){handlers.set(t,fn);return ()=>{};},send:m=>sent.push(m),leave(){}},ui={room:{hostId:'a',players},racing(){},update(){},destroy(){},fail(){assert.fail('加载失败');}};
 const loop=mountRoomRace({engine:{scene:{add(){}},render(){}},params:new URLSearchParams(),client,ui,requestFrame:()=>{},setup:()=>new Promise(resolve=>{finishSetup=resolve;}),clear(){},getTrack:()=>track,getState:()=>snapshot,getBits:()=>0,simulate(){snapshot.step++;},render(){},createRemote:async()=>({root:{},update(){},dispose(){}})});
 const pending=handlers.get('start')({startAt:2500,trackId:1,laps:3,grid:players});await Promise.resolve();ui.room={hostId:'a',phase:'racing',players:players.map(p=>p.bot?{...p,connected:false}:p)};handlers.get('room')(ui.room);finishSetup();await pending;loop.frame(0);assert.equal(sent.filter(m=>m.type==='botState').length,0);loop.destroy();
});
test('道具赛固定步拾取与 E 按下沿、机器人自动使用；竞速赛不创建道具框架',async()=>{
 const {buildTrack}=await import('./track/build.js'),{default:def}=await import('./track/data/meadow.js'),{createSession}=await import('./sim/session.js');const track=buildTrack(def),handlers=new Map(),listeners=new Map(),sent=[],effects=[];let now=2500,step=0,session,created=0,disposed=0;
 const players=[{id:'a',seat:0,connected:true},{id:'b1',seat:1,bot:true,ownerId:'a',difficulty:'normal',connected:true}],client={id:'a',serverNow:()=>now,on(t,fn){handlers.set(t,fn);return ()=>{};},send:m=>sent.push(m),leave(){}},ui={view:'lobby',room:{hostId:'a',players},racing(){this.view='racing';},update(){},destroy(){},fail(){assert.fail('道具加载失败');}};
 const inputTarget={addEventListener:(t,fn)=>listeners.set(t,fn),removeEventListener(){}},loop=mountRoomRace({engine:{scene:{add(){}},render(){}},params:new URLSearchParams(),inputTarget,client,ui,requestFrame:()=>{},setup:async()=>{session=createSession(track);step=0;},clear(){},getTrack:()=>track,getState:()=>({step,car:session.car,race:session.race}),getBits:()=>0,simulate(bits){session.step(bits);step++;},render(){},applyEffect:kind=>{effects.push(kind);session.applyEffect(kind);},random:()=>.6,createItemsFx:()=>{created++;return {update(){},burst(){},dispose(){disposed++;}};},createRemote:async()=>({root:{},update(){},dispose(){}})});
 const start={startAt:2500,mode:'items',trackId:1,laps:3,grid:players};await handlers.get('start')(start);assert.equal(created,1);assert.equal(handlers.has('item'),true);now+=3100;loop.frame(0);
 const {itemBoxes}=await import('./sim/items.js'),box=itemBoxes(track)[0];Object.assign(session.car,{x:box.x,z:box.z,y:box.y,grounded:true,vx:0,vz:0,near:track.nearest(box.x,box.z)});now+=20;loop.frame(20);assert.equal(loop.itemSlot.kind,'nitro');now+=1100;loop.frame(1120);const press=(repeat=false)=>listeners.get('keydown')({code:'KeyE',repeat,target:{},preventDefault(){}});press(true);assert.equal(effects.length,0);press();press(true);assert.deepEqual(effects,['nitro']);assert.equal(loop.itemSlot.kind,null);
 handlers.get('results')({results:[]});assert.equal(disposed,1);await handlers.get('start')({...start,mode:'speed',startAt:now+1000});assert.equal(created,1);assert.equal(loop.itemSlot,null);loop.destroy();
});

test('房间导弹接入预警、目标命中、远端爆炸与状态字段，掉线取消锁定',async()=>{
 const handlers=new Map(),sent=[],sounds=[],effects=[],bursts=[],players=[{id:'a',seat:0,connected:true},{id:'b',seat:1,connected:true}];let now=8500,snapshot={step:720,car:{x:0,y:0,z:0,yaw:0,pitch:0,vx:0,vz:0,steer:0,grounded:true,near:{s:0},spinTime:1,shieldTime:0},race:{lap:1,finished:false,frozen:false}};
 const {buildTrack}=await import('./track/build.js'),{default:def}=await import('./track/data/meadow.js'),track=buildTrack(def),client={id:'a',serverNow:()=>now,on(t,fn){handlers.set(t,fn);return ()=>{};},send:m=>sent.push(m),leave(){}},ui={view:'lobby',room:{players},racing(){this.view='racing';},update(){},destroy(){},fail(){assert.fail('导弹加载失败');}};
 const loop=mountRoomRace({engine:{scene:{add(){}},render(){}},params:new URLSearchParams(),client,ui,requestFrame:()=>{},setup:async()=>{},clear(){},getTrack:()=>track,getState:()=>snapshot,getBits:()=>0,simulate(){snapshot.step++;},render(){},applyEffect:k=>effects.push(k),playSound:k=>sounds.push(k),createItemsFx:()=>({update(){},burst(){},explode:(...args)=>bursts.push(args),dispose(){}}),createRemote:async()=>({root:{},update(){},dispose(){}})});
 await handlers.get('start')({startAt:2500,trackId:1,laps:3,mode:'items',grid:players});const missile={type:'item',kind:'missile',itemId:'b-1',from:'b',target:'a',x:0,z:0,yaw:0,firedAt:6};handlers.get('item')(missile);assert.equal(loop.missileLocked,true);assert.ok(sounds.includes('raceMissileWarning'));
 now=10000;loop.frame(0);assert.deepEqual(effects,['spin']);assert.equal(sent.filter(m=>m.type==='hit').length,1);assert.equal(loop.missileLocked,false);assert.equal(sent.find(m=>m.type==='state').spinning,true);assert.equal(sent.find(m=>m.type==='state').finished,false);
 handlers.get('hitAt')({itemId:'b-1',by:'a',shielded:false});handlers.get('hitAt')({itemId:'b-1',by:'a',shielded:false});assert.equal(bursts.length,1);assert.ok(sounds.includes('raceExplosion'));
 for(const [seq,step,x] of [[1,888,100],[2,900,104]])handlers.get('peer')({id:'b',seq,step,x,y:0,z:0,yaw:0,vx:40,vz:0,serverT:now,lap:1,s:x});handlers.get('hitAt')({itemId:'b-3',by:'b',shielded:false});assert.equal(bursts[1][0].x,100);
 handlers.get('item')({...missile,itemId:'b-2',target:'b',firedAt:7.5});handlers.get('room')({players:players.map(p=>({...p,connected:p.id!=='b'}))});now+=1500;loop.frame(1500);assert.equal(sent.filter(m=>m.type==='hit').length,1);loop.destroy();assert.equal(loop.missileLocked,false);
});

test('异步加载期间收到锁定后断线，恢复加载不能复活导弹或对自己执行 spin',async()=>{
 const handlers=new Map(),effects=[],players=[{id:'a',seat:0,connected:true}];let finishSetup,now=2500,step=720;
 const client={id:'a',serverNow:()=>now,on(t,fn){handlers.set(t,fn);return ()=>{};},send(){},leave(){}},ui={room:{players},view:'racing',racing(){},update(){},destroy(){},fail(){assert.fail('加载失败');}},track={length:1000,features:[],at:s=>({x:0,y:0,z:s,tx:0,tz:1,w:10,bank:0}),surfaceAt:()=>0},snapshot={car:{x:0,y:0,z:0,yaw:0,grounded:true,near:{s:0}},race:{lap:1,frozen:false,finished:false}};
 const loop=mountRoomRace({engine:{scene:{add(){}},render(){}},params:new URLSearchParams(),client,ui,requestFrame:()=>{},setup:()=>new Promise(resolve=>finishSetup=resolve),clear(){},getTrack:()=>track,getState:()=>({...snapshot,step}),getBits:()=>0,simulate(){step++;},applyEffect:k=>effects.push(k),render(){},createItemsFx:()=>({update(){},dispose(){}})});
 const pending=handlers.get('start')({startAt:2500,trackId:1,laps:3,mode:'items',grid:players});await Promise.resolve();handlers.get('item')({type:'item',kind:'missile',itemId:'b-1',target:'a',x:0,z:0,yaw:0,firedAt:6});handlers.get('connection')({connected:false});handlers.get('connection')({connected:true});finishSetup();await pending;now=10000;loop.frame(0);assert.deepEqual(effects,[]);loop.destroy();
});

test('房间每帧提供其他车颜色与位置、瞄准进度和后退输入，离开后移除',async()=>{
 const handlers=new Map(),listeners=new Map(),sent=[],updates=[],players=[{id:'a',seat:0},{id:'b',seat:1},{id:'c',seat:2,color:'#123456'}];let bits=0,now=2500;
 const snapshot={step:0,car:{x:0,y:0,z:20,yaw:0,vx:0,vz:0,grounded:true,near:{s:20}},race:{lap:2,frozen:false,finished:false}},track={length:1000,features:[],at:s=>({x:0,y:0,z:s,tx:0,tz:1,w:10,bank:0}),surfaceAt:()=>0},client={id:'a',serverNow:()=>now,on(t,fn){handlers.set(t,fn);return ()=>{};},send:m=>sent.push(m),leave(){}},ui={room:{players},view:'racing',racing(){},update(){},destroy(){},fail(){assert.fail('加载失败');}},loop=mountRoomRace({engine:{scene:{add(){}},render(){}},params:new URLSearchParams(),client,ui,inputTarget:{addEventListener:(t,fn)=>listeners.set(t,fn),removeEventListener(){}},requestFrame:()=>{},setup:async()=>{},clear(){},simulate(){snapshot.step++;},render(){},getState:()=>snapshot,getTrack:()=>track,getBits:()=>bits,createRemote:async()=>({root:{},update(){},dispose(){}}),createItemsFx:()=>({update:(...args)=>updates.push(args),dispose(){}})});
 await handlers.get('start')({startAt:2500,trackId:1,laps:3,mode:'items',grid:players});handlers.get('peer')({id:'b',seq:1,step:0,serverT:now,x:2,y:0,z:40,vx:0,vz:0,lap:2,s:40});now+=200;loop.frame(0);
 assert.equal(loop.rivals.length,2);assert.deepEqual(loop.rivals[0],{x:2,z:40,color:'#42b9ff'});assert.equal(loop.rivals[1].color,'#123456');const aim=updates.at(-1)[3];assert.deepEqual(aim.self,{id:'a',lap:2,s:20});assert.equal(aim.back,false);assert.ok(aim.cars.some(c=>c.id==='b'&&c.lap===2&&c.s===40));
 bits=2;loop.frame(10);assert.equal(updates.at(-1)[3].back,true);Object.assign(loop.itemSlot,{kind:'mine',readyAt:0});listeners.get('keydown')({code:'KeyE',preventDefault(){}});assert.equal(sent.find(m=>m.kind==='mine').z,17);
 now+=4000;loop.frame(4010);assert.equal(loop.rivals.length,2);handlers.get('left')({id:'b'});loop.frame(4020);assert.equal(loop.rivals.length,1);loop.destroy();assert.deepEqual(loop.rivals,[]);
});

test('已入房大厅由展厅负责绘制，后台赛道不重复渲染；未入房和结算仍绘制背景',()=>{
 let renders=0;const ui={room:null,view:'lobby',destroy(){}},client={on:()=>()=>{},leave(){}},loop=mountRoomRace({engine:{render(){renders++;},scene:{add(){}}},client,ui,params:new URLSearchParams(),requestFrame(){},clear(){}});
 loop.frame(0);assert.equal(renders,1);
 ui.room={phase:'lobby',players:[]};loop.frame(16);loop.frame(32);assert.equal(renders,1);
 ui.view='results';loop.frame(48);assert.equal(renders,2);loop.destroy();
});
