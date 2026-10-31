import * as THREE from 'three';

export function intersects(a,b) {
 return a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
}
/** 过滤不可见的推进器/等离子占位，得到车根节点局部坐标包围盒。 */
export function measureCarBounds(car) {
 return new THREE.Box3().setFromPoints(measureCarCorners(car));
}
/** 缓存每个可见零件的八角点，投影时不引入车身整体空角。 */
export function measureCarCorners(car) {
 car.updateWorldMatrix(true,true);
 const inverse=car.matrixWorld.clone().invert(),points=[];
 car.traverseVisible(object=>{
  if(!object.isMesh)return;
  object.geometry.computeBoundingBox();
  const box=object.geometry.boundingBox,matrix=inverse.clone().multiply(object.matrixWorld);
  for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])points.push(new THREE.Vector3(x,y,z).applyMatrix4(matrix));
 });
 return points;
}
/** 只投影车身缓存包围盒，不让准备尾焰撑大避让区。 */
export function projectCarBounds(bounds,matrix,camera,width,height) {
 if(!bounds||(bounds.isBox3?bounds.isEmpty():!bounds.length))return null;
 const corners=bounds.isBox3?[]:bounds;
 if(bounds.isBox3)for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z])corners.push(new THREE.Vector3(x,y,z));
 let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;
 const point=new THREE.Vector3();
 for(const corner of corners){
  point.copy(corner).applyMatrix4(matrix).project(camera);
  const px=(point.x*.5+.5)*width,py=(-point.y*.5+.5)*height;
  left=Math.min(left,px);right=Math.max(right,px);top=Math.min(top,py);bottom=Math.max(bottom,py);
 }
 return {left,right,top,bottom};
}
/** 台前先横移再向下避让，并把已分配的名牌作为障碍，避免成排堆到主车脚下。 */
export function placePlate({x,y,width,height},boxes,stageWidth,stageHeight=Infinity) {
 const clamp=left=>Math.max(4,Math.min(stageWidth-width-4,left)),ideal=clamp(x-width/2);
 const obstacles=boxes.filter(Boolean),candidates=[ideal,...obstacles.flatMap(box=>[clamp(box.left-width-10),clamp(box.right+10)])];
 let best,score=Infinity;
 for(const left of candidates){
  const rect={left,right:left+width,top:y,bottom:y+height};
  for(let pass=0;pass<=obstacles.length;pass++){
   const hits=obstacles.filter(box=>intersects(rect,box));if(!hits.length)break;
   rect.top=Math.max(...hits.map(box=>box.bottom))+10;rect.bottom=rect.top+height;
  }
  const cost=(rect.top-y)*10+Math.abs(left-ideal)+Math.max(0,rect.bottom-stageHeight+12)*1000;
  if(cost<score){best=rect;score=cost;}
 }
 return best;
}
