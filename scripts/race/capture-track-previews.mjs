// 从真实游戏场景截取静态预览；Playwright 从本仓库 node_modules 解析。
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { TRACKS } from '../../src/race/track/data/index.js';
import { createSession } from '../../src/race/sim/session.js';
import { autopilot } from '../../src/race/sim/autopilot.js';
import { buildTrack } from '../../src/race/track/build.js';
const out=new URL('../../public/assets/race/previews/',import.meta.url);
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist']});
try {
 for(const {def,difficulty} of TRACKS){
  const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
  page.setDefaultTimeout(120000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${process.env.RACE_URL||'http://localhost:8932'}/?race&capture&map=${difficulty}`);
  await page.waitForFunction(()=>!!window.__engine&&!!window.__race,null,{timeout:120000});
  await page.locator('#race-loading').waitFor({state:'detached'});
  const track=buildTrack(def),s=def.id===3?track.features.find(f=>f.type==='gap').s-28:def.id===2?track.features.find(f=>f.type==='ramp').s-8:track.length*.12;
  // 用同一确定性模拟先求步数；浏览器一次推进，避免软件渲染积压数十帧。
  const session=createSession(track,{laps:def.laps});let steps=0;
  for(;steps<120000;steps++){
   const near=session.car.near.s;if(near>=s&&near<s+20)break;
   session.step(autopilot({car:session.car,race:session.race},track));
  }
  if(steps===120000)throw new Error('自动驾驶未到达预览机位');
  console.log('地图机位',difficulty,'模拟步数',steps);
  await page.evaluate(n=>window.__race.auto(n),steps);
  const point=track.at(s),ahead=track.at(s+40);
  // 贴近驾驶视线，保留天空与远景，避免俯拍画面放大成背景海报。
  await page.evaluate(({p,a})=>{
   const e=window.__engine;e.scene.updateMatrixWorld(true);
   e.camera.position.set(p.x-p.tx*30+p.tz*7,p.y+5,p.z-p.tz*30-p.tx*7);
   e.camera.lookAt(a.x,a.y+2,a.z);e.camera.fov=60;e.camera.updateProjectionMatrix();e.render();
   document.querySelectorAll('body > :not(canvas)').forEach(el=>el.style.visibility='hidden');
  },{p:point,a:ahead});
  await page.waitForTimeout(200);
  const png=await page.screenshot();
  // Pillow 仅做原始截图的格式压缩，不生成或修饰游戏画面。
  const target=new URL(`${difficulty}.webp`,out).pathname;
  execFileSync('python3',['-c','import sys,io; from PIL import Image; im=Image.open(io.BytesIO(sys.stdin.buffer.read())).convert("RGB"); q=90\nassert im.size==(1920,1080)\nwhile True:\n b=io.BytesIO(); im.save(b,"WEBP",quality=q,method=6)\n if len(b.getvalue())<=350000 or q<=30: break\n q-=4\nassert len(b.getvalue())<=350000\nopen(sys.argv[1],"wb").write(b.getvalue()); print(len(b.getvalue()))',target],{input:png,stdio:['pipe','inherit','inherit']});
  if(errors.length)throw new Error(errors.join('\n'));console.log('已生成地图实景',target);await page.close();
 }
} finally {await browser.close();}
