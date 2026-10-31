// 真实双页、机器人和开赛交接验收；不伪造服务端房间数据，不连接钱包。
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
const out=process.env.GARAGE_SHOTS||'/private/tmp/claude-501/-Users-captain-python-Claude-arc-main-first/52a9eede-5d82-4a4f-9ef5-151e0447a67d/scratchpad/lobby-3';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const errors=[],warnings=[],checks=[],shots=[];
const monitor=page=>{page.setDefaultTimeout(120000);page.on('pageerror',e=>errors.push(e.message));page.on('console',e=>{if(e.type()==='error')errors.push(e.text());if(e.type()==='warning')warnings.push(e.text());});};
// 从 DOM 读取名牌实际矩形，与真实车模在同一屏幕坐标下逐对计算。
async function checkPlates(page,label,samples=1){
 const result=await page.evaluate(async samples=>{
  const collisions=[],plateCollisions=[],clipped=[],samplesRead=[];
  for(let frame=0;frame<samples;frame++){
   await new Promise(requestAnimationFrame);
   const canvas=document.querySelector('.grg-canvas'),origin=canvas.getBoundingClientRect(),metrics=canvas.garageProbe.read();
   const cars=metrics.carBoxes.filter(box=>Number.isFinite(box.left)).map(box=>({...box,left:box.left+origin.left,right:box.right+origin.left,top:box.top+origin.top,bottom:box.bottom+origin.top}));
   const plates=[...document.querySelectorAll('.grg-plate')].map(plate=>({seat:Number(plate.dataset.seat),...plate.getBoundingClientRect().toJSON()}));
   for(const plate of plates){
    if(plate.top<origin.top||plate.bottom>origin.bottom)clipped.push({frame,seat:plate.seat,top:plate.top,bottom:plate.bottom,stageBottom:origin.bottom});
    for(const car of cars)if(plate.left<car.right&&plate.right>car.left&&plate.top<car.bottom&&plate.bottom>car.top)collisions.push({frame,plate:plate.seat,car:car.seat});
   }
   for(let i=0;i<plates.length;i++)for(let j=i+1;j<plates.length;j++){
    const a=plates[i],b=plates[j];if(a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top)plateCollisions.push({frame,a:a.seat,b:b.seat});
   }
   if(frame===samples-1)samplesRead.push({plates,cars});
  }
  return {collisions,plateCollisions,clipped,pairs:samples*36,geometry:samplesRead};
 },samples);
 checks.push({label,...result});assert.deepEqual(result.collisions,[],`${label} 名牌不能遮挡任何车`);assert.deepEqual(result.plateCollisions,[],`${label} 名牌之间不能重叠`);assert.deepEqual(result.clipped,[],`${label} 名牌不能被展区裁切`);
}
async function checkCurrentTrack(page,label,scroll=false){
 const geometry=await page.evaluate(async scroll=>{
  const panel=document.querySelector('[data-rm-lobby]');if(scroll)panel.scrollTop=panel.scrollHeight;
  await new Promise(requestAnimationFrame);
  const card=document.querySelector('.rm-current-track');return{panel:panel.getBoundingClientRect().toJSON(),card:card.getBoundingClientRect().toJSON(),text:card.innerText};
 },scroll);
 checks.push({label,geometry});assert.ok(geometry.card.top>=geometry.panel.top&&geometry.card.bottom<=geometry.panel.bottom,`${label} 当前地图卡片必须完整位于面板可视范围`);
}
try {
 const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:2});
 await context.addInitScript(()=>{localStorage.setItem('liftoff.lang.v1','zh');localStorage.setItem('liftoff.audio.v1',JSON.stringify({muted:true,volume:.8}));localStorage.setItem('liftoff.ui.v1',JSON.stringify({muted:true}));});
 const host=await context.newPage();monitor(host);
 const shot=async(name,page=host)=>{await page.screenshot({scale:'css',path:`${out}/${name}.png`});shots.push(`${name}.png`);console.log('截图',name);};
 await host.goto('http://localhost:8932/?race&room&garageCapture');await host.locator('[data-rm-name]').fill('Captain');await host.locator('[data-rm-create]').click();await host.locator('.grg-canvas').waitFor();
 const code=await host.locator('[data-rm-room-code]').innerText();
 const peerContext=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:2});
 await peerContext.addInitScript(()=>{localStorage.setItem('race.room.name','Starman');localStorage.setItem('liftoff.lang.v1','zh');localStorage.setItem('liftoff.audio.v1',JSON.stringify({muted:true}));});
 const peer=await peerContext.newPage();monitor(peer);await peer.goto(`http://localhost:8932/?race&room=${code}&garageCapture`);await host.waitForFunction(()=>document.querySelectorAll('[data-rm-players] li').length===2);
 await host.bringToFront();await host.waitForFunction(()=>document.querySelector('.grg-canvas')?.garageProbe?.read().carBoxes.filter(box=>Number.isFinite(box.left)).length===2);await host.waitForTimeout(1800);await shot('01-desktop-two');
 assert.equal(await host.locator('.grg-scroll-hint').isVisible(),false);
 for(const difficulty of ['easy','normal','hard','normal']){await host.locator('[data-rm-difficulty]').selectOption(difficulty);await host.locator('[data-rm-add-bot]').click();}
 await host.waitForFunction(()=>document.querySelectorAll('[data-rm-players] li').length===6);await host.waitForFunction(()=>document.querySelector('.grg-canvas').garageProbe.read().carBoxes.every(box=>Number.isFinite(box.left)));await host.waitForTimeout(2600);await shot('02-desktop-six');await checkPlates(host,'桌面满员',30);
 // 主车真实几何投影与渲染帧间隔来自大厅自身，而非空转的 rAF。
 const metrics=await host.evaluate(async()=>{
  const probe=document.querySelector('.grg-canvas').garageProbe;
  if(!probe)throw new Error('缺少大厅诊断');
  probe.reset();await new Promise(resolve=>setTimeout(resolve,3200));return probe.read();
 });checks.push({metrics});console.log('满员指标',JSON.stringify(metrics));assert.ok(metrics.fps>=30);assert.ok(metrics.wallImage?.endsWith('/easy.webp'));assert.equal(metrics.wallOpacity,1);assert.equal(metrics.pixelRatio,1.5);assert.ok(metrics.heroHeight>=270,`主车投影 ${metrics.heroHeight}px`);assert.deepEqual(metrics.wallSize,{width:1920,height:1080});assert.ok(metrics.anisotropy>1);assert.equal(metrics.mipmaps,true);assert.equal(metrics.colorSpace,'srgb');
 assert.equal(await host.locator('.rm-current-track img').isVisible(),true);
 await host.locator('.rm-track-details summary').click();await host.waitForTimeout(300);const cards=await host.locator('.rm-track-picker').boundingBox();assert.ok(cards.x>=0&&cards.x+cards.width<=1440&&cards.width>700);await shot('03-track-cards');
 await host.locator('[data-rm-track="3"]').click();await peer.waitForFunction(()=>document.querySelector('[data-rm-track="3"]').getAttribute('aria-pressed')==='true');assert.equal(await peer.locator('[data-rm-track="3"]').isDisabled(),true);
 assert.equal(await host.locator('.rm-track-details').getAttribute('open'),null);await host.waitForTimeout(1400);await shot('04-alpine-wall');
 await peer.bringToFront();await peer.waitForTimeout(1400);await shot('05-peer-alpine-wall',peer);await checkPlates(peer,'非房主满员');
 assert.equal(await peer.locator('.rm-current-track img').isVisible(),true);assert.ok((await peer.locator('.rm-current-track').innerText()).includes('阿尔卑斯'));
 await host.bringToFront();
 const readyCDP=await peerContext.newCDPSession(peer);
 const readyCheck=checkPlates(peer,'准备点击前至转身复位全程',150);readyCheck.catch(()=>{});
 await peer.getByRole('button',{name:'准备',exact:true}).click();
 await peer.waitForFunction(()=>{const p=document.querySelector('.grg-canvas').garageProbe.read();return p.feedback<.3&&p.headlights?.some(v=>v===5);},null,{polling:'raf'});
 const front=await readyCDP.send('Page.captureScreenshot',{format:'png'});await writeFile(`${out}/06-ready-headlights.png`,Buffer.from(front.data,'base64'));shots.push('06-ready-headlights.png');
 await peer.waitForFunction(()=>{const p=document.querySelector('.grg-canvas').garageProbe.read();return p.feedback>=.85&&p.feedback<1.35;},null,{polling:'raf'});
 const tail=await readyCDP.send('Page.captureScreenshot',{format:'png'});await writeFile(`${out}/06-ready-burst.png`,Buffer.from(tail.data,'base64'));shots.push('06-ready-burst.png');
 await readyCheck;await peer.getByRole('button',{name:'取消准备',exact:true}).click();
 const mobileContext=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
 await mobileContext.addInitScript(()=>{localStorage.setItem('race.room.name','Mobile');localStorage.setItem('liftoff.lang.v1','zh');localStorage.setItem('liftoff.audio.v1',JSON.stringify({muted:true}));});
 // 满员下手机用房主本页调整尺寸，随后补充真实触屏设备场景。
 await host.setViewportSize({width:390,height:844});await host.waitForTimeout(1200);await shot('07-mobile-six');await checkPlates(host,'手机满员',30);await checkCurrentTrack(host,'手机房主当前图');
 const mobileGeometry=await host.evaluate(()=>{const view=document.querySelector('.grg-viewport').getBoundingClientRect(),panel=document.querySelector('[data-rm-lobby]').getBoundingClientRect();return{viewBottom:view.bottom,panelTop:panel.top};});assert.ok(mobileGeometry.viewBottom<=mobileGeometry.panelTop+1);checks.push({mobileGeometry});
 await host.setViewportSize({width:1440,height:900});await host.locator('.grg-plate__remove').last().click();
 const mobile=await mobileContext.newPage();monitor(mobile);await mobile.goto(`http://localhost:8932/?race&room=${code}&garageCapture`);await mobile.waitForFunction(()=>document.querySelector('.grg-canvas')?.garageProbe?.read().carBoxes.every(box=>Number.isFinite(box.left)));await mobile.waitForTimeout(1800);assert.equal(await mobile.evaluate(()=>innerWidth),390);await checkCurrentTrack(mobile,'真实触屏非房主滚动后当前图',true);await shot('08-mobile-touch',mobile);await checkPlates(mobile,'触屏满员');assert.equal(await mobile.locator('.grg-scroll-hint').isVisible(),true);await mobile.locator('[data-rm-leave]').click();await mobileContext.close();
 await host.bringToFront();await host.emulateMedia({reducedMotion:'reduce'});await host.locator('#race-tools .lang-toggle').click();await host.waitForTimeout(300);await host.locator('.rm-track-details summary').click();await shot('09-english-reduced');await host.locator('.rm-track-details summary').click();await host.locator('#race-tools .lang-toggle').click();await host.emulateMedia({reducedMotion:'no-preference'});
 // 用浏览器合成器逐帧录下转场，防止普通 screenshot 等待绘制时已错过 0.8 秒。
 const cdp=await context.newCDPSession(host),launchFrames=[];let launchStage='';
 host.on('console',message=>{const value=message.text();if(value.startsWith('展厅转场取帧:'))launchStage=value.slice('展厅转场取帧:'.length);});
 await host.evaluate(()=>{
  const flash=document.querySelector('.grg-transition');
  new MutationObserver(()=>console.log('展厅转场取帧:'+flash.className)).observe(flash,{attributes:true,attributeFilter:['class']});
 });
 cdp.on('Page.screencastFrame',frame=>{if(launchStage.includes('--rush'))launchFrames.push(frame.data);void cdp.send('Page.screencastFrameAck',{sessionId:frame.sessionId}).catch(()=>{});});
 await cdp.send('Page.startScreencast',{format:'png',maxWidth:1440,maxHeight:900,everyNthFrame:1});
 await peer.locator('[data-rm-ready]').click();await host.getByRole('button',{name:'开始比赛',exact:true}).click();await host.locator('.grg-transition--rush').waitFor({state:'visible'});
 await host.locator('.grg-canvas').waitFor({state:'detached'});await host.waitForTimeout(500);await cdp.send('Page.stopScreencast');
 assert.ok(launchFrames.length,'合成器必须捕获冲镜中间帧');
 const middle=execFileSync('python3',['-c','import sys,json,base64,io; from PIL import Image,ImageStat; frames=json.load(sys.stdin); scored=[]\nfor frame in frames:\n raw=base64.b64decode(frame); im=Image.open(io.BytesIO(raw)).convert("L"); mean=ImageStat.Stat(im.resize((144,90))).mean[0]; scored.append((abs(mean-125),mean,raw))\nscore,mean,raw=min(scored,key=lambda x:x[0]); assert mean<235,"转场必须有可见内容"; sys.stdout.buffer.write(raw)'],{input:JSON.stringify(launchFrames),maxBuffer:8*1024*1024});
 await writeFile(`${out}/10-launch-middle.png`,middle);shots.push('10-launch-middle.png');checks.push({transitionFrames:launchFrames.length});console.log('截图 10-launch-middle');
 await shot('11-start-line');
 assert.deepEqual(errors,[]);checks.push('双页地图同步、非房主禁用、准备反馈、触屏提示、减少运动、开赛无页面错误');
 await peerContext.close();
} finally {await writeFile(`${out}/browser-result.json`,JSON.stringify({errors,warnings,shots,checks},null,2));await browser.close();}
