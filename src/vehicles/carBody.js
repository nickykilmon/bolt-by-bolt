// Procedural body shell + interior of the Ruska 1600 (the non-removable parts of the car).
import * as THREE from 'three';
import { MAT } from '../core/materials.js';
import { box, cyl } from '../mechanics/partMeshes.js';
import { labelTex } from '../core/textures.js';

function sidePanel(shapePts, arches, side, mat) {
  const s = new THREE.Shape();
  s.moveTo(shapePts[0][0], shapePts[0][1]);
  for (let i = 1; i < shapePts.length; i++) {
    const p = shapePts[i];
    if (p === 'arch') { const a = arches.shift(); s.absarc(a[0], a[1], a[2], Math.PI, 0, true); }
    else s.lineTo(p[0], p[1]);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: false, curveSegments: 14 });
  const m = new THREE.Mesh(g, mat);
  m.rotation.y = -Math.PI / 2;
  m.position.x = side > 0 ? 0.835 : -0.805;
  return m;
}

const ARCH_GEO = new THREE.CylinderGeometry(0.42, 0.42, 0.26, 16, 1, true, 0, Math.PI);
const ARCH_MAT = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9, side: THREE.DoubleSide });

export function buildShell(root) {
  const g = new THREE.Group();
  g.name = 'shell';
  g.userData.containerId = 'car'; // things placed on the car ride along
  const P = MAT.carPaint, D = MAT.carPaintDull, BL = MAT.blackPaint, IN = MAT.interior;
  // side panels
  for (const s of [1, -1]) {
    g.add(sidePanel([[0.65, 0.3], [0.8, 0.3], 'arch', [2.02, 0.3], [2.02, 0.9], [1.96, 0.95], [0.65, 0.95]], [[1.2, 0.3, 0.4]], s, P));
    g.add(sidePanel([[-2.08, 0.3], [-1.6, 0.3], 'arch', [-0.45, 0.3], [-0.45, 0.95], [-2.04, 0.97], [-2.08, 0.9]], [[-1.2, 0.3, 0.4]], s, P));
    const sg = sidePanel([[-0.45, 0.95], [-0.85, 0.95], [-0.85, 1.32], [-0.45, 1.32]], [], s, MAT.glass); sg.userData.glass = true; g.add(sg);
    g.add(sidePanel([[-0.85, 0.95], [-1.45, 0.95], [-0.98, 1.37], [-0.85, 1.37]], [], s, P));
    box(g, 0.05, 0.12, 1.1, D, s * 0.81, 0.3, 0.1); // sill
    box(g, 0.051, 0.06, 0.4, MAT.rust, s * 0.812, 0.28, -0.3); // rust on the sill
    box(g, 0.04, 0.42, 0.05, P, s * 0.8, 1.15, -0.44); // B pillar
      box(g, 0.05, 0.68, 0.05, P, s * 0.77, 1.15, 0.42, -0.9); // A pillar
    // inner wheel arches
    for (const z of [1.2, -1.2]) { const liner = new THREE.Mesh(ARCH_GEO, ARCH_MAT); liner.rotation.z = Math.PI / 2; liner.position.set(s * 0.7, 0.32, z); g.add(liner); }
    // engine bay inner fenders & shock towers
    box(g, 0.03, 0.42, 1.15, D, s * 0.6, 0.68, 1.36);
    cyl(g, 0.09, 0.3, D, s * 0.62, 0.78, 1.2, 'y', 12);
  }
  // roof, glass
  box(g, 1.44, 0.04, 1.12, P, 0, 1.37, -0.41);
  const ws = box(g, 1.46, 0.006, 0.7, MAT.glass, 0, 1.16, 0.42, 0.67); ws.userData.glass = true;
  const rw = box(g, 1.4, 0.006, 0.62, MAT.glass, 0, 1.17, -1.18); rw.rotation.set(-0.72, 0, 0); rw.userData.glass = true;
  // front
  box(g, 1.64, 0.2, 0.04, D, 0, 0.4, 2.0);                // valance
  box(g, 0.84, 0.32, 0.03, BL, 0, 0.7, 2.0);              // grille
  for (let i = 0; i < 6; i++) box(g, 0.82, 0.012, 0.035, MAT.chrome, 0, 0.57 + i * 0.05, 2.005);
  box(g, 0.36, 0.42, 0.03, P, 0.6, 0.72, 1.97); box(g, 0.36, 0.42, 0.03, P, -0.6, 0.72, 1.97);
  box(g, 1.2, 0.08, 0.08, D, 0, 0.36, 1.92);              // radiator support lower
  box(g, 1.2, 0.05, 0.05, D, 0, 0.88, 1.92);              // radiator support upper
  box(g, 1.1, 0.06, 0.12, BL, 0, 0.24, 1.55);             // front crossmember (jack point)
  // firewall, cowl, floor, tunnel
  box(g, 1.6, 0.66, 0.03, D, 0, 0.62, 0.77);
  box(g, 1.6, 0.04, 0.12, P, 0, 0.96, 0.76);
  for (const s of [1, -1]) box(g, 0.64, 0.04, 2.3, IN, s * 0.48, 0.27, -0.4);   // floor pans either side of the tunnel
  box(g, 0.34, 0.03, 1.9, IN, 0, 0.5, -0.2);                                      // transmission tunnel top
  for (const s of [1, -1]) box(g, 0.03, 0.23, 1.9, IN, s * 0.17, 0.38, -0.2);
  box(g, 0.4, 0.05, 0.3, BL, 0.35, 0.22, 0.5);            // floor under pedals
  // rear: boot floor/walls, rear panel, seat
  box(g, 1.5, 0.03, 0.62, IN, 0, 0.5, -1.75);
  box(g, 1.64, 0.62, 0.03, P, 0, 0.62, -2.07);
  box(g, 1.5, 0.04, 0.5, P, 0, 0.95, -1.95).visible = true;
  box(g, 1.4, 0.04, 0.45, IN, 0, 0.96, -1.18);            // parcel shelf
  box(g, 1.3, 0.16, 0.5, MAT.seat, 0, 0.4, -0.8);         // rear bench
  box(g, 1.3, 0.5, 0.1, MAT.seat, 0, 0.7, -1.02, -0.2);
  // dashboard
  box(g, 1.56, 0.2, 0.24, IN, 0, 0.88, 0.62);
  box(g, 1.56, 0.04, 0.08, IN, 0, 0.99, 0.55);
  box(g, 0.4, 0.16, 0.06, BL, 0.37, 0.9, 0.53);           // cluster hood
  // steering column
  const col = cyl(g, 0.025, 0.42, MAT.plastic, 0.37, 0.78, 0.55, 'z', 10); col.rotation.x = Math.PI / 2 - 0.45;
  // pedals
  for (const [i, x] of [0.27, 0.37, 0.47].entries()) { box(g, 0.06, 0.08, 0.015, MAT.darkSteel, x, 0.38, 0.62, -0.3); box(g, 0.015, 0.2, 0.015, MAT.darkSteel, x, 0.47, 0.67); }
  // gear lever
  const lever = new THREE.Group(); lever.position.set(0, 0.5, 0.2); g.add(lever);
  cyl(lever, 0.008, 0.3, MAT.chrome, 0, 0.15, 0); const knob = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 8), MAT.blackPaint); knob.position.y = 0.31; lever.add(knob);
  cyl(g, 0.07, 0.03, MAT.rubber, 0, 0.52, 0.2, 'y', 12);
  // handbrake
  const hb = new THREE.Group(); hb.position.set(0.1, 0.53, -0.15); g.add(hb);
  box(hb, 0.03, 0.03, 0.25, MAT.darkSteel, 0, 0, 0.1); box(hb, 0.035, 0.035, 0.08, MAT.blackPaint, 0, 0, 0.22);
  // ignition key
  const key = new THREE.Group(); key.position.set(0.56, 0.84, 0.5); g.add(key);
  cyl(key, 0.018, 0.02, MAT.chrome, 0, 0, 0, 'z', 12);
  const kb = box(key, 0.012, 0.035, 0.008, MAT.brass, 0, 0.0, -0.02);
  const keyHit = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), MAT.hit); key.add(keyHit);
  keyHit.userData.action = 'ignition';
  // gauges
  const gc = document.createElement('canvas'); gc.width = 512; gc.height = 180;
  const gtex = new THREE.CanvasTexture(gc); gtex.colorSpace = THREE.SRGBColorSpace;
  const gm = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.126), new THREE.MeshBasicMaterial({ map: gtex }));
  gm.position.set(0.37, 0.9, 0.497); gm.rotation.y = Math.PI; g.add(gm);
  // number plates
  const plateM = new THREE.MeshStandardMaterial({ map: labelTex('JC-162', 256, 56, '#f2f0e8', '#111', 'bold 40px Arial'), roughness: 0.5 });
  const pf = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.1), plateM); pf.position.set(0, 0.3, 2.045); g.add(pf);
  const pr = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.1), plateM); pr.position.set(0, 0.55, -2.09); pr.rotation.y = Math.PI; g.add(pr);
  const badge = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.06), new THREE.MeshStandardMaterial({ map: labelTex('RUSKA', 256, 52, '#c4a25a', '#3a2a10', 'italic bold 40px Georgia'), roughness: 0.4, metalness: 0.4 }));
  badge.position.set(0.45, 0.8, -2.088); badge.rotation.y = Math.PI; g.add(badge);
  // enter-car hit zones (seat area, reachable through an open or missing door)
  const enter = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.7), MAT.hit);
  enter.position.set(0.4, 0.65, -0.1); enter.userData.action = 'enter'; g.add(enter);
  // push-hit for flipping the car back over
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.userData.shell = true; } });
  root.add(g);
  // lights
  const lights = [];
  for (const s of [1, -1]) {
    const L = new THREE.SpotLight(0xfff2d8, 0, 70, 0.45, 0.5, 1.2);
    L.position.set(s * 0.56, 0.72, 2.05); L.target.position.set(s * 0.4, 0.2, 14);
    root.add(L, L.target); lights.push(L);
  }
  return { group: g, lever, handbrake: hb, key, keyBlade: kb, gaugeCanvas: gc, gaugeTex: gtex, lights, enter };
}

export function drawGauges(c, st) {
  const g = c.getContext('2d');
  g.fillStyle = '#0c0c0c'; g.fillRect(0, 0, c.width, c.height);
  const lit = st.ign;
  const face = (cx, cy, r, max, step, label, val, unitTxt) => {
    g.fillStyle = '#151515'; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill();
    g.strokeStyle = '#555'; g.lineWidth = 2; g.stroke();
    g.fillStyle = lit ? '#f2e2b0' : '#9a9a9a'; g.strokeStyle = g.fillStyle; g.font = '13px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let v = 0; v <= max; v += step) {
      const a = Math.PI * 0.75 + (v / max) * Math.PI * 1.5;
      g.lineWidth = 2; g.beginPath(); g.moveTo(cx + Math.cos(a) * r * 0.82, cy + Math.sin(a) * r * 0.82); g.lineTo(cx + Math.cos(a) * r * 0.95, cy + Math.sin(a) * r * 0.95); g.stroke();
      g.fillText(String(label(v)), cx + Math.cos(a) * r * 0.66, cy + Math.sin(a) * r * 0.66);
    }
    g.font = '10px Arial'; g.fillText(unitTxt, cx, cy + r * 0.45);
    const a = Math.PI * 0.75 + Math.min(val / max, 1.03) * Math.PI * 1.5;
    g.strokeStyle = '#ff5a20'; g.lineWidth = 3; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * r * 0.85, cy + Math.sin(a) * r * 0.85); g.stroke();
    g.fillStyle = '#333'; g.beginPath(); g.arc(cx, cy, 6, 0, 7); g.fill();
  };
  face(90, 90, 82, 8000, 1000, (v) => v / 1000, st.rpm, 'RPM x1000');
  face(260, 90, 82, 200, 20, (v) => v, st.kmh, 'km/h');
  // small gauges
  const bar = (x, label, v, warn) => {
    g.fillStyle = '#999'; g.font = '11px Arial'; g.textAlign = 'center'; g.fillText(label, x, 165);
    g.strokeStyle = '#555'; g.strokeRect(x - 8, 25, 16, 125);
    g.fillStyle = warn ? '#e04020' : '#d8c070'; const h = Math.max(0, Math.min(1, v)) * 121;
    if (lit) g.fillRect(x - 6, 148 - h, 12, h);
  };
  bar(380, 'FUEL', st.fuel, st.fuel < 0.12);
  bar(420, 'TEMP', (st.temp - 40) / 90, st.temp > 110);
  // warning lights
  const lamp = (x, y, col, on, t) => { g.fillStyle = on && lit ? col : '#222'; g.beginPath(); g.arc(x, y, 9, 0, 7); g.fill(); g.fillStyle = on && lit ? '#000' : '#555'; g.font = 'bold 9px Arial'; g.fillText(t, x, y + 1); };
  lamp(470, 30, '#ff3020', st.oilLamp, 'OIL');
  lamp(470, 60, '#ff3020', st.battLamp, 'BAT');
  lamp(470, 90, '#ff9020', st.hotLamp, 'TMP');
  lamp(470, 120, '#40a0ff', st.lights, 'HI');
  lamp(470, 150, '#ff3020', st.hand, 'P');
  g.fillStyle = lit ? '#ffcc66' : '#555'; g.font = 'bold 20px Consolas, monospace'; g.textAlign = 'center';
  g.fillText(st.gear, 175, 160);
}
