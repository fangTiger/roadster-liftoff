import * as THREE from 'three';

// 只处理独立加载的影子车，所有材质先克隆，避免改动车身和原车的共享资源。
export function prepareGhostCar(car, name) {
  car.root.traverse(object => {
    object.castShadow = object.receiveShadow = false;
    if (!object.material) return;
    const clone = source => {
      const material = source.clone();
      material.transparent = true; material.opacity = .35; material.depthWrite = false;
      if (material.emissive) { material.emissive.set('#65bded'); material.emissiveIntensity = .45; }
      return material;
    };
    object.material = Array.isArray(object.material) ? object.material.map(clone) : clone(object.material);
    object.renderOrder = 11;
  });
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 96;
  const context = canvas.getContext('2d'), texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }));
  label.position.set(0, 2.3, 0); label.scale.set(3.2, .6, 1); label.renderOrder = 12;
  car.root.add(label);
  function setLabel(text) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#101a20cc'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#a5dcfa'; context.font = '500 42px "PingFang SC", sans-serif';
    context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(text, 256, 48, 480);
    texture.needsUpdate = true;
  }
  setLabel(name);
  return { ...car, setLabel };
}
