// 天空穹顶：爬升与太空阶段的天空。颜色随高度从地面的蓝天渐变到太空的纯黑，叠加太阳光晕与 NASA 真实星图。
// 天空颜色按"屏幕上最终看到的颜色"给出，着色器里做 ACES 逆运算，这样低空时能和实拍天空无缝衔接
import * as THREE from 'three';

const srgb = hex => new THREE.Color(hex);           // THREE.Color 把 sRGB 十六进制解码为线性值，与贴图采样结果同一口径，再交给 ACES 逆运算

// 高度（米）→ 天顶色 / 地平线色（屏幕显示色）
const STOPS = [
  [0, '#43628a', '#b1b4b4'],
  [3000, '#3d68a8', '#c4d4e4'],
  [12000, '#22468f', '#9cc0ea'],
  [30000, '#0b1d4c', '#5e8fd8'],
  [55000, '#02060f', '#3c6cc4'],
  [80000, '#000000', '#16305e'],
  [100000, '#000000', '#000000'],
];

export async function createSkyDome(scene, renderer) {
  const tex = await new THREE.TextureLoader().loadAsync('/assets/sky/stars_8k.jpg');
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const cols = cs => new THREE.Matrix3().set(cs[0][0], cs[1][0], cs[2][0], cs[0][1], cs[1][1], cs[2][1], cs[0][2], cs[1][2], cs[2][2]);
  const u = {
    zen: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, .3, -1) },
    sunK: { value: 1 }, opacity: { value: 0 }, groundK: { value: 0 }, stars: { value: tex }, starK: { value: 0 }, starRot: { value: new THREE.Matrix3() },
    invIn: { value: cols([[.59719, .07600, .02840], [.35458, .90834, .13383], [.04823, .01566, .83777]]).invert() },
    invOut: { value: cols([[1.60475, -.10208, -.00327], [-.53108, 1.10813, -.07276], [-.07367, -.00605, 1.07602]]).invert() },
    exposure: { value: renderer.toneMappingExposure },
  };
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, transparent: true, fog: false, uniforms: u,
    vertexShader: 'varying vec3 vW; void main(){ vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }',
    fragmentShader: `uniform vec3 zen, hor, sunDir; uniform float sunK, opacity, groundK, starK, exposure; uniform sampler2D stars; uniform mat3 starRot, invIn, invOut; varying vec3 vW;
      vec3 invACES(vec3 c){
        vec3 y=clamp(invOut*c,0.,.995);
        vec3 A=1.-.983729*y, B=.0245786-.4329510*y, C=-(.000090537+.238081*y);
        return max(invIn*((-B+sqrt(max(B*B-4.*A*C,0.)))/(2.*A)),0.)/(exposure/.6);
      }
      void main(){
        vec3 d=normalize(vW-cameraPosition); float e=d.y;
        // 天空渐变（显示色）：地平线附近亮、天顶深；地平线以下是远方的雾霭
        vec3 c=mix(hor,zen,pow(clamp(e,0.,1.),.42));
        c=mix(c,hor*.82,smoothstep(0.,-.25,e));
        vec3 lin=invACES(c);
        // 太阳：小而亮的日面 + 大气散射光晕（高空时光晕收缩）
        float cs=max(dot(d,normalize(sunDir)),0.);
        float disc=smoothstep(.99996,.99999,cs);                         // 日面约 0.5°
        lin+=vec3(1.,.95,.88)*disc*6.;
        lin+=vec3(1.,.9,.78)*(pow(cs,900.)*.9+pow(cs,40.)*.18)*sunK;       // 大气散射光晕，高空收缩消失
        // 星空：NASA 星图（贴图存的是线性亮度 ×4）
        vec3 sd=starRot*d; vec2 uv=vec2(atan(sd.z,sd.x)/6.28318+.5, asin(clamp(sd.y,-1.,1.))/3.14159+.5);
        lin+=texture2D(stars,uv).rgb*.45*starK*smoothstep(-.05,.1,e+.2);
        // groundK：沙漠场景里地平线以下交给流动地面（它自己做空气透视），穹顶只在地平线附近留一圈雾霭盖住地面边缘
        gl_FragColor=vec4(lin,opacity*(1.-groundK*smoothstep(.004,.05,-e)));
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(20000, 64, 32), mat);
  dome.renderOrder = -10; dome.frustumCulled = false; dome.visible = false; scene.add(dome);

  // alt：高度（米）；starOn：星空可见度系数（太空中受地球亮度影响）
  function setAltitude(alt) {
    let i = 0; while (i < STOPS.length - 2 && alt > STOPS[i + 1][0]) i++;
    const [a0, z0, h0] = STOPS[i], [a1, z1, h1] = STOPS[i + 1], k = THREE.MathUtils.clamp((alt - a0) / (a1 - a0), 0, 1);
    u.zen.value.copy(srgb(z0)).lerp(srgb(z1), k);
    u.hor.value.copy(srgb(h0)).lerp(srgb(h1), k);
    u.sunK.value = 1 - THREE.MathUtils.smoothstep(alt, 20000, 90000);
    u.starK.value = THREE.MathUtils.smoothstep(alt, 45000, 110000);
  }
  function follow(cam) { dome.position.copy(cam.position); }
  return { dome, uniforms: u, setAltitude, follow };
}
