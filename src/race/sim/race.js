import { atan2 } from './fmath.js';
const cross = (ax,az,bx,bz) => ax*bz-az*bx;
function crossing(prev,pos,line) {
  const dx=pos.x-prev.x,dz=pos.z-prev.z,ex=line.b.x-line.a.x,ez=line.b.z-line.a.z;
  const den=cross(dx,dz,ex,ez);
  if(Math.abs(den)<1e-12) return null;
  const ax=line.a.x-prev.x,az=line.a.z-prev.z;
  const t=cross(ax,az,ex,ez)/den,u=cross(ax,az,dx,dz)/den;
  return t>1e-10&&t<=1+1e-10&&u>=0&&u<=1?t:null;
}
export function createRace(track,{laps=3,dt=1/120}={}) {
  if(!Number.isInteger(laps)||laps<1||!Number.isFinite(dt)||dt<=0) throw new RangeError('圈数与步长必须为正数');
  const gates=track.checkpointGates,countdownSteps=Math.ceil(3/dt),wrongSteps=Math.ceil(2/dt);
  const state={frozen:true,countdown:3,finished:false,steps:0,elapsed:0,lap:1,lapTime:0,lapTimes:[],sectorTimes:[],currentSectors:[],bestLap:null,nextCheckpoint:0,missed:null,wrongWay:false,penalty:0};
  let countdown=0,lapStart=0,sectorStart=0,penalty=0,sectorPenalty=0,wrong=0,lastGate=gates.length-1,hint;
  function updateTime() {state.elapsed=state.steps*dt+state.penalty;state.lapTime=(state.steps-lapStart)*dt+penalty;}
  function step(prevPos,pos,carState) {
    if(state.finished) return state;
    if(state.frozen) {
      countdown++;state.countdown=Math.max(0,(countdownSteps-countdown)*dt);
      if(countdown>=countdownSteps) state.frozen=false;
      return state;
    }
    state.steps++;updateTime();
    const near=track.nearest(pos.x,pos.z,hint);hint=near;
    const speed2=carState.vx*carState.vx+carState.vz*carState.vz;
    wrong=speed2>9&&carState.vx*near.tx+carState.vz*near.tz<0?wrong+1:0;
    state.wrongWay=wrong>=wrongSteps;
    // 同一步若穿过多条门，按交点沿移动线段的顺序处理。
    const hits=[];
    for(let i=0;i<gates.length;i++) {
      const gate=gates[i]; let first=null;
      for(const line of gate.lines||[gate]) {
        const tx=line.tx??gate.tx,tz=line.tz??gate.tz;
        if((pos.x-prevPos.x)*tx+(pos.z-prevPos.z)*tz<=0) continue;
        const t=crossing(prevPos,pos,line);
        if(t!==null&&(first===null||t<first)) first=t;
      }
      if(first!==null) hits.push({i,t:first});
    }
    hits.sort((a,b)=>a.t-b.t||a.i-b.i);
    for(const hit of hits) {
      if(hit.i!==state.nextCheckpoint) {
        if(hit.i===gates.length-1) state.missed=gates[state.nextCheckpoint].id;
        continue;
      }
      state.currentSectors.push((state.steps-sectorStart)*dt+penalty-sectorPenalty);
      sectorStart=state.steps;sectorPenalty=penalty;lastGate=hit.i;state.nextCheckpoint++;
      if(state.nextCheckpoint===gates.length) {
        const time=(state.steps-lapStart)*dt+penalty;
        state.lapTimes.push(time);state.sectorTimes.push(state.currentSectors);state.currentSectors=[];
        state.bestLap=state.bestLap===null?time:Math.min(state.bestLap,time);
        state.missed=null;state.nextCheckpoint=0;lapStart=state.steps;sectorStart=state.steps;penalty=0;sectorPenalty=0;
        state.finished=state.lapTimes.length===laps;state.lap=Math.min(laps,state.lapTimes.length+1);
        if(state.finished) break;
      }
    }
    updateTime();return state;
  }
  function requestReset() {
    const gate=gates[lastGate];
    if(!state.frozen&&!state.finished) {penalty+=3;state.penalty+=3;updateTime();}
    wrong=0;state.wrongWay=false;hint=undefined;
    // 朝向约定：0 指向 +z，正值转向 +x，供下一批车辆物理使用。
    return {x:gate.x,z:gate.z,y:gate.y,yaw:atan2(gate.tx,gate.tz),tx:gate.tx,tz:gate.tz,s:gate.s};
  }
  return {state,step,requestReset};
}
