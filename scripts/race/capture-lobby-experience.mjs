// 使用真实房间与浏览器验证拖车、触屏滚动和现有音频总线，不连接钱包。
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const out=process.env.LOBBY_SHOTS||'/private/tmp/claude-501/-Users-captain-python-Claude-arc-main-first/52a9eede-5d82-4a4f-9ef5-151e0447a67d/scratchpad/lobby-4';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const checks=[],errors=[],roomEvents=[];let musicEnd;
const monitor=page=>{page.setDefaultTimeout(60000);page.on('pageerror',error=>errors.push(error.message));page.on('websocket',ws=>ws.on('framereceived',({payload})=>{try{const m=JSON.parse(payload);if(['room','start','error'].includes(m.type))roomEvents.push({type:m.type,phase:m.phase,code:m.type==='error'?m.code:undefined});}catch{}}));};
async function prepare(context,name){
 await context.addInitScript(name=>{
  localStorage.setItem('liftoff.lang.v1','zh');localStorage.setItem('race.room.name',name);
  const NativeAudio=window.Audio;window.lobbyMedia=[];window.mediaEvents=[];
  const createSource=AudioContext.prototype.createMediaElementSource;AudioContext.prototype.createMediaElementSource=function(el){const source=createSource.call(this,el),connect=source.connect.bind(source);source.connect=(destination,...args)=>{el.lobbyGain=destination.gain;return connect(destination,...args);};return source;};
  window.lobbyAttempts=0;window.Audio=function(...args){const el=new NativeAudio(...args),play=el.play.bind(el);el.play=()=>{if(el.src.endsWith('lobby-rock.m4a')&&++window.lobbyAttempts===1)return Promise.reject(new DOMException('模拟自动播放限制','NotAllowedError'));return play();};for(const type of ['play','pause'])el.addEventListener(type,()=>window.mediaEvents.push({type,at:performance.now()}));window.lobbyMedia.push(el);return el;};
 },name);
 const page=await context.newPage();monitor(page);return page;
}
const probe=page=>page.evaluate(()=>document.querySelector('.grg-canvas').garageProbe.read());
const playing=page=>page.evaluate(()=>window.lobbyMedia.some(el=>el.src.endsWith('lobby-rock.m4a')&&!el.paused));
try{
 const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
 const host=await prepare(context,'旋转体验');await host.goto('http://localhost:8932/?race&room&garageCapture');
 await host.locator('[data-rm-create]').waitFor();assert.equal(await host.evaluate(()=>window.lobbyMedia.length),0);
 await host.locator('[data-rm-create]').click();await host.locator('.grg-car-hit[data-seat="0"]').waitFor({state:'visible'});
 await host.waitForFunction(()=>document.querySelector('.grg-canvas').garageProbe.read().heroHeight>250);await host.waitForTimeout(1500);
 const unlockBox=await host.locator('.grg-car-hit[data-seat="0"]').boundingBox();await host.mouse.move(unlockBox.x+unlockBox.width/2,unlockBox.y+unlockBox.height/2);await host.mouse.down();await host.mouse.up();await host.waitForFunction(()=>window.lobbyMedia.some(el=>el.src.endsWith('lobby-rock.m4a')&&!el.paused),null,{timeout:5000});
 assert.equal(await host.evaluate(()=>window.lobbyMedia.filter(el=>el.src.includes('/music/')).length),1);console.log('验证进度',checks.length);checks.push('入房前没有媒体，入房后只加载大厅音乐并播放');
 assert.equal(await host.locator('.grg-rotate-hint').textContent(),'拖动旋转');assert.equal(await host.evaluate(()=>localStorage.getItem('race.garage.rotateHint')),'1');
 const hit=host.locator('.grg-car-hit[data-seat="0"]'),box=await hit.boundingBox(),x=box.x+box.width/2,y=box.y+box.height/2;
 const before=(await probe(host)).rotations[0].yaw;
 await host.mouse.move(x,y);assert.equal(await hit.evaluate(el=>getComputedStyle(el).cursor),'grab');await host.mouse.down();await host.mouse.move(x+530,y,{steps:15});
 const full=(await probe(host)).rotations[0].yaw;assert.ok(full-before>Math.PI*2-.1);await host.mouse.up();console.log('验证进度',checks.length);checks.push('桌面真实拖动可转满 360°');
 await host.waitForTimeout(4200);assert.equal((await probe(host)).rotations[0].active,false);console.log('验证进度',checks.length);checks.push('松手后恢复展示动画');
 const nextBox=await hit.boundingBox(),sx=nextBox.x+nextBox.width/2,sy=nextBox.y+nextBox.height/2,base=(await probe(host)).rotations[0].yaw;
 await host.mouse.move(sx,sy);await host.mouse.down();await host.mouse.move(sx+(Math.PI/2-base)/.012,sy,{steps:10});await host.waitForTimeout(80);
 assert.ok(Math.abs((await probe(host)).rotations[0].yaw-Math.PI/2)<.1);
 await host.screenshot({path:`${out}/01-desktop-car-side.png`,scale:'css'});await host.mouse.up();
 // 名牌按钮仍走真实增删协议。
 await host.locator('.grg-plate__add').first().click();await host.waitForFunction(()=>document.querySelectorAll('.grg-plate__remove').length===1);await host.locator('.grg-plate__remove').click();await host.waitForFunction(()=>document.querySelectorAll('.grg-plate__remove').length===0);console.log('验证进度',checks.length);checks.push('名牌 + 和 × 正常增删机器人');
 await host.locator('#race-tools summary').click();await host.locator('[data-setting=musicEnabled]').uncheck();assert.equal(await playing(host),false);
 await host.locator('[data-setting=musicEnabled]').check();await host.waitForFunction(()=>window.lobbyMedia.some(el=>!el.paused));await host.locator('[data-setting=muted]').check();assert.equal(await playing(host),false);
 await host.locator('[data-setting=muted]').uncheck();await host.waitForFunction(()=>window.lobbyMedia.some(el=>!el.paused));await host.locator('#race-tools summary').click();console.log('验证进度',checks.length);checks.push('设置面板音乐和静音开关控制同一曲目');
 const code=await host.locator('[data-rm-room-code]').innerText();
 const mobileContext=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
 const mobile=await prepare(mobileContext,'手机车手');await mobile.goto(`http://localhost:8932/?race&room=${code}&garageCapture`);await mobile.locator('.grg-car-hit[data-seat="1"]').waitFor({state:'visible'});await mobile.waitForTimeout(1800);
 const mhit=mobile.locator('.grg-car-hit[data-seat="1"]'),mb=await mhit.boundingBox();
 const mx=Math.max(50,Math.min(330,mb.x+mb.width/2)),my=mb.y+mb.height/2,viewport=mobile.locator('.grg-viewport');
 const scroll=await viewport.evaluate(el=>el.scrollLeft),mBefore=(await probe(mobile)).rotations[1].yaw;
 const cdp=await mobileContext.newCDPSession(mobile);
 const touch=(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y,id:1}]});
 await touch('touchStart',mx,my);await touch('touchMove',mx+70,my);await mobile.waitForTimeout(100);
 const mAfter=(await probe(mobile)).rotations[1].yaw;assert.ok(mAfter-mBefore>.7);assert.equal(await viewport.evaluate(el=>el.scrollLeft),scroll);
 await mobile.screenshot({path:`${out}/02-mobile-car-rotate.png`,scale:'css'});await touch('touchEnd',0,0);console.log('验证进度',checks.length);checks.push('真实触屏拖车转向且展区不滚动');
 await touch('touchStart',mx,my);await touch('touchMove',mx-40,my);await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});assert.equal(await mhit.evaluate(el=>el.classList.contains('grg-car-hit--dragging')),false);checks.push('系统取消触摸后释放旋转手势');
 // 从车身上方的空白横拖，原生横向滚动必须仍可用。
 const vb=await viewport.boundingBox();await touch('touchStart',290,vb.y+15);for(let i=1;i<=5;i++){await touch('touchMove',290-i*35,vb.y+15);await mobile.waitForTimeout(30);}await touch('touchEnd',0,0);await mobile.waitForTimeout(200);
 assert.ok(Math.abs(await viewport.evaluate(el=>el.scrollLeft)-scroll)>30);console.log('验证进度',checks.length);checks.push('触屏空白处仍可横向滚动');
 // 后排车投影可能与主车包围盒重合，选择实际可命中的可见区域。
 const peerPoint=await host.locator('.grg-car-hit[data-seat="1"]').evaluate(el=>{const b=el.getBoundingClientRect();for(const fy of [.2,.4,.6,.8])for(const fx of [.2,.4,.6,.8]){const x=b.x+b.width*fx,y=b.y+b.height*fy;if(document.elementFromPoint(x,y)===el)return{x,y};}return null;});
 assert.ok(peerPoint,'后排车必须有可交互的投影区域');await host.bringToFront();await host.mouse.move(peerPoint.x,peerPoint.y);await host.mouse.down();await host.mouse.move(peerPoint.x+30,peerPoint.y);
 assert.equal(await host.locator('.grg-car-hit[data-seat="1"]').evaluate(el=>el.classList.contains('grg-car-hit--dragging')),true);await host.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));const heldYaw=(await probe(host)).rotations[1].yaw;await mobile.locator('[data-rm-ready]').evaluate(el=>el.click());await host.waitForTimeout(1200);const readyYaw=(await probe(host)).rotations[1].yaw;assert.ok(Math.abs(readyYaw-heldYaw)<.01,`准备抢占朝向：${heldYaw} → ${readyYaw}`);await host.mouse.up();checks.push('拖动其他车辆时准备动画不会抢走朝向控制');await host.waitForFunction(()=>!document.querySelector('[data-rm-ready]').disabled);
 await host.locator('[data-rm-ready]').click();await host.waitForTimeout(950);musicEnd=await host.evaluate(()=>({now:performance.now(),events:window.mediaEvents,media:window.lobbyMedia.map(el=>({paused:el.paused,gain:el.lobbyGain?.value}))}));assert.ok(musicEnd.media[0].gain<.001,'倒计时一秒内必须已静音');await host.waitForFunction(()=>window.lobbyMedia.every(el=>el.paused));console.log('验证进度',checks.length);checks.push('房主真实开赛后音乐在一秒内停止');
 await mobileContext.close();await context.close();
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({checks,errors,out},null,2));
}finally{console.log('浏览器状态',JSON.stringify({checks,errors}));await writeFile(`${out}/browser-result.json`,JSON.stringify({checks,errors,musicEnd,roomEvents},null,2));await browser.close();}
