// 竞速模式的天空与光照：沿用第一版的沙漠实拍 HDR（环境光与车漆反射）和做过色调映射的 8K 全景背景，太阳方向取自 HDR 最亮点
import * as THREE from 'three';
import { loadHDR } from '../../game/assets.js';
import { createSkyMaterial } from '../../game/desert.js';
export async function createDesertSky(scene,renderer){
 const { hdr,sunDir }=await loadHDR('/assets/hdri/goegap_road_2k.hdr');
 scene.environment=hdr;scene.background=null;scene.fog=new THREE.FogExp2('#c4b293',.0007);
 // 背景球跟着镜头走，永远在最远处；BackSide 从内部看要镜像 x 才不反转全景
 const sky=new THREE.Mesh(new THREE.SphereGeometry(1500,96,48),await createSkyMaterial(renderer));
 sky.material.side=THREE.BackSide;sky.scale.x=-1;sky.renderOrder=-1;sky.frustumCulled=false;scene.add(sky);
 const sun=new THREE.DirectionalLight('#fff0dc',3.2);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.bias=-.0002;sun.shadow.normalBias=.02;
 Object.assign(sun.shadow.camera,{left:-12,right:12,top:12,bottom:-12,near:1,far:160});scene.add(sun,sun.target);
 // 每帧把天空球和阴影相机挪到车旁
 function update(camera,car){sky.position.copy(camera.position);sun.target.position.copy(car);sun.position.copy(car).addScaledVector(sunDir,80);}
 return {update,sunDir};
}
