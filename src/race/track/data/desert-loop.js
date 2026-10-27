// 坐标：x 向东、z 向北；从上方看逆时针。每段五个控制点，末点不重复起点。
// section.from/to 是控制点下标，to 可等于 points.length 表示回到 0；机关用 section + u 定位。
const scale = .95;
const routes = [
  [[0,90],[0,180],[0,270],[0,360],[0,450]],
  [[0,480],[-15,510],[-60,520],[-100,490],[-100,450]],
  [[-150,370],[-260,390],[-180,300],[-310,260],[-400,300]],
  [[-460,300],[-520,300],[-580,300],[-640,300],[-700,300]],
  [[-740,240],[-700,170],[-790,100],[-730,30],[-760,-50]],
  [[-750,-95],[-730,-140],[-700,-180],[-675,-225],[-650,-270]],
  [[-635,-310],[-610,-350],[-570,-400],[-520,-450],[-470,-490]],
  [[-350,-490],[-230,-490],[-110,-490],[10,-490],[130,-490]],
  [[200,-505],[250,-550],[310,-545],[365,-490],[380,-400]],
  [[420,-350],[440,-275],[425,-195],[390,-120],[310,-80]],
  [[220,-70],[130,-65],[50,-60],[0,-45],[0,0]],
];
const widths = [12,14,10,12,9,10,12,30,12,12,14];
const heights = [[0,0,0,0,0],[0,0,0,0,0],[6,12,18,24,30],[30,30,30,30,30],[33,28,32,27,30],[30,30,30,30,30],[34,30,20,8,0],[0,0,0,0,0],[0,0,0,0,0],[1,3,4,2,0],[0,0,0,0,0]];
const labels = [['发车直道','Starting Straight'],['发卡弯','Hairpin'],['盘山回头弯','Mesa Switchbacks'],['峡谷断桥','Canyon Bridge'],['巨石 S 弯','Boulder Slalom'],['穿山隧道','Mountain Tunnel'],['坡顶跳台','Mesa Jump'],['干盐湖高速段','Salt Flat'],['翻滚捷径','Roll Shortcut'],['滚石区','Rockfall Run'],['高速大弯','Final Sweeper']];
const points = [{ x: 0, z: 0, y: 0, w: 12, bank: 0 }];
for (let s = 0; s < routes.length; s++) for (let j = 0; j < 5; j++) {
  if (s === 10 && j === 4) continue;
  const [x,z] = routes[s][j];
  points.push({ x: x * scale, z: z * scale, y: heights[s][j], w: widths[s], bank: s === 2 ? (j & 1 ? -.06 : .06) : 0 });
}
const sections = labels.map(([zh,en], i) => ({ id: i + 1, name: { zh,en }, from: i * 5, to: (i + 1) * 5 }));
const checkpoints = sections.map(s => ({ id: s.id, point: s.to === points.length ? 0 : s.to }));
const p = (x,z,y,w) => ({ x:x * scale, z:z * scale, y,w,bank:0 });
// 分支与主线共用端点；慢道在峡谷东侧下河床，从南侧绕过峡谷后回到台地。
const branches = [
  { id:'riverbed', from:16, to:20, points:[points[16],p(-470,250,17,8),p(-490,165,0,8),p(-560,140,-2,8),p(-660,180,7,8),p(-650,270,25,8),p(-660,300,30,8),points[20]] },
  { id:'roll-slot', from:41, to:44, points:[points[41],p(245,-470,0,3.2),p(310,-466,0,3.2),points[44]] },
];
const features = [
  {type:'gap',section:4,u:.47,end:.56,depth:25},
  {type:'boost',section:1,u:.889,lateral:0,length:16,width:9},
  {type:'boost',section:8,u:.25,lateral:-9,length:20,width:3},
  {type:'boost',section:8,u:.7,lateral:9,length:20,width:3},
  {type:'boost',section:11,u:.86,lateral:-3,length:14,width:3},
  {type:'cones',section:5,u:.15,items:Array.from({length:12},(_,i)=>({u:.1+i*.065,lateral:i&1 ? -2.5 : 2.5,kind:(i&3)===0?'concrete':'cone',radius:(i&3)===0?1.1:.35}))},
  {type:'slot',section:9,u:.5,path:'roll-slot',pathU:.5,width:1.35,rockRadius:4,height:7},
  {type:'ramp',section:7,u:.15,length:12,rise:4},
  {type:'rockfall',section:10,u:.45,period:5,phase:1.2,radius:1.1,lateralFrom:-22,lateralTo:22,duration:2.5},
  {type:'rockfall',section:10,u:.75,period:7,phase:3,radius:.7,lateralFrom:24,lateralTo:-24,duration:3,kind:'tumbleweed'},
  {type:'tunnel',section:6,u:.06,end:.94,height:7},
  ...[7,8,9].map(section=>({type:'coins',section,u:.2,end:.85,count:20,lateral:section===8?9:0,height:section===7?8:1})),
  ...labels.map(([zh,en],i)=>({type:'landmarks',section:i+1,u:.55,lateral:22,name:{zh:['发车拱门与计时塔','旧轮胎堆','输电塔','断桥残骸','红岩拱门','隧道警示条','废弃水塔','风化车骨架','双子巨石','落石警示牌','风车'][i],en}})),
];
const rect = (x0,x1,z0,z1,height) => ({x0:x0*scale,x1:x1*scale,z0:z0*scale,z1:z1*scale,height});
export const desertLoop = {
  id:1,key:'desert-loop',name:{zh:'沙漠环线',en:'Desert Loop'},laps:3,points,sections,checkpoints,features,branches,
  terrain:{seed:1031,plateaus:[rect(-545,-270,230,490,30),rect(-850,-570,-310,400,30)],canyon:rect(-568,-542,180,430,5),salt:rect(-490,160,-580,-420,0)},
};
export default desertLoop;
