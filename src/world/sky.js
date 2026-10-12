// Renderer, sky dome, sun/moon lighting, fog, day-night cycle and rain.
import * as THREE from 'three';
import { clamp, lerp, mulberry32 } from '../core/util.js';

export function createRenderer(canvas, quality) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: quality !== 'low', powerPreference: 'high-performance' });
  r.setPixelRatio(Math.min(devicePixelRatio, quality === 'high' ? 2 : 1));
  r.setSize(innerWidth, innerHeight);
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFSoftShadowMap;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.0;
  r.outputColorSpace = THREE.SRGBColorSpace;
  return r;
}

export class Sky {
  constructor(scene, quality) {
    this.scene = scene;
    const geo = new THREE.SphereGeometry(1500, 32, 16);
    this.uni = { top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3() }, sunCol: { value: new THREE.Color() }, time: { value: 0 }, cover: { value: 0.3 }, dayL: { value: 1 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uni, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 top; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunCol; uniform float time; uniform float cover; uniform float dayL; varying vec3 vP;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(hash(i), hash(i+vec2(1.0,0.0)), f.x), mix(hash(i+vec2(0.0,1.0)), hash(i+vec2(1.0,1.0)), f.x), f.y); }
        float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ v += a*noise(p); p = p*2.03 + 1.7; a *= 0.5; } return v; }
        void main(){ vec3 d = normalize(vP); float h = clamp(d.y*1.4+0.1,0.0,1.0); vec3 c = mix(bottom, top, pow(h,0.7));
        float s = max(dot(d, normalize(sunDir)),0.0); c += sunCol * (pow(s, 600.0)*4.0 + pow(s,8.0)*0.25);
        if (d.y > 0.0) {
          vec2 uv = d.xz / (d.y + 0.15) * 1.3 + vec2(time*0.006, time*0.0025);
          float n = fbm(uv);
          float cov = smoothstep(0.62 - cover*0.4, 0.92 - cover*0.35, n);
          float shade = fbm(uv + normalize(sunDir.xz + 0.001)*0.08);
          vec3 lit = mix(vec3(1.0, 0.98, 0.95), sunCol*1.4 + 0.25, 0.35);
          vec3 cc = mix(lit, bottom*0.85 + 0.05, clamp((shade - n)*6.0 + 0.45, 0.0, 1.0)) * (0.12 + 0.88*dayL);
          cc += sunCol * pow(s, 6.0) * 0.4;
          c = mix(c, cc, cov * smoothstep(0.0, 0.18, d.y) * 0.95);
        }
        gl_FragColor = vec4(c,1.0); }`,
    });
    this.dome = new THREE.Mesh(geo, mat);
    this.dome.renderOrder = -10;
    scene.add(this.dome);
    this.hemi = new THREE.HemisphereLight(0xbfd8ff, 0x4a4030, 0.6);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff0dd, 2.2);
    this.sun.castShadow = true;
    const ss = quality === 'high' ? 2048 : quality === 'medium' ? 1536 : 1024;
    this.sun.shadow.mapSize.set(ss, ss);
    const sc = this.sun.shadow.camera; sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 300;
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.03;
    scene.add(this.sun, this.sun.target);
    scene.fog = new THREE.Fog(0xaabbc8, 60, 650);
    // stars
    const sp = []; const r = mulberry32(5);
    for (let i = 0; i < 1200; i++) { const v = new THREE.Vector3(r() - 0.5, r() * 0.9 + 0.05, r() - 0.5).normalize().multiplyScalar(1400); sp.push(v.x, v.y, v.z); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, transparent: true, fog: false }));
    scene.add(this.stars);
    // rain
    const rp = new Float32Array(3000 * 3);
    for (let i = 0; i < 3000; i++) { rp[i * 3] = (r() - 0.5) * 50; rp[i * 3 + 1] = r() * 25; rp[i * 3 + 2] = (r() - 0.5) * 50; }
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
    this.rain = new THREE.Points(rg, new THREE.PointsMaterial({ color: 0xaabbcc, size: 0.06, transparent: true, opacity: 0.6 }));
    this.rain.visible = false;
    scene.add(this.rain);
    this.rainAmt = 0; this.fogAmt = 0;
  }

  // hours 0..24
  update(hours, camPos, dt) {
    const dayAngle = ((hours - 6) / 24) * Math.PI * 2; // sunrise 06, sunset 18 (shifted for northern summer below)
    const elev = Math.sin(dayAngle) * 0.9 + 0.12; // long Nordic dusk
    const dir = new THREE.Vector3(Math.cos(dayAngle) * 0.8, elev, 0.45).normalize();
    const day = clamp(elev * 3 + 0.25, 0, 1);
    const dusk = clamp(1 - Math.abs(elev - 0.05) * 6, 0, 1);
    const top = new THREE.Color().setRGB(0.25, 0.45, 0.85).multiplyScalar(day).add(new THREE.Color(0.02, 0.03, 0.07));
    const bottom = new THREE.Color().setRGB(0.72, 0.8, 0.9).multiplyScalar(day).lerp(new THREE.Color(0.95, 0.55, 0.3), dusk * 0.6).add(new THREE.Color(0.03, 0.04, 0.07));
    const grey = this.rainAmt * 0.7 + this.fogAmt * 0.5;
    top.lerp(new THREE.Color(0.45, 0.48, 0.52).multiplyScalar(day + 0.1), grey);
    bottom.lerp(new THREE.Color(0.6, 0.62, 0.64).multiplyScalar(day + 0.1), grey);
    this.uni.top.value.copy(top); this.uni.bottom.value.copy(bottom);
    this.uni.sunDir.value.copy(dir);
    this.uni.time.value += dt || 0; this.uni.dayL.value = day;
    this.uni.cover.value = 0.25 + this.rainAmt * 0.75 + this.fogAmt * 0.3;
    this.scene.environmentIntensity = 0.05 + 0.25 * day * (1 - grey * 0.5);
    this.uni.sunCol.value.setRGB(1, 0.8, 0.6).multiplyScalar(day * (1 - grey));
    this.sun.intensity = 2.4 * day * (1 - grey * 0.75);
    this.sun.color.setRGB(1, 0.92 - dusk * 0.25, 0.82 - dusk * 0.4);
    this.hemi.intensity = 0.15 + 0.6 * day;
    this.hemi.color.copy(top).lerp(new THREE.Color(0xffffff), 0.3);
    this.scene.fog.color.copy(bottom);
    this.scene.fog.near = lerp(60, 10, this.fogAmt);
    this.scene.fog.far = lerp(650, 120, Math.max(this.fogAmt, this.rainAmt * 0.6));
    this.sun.position.copy(camPos).addScaledVector(dir, 120);
    this.sun.target.position.copy(camPos);
    this.dome.position.copy(camPos);
    this.stars.position.copy(camPos);
    this.stars.material.opacity = clamp(1 - day * 2.5, 0, 1) * (1 - grey);
    this.dayLight = day;
    // rain particles follow the camera
    this.rain.visible = this.rainAmt > 0.05;
    if (this.rain.visible) {
      const a = this.rain.geometry.attributes.position;
      for (let i = 0; i < a.count; i++) {
        let y = a.getY(i) - dt * 14;
        if (y < 0) y += 25;
        a.setY(i, y);
      }
      a.needsUpdate = true;
      this.rain.position.set(camPos.x, camPos.y - 8, camPos.z);
      this.rain.material.opacity = 0.6 * this.rainAmt;
    }
  }
}
