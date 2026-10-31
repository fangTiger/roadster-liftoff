import { TRACKS } from '../track/data/index.js';
import { buildTrack } from '../track/build.js';
const cache=new Map();
/** 长度和小图均取自比赛使用的同一条中心线，避免手绘示意与实景脱节。 */
export function trackPreview(id) {
 if(cache.has(id))return cache.get(id);
 const entry=TRACKS.find(entry=>entry.def.id===id)||TRACKS[0],track=buildTrack(entry.def);
 const points=Array.from({length:128},(_,i)=>track.at(track.length*i/128));
 const xmin=Math.min(...points.map(p=>p.x)),zmin=Math.min(...points.map(p=>p.z));
 const scale=88/Math.max(...points.map(p=>p.x-xmin),...points.map(p=>p.z-zmin));
 const path='M'+points.map(p=>`${(6+(p.x-xmin)*scale).toFixed(1)},${(6+(p.z-zmin)*scale).toFixed(1)}`).join('L')+'Z';
 const preview={image:`/assets/race/previews/${entry.difficulty}.webp`,path,length:Math.round(track.length),difficulty:entry.difficulty,jet:entry.def.id===3};
 cache.set(id,preview);return preview;
}
