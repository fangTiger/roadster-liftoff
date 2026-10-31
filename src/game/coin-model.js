import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
// 两种模式共用原始旋转体、浮雕贴图与材质；调用方仅决定位置和缩放。
export function createCoinModel() {
 const points=[[0,.026],[.355,.026],[.372,.036],[.4,.036],[.42,.018],[.42,-.018],[.4,-.036],[.372,-.036],[.355,-.026],[0,-.026]].map(([x,y])=>new THREE.Vector2(x,y));
 const geometry=new THREE.LatheGeometry(points,40);geometry.rotateX(Math.PI/2);geometry.computeVertexNormals();
 const material=new THREE.MeshStandardMaterial({color:'#ffc94a',metalness:1,roughness:.26,emissive:'#6b4300',emissiveIntensity:.45});
 const texture=new THREE.TextureLoader().load('/assets/props/coin-face.webp');texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=8;
 const faceMaterial=new THREE.MeshStandardMaterial({color:'#ffd36a',metalness:1,roughness:.3,map:texture,bumpMap:texture,bumpScale:4,emissive:'#6b4300',emissiveMap:texture,emissiveIntensity:.75});
 const front=new THREE.CircleGeometry(.36,64);front.translate(0,0,.0262);
 const back=new THREE.CircleGeometry(.36,64);back.rotateY(Math.PI);back.translate(0,0,-.0262);
 const faceGeometry=mergeGeometries([front,back]);front.dispose();back.dispose();
 let disposed=false;
 return {geometry,material,faceGeometry,faceMaterial,dispose(){if(disposed)return;disposed=true;for(const resource of [geometry,material,faceGeometry,faceMaterial,texture])resource.dispose();}};
}
