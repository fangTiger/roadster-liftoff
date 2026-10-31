// 真实双页、机器人和开赛交接验收；不伪造服务端房间数据，不连接钱包。
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
const out=process.env.GARAGE_SHOTS||'/private/tmp/claude-501/-Users-captain-python-Claude-arc-main-first/52a9eede-5d82-4a4f-9ef5-151e0447a67d/scratchpad/lobby-2';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const errors=[],warnings=[],checks=[],shots=[];
const monitor=page=>{page.setDefaultTimeout(120000);page.on('pageerror',e=>errors.push(e.message));page.on('console',e=>{if(e.type()==='error')errors.push(e.text());if(e.type()==='warning')warnings.push(e.text());});};
try {
 const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:2});
 await context.addInitScript(()=>{localStorage.setItem('liftoff.lang.v1','zh');localStorage.setItem('liftoff.audio.v1',JSON.stringify({muted:true,volume:.8}));localStorage.setItem('liftoff.ui.v1',JSON.stringify({muted:true}));});
 const host=await context.newPage();monitor(host);
 const shot=async(name,page=host)=>{await page.screenshot({scale:'css',path:`${out}/${name}.png`});shots.push(`${name}.png`);console.log('截图',name);};
 await host.goto('http://localhost:8932/?race&room&garageCapture');await host.locator('[data-rm-name]').fill('Captain');await host.locator('[data-rm-create]').click();await host.locator('.grg-canvas').waitFor();
 const code=await host.locator('[data-rm-room-code]').innerText();
 const peerContext=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:2});
 await peerContext.addInitScript(()=>{localStorage.setItem('race.room.name','Starman');localStorage.setItem('liftoff.lang.v1','zh');localStorage.setItem('liftoff.audio.v1',JSON.stringify({muted:true}));});
 const peer=await peerContext.newPage();monitor(peer);await peer.goto(`http://localhost:8932/?race&room=${code}`);await host.waitForFunction(()=>document.querySelectorAll('[data-rm-players] li').length===2);
 await host.bringToFront();await host.waitForTimeout(1800);await shot('01-desktop-two');
 assert.equal(await host.locator('.grg-scroll-hint').isVisible(),false);
 for(const difficulty of ['easy','normal','hard','normal']){await host.locator('[data-rm-difficulty]').selectOption(difficulty);await host.locator('[data-rm-add-bot]').click();}
 await host.waitForFunction(()=>document.querySelectorAll('[data-rm-players] li').length===6);await host.waitForTimeout(1500);await shot('02-desktop-six');
 // 主车真实几何投影与渲染帧间隔来自大厅自身，而非空转的 rAF。
 const metrics=await host.evaluate(async()=>{
  const probe=document.querySelector('.grg-canvas').garageProbe;
  if(!probe)throw new Error('缺少大厅诊断');
  probe.reset();await new Promise(resolve=>setTimeout(resolve,3200));return probe.read();
 });checks.push({metrics});console.log('满员指标',JSON.stringify(metrics));assert.ok(metrics.fps>=30);assert.ok(metrics.wallImage?.endsWith('/easy.webp'));assert.equal(metrics.wallOpacity,1);assert.equal(metrics.pixelRatio,1.5);assert.ok(metrics.heroHeight>=270,`主车投影 ${metrics.heroHeight}px`);
 await host.locator('.rm-track-details summary').click();await host.waitForTimeout(300);const cards=await host.locator('.rm-track-picker').boundingBox();assert.ok(cards.x>=0&&cards.x+cards.width<=1440&&cards.width>700);await shot('03-track-cards');
 await host.locator('[data-rm-track="3"]').click();await peer.waitForFunction(()=>document.querySelector('[data-rm-track="3"]').getAttribute('aria-pressed')==='true');assert.equal(await peer.locator('[data-rm-track="3"]').isDisabled(),true);
 await host.locator('.rm-track-details summary').click();await host.waitForTimeout(1400);await shot('04-alpine-wall');
 await peer.bringToFront();await peer.waitForTimeout(1400);await shot('05-peer-alpine-wall',peer);
 await host.bringToFront();await host.locator('[data-rm-ready]').click();await host.waitForTimeout(220);await shot('06-ready-burst');await host.locator('[data-rm-ready]').click();
 const mobileContext=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
 await mobileContext.addInitScript(()=>{localStorage.setItem('race.room.name','Mobile');localStorage.setItem('liftoff.lang.v1','zh');localStorage.setItem('liftoff.audio.v1',JSON.stringify({muted:true}));});
 // 满员下手机用房主本页调整尺寸，随后补充真实触屏设备场景。
 await host.setViewportSize({width:390,height:844});await host.waitForTimeout(1200);await shot('07-mobile-six');
 const mobileGeometry=await host.evaluate(()=>{const view=document.querySelector('.grg-viewport').getBoundingClientRect(),panel=document.querySelector('[data-rm-lobby]').getBoundingClientRect();return{viewBottom:view.bottom,panelTop:panel.top};});assert.ok(mobileGeometry.viewBottom<=mobileGeometry.panelTop+1);checks.push({mobileGeometry});
 await host.setViewportSize({width:1440,height:900});await host.locator('.grg-plate__remove').last().click();
 const mobile=await mobileContext.newPage();monitor(mobile);await mobile.goto(`http://localhost:8932/?race&room=${code}`);await mobile.locator('.grg-plate--self').waitFor();await mobile.waitForTimeout(1800);assert.equal(await mobile.evaluate(()=>innerWidth),390);await shot('08-mobile-touch',mobile);assert.equal(await mobile.locator('.grg-scroll-hint').isVisible(),true);await mobile.locator('[data-rm-leave]').click();await mobileContext.close();
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
 await peer.locator('[data-rm-ready]').click();await host.locator('[data-rm-ready]').click();await host.locator('.grg-transition--rush').waitFor({state:'visible'});
 await host.locator('.grg-canvas').waitFor({state:'detached'});await host.waitForTimeout(500);await cdp.send('Page.stopScreencast');
 assert.ok(launchFrames.length,'合成器必须捕获冲镜中间帧');
 const middle=execFileSync('python3',['-c','import sys,json,base64,io; from PIL import Image,ImageStat; frames=json.load(sys.stdin); scored=[]\nfor frame in frames:\n raw=base64.b64decode(frame); im=Image.open(io.BytesIO(raw)).convert("L"); mean=ImageStat.Stat(im.resize((144,90))).mean[0]; scored.append((abs(mean-125),mean,raw))\nscore,mean,raw=min(scored,key=lambda x:x[0]); assert mean<235,"转场必须有可见内容"; sys.stdout.buffer.write(raw)'],{input:JSON.stringify(launchFrames),maxBuffer:8*1024*1024});
 await writeFile(`${out}/10-launch-middle.png`,middle);shots.push('10-launch-middle.png');checks.push({transitionFrames:launchFrames.length});console.log('截图 10-launch-middle');
 await shot('11-start-line');
 assert.deepEqual(errors,[]);checks.push('双页地图同步、非房主禁用、准备反馈、触屏提示、减少运动、开赛无页面错误');
 await peerContext.close();
} finally {await writeFile(`${out}/browser-result.json`,JSON.stringify({errors,warnings,shots,checks},null,2));await browser.close();}
