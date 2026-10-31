import * as THREE from 'three';

/** 边缘向前环抱的弧形大屏，底部悬浮于地面。 */
export function createScreenGeometry() {
 const geometry=new THREE.PlaneGeometry(64,12,64,1),position=geometry.getAttribute('position');
 for(let i=0;i<position.count;i++){
  const x=position.getX(i);position.setZ(i,95-Math.sqrt(95*95-x*x));
 }
 position.needsUpdate=true;geometry.computeVertexNormals();return geometry;
}
export function configureScreenTexture(texture,maxAnisotropy) {
 texture.colorSpace=THREE.SRGBColorSpace;texture.generateMipmaps=true;
 texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;
 texture.anisotropy=maxAnisotropy;texture.needsUpdate=true;return texture;
}
/** 屏幕四边渐隐并收暗，底部更宽的雾化带融入展厅，避免实体矩形硬切线。 */
export function createScreenMaterial() {
 return new THREE.ShaderMaterial({
  transparent:true,depthWrite:false,
  uniforms:{map:{value:null},opacity:{value:0}},
  vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:`uniform sampler2D map;uniform float opacity;varying vec2 vUv;
   void main(){
    // 全景 LED 按实景原比例裁切中部，保留地平线，不把画面拉伸成海报。
    vec3 photo=texture2D(map,vec2(vUv.x,.38+vUv.y/3.)).rgb;
    float sides=smoothstep(0.,.12,vUv.x)*smoothstep(0.,.12,1.-vUv.x);
    float vertical=smoothstep(0.,.24,vUv.y)*smoothstep(0.,.12,1.-vUv.y);
    float vignette=1.-.48*smoothstep(.15,.72,length((vUv-.5)*vec2(1.,.8)));
    gl_FragColor=vec4(photo*vignette*.88,opacity*sides*vertical);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
   }`,
 });
}
