// 云海：穿出云层后脚下那片被阳光照亮的云顶。两层可平铺的分形噪声云，向后流动表现前进，
// 远处融入地平线雾霭；高度升到二三十公里后淡出，交给地球贴图自带的云层
import * as THREE from 'three';

function tileNoiseTexture(S, seed, octaves, scale) {
  let s = seed; const rnd = () => (s = s * 16807 % 2147483647) / 2147483647;
  const G = 64, grid = Array.from({ length: G * G }, rnd);                 // 周期网格，保证无缝平铺
  const at = (x, y) => grid[((y % G + G) % G) * G + ((x % G + G) % G)];
  const sm = t => t * t * (3 - 2 * t);
  const n2 = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), u = sm(x - xi), v = sm(y - yi);
    return (at(xi, yi) * (1 - u) + at(xi + 1, yi) * u) * (1 - v) + (at(xi, yi + 1) * (1 - u) + at(xi + 1, yi + 1) * u) * v; };
  const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'); const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let v = 0, a = .5, f = scale / S;
    for (let o = 0; o < octaves; o++) { const p = 1 << o; v += a * n2(x * f * p % (G * p) , y * f * p % (G * p)); a *= .5; }
    const i = (y * S + x) * 4; const k = Math.round(v * 255); img.data[i] = img.data[i + 1] = img.data[i + 2] = k; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace; return t;
}

export function createCloudSea(parent) {
  const noise = tileNoiseTexture(512, 5, 6, 64);
  const u = { noise: { value: noise }, off: { value: new THREE.Vector2() }, sunDir: { value: new THREE.Vector3(0, .3, -1) }, opacity: { value: 1 }, haze: { value: new THREE.Color('#9cc0ea') } };
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, uniforms: u,
    vertexShader: 'varying vec2 vUv; varying vec3 vW; void main(){ vUv=uv; vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }',
    fragmentShader: `uniform sampler2D noise; uniform vec2 off; uniform vec3 sunDir, haze; uniform float opacity; varying vec2 vUv; varying vec3 vW;
      void main(){
        vec2 p=vUv*18.+off;
        float a=texture2D(noise,p).r*.62+texture2D(noise,p*2.7+vec2(.31,.17)).r*.38;
        float cov=smoothstep(.36,.62,a);                                  // 覆盖率：大片云团、少量缝隙
        // 用高度差近似法线：受光一侧更亮，背光一侧偏蓝灰
        float dx=texture2D(noise,p+vec2(.004,0.)).r-texture2D(noise,p-vec2(.004,0.)).r;
        float dz=texture2D(noise,p+vec2(0.,.004)).r-texture2D(noise,p-vec2(0.,.004)).r;
        vec3 n=normalize(vec3(-dx*6.,1.,-dz*6.)); float lit=clamp(dot(n,normalize(sunDir))*.6+.55,0.,1.);
        vec3 col=mix(vec3(.55,.62,.75),vec3(1.25,1.2,1.12),lit)*(.75+.35*a);
        float d=length(vW.xz-cameraPosition.xz);
        float far=smoothstep(30.,140.,d);                                 // 远处融入地平线雾霭
        col=mix(col,haze*1.2,far*.85);
        gl_FragColor=vec4(col,cov*opacity*(1.-smoothstep(150.,190.,d)));
      }`,
  });
  // 单位：公里（太空场景的尺度），平面 400 km 见方，跟随车的水平位置
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), mat);
  sea.rotation.x = -Math.PI / 2; sea.renderOrder = -5; sea.visible = false; parent.add(sea);
  function update(dt, speedKmS, carPos, alt, sunDir, hazeColor) {
    u.off.value.y -= dt * speedKmS / 22;                                // 400 km / 18 次平铺 ≈ 22 km 一格
    sea.position.set(carPos.x, carPos.y - Math.max(.05, alt / 1000 - .8), carPos.z);   // 云顶约在 0.8 km
    u.opacity.value = 1 - THREE.MathUtils.smoothstep(alt, 14000, 30000);
    sea.visible = u.opacity.value > .01;
    if (sunDir) u.sunDir.value.copy(sunDir);
    if (hazeColor) u.haze.value.copy(hazeColor);
  }
  return { sea, update };
}
