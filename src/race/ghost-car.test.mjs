import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

test('影子克隆全部材质，淡蓝半透明、不投影、不写深度，标签为车顶 Sprite', async () => {
  const { prepareGhostCar } = await import('./ghost-car.js');
  const originalDocument = globalThis.document, text = [];
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ({ clearRect() {}, fillRect() {}, fillText: label => text.push(label) }) }) };
  try {
    const root = new THREE.Group(), source = new THREE.MeshStandardMaterial({ color: 'white' });
    const a = new THREE.Mesh(new THREE.BoxGeometry(), source), b = new THREE.Mesh(new THREE.BoxGeometry(), [source, source]);
    a.castShadow = b.castShadow = true; root.add(a, b);
    const car = prepareGhostCar({ root }, '我的最佳');
    for (const mesh of [a, b]) {
      assert.equal(mesh.castShadow, false);
      for (const material of [].concat(mesh.material)) {
        assert.notEqual(material, source);
        assert.equal(material.opacity, .35); assert.equal(material.transparent, true);
        assert.equal(material.depthWrite, false); assert.ok(material.emissive.b > material.emissive.r);
      }
    }
    assert.equal(source.opacity, 1); assert.equal(source.transparent, false);
    const label = root.children.find(child => child.isSprite);
    assert.ok(label); assert.ok(label.position.y > 1.5);
    car.setLabel('My best'); assert.deepEqual(text, ['我的最佳', 'My best']);
  } finally { globalThis.document = originalDocument; }
});
