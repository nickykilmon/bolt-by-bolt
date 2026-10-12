// Visible crash damage: push mesh vertices in around an impact point (a dent).
// Dents are stored as plain numbers so they survive saving and rebuilding the visual.
// Only visuals are touched — fasteners are picked by their own raycast, so dents never block a bolt.
import * as THREE from 'three';
import { MAT } from '../core/materials.js';

const _v = new THREE.Vector3(), _m = new THREE.Matrix4(), _inv = new THREE.Matrix4(), _c = new THREE.Vector3(), _sphere = new THREE.Sphere();
const seg = (L) => Math.min(14, Math.max(1, Math.round(L / 0.07)));

// give a mesh its own, finely subdivided geometry the first time it gets dented
function prep(mesh) {
  if (mesh.userData.dentable) return;
  const g = mesh.geometry;
  if (g.type === 'BoxGeometry') {
    const p = g.parameters;
    mesh.geometry = new THREE.BoxGeometry(p.width, p.height, p.depth, seg(p.width), seg(p.height), seg(p.depth));
  } else mesh.geometry = g.clone();
  mesh.userData.dentable = true;
  mesh.userData.orig = mesh.geometry.attributes.position.array.slice();
}

// dent = [cx, cy, cz, dx, dy, dz, radius, depth] in root-local coordinates
export function applyDent(root, d, owner = null) {
  const [cx, cy, cz, dx, dy, dz, r, depth] = d;
  _c.set(cx, cy, cz);
  const dir = new THREE.Vector3(dx, dy, dz);
  root.updateMatrixWorld(true);
  _inv.copy(root.matrixWorld).invert();
  root.traverse((m) => {
    if (!m.isMesh || m.material === MAT.hit || m.material === MAT.glass || m.userData.fastener || m.userData.noDent || m.isSprite) return;
    if (owner === 'shell' ? m.userData.inst : owner && m.userData.inst && m.userData.inst !== owner) return; // don't dent things riding along / child parts
    if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
    _m.multiplyMatrices(_inv, m.matrixWorld);
    _sphere.copy(m.geometry.boundingSphere).applyMatrix4(_m);
    if (_sphere.center.distanceTo(_c) > _sphere.radius + r) return;
    prep(m);
    const pos = m.geometry.attributes.position, back = _m.clone().invert();
    let moved = false;
    for (let i = 0; i < pos.count; i++) {
      _v.fromBufferAttribute(pos, i).applyMatrix4(_m);
      const dist = _v.distanceTo(_c);
      if (dist >= r) continue;
      const f = 1 - dist / r, crumple = 0.75 + 0.25 * Math.sin(i * 12.9898);
      _v.addScaledVector(dir, depth * f * f * crumple).applyMatrix4(back);
      pos.setXYZ(i, _v.x, _v.y, _v.z); moved = true;
    }
    if (moved) { pos.needsUpdate = true; m.geometry.computeVertexNormals(); m.geometry.computeBoundingSphere(); }
  });
}
export function applyDents(root, list, owner = null) { for (const d of list || []) applyDent(root, d, owner); }
// panel-beat: restore the original shape of every dented mesh under root
export function undent(root) {
  root.traverse((m) => { if (m.isMesh && m.userData.orig) { const a = m.geometry.attributes.position; a.array.set(m.userData.orig); a.needsUpdate = true; m.geometry.computeVertexNormals(); } });
}

// record + apply a dent on `root` from a world-space hit; returns true if it touched it
export function dentAt(root, store, worldPoint, worldDir, r, depth, owner = null) {
  root.updateMatrixWorld(true);
  const lp = root.worldToLocal(worldPoint.clone());
  const box = new THREE.Box3().setFromObject(root); // cheap reject
  if (box.distanceToPoint(worldPoint) > r) return false;
  const q = root.getWorldQuaternion(new THREE.Quaternion()).invert();
  const ld = worldDir.clone().applyQuaternion(q).normalize();
  const d = [lp.x, lp.y, lp.z, ld.x, ld.y, ld.z, r, depth].map((v) => Math.round(v * 1000) / 1000);
  store.push(d); if (store.length > 14) store.shift();
  applyDent(root, d, owner);
  return true;
}
