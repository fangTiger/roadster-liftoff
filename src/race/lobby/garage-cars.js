import { createCar } from '../../game/car.js';

/** 每个实例拥有独立 GPU 资源；去重释放允许多网格共用同一材质。 */
export function disposeGarageObject(root, { closeImages = false } = {}) {
 if (!root || root.userData.garageDisposed) return;
 root.userData.garageDisposed = true;
 const resources = new Set(), images = new Set();
 root.traverse(object => {
  if (object.geometry) resources.add(object.geometry);
  for (const material of [object.material].flat().filter(Boolean)) {
   resources.add(material);
   for (const value of Object.values(material)) if (value?.isTexture) { resources.add(value); if (value.image?.close) images.add(value.image); }
  }
 });
 root.removeFromParent();
 for (const resource of resources) resource.dispose();
 if (closeImages) for (const image of images) image.close();
}

/** 同时支持标准工厂和自定义车型的释放器，防止离场节点残留。 */
export function disposeGarageCar(root) {
 if (!root || root.userData.garageDisposed) return;
 if (root.userData.dispose) root.userData.dispose();
 else disposeGarageObject(root, { closeImages: true });
 root.userData.garageDisposed = true;
 root.removeFromParent?.();
}

/** 与远端车辆相同，只给 car_main_paint 着座位色，克隆缓存避免互相污染。 */
export function cloneGarageCar(source, color) {
 const root = source.clone(true), cache = new Map();
 const clone = resource => {
  if (!cache.has(resource)) cache.set(resource, resource.clone());
  return cache.get(resource);
 };
 root.traverse(object => {
  // 原车预置的推进器强度为零仍会提交绘制，大厅只保留新触发的尾焰。
  if(object.material?.isShaderMaterial&&object.material.uniforms.k?.value===0)object.visible=false;
  if (object.geometry) object.geometry = clone(object.geometry);
  if (!object.material) return;
  const material = source => {
   const copy = clone(source);
   for (const [key, value] of Object.entries(source)) if (value?.isTexture) copy[key] = clone(value);
   if (copy.name === 'car_main_paint') copy.color.set(color);
   return copy;
  };
  object.material = Array.isArray(object.material) ? object.material.map(material) : material(object.material);
 });
 root.userData.dispose = () => disposeGarageObject(root);
 return root;
}

/** 源车只加载一次；销毁期间完成的加载同样释放。 */
export function createGarageCarLoader(factory = createCar) {
 let source, pending, disposed = false;
 return {
  async load(color) {
   if (disposed) throw new Error('展厅已释放');
   pending ??= factory().then(car => {
    const model = car.root;
    if (disposed) disposeGarageObject(model, { closeImages: true });
    else source = model;
    return model;
   }).catch(error => { pending = null; throw error; });
   const model = await pending;
   if (disposed) throw new Error('展厅已释放');
   return cloneGarageCar(model, color);
  },
  dispose() { if (disposed) return; disposed = true; disposeGarageObject(source, { closeImages: true }); source = null; pending = null; },
 };
}

/** 异步结果必须匹配当前席位代际；准备/语言更新不重复加载车辆。 */
export function createSeatLoader(loadCar, onAttach, onRemove, onError = () => {}) {
 let layout = Array(6).fill(null), disposed = false;
 const tokens = Array(6).fill(0), cars = new Map();
 const release = disposeGarageCar;
 return {
  update(next) {
   if (disposed) return;
   const previous = layout; layout = next;
   for (let i = 0; i < 6; i++) {
    const old = previous[i], data = next[i];
    if (old?.id === data?.id && old?.color === data?.color) continue;
    const token = ++tokens[i];
    if (cars.has(i)) { onRemove(cars.get(i), i); cars.delete(i); }
    if (!data) continue;
    Promise.resolve(loadCar(data.color)).then(car => {
     if (disposed || tokens[i] !== token) { release(car); return; }
     cars.set(i, car); onAttach(car, i, layout[i]);
    }).catch(error => { if (!disposed && tokens[i] === token) onError(error, i); });
   }
  },
  dispose() {
   if (disposed) return; disposed = true;
   for (const car of cars.values()) release(car);
   cars.clear(); layout = [];
  },
 };
}
