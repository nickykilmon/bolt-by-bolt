// Procedural 3D models for every part / tool / consumable.
// Each builder returns a THREE.Group in the part's local frame (see partsdb.js for conventions).
import * as THREE from 'three';
import { MAT } from '../core/materials.js';
import { CYL_Z, PATHS, TUBE_RADIUS, pathCenter } from './partsdb.js';
import { labelTex } from '../core/textures.js';

const geoCache = new Map();
function cachedGeo(key, make) { let g = geoCache.get(key); if (!g) { g = make(); geoCache.set(key, g); } return g; }

export function box(g, w, h, d, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(cachedGeo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d)), mat);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz); g.add(m); return m;
}
// axis: 'x' | 'y' | 'z'
export function cyl(g, r, len, mat, x = 0, y = 0, z = 0, axis = 'y', seg = 16, r2 = r) {
  const m = new THREE.Mesh(cachedGeo(`c${r},${r2},${len},${seg}`, () => new THREE.CylinderGeometry(r2, r, len, seg)), mat);
  m.position.set(x, y, z);
  if (axis === 'x') m.rotation.z = -Math.PI / 2;
  if (axis === 'z') m.rotation.x = Math.PI / 2;
  g.add(m); return m;
}
function torus(g, r, tube, mat, x = 0, y = 0, z = 0, axis = 'z', seg = 20) {
  const m = new THREE.Mesh(cachedGeo(`t${r},${tube},${seg}`, () => new THREE.TorusGeometry(r, tube, 8, seg)), mat);
  m.position.set(x, y, z);
  if (axis === 'x') m.rotation.y = Math.PI / 2;
  if (axis === 'y') m.rotation.x = Math.PI / 2;
  g.add(m); return m;
}
function tubeMesh(g, pts, r, mat, closed = false, segs = 40) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), closed);
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, segs, r, 8, closed), mat);
  g.add(m); return m;
}
function centredPath(name) {
  const c = pathCenter(PATHS[name]);
  return PATHS[name].map((p) => [p[0] - c[0], p[1] - c[1], p[2] - c[2]]);
}
function sprocket(g, r, thick, mat, teeth) {
  const rot = new THREE.Group(); rot.name = 'rot'; g.add(rot);
  cyl(rot, r, thick, mat, 0, 0, 0, 'z', Math.max(12, teeth));
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    box(rot, 0.008, 0.008, thick, mat, Math.cos(a) * r, Math.sin(a) * r, 0, 0, 0, a);
  }
  box(rot, 0.006, r * 0.5, 0.004, MAT.whitePlastic, 0, r * 0.7, thick / 2 + 0.002); // timing mark
  return rot;
}

const B = {};
B.block = (g) => {
  const blue = MAT.bluePaint;
  box(g, 0.34, 0.25, 0.47, blue, 0, 0.175, 0);         // cylinder bank
  box(g, 0.36, 0.13, 0.47, blue, 0, -0.0, 0);           // crankcase
  for (const z of CYL_Z) {
    cyl(g, 0.04, 0.004, MAT.darkSteel, 0, 0.3, z, 'y', 20);
    torus(g, 0.04, 0.003, MAT.steel, 0, 0.301, z, 'y');
  }
  for (const s of [1, -1]) {
    box(g, 0.04, 0.05, 0.08, blue, s * 0.2, -0.02, 0);   // mount bosses
    for (const z of [-0.15, 0, 0.15]) box(g, 0.012, 0.2, 0.012, blue, s * 0.175, 0.17, z); // ribs
  }
  box(g, 0.44, 0.36, 0.015, blue, 0, 0.08, -0.235);      // rear flange
  for (const z of [-0.18, -0.09, 0, 0.09, 0.18]) box(g, 0.08, 0.02, 0.03, MAT.castIron, 0, -0.062, z); // main saddles
};
B.crankshaft = (g) => {
  cyl(g, 0.026, 0.52, MAT.steel, 0, 0, 0.005, 'z');
  for (const [i, z] of CYL_Z.entries()) {
    const up = i === 0 || i === 3 ? 1 : -1;
    box(g, 0.07, 0.09, 0.012, MAT.steel, 0, up * 0.02, z + 0.022);
    box(g, 0.07, 0.09, 0.012, MAT.steel, 0, up * 0.02, z - 0.022);
    cyl(g, 0.02, 0.035, MAT.steel, 0, up * 0.042, z, 'z');
    box(g, 0.08, 0.04, 0.012, MAT.darkSteel, 0, -up * 0.04, z + 0.022);
  }
};
B.main_bearings = (g) => { for (const z of [-0.18, -0.09, 0, 0.09, 0.18]) torus(g, 0.028, 0.003, MAT.copper, 0, 0, z, 'z', 16); };
B.rod_bearings = (g) => { CYL_Z.forEach((z, i) => torus(g, 0.022, 0.003, MAT.copper, 0, (i === 0 || i === 3 ? 1 : -1) * 0.042, z, 'z', 14)); };
B.piston = (g) => {
  cyl(g, 0.039, 0.065, MAT.alu, 0, 0, 0, 'y', 20);
  const arrow = new THREE.Mesh(cachedGeo('arrow', () => { const s = new THREE.Shape(); s.moveTo(0, 0.022); s.lineTo(0.012, 0); s.lineTo(0.004, 0); s.lineTo(0.004, -0.018); s.lineTo(-0.004, -0.018); s.lineTo(-0.004, 0); s.lineTo(-0.012, 0); s.closePath(); return new THREE.ShapeGeometry(s); }), MAT.blackPaint);
  arrow.rotation.x = -Math.PI / 2; arrow.position.y = 0.0331; g.add(arrow);
  cyl(g, 0.009, 0.07, MAT.steel, 0, -0.012, 0, 'x');
};
B.piston_rings = (g) => { for (const y of [0.022, 0.012, 0.002]) torus(g, 0.0392, 0.0018, MAT.darkSteel, 0, y, 0, 'y', 24); };
B.conrod = (g) => {
  box(g, 0.016, 0.19, 0.012, MAT.steel, 0, -0.11, 0);
  torus(g, 0.03, 0.007, MAT.steel, 0, -0.205, 0, 'z', 14);
  torus(g, 0.012, 0.005, MAT.steel, 0, -0.012, 0, 'z', 10);
};
B.oil_pump = (g) => { box(g, 0.12, 0.08, 0.05, MAT.aluDark); cyl(g, 0.01, 0.12, MAT.darkSteel, 0.03, -0.08, -0.03); cyl(g, 0.03, 0.01, MAT.darkSteel, 0.03, -0.14, -0.03); };
B.oil_pan = (g) => {
  const m = MAT.blackPaint;
  box(g, 0.34, 0.006, 0.45, m, 0, -0.04, 0.0); box(g, 0.34, 0.008, 0.2, m, 0, -0.15, -0.12);
  for (const s of [1, -1]) { box(g, 0.006, 0.04, 0.45, m, s * 0.17, -0.02, 0); box(g, 0.006, 0.11, 0.2, m, s * 0.17, -0.095, -0.12); }
  box(g, 0.34, 0.04, 0.006, m, 0, -0.02, 0.225); box(g, 0.34, 0.15, 0.006, m, 0, -0.075, -0.225); box(g, 0.34, 0.11, 0.006, m, 0, -0.095, -0.02);
  box(g, 0.36, 0.006, 0.47, m, 0, 0, 0).scale.set(1, 1, 1);
};
B.oil_filter = (g) => { cyl(g, 0.045, 0.1, MAT.filter, 0.05, 0, 0, 'x', 18); cyl(g, 0.04, 0.012, MAT.darkSteel, 0.005, 0, 0, 'x', 18); };
B.fuel_pump = (g) => { cyl(g, 0.035, 0.05, MAT.aluDark, 0.025, 0, 0, 'x'); cyl(g, 0.005, 0.04, MAT.brass, 0.03, 0.04, 0); cyl(g, 0.005, 0.04, MAT.brass, 0.03, 0.0, 0.04, 'z'); };
B.head_gasket = (g) => {
  box(g, 0.34, 0.003, 0.47, MAT.gasket);
  for (const z of CYL_Z) torus(g, 0.041, 0.003, MAT.darkSteel, 0, 0.002, z, 'y', 18);
};
B.cylinder_head = (g) => {
  box(g, 0.32, 0.11, 0.47, MAT.alu, 0, 0.055, 0);
  for (const z of [-0.13, 0, 0.13]) { box(g, 0.02, 0.05, 0.07, MAT.alu, 0.165, 0.06, z); box(g, 0.02, 0.05, 0.07, MAT.alu, -0.165, 0.06, z); }
  box(g, 0.25, 0.006, 0.47, MAT.aluDark, 0, 0.11, 0);
};
const valveSet = (g, mat) => { for (const z of CYL_Z) { cyl(g, 0.004, 0.09, MAT.steel, 0, 0.0, z); cyl(g, 0.016, 0.004, mat, 0, -0.045, z, 'y', 14); } };
B.valves_in = (g) => valveSet(g, MAT.steel);
B.valves_ex = (g) => valveSet(g, MAT.darkSteel);
B.valve_springs = (g) => { for (const x of [0.035, -0.035]) for (const z of CYL_Z) { const m = cyl(g, 0.012, 0.04, MAT.greenPaint, x, 0, z, 'y', 10); m.material = MAT.darkSteel; } };
B.valve_retainers = (g) => { for (const x of [0.035, -0.035]) for (const z of CYL_Z) cyl(g, 0.013, 0.005, MAT.steel, x, 0, z, 'y', 10); };
B.cam_bearings = (g) => { for (const z of [-0.18, 0, 0.18]) box(g, 0.1, 0.018, 0.03, MAT.alu, 0, 0, z); };
B.camshaft = (g) => {
  cyl(g, 0.014, 0.5, MAT.steel, 0, 0, 0, 'z');
  for (const z of CYL_Z) for (const dz of [-0.018, 0.018]) box(g, 0.03, 0.04, 0.012, MAT.steel, 0, 0.008, z + dz, 0, 0, dz > 0 ? 0.5 : -0.5);
};
B.rockers = (g) => {
  cyl(g, 0.009, 0.46, MAT.steel, 0, 0, 0, 'z');
  for (const z of CYL_Z) for (const dz of [-0.018, 0.018]) box(g, 0.09, 0.015, 0.012, MAT.darkSteel, 0, 0, z + dz);
  for (const z of [-0.21, -0.07, 0.07, 0.21]) box(g, 0.03, 0.025, 0.02, MAT.aluDark, 0, 0.01, z);
};
B.valve_cover = (g) => {
  box(g, 0.24, 0.09, 0.48, MAT.redPaint, 0, 0.045, 0);
  box(g, 0.22, 0.01, 0.46, MAT.redPaint, 0, 0.093, 0);
  cyl(g, 0.022, 0.025, MAT.blackPaint, 0.05, 0.1, 0.12, 'y', 16);
  const lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.04), new THREE.MeshStandardMaterial({ map: labelTex('RUSKA 1600', 256, 64, '#a82a20', '#f0e0c0', 'bold 34px Arial'), roughness: 0.5 }));
  lbl.rotation.x = -Math.PI / 2; lbl.position.set(-0.03, 0.0985, -0.08); g.add(lbl);
};
B.cam_sprocket = (g) => { sprocket(g, 0.06, 0.02, MAT.steel, 24); };
B.crank_sprocket = (g) => { sprocket(g, 0.03, 0.02, MAT.steel, 12); };
B.timing_belt = (g) => {
  const pts = [];
  const camY = 0.443, rc = 0.062, rk = 0.032;
  for (let i = 0; i <= 10; i++) { const a = Math.PI * (i / 10); pts.push([Math.cos(a) * rc, camY + Math.sin(a) * rc, 0]); }
  pts.push([-0.065, 0.2, 0]);
  for (let i = 0; i <= 8; i++) { const a = Math.PI + Math.PI * (i / 8); pts.push([Math.cos(a) * rk, Math.sin(a) * rk, 0]); }
  pts.push([0.08, 0.07, 0]); pts.push([0.07, 0.2, 0]);
  const m = tubeMesh(g, pts, 0.006, MAT.belt, true, 80); m.scale.set(1, 1, 2.2);
};
B.tensioner = (g) => { cyl(g, 0.025, 0.02, MAT.steel, 0, 0, 0.01, 'z'); box(g, 0.02, 0.06, 0.01, MAT.darkSteel, 0, -0.03, 0); };
B.timing_cover = (g) => { box(g, 0.2, 0.52, 0.012, MAT.blackPaint, 0, 0.04, 0); };
B.crank_pulley = (g) => { cyl(g, 0.065, 0.025, MAT.darkSteel, 0, 0, 0, 'z', 24); torus(g, 0.06, 0.004, MAT.belt, 0, 0, 0.01, 'z'); };
B.water_pump = (g) => { cyl(g, 0.05, 0.04, MAT.aluDark, 0, 0, 0, 'z', 18); cyl(g, 0.05, 0.01, MAT.steel, 0, 0, 0.075, 'z', 18); cyl(g, 0.01, 0.06, MAT.steel, 0, 0, 0.045, 'z'); cyl(g, 0.018, 0.06, MAT.aluDark, 0, 0, 0.055, 'z'); };
B.thermostat = (g) => { cyl(g, 0.03, 0.03, MAT.aluDark, 0, 0, 0, 'y', 14); cyl(g, 0.02, 0.05, MAT.aluDark, 0, 0.02, 0.025, 'z', 12); };
B.alternator = (g) => { cyl(g, 0.06, 0.12, MAT.alu, 0, 0, 0.04, 'z', 18); cyl(g, 0.035, 0.015, MAT.darkSteel, 0, 0, 0.14, 'z'); box(g, 0.06, 0.03, 0.04, MAT.alu, 0.05, 0.03, 0); };
B.fan_belt = (g) => { tubeMesh(g, [[0.06, -0.02, 0], [0, -0.068, 0], [-0.06, -0.02, 0], [-0.2, 0.045, 0], [-0.24, 0.07, 0], [-0.2, 0.1, 0], [-0.09, 0.193, 0], [-0.04, 0.14, 0], [0.05, 0.03, 0]], 0.006, MAT.belt, true, 60); };
B.starter = (g) => { cyl(g, 0.04, 0.15, MAT.blackPaint, 0, 0, 0.09, 'z', 16); cyl(g, 0.02, 0.09, MAT.alu, 0.045, 0.02, 0.09, 'z', 12); box(g, 0.1, 0.1, 0.01, MAT.aluDark, 0, 0, 0.012); };
B.flywheel = (g) => { cyl(g, 0.14, 0.03, MAT.steel, 0, 0, 0, 'z', 32); torus(g, 0.142, 0.006, MAT.darkSteel, 0, 0, 0, 'z', 40); };
B.clutch_disc = (g) => { cyl(g, 0.1, 0.008, MAT.gasket, 0, 0, 0, 'z', 28); cyl(g, 0.03, 0.03, MAT.steel, 0, 0, 0, 'z', 12); };
B.pressure_plate = (g) => {
  cyl(g, 0.125, 0.035, MAT.darkSteel, 0, 0, 0, 'z', 28);
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; box(g, 0.012, 0.06, 0.004, MAT.steel, Math.cos(a) * 0.055, Math.sin(a) * 0.055, -0.02, 0, 0, a + Math.PI / 2); }
};
B.gearbox = (g) => {
  const m = MAT.alu;
  cyl(g, 0.12, 0.18, m, 0, 0, -0.09, 'z', 22, 0.19);
  box(g, 0.2, 0.22, 0.36, m, 0, -0.01, -0.36);
  cyl(g, 0.05, 0.16, m, 0, 0, -0.62, 'z', 14);
  cyl(g, 0.045, 0.02, MAT.darkSteel, 0, 0, -0.7, 'z');
  cyl(g, 0.012, 0.18, MAT.darkSteel, 0, 0.18, -0.36, 'y', 8);
  cyl(g, 0.025, 0.04, MAT.blackPaint, 0, 0.28, -0.36, 'y', 10);
  cyl(g, 0.015, 0.02, MAT.brass, 0.1, 0.02, -0.25, 'x', 8);
};
B.gearset = (g) => {
  cyl(g, 0.012, 0.42, MAT.steel, 0, 0.04, 0, 'z'); cyl(g, 0.012, 0.42, MAT.steel, 0, -0.04, 0, 'z');
  [0.035, 0.03, 0.025, 0.02].forEach((r, i) => { cyl(g, r, 0.02, MAT.steel, 0, 0.04, -0.14 + i * 0.09, 'z', 16); cyl(g, 0.055 - r, 0.02, MAT.darkSteel, 0, -0.04, -0.14 + i * 0.09, 'z', 16); });
};
B.gearbox_cover = (g) => { box(g, 0.19, 0.008, 0.34, MAT.aluDark); };
B.engine_mount = (g) => { box(g, 0.08, 0.04, 0.12, MAT.darkSteel, 0, -0.04, 0); box(g, 0.06, 0.04, 0.08, MAT.rubber, 0, 0, 0); };
B.gearbox_mount = (g) => { box(g, 0.6, 0.03, 0.05, MAT.darkSteel, 0, -0.02, 0); box(g, 0.08, 0.04, 0.06, MAT.rubber, 0, 0.015, 0); };
B.propshaft = (g) => { cyl(g, 0.035, 1.3, MAT.darkSteel, 0, 0, 0.05, 'z', 14); for (const z of [0.7, -0.6]) { cyl(g, 0.045, 0.03, MAT.steel, 0, 0, z, 'z'); box(g, 0.05, 0.05, 0.03, MAT.steel, 0, 0, z + (z > 0 ? -0.04 : 0.04), 0, 0, 0.78); } };
B.differential = (g) => {
  const s = new THREE.Mesh(cachedGeo('diffS', () => new THREE.SphereGeometry(0.13, 16, 12)), MAT.castIron); g.add(s);
  cyl(g, 0.04, 1.2, MAT.castIron, 0, 0, 0, 'x', 12); cyl(g, 0.05, 0.08, MAT.castIron, 0, 0, 0.13, 'z');
};
B.halfshaft = (g) => { cyl(g, 0.016, 0.52, MAT.steel, 0.27, 0, 0, 'x', 10); cyl(g, 0.05, 0.015, MAT.steel, 0.53, 0, 0, 'x', 14); };
B.radiator = (g) => {
  box(g, 0.6, 0.38, 0.05, MAT.darkSteel, 0, 0, 0);
  for (let i = 0; i < 18; i++) box(g, 0.002, 0.36, 0.052, MAT.aluDark, -0.28 + i * 0.033, 0, 0);
  box(g, 0.64, 0.05, 0.06, MAT.blackPaint, 0, 0.21, 0); box(g, 0.64, 0.05, 0.06, MAT.blackPaint, 0, -0.21, 0);
  cyl(g, 0.025, 0.02, MAT.steel, 0.18, 0.245, 0, 'y'); cyl(g, 0.02, 0.06, MAT.blackPaint, 0.18, 0.18, -0.04, 'z'); cyl(g, 0.02, 0.06, MAT.blackPaint, -0.18, -0.16, -0.04, 'z');
};
B.cooling_fan = (g) => {
  torus(g, 0.17, 0.012, MAT.plastic, 0, 0, 0, 'z', 28); cyl(g, 0.04, 0.06, MAT.plastic, 0, 0, -0.02, 'z');
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; box(g, 0.05, 0.13, 0.005, MAT.plastic, Math.cos(a) * 0.09, Math.sin(a) * 0.09, 0, 0.3, 0, a - Math.PI / 2); }
};
for (const n of ['hose_upper', 'hose_lower', 'downpipe', 'midpipe', 'coil_lead', 'engine_harness', 'fuel_line', 'throttle_cable', 'clutch_cable']) {
  const mat = { hose_upper: 'rubber', hose_lower: 'rubber', downpipe: 'rust', midpipe: 'rust', coil_lead: 'blackPaint', engine_harness: 'plastic', fuel_line: 'rubber', throttle_cable: 'darkSteel', clutch_cable: 'darkSteel' }[n];
  B[n] = (g) => {
    const p = centredPath(n);
    tubeMesh(g, p, TUBE_RADIUS[n], MAT[mat], false, 30);
    if (n === 'midpipe') { const m = cyl(g, 0.07, 0.4, MAT.rust, ...p[2].map((v, i) => v + [0, 0, 0.35][i]), 'z', 14); m.scale.set(1, 0.7, 1); }
  };
}
B.muffler = (g) => { const m = cyl(g, 0.12, 0.5, MAT.rust, 0, 0, 0, 'z', 18); m.scale.set(1.3, 0.75, 1); cyl(g, 0.025, 0.4, MAT.rust, 0.02, 0, 0.35, 'z', 10); cyl(g, 0.028, 0.2, MAT.chrome, -0.04, 0, -0.33, 'z', 12); };
B.battery = (g) => {
  box(g, 0.24, 0.18, 0.17, MAT.battery, 0, 0.09, 0); box(g, 0.24, 0.015, 0.17, MAT.redPlastic, 0, 0.185, 0);
  cyl(g, 0.01, 0.025, MAT.redPlastic, 0.06, 0.2, 0.05); cyl(g, 0.01, 0.025, MAT.blackPaint, -0.06, 0.2, 0.05);
  box(g, 0.2, 0.008, 0.02, MAT.darkSteel, 0, 0.19, 0);
};
B.ignition_coil = (g) => { cyl(g, 0.028, 0.13, MAT.blackPaint, 0, 0, 0, 'y', 14); box(g, 0.04, 0.12, 0.01, MAT.steel, 0.03, 0, -0.025); };
B.fuel_tank = (g) => { box(g, 0.8, 0.22, 0.48, MAT.blackPaint, 0, 0, 0); cyl(g, 0.025, 0.95, MAT.darkSteel, 0.45, 0.2, 0.15, 'x', 10).rotation.z = -1.2; cyl(g, 0.035, 0.03, MAT.blackPaint, 0.86, 0.42, 0.15, 'x', 12); };
B.master_cylinder = (g) => { cyl(g, 0.025, 0.14, MAT.alu, 0, 0, 0.0, 'z', 12); box(g, 0.06, 0.05, 0.08, MAT.whitePlastic, 0, 0.045, 0); cyl(g, 0.02, 0.01, MAT.blackPaint, 0, 0.075, 0); };
B.steering_rack = (g) => { cyl(g, 0.025, 0.6, MAT.darkSteel, 0, 0, 0, 'x', 12); cyl(g, 0.035, 0.12, MAT.aluDark, 0.12, 0, 0, 'x', 12); for (const s of [1, -1]) cyl(g, 0.03, 0.1, MAT.rubber, s * 0.32, 0, 0, 'x', 10); };
B.tie_rod = (g) => { cyl(g, 0.009, 0.22, MAT.steel, 0.1, 0, 0, 'x', 8); cyl(g, 0.018, 0.03, MAT.darkSteel, 0.21, 0, 0, 'y', 10); };
B.control_arm = (g) => {
  const m = MAT.blackPaint;
  box(g, 0.38, 0.03, 0.04, m, 0, 0, 0.045, 0, 0.25); box(g, 0.38, 0.03, 0.04, m, 0, 0, -0.045, 0, -0.25);
  cyl(g, 0.022, 0.05, MAT.rubber, -0.18, 0, 0.08, 'z', 10); cyl(g, 0.022, 0.05, MAT.rubber, -0.18, 0, -0.08, 'z', 10);
  const s = new THREE.Mesh(cachedGeo('ball', () => new THREE.SphereGeometry(0.025, 10, 8)), MAT.steel); s.position.set(0.19, 0.01, 0); g.add(s);
};
B.shock = (g) => { cyl(g, 0.03, 0.26, MAT.yellowPaint, 0, -0.06, 0, 'y', 12); cyl(g, 0.01, 0.2, MAT.chrome, 0, 0.12, 0, 'y', 8); cyl(g, 0.045, 0.012, MAT.darkSteel, 0, 0.22, 0, 'y', 14); };
B.spring = (g) => {
  const pts = []; const turns = 6, r = 0.055;
  for (let i = 0; i <= turns * 12; i++) { const a = (i / 12) * Math.PI * 2; pts.push([Math.cos(a) * r, -0.08 + (i / (turns * 12)) * 0.28, Math.sin(a) * r]); }
  tubeMesh(g, pts, 0.007, MAT.redPaint, false, turns * 24);
};
B.brake_disc = (g) => { cyl(g, 0.12, 0.02, MAT.steel, 0.0, 0, 0, 'x', 28); cyl(g, 0.065, 0.06, MAT.darkSteel, 0.03, 0, 0, 'x', 18); };
B.brake_pads = (g) => { for (const s of [1, -1]) box(g, 0.008, 0.07, 0.04, MAT.gasket, s * 0.016, 0.07, -0.08, 0.95); };
B.caliper = (g) => { box(g, 0.07, 0.15, 0.06, MAT.redPaint, 0, 0.07, -0.085, 0.95); };
B.wheel = (g) => {
  const t = cyl(g, 0.3, 0.17, MAT.tire, 0.06, 0, 0, 'x', 28);
  cyl(g, 0.19, 0.172, MAT.darkSteel, 0.06, 0, 0, 'x', 20);
  cyl(g, 0.17, 0.02, MAT.steel, 0.14, 0, 0, 'x', 20);
  cyl(g, 0.05, 0.03, MAT.chrome, 0.15, 0, 0, 'x', 12);
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; box(g, 0.02, 0.035, 0.035, MAT.steel, 0.145, Math.cos(a) * 0.11, Math.sin(a) * 0.11); }
  t.name = 'tire';
};
B.steering_wheel = (g) => {
  torus(g, 0.18, 0.014, MAT.plastic, 0, 0, 0, 'z', 32);
  for (const a of [0, Math.PI * 0.75, Math.PI * 1.25]) box(g, 0.012, 0.17, 0.01, MAT.darkSteel, Math.sin(a) * 0.085, -Math.cos(a) * 0.085 * -1 * (a === 0 ? -1 : 1), 0, 0, 0, a);
  cyl(g, 0.04, 0.04, MAT.plastic, 0, 0, 0, 'z', 14);
};
B.seat = (g) => {
  box(g, 0.48, 0.12, 0.5, MAT.seat, 0, 0.18, 0);
  box(g, 0.48, 0.6, 0.1, MAT.seat, 0, 0.5, -0.24, -0.15);
  box(g, 0.26, 0.15, 0.08, MAT.seat, 0, 0.88, -0.29, -0.15);
  box(g, 0.4, 0.12, 0.4, MAT.darkSteel, 0, 0.06, 0);
};
B.hood = (g) => {
  box(g, 1.56, 0.025, 1.18, MAT.carPaint, 0, 0, 0.59);
  box(g, 1.2, 0.012, 1.0, MAT.carPaintDull, 0, 0.018, 0.55);
  for (const s of [1, -1]) box(g, 0.03, 0.03, 0.12, MAT.darkSteel, s * 0.55, -0.02, 0.1);
};
const door = (g, side) => {
  box(g, 0.05, 0.62, 1.04, MAT.carPaint, 0, 0.32, -0.52);
  box(g, 0.02, 0.58, 0.98, MAT.interior, -side * 0.03, 0.32, -0.52);
  const frame = MAT.carPaint;
  box(g, 0.035, 0.04, 0.9, frame, 0, 1.02, -0.6);
  box(g, 0.035, 0.42, 0.04, frame, 0, 0.83, -0.02, -0.0); box(g, 0.035, 0.38, 0.04, frame, 0, 0.83, -1.02);
  const glass = box(g, 0.008, 0.36, 0.95, MAT.glass, 0, 0.82, -0.52); glass.userData.glass = true;
  box(g, 0.02, 0.025, 0.1, MAT.chrome, side * 0.03, 0.55, -0.85);
  box(g, 0.1, 0.06, 0.03, MAT.blackPaint, side * 0.06, 0.88, -0.05); // mirror
};
B.door_l = (g) => door(g, 1);
B.door_r = (g) => door(g, -1);
B.trunk_lid = (g) => { box(g, 1.5, 0.025, 0.62, MAT.carPaint, 0, 0, -0.31); box(g, 0.2, 0.04, 0.02, MAT.chrome, 0, -0.02, -0.6); };
B.bumper_f = (g) => { box(g, 1.7, 0.1, 0.07, MAT.chrome); box(g, 0.08, 0.12, 0.05, MAT.rubber, 0.4, 0, 0.02); box(g, 0.08, 0.12, 0.05, MAT.rubber, -0.4, 0, 0.02); };
B.bumper_r = (g) => { box(g, 1.7, 0.1, 0.07, MAT.chrome); };
B.headlight = (g) => { cyl(g, 0.085, 0.06, MAT.chrome, 0, 0, -0.02, 'z', 20); const l = cyl(g, 0.075, 0.01, MAT.lens, 0, 0, 0.012, 'z', 20); l.name = 'lens'; };
B.taillight = (g) => { const l = box(g, 0.24, 0.12, 0.03, MAT.redLens); l.name = 'lens'; box(g, 0.08, 0.12, 0.031, MAT.yellowPaint, 0.08, 0, 0.001); };
B.stand = (g) => {
  const m = MAT.redPaint;
  box(g, 0.08, 0.06, 0.9, m, 0, 0.05, 0); box(g, 0.8, 0.06, 0.08, m, 0, 0.05, -0.4);
  for (const [x, z] of [[0, 0.42], [0.38, -0.4], [-0.38, -0.4]]) cyl(g, 0.035, 0.04, MAT.rubber, x, 0.02, z, 'x', 10);
  box(g, 0.08, 0.7, 0.08, m, 0, 0.42, -0.4);
  box(g, 0.08, 0.06, 0.4, m, 0, 0.74, -0.22);
  for (const s of [1, -1]) { box(g, 0.44, 0.04, 0.05, m, 0, 0.76, s * 0.1); box(g, 0.04, 0.1, 0.05, m, s * 0.2, 0.8, s * 0.1); }
};

B.spark_plug = (g) => { cyl(g, 0.007, 0.03, MAT.steel, 0, -0.012, 0, 'y', 8); cyl(g, 0.011, 0.012, MAT.steel, 0, 0.008, 0, 'y', 6); cyl(g, 0.008, 0.04, MAT.ceramic, 0, 0.032, 0, 'y', 10); cyl(g, 0.003, 0.008, MAT.steel, 0, 0.055, 0, 'y', 6); };
B.distributor = (g) => { cyl(g, 0.028, 0.09, MAT.alu, 0, 0, 0, 'y', 14); cyl(g, 0.036, 0.035, MAT.blackPaint, 0, 0.06, 0, 'y', 14); box(g, 0.05, 0.012, 0.03, MAT.aluDark, 0.03, -0.01, 0.01); };
B.plug_wires = (g) => {
  const cap = [0.07, 0.2, -0.27];
  for (const z of CYL_Z) tubeMesh(g, [cap, [cap[0] - 0.05, 0.24, (cap[2] + z) / 2], [-0.12, 0.2, z], [-0.135, 0.16, z]], 0.004, MAT.redPaint, false, 16);
  for (const z of CYL_Z) cyl(g, 0.009, 0.03, MAT.redPaint, -0.135, 0.15, z, 'y', 8);
};
B.intake_manifold = (g) => {
  box(g, 0.02, 0.08, 0.42, MAT.alu, -0.005, 0, 0);
  for (const z of CYL_Z) box(g, 0.1, 0.035, 0.035, MAT.alu, 0.04, 0.01 + Math.abs(z) * 0.1, z * 0.8);
  box(g, 0.07, 0.06, 0.16, MAT.alu, 0.09, 0.02, 0); box(g, 0.08, 0.008, 0.08, MAT.aluDark, 0.1, 0.055, 0);
};
B.carburetor = (g) => { box(g, 0.075, 0.07, 0.075, MAT.alu, 0, 0.0, 0); cyl(g, 0.022, 0.05, MAT.aluDark, 0.05, -0.005, 0, 'y', 12); cyl(g, 0.03, 0.02, MAT.alu, 0, 0.045, 0, 'y', 14); box(g, 0.01, 0.03, 0.04, MAT.steel, -0.04, 0.0, 0.02); };
B.air_filter = (g) => { cyl(g, 0.1, 0.05, MAT.blackPaint, 0, 0.0, 0, 'y', 22); cyl(g, 0.012, 0.02, MAT.chrome, 0, 0.035, 0, 'y', 8); box(g, 0.04, 0.006, 0.01, MAT.chrome, 0, 0.045, 0); };
B.exhaust_gasket = (g) => { box(g, 0.004, 0.07, 0.42, MAT.gasket); };
B.exhaust_manifold = (g) => {
  box(g, 0.012, 0.07, 0.42, MAT.castIron, 0, 0, 0);
  const out = [-0.074, -0.03, -0.02];
  for (const z of CYL_Z) tubeMesh(g, [[-0.005, 0, z], [-0.05, -0.0, z * 0.8], [-0.07, -0.02, z * 0.3], out], 0.018, MAT.rust, false, 12);
  cyl(g, 0.035, 0.012, MAT.rust, out[0], out[1] - 0.01, out[2], 'y', 14);
};

// ---- tools & consumables ----
B.ratchet = (g) => { box(g, 0.022, 0.012, 0.2, MAT.chrome, 0, 0, -0.06); cyl(g, 0.02, 0.018, MAT.chrome, 0, 0, 0.05, 'y', 14); box(g, 0.026, 0.02, 0.09, MAT.redPlastic, 0, 0, -0.13); const s = cyl(g, 0.012, 0.035, MAT.chrome, 0, -0.025, 0.05, 'y', 10); s.name = 'socket'; };
B.torque_wrench = (g) => { cyl(g, 0.012, 0.42, MAT.chrome, 0, 0, -0.12, 'z', 10); cyl(g, 0.018, 0.12, MAT.blackPaint, 0, 0, -0.3, 'z', 10); cyl(g, 0.02, 0.018, MAT.chrome, 0, 0, 0.1, 'y', 12); box(g, 0.02, 0.006, 0.05, MAT.whitePlastic, 0, 0.013, -0.15); const s = cyl(g, 0.012, 0.035, MAT.chrome, 0, -0.025, 0.1, 'y', 10); s.name = 'socket'; };
B.lug_wrench = (g) => { cyl(g, 0.01, 0.42, MAT.darkSteel, 0, 0, 0, 'z', 8); cyl(g, 0.018, 0.05, MAT.darkSteel, 0, -0.02, 0.21, 'y', 8); };
B.wrench = (g) => { box(g, 0.02, 0.006, 0.16, MAT.chrome); torus(g, 0.013, 0.004, MAT.chrome, 0, 0, 0.085, 'y', 12); box(g, 0.03, 0.006, 0.02, MAT.chrome, 0, 0, -0.088); };
B.screwdriver = (g) => { cyl(g, 0.015, 0.1, MAT.yellowPlastic, 0, 0, -0.06, 'z', 10); cyl(g, 0.004, 0.12, MAT.chrome, 0, 0, 0.05, 'z', 6); };
B.plug_socket = (g) => { cyl(g, 0.012, 0.08, MAT.chrome, 0, 0, 0, 'y', 10); cyl(g, 0.006, 0.2, MAT.chrome, 0, 0.04, 0, 'x', 6); };
B.socket_case = (g) => {
  box(g, 0.34, 0.06, 0.18, MAT.bluePaint, 0, 0.03, 0); box(g, 0.32, 0.01, 0.16, MAT.plastic, 0, 0.061, 0);
  for (let i = 0; i < 7; i++) cyl(g, 0.011 + i * 0.0015, 0.03, MAT.chrome, -0.13 + i * 0.043, 0.07, 0.02, 'y', 10);
};
B.socket = (g) => { cyl(g, 0.014, 0.03, MAT.chrome, 0, 0.015, 0, 'y', 10); };
B.axle_stands = (g) => { for (const s of [1, -1]) { cyl(g, 0.02, 0.55, MAT.redPaint, s * 0.25, 0.27, 0, 'y', 8, 0.12); box(g, 0.06, 0.04, 0.06, MAT.darkSteel, s * 0.25, 0.56, 0); } };
B.rally_lights = (g) => { box(g, 0.9, 0.04, 0.04, MAT.blackPaint, 0, -0.05, 0); for (const x of [-0.33, -0.11, 0.11, 0.33]) { cyl(g, 0.085, 0.07, MAT.blackPaint, x, 0.04, 0.0, 'z', 18); const l = cyl(g, 0.075, 0.01, MAT.lens, x, 0.04, 0.037, 'z', 18); l.name = 'lens'; } };
B.parcel = (g) => { box(g, 0.34, 0.24, 0.28, MAT.cardboard, 0, 0.12, 0); box(g, 0.35, 0.03, 0.05, MAT.whitePlastic, 0, 0.24, 0); box(g, 0.12, 0.08, 0.005, MAT.paper, 0.05, 0.14, 0.141); };
B.scrap = (g, def) => {
  if (def.id === 'scrap_small') { cyl(g, 0.17, 0.08, MAT.rust, 0, 0.04, 0, 'y', 10); box(g, 0.3, 0.03, 0.08, MAT.rust, 0.1, 0.09, 0, 0, 0.6); }
  else if (def.id === 'scrap_med') { cyl(g, 0.04, 0.9, MAT.rust, 0, 0.05, 0, 'x', 8); cyl(g, 0.17, 0.12, MAT.rust, 0.2, 0.08, 0.15, 'y', 12); }
  else { box(g, 0.4, 0.3, 0.45, MAT.rust, 0, 0.15, 0); cyl(g, 0.05, 0.3, MAT.rust, 0.15, 0.35, 0, 'y', 8); }
};
B.fluid = (g, def) => {
  if (def.infinite) { box(g, 0.05, 0.12, 0.04, MAT.blackPaint, 0, 0.06, 0); cyl(g, 0.012, 0.18, MAT.darkSteel, 0, 0.12, 0.08, 'z', 8); box(g, 0.03, 0.05, 0.08, MAT.greenPaint, 0, 0.0, -0.03); return; }
  const col = { oil: MAT.yellowPlastic, coolant: MAT.coolantGreen, brake: MAT.whitePlastic, gearoil: MAT.blackPaint, fuel: MAT.redPaint }[def.fluid];
  if (def.fluid === 'fuel') { box(g, 0.34, 0.45, 0.16, col, 0, 0.225, 0); cyl(g, 0.02, 0.06, MAT.darkSteel, 0.12, 0.47, 0, 'y'); box(g, 0.16, 0.03, 0.03, col, -0.03, 0.47, 0); }
  else { const s = def.cap; const h = 0.12 + s * 0.04; box(g, 0.09 + s * 0.02, h, 0.08 + s * 0.012, col, 0, h / 2, 0); cyl(g, 0.018, 0.04, MAT.blackPaint, 0.02, h + 0.02, 0); }
};
B.kit = (g, def) => {
  if (def.id === 'bolt_kit') { box(g, 0.18, 0.05, 0.12, MAT.orangePaint, 0, 0.025, 0); box(g, 0.17, 0.004, 0.11, MAT.glass, 0, 0.052, 0); }
  else box(g, 0.08, 0.04, 0.06, MAT.cardboard, 0, 0.02, 0);
};
B.food = (g, def) => {
  if (def.id === 'sausage') { const m = cyl(g, 0.025, 0.25, MAT.redPaint, 0, 0.025, 0, 'x', 10); m.material = new THREE.MeshStandardMaterial({ color: 0xb0583a, roughness: 0.6 }); }
  else if (def.id === 'rye_bread') { box(g, 0.2, 0.06, 0.2, MAT.wood, 0, 0.03, 0); }
  else if (def.props?.shape) {
    const col = new THREE.MeshStandardMaterial({ color: def.props.col ?? 0xcccccc, roughness: 0.4, metalness: def.props.shape === 'can' || def.props.shape === 'tin' ? 0.6 : 0 });
    const sh = def.props.shape;
    if (sh === 'can') { cyl(g, 0.033, 0.12, col, 0, 0.06, 0, 'y', 14); cyl(g, 0.03, 0.01, MAT.alu, 0, 0.125, 0, 'y', 14); }
    else if (sh === 'tin') { cyl(g, 0.042, 0.11, col, 0, 0.055, 0, 'y', 14); cyl(g, 0.043, 0.012, MAT.alu, 0, 0.11, 0, 'y', 14); }
    else if (sh === 'bottle') { const m = cyl(g, 0.035, 0.2, col, 0, 0.1, 0, 'y', 12); m.material = new THREE.MeshStandardMaterial({ color: def.props.col, roughness: 0.05, transparent: true, opacity: 0.6 }); cyl(g, 0.016, 0.03, MAT.bluePaint, 0, 0.215, 0, 'y', 10); }
    else if (sh === 'carton') { box(g, 0.08, 0.2, 0.08, col, 0, 0.1, 0); box(g, 0.081, 0.05, 0.081, MAT.whitePlastic, 0, 0.13, 0); }
    else if (sh === 'hotdog') { const bun = new THREE.MeshStandardMaterial({ color: 0xd8a860, roughness: 0.8 }); box(g, 0.05, 0.035, 0.17, bun, 0, 0.02, 0); cyl(g, 0.016, 0.2, new THREE.MeshStandardMaterial({ color: 0xa04830, roughness: 0.5 }), 0, 0.045, 0, 'z', 8); }
    else if (sh === 'pastry') { const m = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 6), col); m.scale.set(1.4, 0.45, 1); m.position.y = 0.02; g.add(m); }
    else if (sh === 'bag') { box(g, 0.1, 0.13, 0.02, col, 0, 0.065, 0); box(g, 0.06, 0.03, 0.021, MAT.whitePlastic, 0, 0.08, 0); }
    else if (sh === 'shot') { const gl = new THREE.MeshStandardMaterial({ color: 0xe8f0f8, roughness: 0.05, transparent: true, opacity: 0.45 }); cyl(g, 0.02, 0.05, gl, 0, 0.025, 0, 'y', 10); cyl(g, 0.017, 0.035, new THREE.MeshStandardMaterial({ color: 0xf0f0f0, transparent: true, opacity: 0.7 }), 0, 0.02, 0, 'y', 10); }
    else if (sh === 'cocktail') { const gl = new THREE.MeshStandardMaterial({ color: 0xff4fb0, roughness: 0.05, transparent: true, opacity: 0.75 }); const c = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.07, 14, 1, true), gl); c.rotation.x = Math.PI; c.position.y = 0.11; g.add(c); cyl(g, 0.005, 0.07, MAT.glass, 0, 0.04, 0, 'y', 6); cyl(g, 0.025, 0.005, MAT.glass, 0, 0.003, 0, 'y', 12); const u = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.015, 8), new THREE.MeshStandardMaterial({ color: 0x40e0ff })); u.position.set(0.025, 0.16, 0); g.add(u); }
    else if (sh === 'cone') { const c = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.1, 10), new THREE.MeshStandardMaterial({ color: 0xc8904a })); c.rotation.x = Math.PI; c.position.y = 0.05; g.add(c); const s = new THREE.Mesh(new THREE.SphereGeometry(0.033, 10, 8), new THREE.MeshStandardMaterial({ color: 0xf8e8d0 })); s.position.y = 0.11; g.add(s); }
  }
  else if (def.id === 'beer') { cyl(g, 0.033, 0.17, new THREE.MeshStandardMaterial({ color: 0x5a3010, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.9 }), 0, 0.085, 0, 'y', 12); cyl(g, 0.014, 0.07, new THREE.MeshStandardMaterial({ color: 0x5a3010, roughness: 0.15 }), 0, 0.2, 0, 'y', 10); cyl(g, 0.034, 0.06, MAT.paper, 0, 0.08, 0, 'y', 12); }
  else if (def.id === 'cigarettes') { box(g, 0.055, 0.085, 0.022, MAT.whitePlastic, 0, 0.043, 0); box(g, 0.056, 0.03, 0.023, MAT.redPlastic, 0, 0.07, 0); }
  else if (def.id === 'fish') { const m = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshStandardMaterial({ color: 0x7a8a60, roughness: 0.3, metalness: 0.4 })); m.scale.set(0.6, 0.9, 3); m.position.y = 0.05; g.add(m); const t = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.08, 4), m.material); t.rotation.x = Math.PI / 2; t.scale.set(0.3, 1, 1); t.position.set(0, 0.05, -0.2); g.add(t); }
  else if (def.id === 'pet_food') { cyl(g, 0.045, 0.07, MAT.chrome, 0, 0.035, 0, 'y', 14); cyl(g, 0.046, 0.05, MAT.yellowPlastic, 0, 0.035, 0, 'y', 14); }
  else if (def.id === 'milk') { box(g, 0.07, 0.2, 0.07, MAT.whitePlastic, 0, 0.1, 0); box(g, 0.071, 0.06, 0.071, MAT.bluePaint, 0, 0.12, 0); }
  else { cyl(g, 0.04, 0.26, MAT.chrome, 0, 0.13, 0, 'y', 12); cyl(g, 0.042, 0.04, MAT.redPlastic, 0, 0.28, 0, 'y', 12); }
};
B.turbo = (g) => {
  const hot = new THREE.MeshStandardMaterial({ color: 0x6a5a4a, roughness: 0.6, metalness: 0.7 });
  cyl(g, 0.075, 0.07, hot, -0.03, 0, 0.0, 'x', 18);                       // turbine housing
  cyl(g, 0.08, 0.07, MAT.alu, -0.1, 0, 0.0, 'x', 18);                     // compressor housing
  cyl(g, 0.035, 0.08, MAT.alu, -0.1, 0, 0.09, 'z', 12);                   // compressor outlet
  cyl(g, 0.03, 0.06, MAT.darkSteel, -0.065, -0.07, 0, 'y', 10);           // oil drain
  box(g, 0.012, 0.18, 0.16, MAT.darkSteel, 0.002, 0, 0);                  // flange
};
B.spoiler = (g, def) => {
  const P = MAT.carPaint, BL = MAT.blackPaint;
  if (def.id === 'ducktail') { const m = box(g, 1.3, 0.05, 0.16, P, 0, 0.03, -0.02); m.rotation.x = -0.35; box(g, 1.0, 0.012, 0.1, BL, 0, 0.006, 0); return; }
  for (const x of [-0.45, 0.45]) { box(g, 0.03, 0.24, 0.12, BL, x, 0.12, 0); }
  const blade = box(g, 1.5, 0.025, 0.3, BL, 0, 0.25, -0.03); blade.rotation.x = 0.12;
  for (const x of [-0.76, 0.76]) box(g, 0.012, 0.12, 0.34, BL, x, 0.26, -0.03);
};
B.splitter = (g) => { box(g, 1.62, 0.02, 0.2, MAT.blackPaint, 0, 0, 0.02); box(g, 1.62, 0.06, 0.02, MAT.blackPaint, 0, 0.03, -0.07); };
B.side_skirt = (g) => { box(g, 0.05, 0.1, 1.25, MAT.blackPaint, 0, 0, 0); box(g, 0.07, 0.025, 1.25, MAT.blackPaint, 0.01, -0.05, 0); };
B.fishing_rod = (g) => {
  const rod = cyl(g, 0.008, 1.5, MAT.blackPaint, 0, 0.0, -0.6, 'z', 6); rod.rotation.x = 0;
  cyl(g, 0.015, 0.25, MAT.wood, 0, 0, 0.1, 'z', 8);
  cyl(g, 0.035, 0.03, MAT.alu, 0.03, -0.04, 0.0, 'x', 12);
};
B.box = (g) => { box(g, 0.45, 0.32, 0.36, MAT.cardboard, 0, 0.16, 0); box(g, 0.46, 0.04, 0.06, new THREE.MeshStandardMaterial({ color: 0xd8c8a0 }), 0, 0.32, 0); };

export function buildPartMesh(def) {
  const g = new THREE.Group();
  const b = B[def.type] || B[def.kind];
  if (b) b(g, def); else box(g, 0.1, 0.1, 0.1, MAT.plastic);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}
