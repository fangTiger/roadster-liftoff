// 保存原材质状态，保护期结束时连玻璃的透明度与深度写入一起恢复。
export function createCarOpacity(root) {
 const originals=new Map();
 root.traverse(object=>{for(const material of [].concat(object.material||[]))if(!originals.has(material))originals.set(material,{opacity:material.opacity,transparent:material.transparent,depthWrite:material.depthWrite});});
 return opacity=>{
  for(const [material,base] of originals){
   const fade=opacity<.999,transparent=base.transparent||fade;
   material.opacity=base.opacity*opacity;material.depthWrite=base.depthWrite&&!fade;
   if(material.transparent!==transparent){material.transparent=transparent;material.needsUpdate=true;}
  }
 };
}
