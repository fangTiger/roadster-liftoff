import * as THREE from 'three';
import { createGreybox } from './greybox.js';
import { createTerrain } from './terrain.js';
import { createProps } from './props.js';
import { createObstacles } from './obstacles.js';

// 所有资源就绪后才返回，让入口现有的预编译与加载遮罩涵盖新场景。
export async function createAlpine(scene, track, { tint, renderer } = {}) {
  if (scene.fog?.isFogExp2) scene.fog.density = .0011;
  const mobile = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const road = createGreybox(scene, track, { tint, scenery: false });
  const terrain = createTerrain(scene, track, { tint, mobile });
  const [props, obstacles] = await Promise.all([createProps(scene, track, { mobile, renderer }), createObstacles(scene, track)]);
  const sun = scene.children.find(o => o.isDirectionalLight), environment = scene.environmentIntensity, sunlight = sun?.intensity;
  const tunnelFill = new THREE.HemisphereLight(0xc2cada, 0x71634e, 0); scene.add(tunnelFill);
  const tunnels = track.features.filter(f => f.type === 'tunnel');
  let printed = false;
  const afterRender = scene.onAfterRender;
  scene.onAfterRender = function (...args) {
    afterRender?.apply(this, args);
    if (!printed && renderer && this.userData.alpineStep > 120) {
      printed = true;
      console.info('阿尔卑斯场景渲染统计', JSON.stringify({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, instances: props.count, mobile }));
    }
  };
  return { update(snapshot) {
    road.update(snapshot); terrain.update(snapshot.car); props.update(snapshot.car); obstacles.update(snapshot);
    scene.userData.alpineStep = snapshot.step;
    const near = snapshot.car.near;
    let darkness = 0;
    if (near.path === 'main') for (const f of tunnels) {
      if (Math.abs(near.lateral) < track.at(near.s).w / 2 + 1) darkness = Math.max(darkness, Math.max(0, Math.min(1, (near.s - f.from) / 10, (f.to - near.s) / 10)));
    }
    scene.environmentIntensity = environment * (1 - .55 * darkness);
    tunnelFill.intensity = .85 * darkness;
    if (sun) sun.intensity = sunlight * (1 - .9 * darkness);
  } };
}
