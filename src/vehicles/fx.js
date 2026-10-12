// Driving effects, built to be cheap: tyre marks are one ring-buffer mesh (one draw call),
// dust / smoke / pee is one ring-buffer point cloud (one draw call). Nothing allocates per frame.
import * as THREE from 'three';

const MARKS = 1600;      // quads kept on the ground before the oldest are reused
const PARTS = 700;       // live particles

function softDot() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class FX {
  constructor(scene) {
    // ---- tyre marks ----
    this.mPos = new Float32Array(MARKS * 4 * 3); this.mCol = new Float32Array(MARKS * 4 * 4);
    const idx = new Uint32Array(MARKS * 6);
    for (let i = 0; i < MARKS; i++) { const a = i * 4; idx.set([a, a + 1, a + 2, a + 2, a + 1, a + 3], i * 6); }
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.BufferAttribute(this.mPos, 3).setUsage(THREE.DynamicDrawUsage));
    mg.setAttribute('color', new THREE.BufferAttribute(this.mCol, 4).setUsage(THREE.DynamicDrawUsage));
    mg.setIndex(new THREE.BufferAttribute(idx, 1));
    mg.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.marks = new THREE.Mesh(mg, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    this.marks.frustumCulled = false; this.marks.renderOrder = 2; this.marks.raycast = () => {};
    scene.add(this.marks);
    this.mHead = 0; this.mDirty = false;
    this.last = new Map(); // wheel -> {l, r} previous edge points
    // ---- particles ----
    this.pPos = new Float32Array(PARTS * 3); this.pCol = new Float32Array(PARTS * 4); this.pSize = new Float32Array(PARTS);
    this.pVel = new Float32Array(PARTS * 3); this.pLife = new Float32Array(PARTS); this.pMax = new Float32Array(PARTS); this.pGrow = new Float32Array(PARTS); this.pGrav = new Float32Array(PARTS);
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3).setUsage(THREE.DynamicDrawUsage));
    pg.setAttribute('color', new THREE.BufferAttribute(this.pCol, 4).setUsage(THREE.DynamicDrawUsage));
    pg.setAttribute('size', new THREE.BufferAttribute(this.pSize, 1).setUsage(THREE.DynamicDrawUsage));
    pg.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: softDot() }, scale: { value: innerHeight * 0.5 } },
      vertexShader: 'attribute float size; attribute vec4 color; varying vec4 vC; uniform float scale; void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform sampler2D map; varying vec4 vC; void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC.rgb, vC.a * t.a); if (gl_FragColor.a < 0.01) discard; }',
      transparent: true, depthWrite: false,
    });
    this.parts = new THREE.Points(pg, mat); this.parts.frustumCulled = false; this.parts.raycast = () => {};
    scene.add(this.parts);
    this.pHead = 0; this.alive = 0;
    addEventListener('resize', () => { mat.uniforms.scale.value = innerHeight * 0.5; });
  }

  // one wheel's contact this frame; skid = how hard it's sliding, col = mark colour
  wheelMark(key, cp, side, skid, col) {
    const prev = this.last.get(key);
    if (skid <= 0.05) { this.last.delete(key); return; }
    const w = 0.09, l = new THREE.Vector3(cp.x + side.x * w, cp.y + 0.03, cp.z + side.z * w), r = new THREE.Vector3(cp.x - side.x * w, cp.y + 0.03, cp.z - side.z * w);
    if (prev && prev.l.distanceTo(l) > 0.25 && prev.l.distanceTo(l) < 3) {
      const i = this.mHead; this.mHead = (this.mHead + 1) % MARKS;
      const P = this.mPos, C = this.mCol, a = Math.min(0.75, skid) * col[3];
      P.set([prev.l.x, prev.l.y, prev.l.z, prev.r.x, prev.r.y, prev.r.z, l.x, l.y, l.z, r.x, r.y, r.z], i * 12);
      for (let k = 0; k < 4; k++) C.set([col[0], col[1], col[2], a], i * 16 + k * 4);
      this.mDirty = true;
      this.last.set(key, { l, r });
    } else if (!prev || prev.l.distanceTo(l) >= 3) this.last.set(key, { l, r });
  }

  // spawn a particle: kind tunes size/colour/lifetime
  emit(x, y, z, vx, vy, vz, size, life, r, g, b, a, grow = 1.6, grav = 0) {
    const i = this.pHead; this.pHead = (this.pHead + 1) % PARTS;
    this.pPos.set([x, y, z], i * 3); this.pVel.set([vx, vy, vz], i * 3);
    this.pCol.set([r, g, b, a], i * 4); this.pSize[i] = size; this.pLife[i] = life; this.pMax[i] = life; this.pGrow[i] = grow; this.pGrav[i] = grav;
  }

  update(dt) {
    if (this.mDirty) { const g = this.marks.geometry; g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true; this.mDirty = false; }
    let any = false;
    const P = this.pPos, V = this.pVel, C = this.pCol, S = this.pSize, L = this.pLife;
    for (let i = 0; i < PARTS; i++) {
      if (L[i] <= 0) continue;
      any = true;
      L[i] -= dt;
      if (L[i] <= 0) { C[i * 4 + 3] = 0; continue; }
      const t = L[i] / this.pMax[i];
      V[i * 3 + 1] -= this.pGrav[i] * dt;
      P[i * 3] += V[i * 3] * dt; P[i * 3 + 1] += V[i * 3 + 1] * dt; P[i * 3 + 2] += V[i * 3 + 2] * dt;
      V[i * 3] *= 1 - dt * 0.8; V[i * 3 + 2] *= 1 - dt * 0.8; if (!this.pGrav[i]) V[i * 3 + 1] *= 1 - dt * 0.5;
      S[i] *= 1 + (this.pGrow[i] - 1) * dt;
      C[i * 4 + 3] = Math.min(C[i * 4 + 3], t * 0.9 + 0.02);
    }
    if (any || this.alive) {
      const g = this.parts.geometry;
      g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true; g.attributes.size.needsUpdate = true;
    }
    this.alive = any;
  }
}
