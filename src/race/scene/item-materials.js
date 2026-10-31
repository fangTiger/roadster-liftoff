import * as THREE from 'three';
// 水雷与禁锢共用水材质；时间统一写入，避免每辆车复制着色器。
const vertex=`
 uniform float time;
 uniform float ripple;
 varying vec3 viewNormal;
 varying vec3 viewPosition;
 varying vec3 localPosition;
 varying vec2 surfaceUv;
 void main(){
  vec3 p=position+normal*ripple*(sin(position.y*9.+time*2.1)+sin(position.x*7.-time*1.7))*.018;
  vec4 mv=modelViewMatrix*vec4(p,1.);
  viewNormal=normalize(normalMatrix*normal);viewPosition=-mv.xyz;localPosition=p;surfaceUv=uv;
  gl_Position=projectionMatrix*mv;
 }`;
const waterFragment=` uniform float time;
 varying vec3 viewNormal;varying vec3 viewPosition;varying vec3 localPosition;varying vec2 surfaceUv;
 void main(){
  vec3 n=normalize(viewNormal),v=normalize(viewPosition);float rim=pow(1.-abs(dot(n,v)),2.8);
  float waves=sin(localPosition.y*22.+localPosition.x*8.+time*1.7)*.5+.5;
  float spec=pow(max(dot(reflect(-normalize(vec3(-.4,.8,1.)),n),v),0.),70.);
  float caustic=pow(.5+.5*sin(surfaceUv.x*37.+sin(surfaceUv.y*28.+time)*2.),12.);
  vec3 refraction=mix(vec3(.025,.19,.27),vec3(.19,.68,.83),smoothstep(-.5,.8,n.y+waves*.15));
  vec3 color=refraction+rim*vec3(.48,.85,1.)+spec*vec3(1.)+caustic*.07;
  gl_FragColor=vec4(color,.16+rim*.58+spec*.35);
  #include <colorspace_fragment>
 }`;
const energyFragment=`
 uniform float time;uniform float grid;
 varying vec3 viewNormal;varying vec3 viewPosition;varying vec3 localPosition;varying vec2 surfaceUv;
 float hex(vec2 p){
  vec2 a=mod(p,vec2(1.732,3.))-vec2(.866,1.5),b=mod(p-vec2(.866,1.5),vec2(1.732,3.))-vec2(.866,1.5);
  vec2 h=dot(a,a)<dot(b,b)?a:b;return max(abs(h.x)*.5+abs(h.y)*.866,abs(h.x));
 }
 void main(){
  float rim=pow(1.-abs(dot(normalize(viewNormal),normalize(viewPosition))),2.6);
  float cells=smoothstep(.82,.87,hex(surfaceUv*vec2(39.,21.)))*grid;
  float pulse=pow(.5+.5*sin(localPosition.y*11.-time*3.),14.);
  vec3 color=vec3(.15,.65,.82)*(rim*.9+cells*.5+pulse*.3)+vec3(.5,.95,1.)*rim*rim;
  gl_FragColor=vec4(color,.12+rim*.65+cells*.25+pulse*.1);
  #include <colorspace_fragment>
 }`;
export function createItemMaterials(own) {
 const surface=(fragment,ripple,grid,blending)=>own(new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:fragment,uniforms:{time:{value:0},ripple:{value:ripple},grid:{value:grid}},transparent:true,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true,blending,toneMapped:false}));
 const water=surface(waterFragment,1,0,THREE.NormalBlending),shield=surface(energyFragment,0,1,THREE.AdditiveBlending),crystal=surface(energyFragment,0,0,THREE.AdditiveBlending);
 const metal=own(new THREE.MeshStandardMaterial({color:0x667982,metalness:.88,roughness:.27})),paint=own(new THREE.MeshStandardMaterial({color:0xe0e6e3,metalness:.5,roughness:.31})),copper=own(new THREE.MeshStandardMaterial({color:0xc96a48,metalness:.7,roughness:.3}));
 const glow=own(new THREE.MeshBasicMaterial({color:0x9cecff,toneMapped:false}));
 const flame=(color)=>own(new THREE.ShaderMaterial({uniforms:{time:{value:0},color:{value:new THREE.Color(color)}},vertexShader:'varying vec2 flameUv;void main(){flameUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:`uniform float time;uniform vec3 color;varying vec2 flameUv;void main(){float band=.75+.25*sin(flameUv.y*24.-time*65.);float alpha=sin(flameUv.y*3.14159)*band*.7;gl_FragColor=vec4(color,alpha);
 #include <colorspace_fragment>
 }`,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,forceSinglePass:true,toneMapped:false}));
 const inner=flame(0xbdefff),outer=flame(0xff8e35);
 const burst=()=>{
  const material=own(new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:`
   uniform float time;uniform float fade;uniform float shielded;uniform vec3 color;
   varying vec3 viewNormal;varying vec3 viewPosition;varying vec3 localPosition;
   void main(){
    float rim=1.-abs(dot(normalize(viewNormal),normalize(viewPosition)));
    float turbulence=.5+.5*sin(localPosition.x*13.+sin(localPosition.y*11.-time*21.)*2.+localPosition.z*9.);
    float heat=smoothstep(.25,.85,turbulence)*(1.-rim*.6);
    vec3 fire=mix(color*1.8,vec3(3.2,2.2,.75),heat);
    float pulse=.5+.5*sin(localPosition.y*25.-time*28.);
    vec3 energy=color*(1.+rim*2.+pulse*.3);
    float alpha=mix((.35+.65*turbulence)*(1.-smoothstep(.6,1.,rim)),rim*.9+pulse*.08,shielded);
    gl_FragColor=vec4(mix(fire,energy,shielded),fade*alpha);
    #include <colorspace_fragment>
   }`,uniforms:{time:{value:0},ripple:{value:0},fade:{value:0},shielded:{value:0},color:{value:new THREE.Color()}},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}));
  material.color=material.uniforms.color.value;return material;
 };
 return {water,shield,crystal,metal,paint,copper,glow,inner,outer,burst,update(time){for(const m of [water,shield,crystal,inner,outer])m.uniforms.time.value=time;}};
}
