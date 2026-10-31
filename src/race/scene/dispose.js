// 房间换局时共享资源只释放一次，实例网格另行释放实例缓冲。
export function disposeRaceObjects(objects) {
 const resources=new Set();
 for(const object of objects){object.removeFromParent();object.traverse(child=>{
  if(child.isInstancedMesh)child.dispose();
  if(child.geometry&&!child.isSprite)resources.add(child.geometry);
  for(const material of [].concat(child.material||[])){resources.add(material);for(const value of Object.values(material))if(value?.isTexture)resources.add(value);}
 });}
 for(const resource of resources)resource.dispose();
}
