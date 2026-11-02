// 只连接已经运行的本地 Vite / 房间服务；不启动服务、不连接钱包。
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { createSession } from '../../src/race/sim/session.js';
import { autopilot } from '../../src/race/sim/autopilot.js';
import { createRecorder } from '../../src/race/sim/replay.js';
import { buildTrack,trackHash } from '../../src/race/track/build.js';
import { TRACKS } from '../../src/race/track/data/index.js';
import { mkdir,writeFile } from 'node:fs/promises';
const base=process.env.URL||'http://localhost:8932/',out='output/playwright/coin-boost';
const options={channel:'chrome',headless:true,args:['--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist']};
const browsers=[],checks=[],errors=[],peers=[],pages=[];
const check=message=>{checks.push(message);console.log('验收通过：'+message);};
await mkdir(out,{recursive:true});
async function pageFor(name,{musicProbe=false}={}){
 const browser=await chromium.launch(options);browsers.push(browser);const page=await browser.newPage({viewport:{width:1440,height:960}});page.setDefaultTimeout(60000);pages.push({name,page});
 page.on('pageerror',error=>errors.push({name,message:error.message}));
 page.on('websocket',ws=>ws.on('framereceived',({payload})=>{try{const m=JSON.parse(payload);if(m.type==='peer')peers.push({viewer:name,...m});if(m.type==='error')errors.push({name,message:m.code});}catch{}}));
 await page.route('**/api/**',route=>route.fulfill({json:[]}));
 await page.route('https://rpc.testnet.arc.io/**',route=>route.fulfill({json:{jsonrpc:'2.0',id:1,result:'0x'+(60000).toString(16).padStart(64,'0')+(10000).toString(16).padStart(64,'0')}}));
 await page.addInitScript(({name,musicProbe})=>{
  localStorage.setItem('liftoff.lang.v1','zh');localStorage.setItem('race.room.name',name);localStorage.setItem('liftoff.audio.v1',JSON.stringify({muted:false,musicEnabled:true,volume:.1}));localStorage.setItem('liftoff.ui.v1',JSON.stringify({muted:false,musicEnabled:true,volume:.1}));
  // 仅显式音乐探针模拟普通用户环境；默认自动化环境仍必须静默。
  if(musicProbe)Object.defineProperty(navigator,'webdriver',{get:()=>false});
 },{name,musicProbe});return page;
}
const open=async(page,query)=>{await page.goto(new URL(`/?race&e2eCoins=1&${query}`,base).href);await page.locator('#race-loading').waitFor({state:'detached'});};
const started=async(page,{advance=false}={})=>{await page.waitForFunction(()=>!!window.__raceDebug?.snapshot());if(advance)await page.locator('#race-pick').waitFor({state:'detached'});if(advance)await page.evaluate(()=>{if(window.__raceDebug.snapshot().race.frozen)window.__raceDebug.advance(360);});await page.waitForFunction(()=>window.__raceDebug.snapshot().race.frozen===false);};
async function createRoom(host){
 await open(host,'room');await host.locator('.rb-header .rb-btn--primary').click();await host.locator('.rb-modal__actions .rb-btn--primary').click();await host.locator('[data-rm-room-code]').waitFor({state:'visible'});return (await host.locator('[data-rm-room-code]').innerText()).trim();
}
try{
 const host=await pageFor('金币主车'),peer=await pageFor('金币对手'),code=await createRoom(host);await open(peer,`room=${code}`);
 await peer.locator('[data-rm-ready]').click();await host.locator('[data-rm-ready]').click();await Promise.all([started(host),started(peer)]);
 const id=await host.evaluate(()=>window.__raceDebug.room().id);assert.equal(await host.evaluate(()=>window.__raceDebug.music().playing),false);check('默认自动化环境不播放比赛音乐');
 const pickup=await host.evaluate(()=>{const coins=window.__raceDebug.pickup(),s=window.__raceDebug.snapshot();return {coins,dash:s.car.coinDash,boost:s.car.boostTime,bonus:document.querySelector('.rh-speed-bonus').textContent,glow:!document.querySelector('.rh-coin-glow').hidden};});
 const coins=pickup.coins;assert.ok(coins>0);assert.equal(pickup.dash,.4);assert.equal(pickup.boost,0);assert.equal(pickup.bonus,`+${coins}%`);assert.equal(pickup.glow,true);
 await host.screenshot({path:`${out}/pickup-dash.png`});check('拾取立即刷新 0.4 秒独立冲刺，速度旁金色加成与边缘辉光可见');await host.waitForFunction(n=>document.querySelector('.rh-coins b')?.textContent===`${n}/10`,coins);
 await peer.waitForFunction(n=>window.__raceDebug.trails().some(t=>!t.self&&t.coins===n&&t.visible&&t.length>0),coins);
 assert.ok(peers.some(m=>m.viewer==='金币对手'&&m.id===id&&m.coins===coins));assert.ok(peers.some(m=>m.viewer==='金币对手'&&m.id===id&&m.dash===true));check('小冲刺 dash 经现有房间服务布尔转发');check(`双浏览器道具赛真实拾取：HUD ${coins}/10，服务端 coins 转发及对方流光同步`);
 await host.evaluate(()=>{while(window.__raceDebug.snapshot().car.coins<10)window.__raceDebug.pickup();});
 await host.waitForFunction(()=>document.querySelector('.rh-coins')?.dataset.full==='true');await peer.waitForFunction(()=>window.__raceDebug.trails().some(t=>!t.self&&t.coins===10));
 await host.screenshot({path:`${out}/full-coins.png`});assert.equal(await host.locator('.rh-speed-bonus').innerText(),'+10%');check('满十枚 HUD 发光、+10% 加成及对方满层流光');
 const capped=await host.evaluate(()=>{const coins=window.__raceDebug.pickup();return {coins,dash:window.__raceDebug.snapshot().car.coinDash};});assert.equal(capped.coins,10);assert.equal(capped.dash,.4);check('满层继续拾取仍刷新小冲刺');
 await host.emulateMedia({reducedMotion:'reduce'});const reduced=await host.evaluate(()=>{window.__raceDebug.pickup();return {display:getComputedStyle(document.querySelector('.rh-coin-glow')).display,bonus:document.querySelector('.rh-speed-bonus').textContent,animation:getComputedStyle(document.querySelector('.rh-coin-pop')).animationName};});assert.deepEqual(reduced,{display:'none',bonus:'+10%',animation:'none'});await host.emulateMedia({reducedMotion:'no-preference'});check('减少动态偏好隐藏辉光与金币动画，保留 HUD 加成');
 await host.waitForFunction(()=>window.__raceDebug.snapshot().step/120>5);
 await peer.evaluate(target=>{const s=window.__raceDebug.snapshot();window.__raceDebug.send({type:'item',kind:'missile',itemId:`${window.__raceDebug.room().id}-9001`,target,x:s.car.x,z:s.car.z,yaw:s.car.yaw,firedAt:s.step/120-1.5});},id);
 await host.waitForFunction(()=>window.__raceDebug.snapshot().car.coins===5);await peer.waitForFunction(()=>window.__raceDebug.trails().some(t=>!t.self&&t.coins===5));
 assert.ok((await host.evaluate(()=>window.__raceDebug.snapshot().events)).some(e=>e.type==='coinLoss'&&e.count===5));check('对手经真实房间协议发射导弹，命中掉五枚及远端流光同步减弱');
 await host.screenshot({path:`${out}/coin-loss.png`});
 // 复用同两浏览器创建竞速赛，显式音乐探针模拟普通用户，检查两类多人比赛发车音乐。
 for(const browser of browsers)await browser.close();
 const solo=await pageFor('音乐探针',{musicProbe:true});await open(solo,'map=easy');await solo.locator('button[data-k=easy]').click();await started(solo,{advance:true});await solo.keyboard.press('ArrowUp');await solo.waitForFunction(()=>window.__raceDebug.music().playing&&window.__raceDebug.music().time>0);
 assert.equal(await solo.evaluate(()=>window.__raceDebug.snapshot().car.coins),undefined);check('单人竞速真实媒体解码播放，金币增益关闭');
 await solo.keyboard.press('Escape');await solo.waitForFunction(()=>window.__raceDebug.music().phase==='paused');await solo.keyboard.press('Escape');await solo.waitForFunction(()=>window.__raceDebug.music().phase==='racing');
 await solo.evaluate(()=>{window.__raceDebug.effect('nitro');window.__raceDebug.advance(1);});await solo.waitForFunction(()=>window.__raceDebug.music().ducking);check('单人暂停音乐阶段与氮气避让');
 // 用真实自动驾驶录制完整三圈，满足本地影子记录校验。
 const def=TRACKS[0].def,track=buildTrack(def),session=createSession(track),recorder=createRecorder();
 for(let i=0;i<43200&&!session.race.finished;i++){const bits=autopilot({car:session.car},track);recorder.record(bits);session.step(bits);}assert.equal(session.race.finished,true);
 const record={date:new Date().toISOString(),bestLap:session.race.bestLap,replay:recorder.encode({track:trackHash(def),trackId:def.id,laps:def.laps})};
 await solo.evaluate(record=>{localStorage.setItem('race.ghost.1',JSON.stringify(record));localStorage.setItem('race.ghost.choice.1','best');},record);
 await open(solo,'map=easy');await solo.locator('button[data-k=easy]').click();await started(solo,{advance:true});await solo.keyboard.press('ArrowUp');await solo.waitForFunction(()=>window.__raceDebug.music().playing);assert.equal(await solo.evaluate(()=>window.__raceDebug.snapshot().car.coins),undefined);assert.ok(await solo.evaluate(()=>{const a=window.__raceDebug.ghost();window.__raceDebug.advance(12);const b=window.__raceDebug.ghost();return a.visible&&b.visible&&b.step>a.step;}));check('影子车挂载并推进，发车媒体播放且金币增益关闭');
 await browsers.at(-1).close();
 const musicHost=await pageFor('多人音乐主车',{musicProbe:true}),musicPeer=await pageFor('多人音乐对手',{musicProbe:true}),musicCode=await createRoom(musicHost);await open(musicPeer,`room=${musicCode}`);
 await musicPeer.locator('[data-rm-ready]').click();await musicHost.locator('[data-rm-ready]').click();await Promise.all([started(musicHost),started(musicPeer)]);await musicHost.keyboard.press('ArrowUp');await musicHost.waitForFunction(()=>window.__raceDebug.music().playing);check('多人道具赛发车音乐播放');
 const duck=await musicHost.evaluate(()=>{window.__raceDebug.pickup();return window.__raceDebug.music().ducking;});assert.equal(duck,true);check('道具赛金币小冲刺触发比赛音乐避让');
 // 离开旧房间后创建竞速房，避免等候完整三圈。
 const speedCode=await createRoom(musicHost);await musicHost.locator('[data-rm-mode=speed]').click();await open(musicPeer,`room=${speedCode}`);await musicPeer.locator('[data-rm-ready]').click();await musicHost.locator('[data-rm-ready]').click();await Promise.all([started(musicHost),started(musicPeer)]);await musicHost.keyboard.press('ArrowUp');await musicHost.waitForFunction(()=>window.__raceDebug.music().playing);assert.equal(await musicHost.evaluate(()=>window.__raceDebug.snapshot().car.coins),undefined);check('多人竞速赛发车音乐播放且金币增益关闭');
 assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'通过',checks,errors},null,2));
}catch(error){for(const {name,page} of pages)if(!page.isClosed())console.error('失败页面状态',name,await page.evaluate(()=>({title:document.title,text:document.body.innerText.slice(-800),state:window.__raceDebug?.snapshot(),music:window.__raceDebug?.music()})).catch(()=>null));console.error(JSON.stringify({result:'失败',checks,errors,message:error.message},null,2));throw error;
}finally{await writeFile(`${out}/result.json`,JSON.stringify({checks,errors},null,2));await Promise.all(browsers.map(browser=>browser.close()));}
