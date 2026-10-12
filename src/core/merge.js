// Merge many small static meshes under `root` into one mesh per material (fewer draw calls).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const KEEP = ['position', 'normal', 'uv'];
export function mergeByMaterial(root, filter = () => true) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const groups = new Map();
  root.traverse((o) => {
    if (!o.isMesh || o === root || !filter(o)) return;
    let l = groups.get(o.material); if (!l) groups.set(o.material, (l = [])); l.push(o);
  });
  const m4 = new THREE.Matrix4();
  for (const [mat, list] of groups) {
    if (list.length < 2) continue;
    const geos = list.map((o) => {
      let g = o.geometry.clone().applyMatrix4(m4.multiplyMatrices(inv, o.matrixWorld));
      if (g.index) g = g.toNonIndexed();
      for (const k of Object.keys(g.attributes)) if (!KEEP.includes(k)) g.deleteAttribute(k);
      if (!g.attributes.normal) g.computeVertexNormals();
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      g.morphAttributes = {};
      return g;
    });
    const merged = mergeGeometries(geos, false);
    if (!merged) continue;
    const m = new THREE.Mesh(merged, mat);
    m.castShadow = list.some((o) => o.castShadow); m.receiveShadow = list.some((o) => o.receiveShadow);
    m.raycast = list[0].raycast; m.userData = { ...list[0].userData };
    root.add(m);
    for (const o of list) o.parent.remove(o);
  }
}
