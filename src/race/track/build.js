import { clamp, lerp, smoothstep, fbm2 } from '../sim/fmath.js';
export const ROAD = 0, CURB = 1, SAND = 2, GRAVEL = 3, SALT = 4, ROCK = 5, GAP = 6;
const STRIDE = 7;
const distance = (a,b) => Math.sqrt((a.x-b.x)*(a.x-b.x)+(a.z-b.z)*(a.z-b.z));
const mod = (x,n) => x - Math.floor(x/n)*n;
const mixPoint = (a,b,t) => ({x:lerp(a.x,b.x,t),z:lerp(a.z,b.z,t),y:lerp(a.y,b.y,t)});
function curve(points, closed) {
  const dense = [], pointS = [0];
  let length = 0;
  const count = closed ? points.length : points.length - 1;
  const get = i => closed ? points[mod(i,points.length)] : points[clamp(i,0,points.length-1)];
  for (let i=0;i<count;i++) {
    const p1=get(i),p2=get(i+1);
    // 开放曲线的两端用外推虚点，避免重复端点导致参数除零。
    const p0=!closed&&i===0?mixPoint(p2,p1,2):get(i-1);
    const p3=!closed&&i===count-1?mixPoint(p1,p2,2):get(i+2);
    const knot = (a,b) => Math.sqrt(Math.max(.000001,distance(a,b)));
    const t0=0,t1=knot(p0,p1),t2=t1+knot(p1,p2),t3=t2+knot(p2,p3);
    const steps=Math.max(12,Math.ceil(distance(p1,p2)*4));
    for(let j=0;j<steps;j++) {
      const u=j/steps,t=lerp(t1,t2,u);
      const a=mixPoint(p0,p1,(t-t0)/(t1-t0)),b=mixPoint(p1,p2,(t-t1)/(t2-t1)),c=mixPoint(p2,p3,(t-t2)/(t3-t2));
      const d=mixPoint(a,b,(t-t0)/(t2-t0)),e=mixPoint(b,c,(t-t1)/(t3-t1));
      const q=mixPoint(d,e,(t-t1)/(t2-t1));
      q.w=lerp(p1.w,p2.w,u); q.bank=lerp(p1.bank,p2.bank,u);
      if(dense.length) length+=distance(dense[dense.length-1],q);
      q.s=length; dense.push(q);
      if(j===0) pointS[i]=length;
    }
  }
  const last={...get(count)}; length+=distance(dense[dense.length-1],last); last.s=length; dense.push(last); pointS[count]=length;
  const n=Math.ceil(length)+1,samples=new Float64Array(n*STRIDE);
  let k=0;
  for(let i=0;i<n;i++) {
    const s=Math.min(i,length);
    while(k<dense.length-2&&dense[k+1].s<s) k++;
    const a=dense[k],b=dense[k+1],u=(s-a.s)/(b.s-a.s),o=i*STRIDE;
    samples[o]=lerp(a.x,b.x,u); samples[o+1]=lerp(a.z,b.z,u); samples[o+2]=lerp(a.y,b.y,u);
    samples[o+5]=lerp(a.w,b.w,u); samples[o+6]=lerp(a.bank,b.bank,u);
  }
  for(const [i,p] of [[0,points[0]],[n-1,get(count)]]) {const o=i*7;samples[o]=p.x;samples[o+1]=p.z;samples[o+2]=p.y;samples[o+5]=p.w;samples[o+6]=p.bank;}
  for(let i=0;i<n;i++) {
    const prev=i===0?(closed?n-2:0):i-1,next=i===n-1?(closed?1:n-1):i+1;
    const dx=samples[next*7]-samples[prev*7],dz=samples[next*7+1]-samples[prev*7+1],l=Math.sqrt(dx*dx+dz*dz);
    samples[i*7+3]=dx/l; samples[i*7+4]=dz/l;
  }
  function at(s) {
    s=closed&&s!==length?mod(s,length):clamp(s,0,length);
    const i=Math.min(Math.floor(s),n-2),u=(s-i)/(Math.min(i+1,length)-i),o=i*7;
    return {x:lerp(samples[o],samples[o+7],u),z:lerp(samples[o+1],samples[o+8],u),y:lerp(samples[o+2],samples[o+9],u),tx:lerp(samples[o+3],samples[o+10],u),tz:lerp(samples[o+4],samples[o+11],u),w:lerp(samples[o+5],samples[o+12],u),bank:lerp(samples[o+6],samples[o+13],u)};
  }
  return {length,samples,pointS,at,closed};
}
const inside = (x,z,r) => x>=r.x0&&x<=r.x1&&z>=r.z0&&z<=r.z1;
function edgeDistance(x,z,r) {
  if(inside(x,z,r)) return -Math.min(x-r.x0,r.x1-x,z-r.z0,r.z1-z);
  const dx=Math.max(r.x0-x,0,x-r.x1),dz=Math.max(r.z0-z,0,z-r.z1);
  return Math.sqrt(dx*dx+dz*dz);
}
export function buildTrack(def) {
  const main={id:'main',...curve(def.points,true)};
  const branches=(def.branches||[]).map(b=>{
    const from=main.pointS[b.from],to=main.pointS[b.to],points=b.points.map(p=>({...p}));
    // 接口以重采样后的主线为准，消除微米级端点误差造成的漏检。
    points[0]={...points[0],...main.at(from)};points[points.length-1]={...points[points.length-1],...main.at(to)};
    return {...b,...curve(points,false),from,to};
  });
  const paths=[main,...branches], sections=def.sections.map(s=>({...s,from:main.pointS[s.from],to:main.pointS[s.to]}));
  const features=(def.features||[]).map(f=>{
    const section=sections[f.section-1],from=lerp(section.from,section.to,f.u);
    const to=f.end===undefined?from:lerp(section.from,section.to,f.end);
    const path=paths.find(p=>p.id===f.path)||main,point=path.at(f.pathU===undefined?from:path.length*f.pathU);
    const lateral=f.lateral||0;
    return {...f,s:from,from,to,x:point.x-point.tz*lateral,z:point.z+point.tx*lateral,y:point.y,tx:point.tx,tz:point.tz,
      items:f.items?.map(item=>{const s=lerp(section.from,section.to,item.u),p=main.at(s);return {...item,s,x:p.x-p.tz*item.lateral,z:p.z+p.tx*item.lateral};})};
  });
  const gaps=features.filter(f=>f.type==='gap');
  const gapShapes=gaps.map(f=>{const a=main.at(f.from),b=main.at(f.to),dx=b.x-a.x,dz=b.z-a.z;return {a,b,dx,dz,l:Math.sqrt(dx*dx+dz*dz),depth:f.depth};});
  const isGap = n => n.path==='main'&&gaps.some(f=>n.s>=f.from&&n.s<=f.to)&&Math.abs(n.lateral)<=n.w/2+.8;
  // 24 米空间桶用于无提示查询；有提示仅搜索附近 32 米，并考虑分支交汇。
  const buckets=new Map(),cell=24;
  for(const path of paths) for(let i=0;i<path.samples.length/7-1;i++) {
    const a=path.samples,o=i*7,key=`${Math.floor(a[o]/cell)},${Math.floor(a[o+1]/cell)}`;
    if(!buckets.has(key)) buckets.set(key,[]);
    buckets.get(key).push([path,i]);
  }
  // 包围盒树保证远离道路的查询也只访问少量线段（俯视图会覆盖整幅地形）。
  const entries=[];
  for(const path of paths) for(let i=0;i<path.samples.length/7-1;i++) {
    const a=path.samples,o=i*7;entries.push({path,i,x0:Math.min(a[o],a[o+7]),x1:Math.max(a[o],a[o+7]),z0:Math.min(a[o+1],a[o+8]),z1:Math.max(a[o+1],a[o+8])});
  }
  function tree(items) {
    const node={x0:Infinity,x1:-Infinity,z0:Infinity,z1:-Infinity};
    for(const e of items) {node.x0=Math.min(node.x0,e.x0);node.x1=Math.max(node.x1,e.x1);node.z0=Math.min(node.z0,e.z0);node.z1=Math.max(node.z1,e.z1);}
    if(items.length<=12) node.items=items;
    else {const axis=node.x1-node.x0>node.z1-node.z0?'x':'z';items.sort((a,b)=>a[axis+'0']+a[axis+'1']-b[axis+'0']-b[axis+'1']);const mid=Math.floor(items.length/2);node.left=tree(items.slice(0,mid));node.right=tree(items.slice(mid));}
    return node;
  }
  const root=tree(entries);
  function nearest(x,z,hint) {
    let best=null,bestD=Infinity;
    function visit(path,i) {
      const a=path.samples,o=i*7,dx=a[o+7]-a[o],dz=a[o+8]-a[o+1],den=dx*dx+dz*dz;
      const u=clamp(((x-a[o])*dx+(z-a[o+1])*dz)/den,0,1),px=a[o]+dx*u,pz=a[o+1]+dz*u;
      const ex=x-px,ez=z-pz,d=ex*ex+ez*ez;
      if(d<bestD) {
        const len=Math.sqrt(den); bestD=d;
        best={path:path.id,s:i+u*(Math.min(i+1,path.length)-i),lateral:(dx*ez-dz*ex)/len,index:i,y:lerp(a[o+2],a[o+9],u),w:lerp(a[o+5],a[o+12],u),tx:dx/len,tz:dz/len,bank:lerp(a[o+6],a[o+13],u),distance:Math.sqrt(d)};
      }
    }
    if(hint!==undefined&&hint!==null) {
      const path=paths.find(p=>p.id===(hint.path||'main'))||main,index=typeof hint==='number'?hint:hint.index,n=path.samples.length/7-1;
      for(let j=index-32;j<=index+32;j++) if(path.closed||(j>=0&&j<n)) visit(path,mod(j,n));
      // 同时查相邻空间桶，以便在分支入口自然切换路径。
      const bx=Math.floor(x/cell),bz=Math.floor(z/cell);
      for(let dz=-1;dz<=1;dz++) for(let dx=-1;dx<=1;dx++) for(const [p,i] of buckets.get(`${bx+dx},${bz+dz}`)||[]) if(p!==path) visit(p,i);
    } else {
      const bound=n=>{const dx=Math.max(n.x0-x,0,x-n.x1),dz=Math.max(n.z0-z,0,z-n.z1);return dx*dx+dz*dz;};
      function search(node) {
        if(bound(node)>bestD) return;
        if(node.items) {for(const e of node.items) visit(e.path,e.i);return;}
        const left=bound(node.left),right=bound(node.right);
        if(left<=right) {search(node.left);search(node.right);} else {search(node.right);search(node.left);}
      }
      search(root);
    }
    return best;
  }
  const terrain=def.terrain||{},plateaus=terrain.plateaus||[];
  function natural(x,z) {
    let y=(fbm2(x/160,z/160,terrain.seed,4)-.5)*5;
    if(terrain.salt) y=lerp(y,0,1-smoothstep(-20,25,edgeDistance(x,z,terrain.salt)));
    for(const r of plateaus) y=lerp(y,r.height,1-smoothstep(-8,8,edgeDistance(x,z,r)));
    if(terrain.canyon&&inside(x,z,terrain.canyon)) y=terrain.canyon.height;
    return y;
  }
  let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
  for(const path of paths) for(let i=0;i<path.samples.length;i+=7) {minX=Math.min(minX,path.samples[i]);maxX=Math.max(maxX,path.samples[i]);minZ=Math.min(minZ,path.samples[i+1]);maxZ=Math.max(maxZ,path.samples[i+1]);}
  const x0=Math.floor((minX-300)/2)*2,z0=Math.floor((minZ-300)/2)*2;
  const width=Math.ceil((maxX+300-x0)/2)+1,height=Math.ceil((maxZ+300-z0)/2)+1;
  const heights=new Float32Array(width*height),distances=new Float64Array(width*height),roadY=new Float64Array(width*height),roadW=new Float64Array(width*height);
  distances.fill(Infinity);
  // 从路向外栅格化压平带，避免每个地形格点都全局搜索四千条线段。
  for(const path of paths) for(let i=0;i<path.samples.length/7;i+=2) {
    const a=path.samples,o=i*7,s=Math.min(i,path.length),w=a[o+5];
    if(isGap({path:path.id,s,lateral:0,w})) continue;
    const cx=(a[o]-x0)/2,cz=(a[o+1]-z0)/2,radius=w/2+15,rad=Math.ceil(radius/2);
    for(let iz=Math.max(0,Math.floor(cz)-rad);iz<=Math.min(height-1,Math.ceil(cz)+rad);iz++) for(let ix=Math.max(0,Math.floor(cx)-rad);ix<=Math.min(width-1,Math.ceil(cx)+rad);ix++) {
      const dx=x0+ix*2-a[o],dz=z0+iz*2-a[o+1],d=dx*dx+dz*dz,k=iz*width+ix;
      if(d<distances[k]&&d<=radius*radius) { distances[k]=d;roadY[k]=a[o+2]+(-a[o+4]*dx+a[o+3]*dz)*a[o+6];roadW[k]=w; }
    }
  }
  for(let iz=0;iz<height;iz++) for(let ix=0;ix<width;ix++) {
    const k=iz*width+ix,x=x0+ix*2,z=z0+iz*2,d=Math.sqrt(distances[k]);
    heights[k]=lerp(roadY[k],natural(x,z),smoothstep(roadW[k]/2+2,roadW[k]/2+15,d));
    // 缺口不能被桥头的压平过渡带重新填上。
    for(const {a,b,dx,dz,l,depth} of gapShapes) {
      const along=((x-a.x)*dx+(z-a.z)*dz)/l,side=((z-a.z)*dx-(x-a.x)*dz)/l;
      if(along>=0&&along<=l&&Math.abs(side)<=a.w/2+2) heights[k]=Math.min(a.y,b.y)-depth;
    }
  }
  function heightAt(x,z) {
    const gx=clamp((x-x0)/2,0,width-1),gz=clamp((z-z0)/2,0,height-1),ix=Math.min(width-2,Math.floor(gx)),iz=Math.min(height-2,Math.floor(gz)),k=iz*width+ix;
    return lerp(lerp(heights[k],heights[k+1],gx-ix),lerp(heights[k+width],heights[k+width+1],gx-ix),gz-iz);
  }
  function surfaceAt(x,z) {
    const n=nearest(x,z),d=n.distance;
    if(isGap(n)) return GAP;
    for(const f of features) if(f.type==='slot') {
      const dx=x-f.x,dz=z-f.z,along=dx*f.tx+dz*f.tz,lateral=Math.abs(-dx*f.tz+dz*f.tx);
      if(Math.abs(along)<f.rockRadius&&lateral>=f.width/2&&lateral<=f.width/2+2*f.rockRadius) return ROCK;
    }
    if(d<=n.w/2) return ROAD;
    if(d<=n.w/2+.8) return CURB;
    if(plateaus.some(r=>Math.abs(edgeDistance(x,z,r))<8)) return ROCK;
    if(terrain.canyon&&inside(x,z,terrain.canyon)) return GRAVEL;
    if(terrain.salt&&inside(x,z,terrain.salt)) return SALT;
    if(n.path!=='main'&&d<n.w/2+8) return GRAVEL;
    return SAND;
  }
  const walls=[];
  function branchOpening(a,b) {
    const dx=b.x-a.x,dz=b.z-a.z,den=dx*dx+dz*dz;
    for(const path of branches) for(let i=0;i<path.samples.length/7;i+=2) {
      const p=path.samples,o=i*7,u=clamp(((p[o]-a.x)*dx+(p[o+1]-a.z)*dz)/den,0,1);
      const ex=p[o]-a.x-u*dx,ez=p[o+1]-a.z-u*dz,r=p[o+5]/2+1.5;
      if(ex*ex+ez*ez<r*r) return true;
    }
    return false;
  }
  const segment=(a,b,type)=>{
    // 墙段最长八米：与分支路幅重叠时整段留空，保留安全的接入余量。
    if(type!=='slot'&&branchOpening(a,b)) return;
    walls.push({a:{x:a.x,z:a.z},b:{x:b.x,z:b.z},type});
  };
  const offset=(p,l)=>({x:p.x-p.tz*l,z:p.z+p.tx*l});
  for(const section of sections) for(let s=section.from;s<section.to;s+=8) {
    const p=main.at(s),q=main.at(Math.min(s+8,section.to));
    const n={path:'main',s,lateral:0,w:p.w};
    if(isGap(n)) continue;
    for(const side of [-1,1]) segment(offset(p,side*(p.w/2+1)),offset(q,side*(q.w/2+1)),section.id===6?'tunnel':'tires');
  }
  for(const r of plateaus) {
    const corners=[{x:r.x0,z:r.z0},{x:r.x1,z:r.z0},{x:r.x1,z:r.z1},{x:r.x0,z:r.z1}];
    for(let i=0;i<4;i++) {
      const a=corners[i],b=corners[(i+1)&3],steps=Math.ceil(distance(a,b)/8);
      for(let j=0;j<steps;j++) {const p=mixPoint(a,b,j/steps),q=mixPoint(a,b,(j+1)/steps),n=nearest((p.x+q.x)/2,(p.z+q.z)/2);if(n.distance>n.w/2+16) segment(p,q,'mesa');}
    }
  }
  for(const f of features.filter(f=>f.type==='slot')) for(const side of [-1,1]) {
    const point=(along,lateral)=>({x:f.x+f.tx*along-f.tz*lateral,z:f.z+f.tz*along+f.tx*lateral});
    const lo=side*f.width/2,hi=side*(f.width/2+2*f.rockRadius),r=f.rockRadius;
    const corners=[point(-r,lo),point(r,lo),point(r,hi),point(-r,hi)];
    for(let i=0;i<4;i++) segment(corners[i],corners[(i+1)&3],'slot');
  }
  const checkpointGates=def.checkpoints.map(cp=>{
    const s=main.pointS[cp.point],p=main.at(s),lines=[{a:offset(p,-p.w/2-.8),b:offset(p,p.w/2+.8),path:'main',tx:p.tx,tz:p.tz}];
    for(const branch of branches) if(s>branch.from&&s<branch.to) {
      const q=branch.at(branch.length*(s-branch.from)/(branch.to-branch.from));
      lines.push({a:offset(q,-q.w/2-.8),b:offset(q,q.w/2+.8),path:branch.id,tx:q.tx,tz:q.tz});
    }
    return {...cp,s,...lines[0],lines,x:p.x,z:p.z,y:p.y,tx:p.tx,tz:p.tz};
  });
  return {length:main.length,samples:main.samples,at:main.at,sections,features,branches,nearest,surfaceAt,heightAt,walls,checkpointGates,heightfield:{x0,z0,width,height,step:2,heights}};
}
// 文本键排序、数值缓冲显式小端；不依赖对象插入顺序或机器端序。
export function trackHash(def) {
  const track=buildTrack(def); let hash=2166136261;
  const byte=b=>{hash=Math.imul(hash^b,16777619)>>>0;};
  const canonical=v=>v&&typeof v==='object'?(Array.isArray(v)?`[${v.map(canonical).join(',')}]`:`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`):JSON.stringify(v);
  for(const c of canonical(def)) { const n=c.charCodeAt(0);byte(n&255);byte(n>>>8); }
  const view=new DataView(new ArrayBuffer(8));
  for(const array of [track.samples,...track.branches.map(b=>b.samples),track.heightfield.heights]) for(const n of array) {view.setFloat64(0,n,true);for(let i=0;i<8;i++)byte(view.getUint8(i));}
  return hash.toString(16).padStart(8,'0');
}
