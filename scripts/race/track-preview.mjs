import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import def from '../../src/race/track/data/desert-loop.js';
import { buildTrack } from '../../src/race/track/build.js';
const track=buildTrack(def),field=track.heightfield,header=112;
const width=Math.ceil((field.width-1)*2),height=Math.ceil((field.height-1)*2)+header;
const pixels=Buffer.alloc(width*height*4,255);
const palette=[[53,57,64],[230,225,211],[187,143,91],[123,112,96],[221,219,199],[111,70,53],[48,35,38]];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function pixel(x,y,color) {
  x=Math.round(x);y=Math.round(y);if(x<0||x>=width||y<0||y>=height)return;
  const k=(y*width+x)*4;pixels[k]=color[0];pixels[k+1]=color[1];pixels[k+2]=color[2];pixels[k+3]=255;
}
function line(a,b,color,thickness=1) {
  const steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)));
  for(let i=0;i<=steps;i++) for(let dx=-Math.floor(thickness/2);dx<=Math.floor(thickness/2);dx++) for(let dy=-Math.floor(thickness/2);dy<=Math.floor(thickness/2);dy++) pixel(a.x+(b.x-a.x)*i/steps+dx,a.y+(b.y-a.y)*i/steps+dy,color);
}
function dot(p,r,color) {for(let y=-r;y<=r;y++)for(let x=-r;x<=r;x++)if(x*x+y*y<=r*r)pixel(p.x+x,p.y+y,color);}
const screen=(x,z)=>({x:x-field.x0,y:height-1-(z-field.z0)});
// 地表逐像素取样；阴影取高度场的差分梯度，不依赖画面引擎。
for(let y=header;y<height;y++) for(let x=0;x<width;x++) {
  const wx=field.x0+x,wz=field.z0+height-1-y,type=track.surfaceAt(wx,wz);
  const slope=(track.heightAt(wx-2,wz+2)-track.heightAt(wx+2,wz-2))*.045;
  const shade=clamp(.93+slope,.55,1.18);
  let color=palette[type];
  if(type===1&&Math.floor((wx+wz)/5)%2===0)color=[184,48,42];
  pixel(x,y,color.map(v=>clamp(Math.round(v*shade),0,255)));
}
for(const branch of track.branches) for(let s=0;s<branch.length;s+=5) {
  const a=branch.at(s),b=branch.at(Math.min(s+3,branch.length));line(screen(a.x,a.z),screen(b.x,b.z),[61,189,227]);
}
const white=[248,244,224],green=[71,233,129];
// 文本由 SVG 字形栅格化后叠在 RGBA 底图上，标注不进入确定性模拟。
const texts=[];
function text(x,y,label,size=14,color='#fff2d6',anchor='start') {texts.push(`<text x="${x}" y="${y}" fill="${color}" font-size="${size}" text-anchor="${anchor}" stroke="#20232a" stroke-width="3" paint-order="stroke">${label}</text>`);}
for(let s=100;s<track.length;s+=220) {
  const p=track.at(s),a=screen(p.x,p.z),b={x:a.x+p.tx*13,y:a.y-p.tz*13};
  line(a,b,green,1);line(b,{x:b.x-p.tx*6+p.tz*4,y:b.y+p.tz*6+p.tx*4},green);line(b,{x:b.x-p.tx*6-p.tz*4,y:b.y+p.tz*6-p.tx*4},green);
}
for(const gate of track.checkpointGates) {
  for(const l of gate.lines)line(screen(l.a.x,l.a.z),screen(l.b.x,l.b.z),white,2);
  const p=screen(gate.x,gate.z);dot({x:p.x+19,y:p.y-12},11,[28,34,42]);text(p.x+19,p.y-7,gate.id,13,'#fff2d6','middle');
}
const featureColors={gap:'#ed5353',boost:'#40bcff',cones:'#ff973d',slot:'#da6cff',ramp:'#ffcf4c',rockfall:'#ef7960',tunnel:'#7f9ebc',coins:'#ffe367',landmarks:'#efe7ca'};
for(const f of track.features) {
  const color=featureColors[f.type],rgb=color.slice(1).match(/../g).map(v=>parseInt(v,16)),p=screen(f.x,f.z);
  dot(p,f.type==='landmarks'?3:5,rgb);
  if(f.type==='gap'||f.type==='tunnel') {
    const a=track.at(f.from),b=track.at(f.to);line(screen(a.x,a.z),screen(b.x,b.z),rgb,3);
  }
  if(f.type==='cones')for(const item of f.items)dot(screen(item.x,item.z),2,rgb);
  if(f.type==='coins')for(let i=0;i<f.count;i++){const p=track.at(f.from+(f.to-f.from)*i/(f.count-1));dot(screen(p.x-p.tz*(f.lateral||0),p.z+p.tx*(f.lateral||0)),2,rgb);}
}
const start=screen(0,0);text(start.x+25,start.y+24,'START / FINISH',16,'#47e981');dot(start,6,green);
// 图例独立放在地图上方，颜色与地表/机关标记一一对应。
for(let y=0;y<header;y++)for(let x=0;x<width;x++)pixel(x,y,[27,32,40]);
text(22,25,`DESERT LOOP  /  ${track.length.toFixed(0)} m  /  3 LAPS  /  NORTH UP  /  1 px = 1 m`,17);
['ROAD','CURB','SAND','GRAVEL','SALT','ROCK','GAP'].forEach((label,i)=>{dot({x:28+i*126,y:48},6,palette[i]);text(40+i*126,53,label,12);});
Object.entries(featureColors).forEach(([label,color],i)=>{const x=28+i*150;dot({x,y:80},5,color.slice(1).match(/../g).map(v=>parseInt(v,16)));text(x+12,85,label.toUpperCase(),12);});
const svg=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><g font-family="sans-serif" font-weight="bold">${texts.join('')}</g></svg>`);
const output=resolve(process.argv[2]||'recordings/track-preview.png');await mkdir(dirname(output),{recursive:true});
await sharp(pixels,{raw:{width,height,channels:4}}).composite([{input:svg}]).png().toFile(output);
console.log(`已生成俯视图：${output}（${width} × ${height}）`);
