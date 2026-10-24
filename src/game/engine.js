// 渲染引擎：渲染器、后期链（泛光 → 色调映射 → 径向速度模糊与暗角）、尺寸自适应
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// 径向模糊：从画面中心向外采样，中心（车所在位置）保持清晰
const SpeedBlurShader = {
  uniforms: { tDiffuse: { value: null }, strength: { value: 0 }, center: { value: new THREE.Vector2(.5, .55) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float strength; uniform vec2 center; varying vec2 vUv;
    void main(){
      vec2 d=vUv-center; float r=length(d*vec2(1.6,1.)); float w=smoothstep(.3,.85,r)*strength;
      vec3 c=vec3(0.);
      for(int i=0;i<10;i++){ float t=float(i)/9.; c+=texture2D(tDiffuse,vUv-d*w*t).rgb; }
      c/=10.;
      c=(c-.5)*1.05+.5;
      float v=smoothstep(.95,.3,length(d*vec2(1.1,1.))); c*=mix(.78,1.,v);
      gl_FragColor=vec4(c,1.);
    }`
};

export function createEngine({ pixelRatio } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: /capture/.test(location.search) });
  renderer.setPixelRatio(pixelRatio ?? Math.min(devicePixelRatio, 1.75));
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .85;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, .05, 40000);
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  // 数值净化：把 NaN/Inf 和极端高亮钳制住，否则泛光会把单个坏像素扩散成大块白光
  composer.addPass(new ShaderPass({ uniforms: { tDiffuse: { value: null } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
      void main(){ vec4 c=texture2D(tDiffuse,vUv); bvec3 bad=bvec3(!(c.r==c.r)||c.r>6e4,!(c.g==c.g)||c.g>6e4,!(c.b==c.b)||c.b>6e4);
        if(any(bad)) c.rgb=vec3(0.); gl_FragColor=vec4(min(c.rgb,vec3(48.)),1.); }` }));
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), .35, .4, .95); composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const blur = new ShaderPass(SpeedBlurShader); composer.addPass(blur);

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
  });
  return { renderer, scene, camera, composer, bloom, blur, render: () => composer.render() };
}
