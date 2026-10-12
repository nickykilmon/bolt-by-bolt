// Static collision volumes (axis-aligned boxes) + tree trunks, shared by player and car.
import * as THREE from 'three';
import { heightAt, normalAt, surfaceAt, treesNear, groundY } from './terrain.js';

export const STATICS = [];   // { min: Vector3, max: Vector3, car: bool, player: bool }

export function addCollider(minX, minY, minZ, maxX, maxY, maxZ, opts = {}) {
  const c = { min: new THREE.Vector3(minX, minY, minZ), max: new THREE.Vector3(maxX, maxY, maxZ), car: opts.car ?? true, player: opts.player ?? true, walkable: opts.walkable ?? false };
  STATICS.push(c);
  return c;
}
// Box from a mesh-like spec centred at (x,y,z) with size (w,h,d)
export function addBoxCollider(x, y, z, w, h, d, opts) {
  return addCollider(x - w / 2, y - h / 2, z - d / 2, x + w / 2, y + h / 2, z + d / 2, opts);
}

const _tl = [];
// For the vehicle: push a point out of statics/trees. Returns {push, n} or null.
function pushOut(p) {
  for (const c of STATICS) {
    if (!c.car) continue;
    if (p.x < c.min.x || p.x > c.max.x || p.y < c.min.y || p.y > c.max.y || p.z < c.min.z || p.z > c.max.z) continue;
    const dx1 = p.x - c.min.x, dx2 = c.max.x - p.x, dz1 = p.z - c.min.z, dz2 = c.max.z - p.z, dy2 = c.max.y - p.y;
    const m = Math.min(dx1, dx2, dz1, dz2, dy2);
    const n = new THREE.Vector3();
    if (m === dx1) n.set(-1, 0, 0); else if (m === dx2) n.set(1, 0, 0); else if (m === dz1) n.set(0, 0, -1); else if (m === dz2) n.set(0, 0, 1); else n.set(0, 1, 0);
    return { push: n.clone().multiplyScalar(m + 0.001), n };
  }
  for (const o of DYNAMIC) {
    const dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz);
    if (d < o.r && p.y < o.y + o.h) {
      const n = new THREE.Vector3(dx / (d || 1), 0, dz / (d || 1));
      o.hit = true;
      return { push: n.clone().multiplyScalar(o.r - d + 0.01), n, obj: o };
    }
  }
  for (const t of treesNear(p.x, p.z, _tl)) {
    const dx = p.x - t.x, dz = p.z - t.z, d = Math.hypot(dx, dz);
    if (d < t.r + 0.05 && p.y < heightAt(t.x, t.z) + 5) {
      const n = new THREE.Vector3(dx / (d || 1), 0, dz / (d || 1));
      return { push: n.clone().multiplyScalar(t.r + 0.06 - d), n };
    }
  }
  return null;
}

// moving obstacles (moose, NPC cars...) as {x, z, r, h, onHit(speed)}
export const DYNAMIC = [];
export const ENV = {
  groundY,
  normal: normalAt,
  surface: surfaceAt,
  pushOut,
};

// Player capsule (circle in xz) against statics, trees and dynamic oriented boxes.
export function collidePlayer(pos, radius, feetY, headY, dynamicBoxes) {
  for (let iter = 0; iter < 2; iter++) {
    for (const c of STATICS) {
      if (!c.player) continue;
      if (headY < c.min.y || feetY + 0.3 > c.max.y) continue;
      const cx = Math.max(c.min.x, Math.min(pos.x, c.max.x));
      const cz = Math.max(c.min.z, Math.min(pos.z, c.max.z));
      const dx = pos.x - cx, dz = pos.z - cz, d2 = dx * dx + dz * dz;
      if (d2 < radius * radius) {
        if (d2 > 1e-8) { const d = Math.sqrt(d2); pos.x += dx / d * (radius - d); pos.z += dz / d * (radius - d); }
        else { // centre inside box: push along smallest axis
          const o = [pos.x - c.min.x, c.max.x - pos.x, pos.z - c.min.z, c.max.z - pos.z];
          const m = Math.min(...o);
          if (m === o[0]) pos.x = c.min.x - radius; else if (m === o[1]) pos.x = c.max.x + radius; else if (m === o[2]) pos.z = c.min.z - radius; else pos.z = c.max.z + radius;
        }
      }
    }
    for (const t of treesNear(pos.x, pos.z, _tl)) {
      const dx = pos.x - t.x, dz = pos.z - t.z, d = Math.hypot(dx, dz), r = t.r + radius;
      if (d < r && d > 1e-5) { pos.x += dx / d * (r - d); pos.z += dz / d * (r - d); }
    }
    for (const b of dynamicBoxes) {
      // b: { inv: Matrix4 (world->local), m: Matrix4, half: Vector3, minY, maxY }
      const lp = new THREE.Vector3(pos.x, (feetY + headY) / 2, pos.z).applyMatrix4(b.inv);
      if (lp.y + (headY - feetY) / 2 < b.minY || lp.y - (headY - feetY) / 2 + 0.25 > b.maxY) continue;
      const cx = Math.max(-b.half.x, Math.min(lp.x, b.half.x)), cz = Math.max(-b.half.z + b.cz, Math.min(lp.z, b.half.z + b.cz));
      const dx = lp.x - cx, dz = lp.z - cz, d2 = dx * dx + dz * dz;
      if (d2 < radius * radius) {
        let nx, nz, push;
        if (d2 > 1e-8) { const d = Math.sqrt(d2); nx = dx / d; nz = dz / d; push = radius - d; }
        else {
          const o = [lp.x + b.half.x, b.half.x - lp.x, lp.z - (b.cz - b.half.z), b.cz + b.half.z - lp.z];
          const m = Math.min(...o); const i = o.indexOf(m);
          nx = i === 0 ? -1 : i === 1 ? 1 : 0; nz = i === 2 ? -1 : i === 3 ? 1 : 0; push = m + radius;
        }
        const wn = new THREE.Vector3(nx, 0, nz).transformDirection(b.m);
        wn.y = 0; wn.normalize();
        pos.x += wn.x * push; pos.z += wn.z * push;
      }
    }
  }
}

// extra walkable surfaces that aren't boxes (e.g. the rotated lake jetty): fn(x, z) -> y | null
export const FLOORS = [];
// Highest walkable surface under the player (terrain or walkable box tops)
export function floorAt(x, z, feetY) {
  let y = heightAt(x, z);
  for (const f of FLOORS) { const fy = f(x, z); if (fy !== null && fy <= feetY + 0.45 && fy > y) y = fy; }
  for (const c of STATICS) {
    if (!c.walkable) continue;
    if (x >= c.min.x && x <= c.max.x && z >= c.min.z && z <= c.max.z && c.max.y <= feetY + 0.45 && c.max.y > y) y = c.max.y;
  }
  return y;
}
