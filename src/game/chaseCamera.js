// 追随镜头：弹簧跟随、随速度拉宽视野、起步时后拉并抖动、路肩颠簸
import * as THREE from 'three';

export function createChaseCamera(camera) {
  const pos = new THREE.Vector3(0, 1.6, 7), look = new THREE.Vector3();
  let shake = 0, t = 0;
  const tmp = new THREE.Vector3();
  function update(dt, car, s, shakeOn = true) {
    t += dt;
    const speed = s.v / 111;
    const launchKick = Math.max(0, s.a - 12) / 22;                 // 起步猛加速时镜头被“甩”向后
    shake = Math.max(shake * Math.exp(-dt * 5), launchKick * .9, s.offroad * Math.min(1, s.v / 20) * .7, s.landing * 1.6, s.lift * Math.max(0, 1 - s.y / 6) * .5);
    const air = Math.min(s.y, 15);
    const back = 6.4 + launchKick * 1.4 + speed * 1.2 + air * .1;
    const height = 1.45 + speed * .25 - air * .1;            // 空中镜头略低于车，平视前方，不俯拍照片地面
    // 镜头位置：车后方、随车头方向略偏，弹簧平滑
    tmp.set(Math.sin(s.yaw) * back * .55, height, Math.cos(s.yaw) * back).add(car.position);
    tmp.y = Math.max(tmp.y, .6);
    pos.lerp(tmp, 1 - Math.exp(-dt * (6 + speed * 6)));
    camera.position.copy(pos);
    const j = shakeOn ? shake * .05 : 0;           // 设置里可关闭镜头抖动
    camera.position.x += (Math.sin(t * 71) + Math.sin(t * 43)) * j;
    camera.position.y += (Math.sin(t * 59) + Math.sin(t * 37)) * j;
    look.set(car.position.x - Math.sin(s.yaw) * 6, car.position.y + .65 + air * .02, car.position.z - 8);
    camera.lookAt(look);
    camera.rotation.z += -s.steer * .012 * Math.min(1, s.v / 30);  // 转弯时轻微侧倾
    const fov = 50 + speed * 16 + launchKick * 4;
    if (Math.abs(camera.fov - fov) > .01) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 4); camera.updateProjectionMatrix(); }
  }
  return { update };
}
