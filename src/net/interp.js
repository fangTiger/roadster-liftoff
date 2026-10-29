// 缓冲与采样均返回新对象，不改动原状态；每辆远端车独立保存缓冲。
export function pushState(buffer,state) {
 const last=buffer.at(-1);
 if(last&&(state.seq<=last.seq||state.simT<last.simT))return buffer;
 return [...buffer.slice(-63),{...state}];
}
// 渲染默认延迟 100ms；接触可传当前物理步的模拟时刻，掉线始终按接收时刻判断。
export function sampleState(buffer,serverNow,time=serverNow-100) {
 if(!buffer.length)return null;
 const latest=buffer.at(-1),stale=serverNow-latest.serverT>3000;
 if(time<=buffer[0].simT)return {...buffer[0],stale};
 for(let i=1;i<buffer.length;i++){
  const a=buffer[i-1],b=buffer[i];if(time>b.simT)continue;
  if(time===b.simT)return {...b,stale};
  const alpha=(time-a.simT)/Math.max(1,b.simT-a.simT),out={...a,stale};
  for(const key of ['x','y','z','pitch','vx','vz','steer','s'])out[key]=a[key]+(b[key]-a[key])*alpha;
  const turn=Math.atan2(Math.sin(b.yaw-a.yaw),Math.cos(b.yaw-a.yaw));out.yaw=a.yaw+turn*alpha;return out;
 }
 const dt=Math.max(0,Math.min(250,time-latest.simT))/1000;
 return {...latest,x:latest.x+latest.vx*dt,z:latest.z+latest.vz*dt,stale};
}
