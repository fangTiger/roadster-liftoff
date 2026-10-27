// 本地逐步推进机器人；截图位置来自实际驾驶轨迹，不修改模拟坐标。
import { chromium } from 'playwright';
import { mkdir,writeFile } from 'node:fs/promises';
const out='recordings/race-greybox';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1}),errors=[],warnings=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',e=>{if(e.type()==='error')errors.push(e.text());if(e.type()==='warning')warnings.push(e.text());});
 await page.goto('http://127.0.0.1:8932/?race&capture');await page.waitForFunction(()=>document.title==='ready',null,{timeout:120000});
 await page.screenshot({path:`${out}/01-start.png`});
 const shots=new Set();let snap;
 for(let i=0;i<4320;i++){
  snap=await page.evaluate(n=>{window.__race.auto(n);return window.__race.snap();},snap?.race.lap>1?120:10);
  const c=snap.car,s=c.near.s;
  const label=snap.race.lap===1&&c.near.path==='main'?(s>470&&s<560?'02-hairpin':s>1304&&s<1324&&!c.grounded?'03-canyon-air':s>1940&&s<2080?'04-tunnel':s>2650&&s<2800?'05-salt':null):null;
  if(label&&!shots.has(label)){await page.screenshot({path:`${out}/${label}.png`});shots.add(label);console.log('截图',label,s,c.y);}
  if(snap.race.finished)break;
 }
 const {stateHash,runReplay}=await import('../../src/race/sim/replay.js');
 const {default:def}=await import('../../src/race/track/data/desert-loop.js');
 const replay=await page.evaluate(()=>window.__race.replay()),verified=runReplay(def,replay);
 if(verified.hash!==stateHash(snap))throw new Error('浏览器录制在 Node 重放后的哈希不同');
 await writeFile(`${out}/replay.json`,JSON.stringify(replay));
 await writeFile(`${out}/browser-result.json`,JSON.stringify({errors,warnings,shots:[...shots],hash:stateHash(snap),snapshot:snap},null,2));
 console.log('浏览器结果',JSON.stringify({errors,warnings,shots:[...shots],laps:snap.race.lapTimes,hash:stateHash(snap)}));
 if(errors.length||shots.size!==4||!snap.race.finished)process.exitCode=1;
}finally{await browser.close();}
