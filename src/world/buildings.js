// JC's place: the garage (workshop), the house, the yard and workshop equipment.
import * as THREE from 'three';
import { MAT } from '../core/materials.js';
import { TEX, repeated, labelTex } from '../core/textures.js';
import { box, cyl } from '../mechanics/partMeshes.js';
import { addCollider, addBoxCollider } from './colliders.js';
import { heightAt } from './terrain.js';

export const mats = {};
function initMats() {
  mats.floor = new THREE.MeshStandardMaterial({ map: repeated(TEX.concrete(), 3, 2.5), roughness: 0.85 });
  mats.planks = new THREE.MeshStandardMaterial({ map: repeated(TEX.planks(), 2, 1), roughness: 0.9 });
  mats.inner = new THREE.MeshStandardMaterial({ map: repeated(TEX.wood(), 3, 1), color: 0xc8b090, roughness: 0.9 });
  mats.wallpaper = new THREE.MeshStandardMaterial({ map: repeated(TEX.wallpaper(), 3, 1), roughness: 0.9 });
  mats.woodFloor = new THREE.MeshStandardMaterial({ map: repeated(TEX.wood(), 4, 4), roughness: 0.8 });
  mats.roof = new THREE.MeshStandardMaterial({ color: 0x3a3a3c, roughness: 0.8, metalness: 0.3 });
  mats.peg = new THREE.MeshStandardMaterial({ map: repeated(TEX.pegboard(), 3, 1), roughness: 0.9 });
  mats.fluoro = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xf4f8ff, emissiveIntensity: 1.6 });
  mats.white = new THREE.MeshStandardMaterial({ color: 0xe8e6e0, roughness: 0.4 });
  mats.bedding = new THREE.MeshStandardMaterial({ color: 0x5a7aa8, roughness: 0.95 });
  mats.screen = new THREE.MeshStandardMaterial({ color: 0x113322, emissive: 0x1a5a3a, emissiveIntensity: 0.8 });
}

// wall helper with optional rectangular openings along its length
export function wall(g, axis, fixed, from, to, y0, y1, thick, mat, holes = [], collide = true) {
  const segs = [];
  let cur = from;
  const hs = [...holes].sort((a, b) => a[0] - b[0]);
  for (const h of hs) {
    if (h[0] > cur) segs.push([cur, h[0], y0, y1]);
    if (h[3] < y1) segs.push([h[0], h[1], h[3], y1]);   // lintel
    if (h[2] > y0) segs.push([h[0], h[1], y0, h[2]]);   // sill (windows)
    cur = h[1];
  }
  if (cur < to) segs.push([cur, to, y0, y1]);
  for (const [a, b, c, d] of segs) {
    const len = b - a, mid = (a + b) / 2, h = d - c, my = (c + d) / 2;
    if (axis === 'x') { box(g, len, h, thick, mat, mid, my, fixed); if (collide) addBoxCollider(mid, my, fixed, len, h, thick); }
    else { box(g, thick, h, len, mat, fixed, my, mid); if (collide) addBoxCollider(fixed, my, mid, thick, h, len); }
  }
}

export function interact(mesh, def) { mesh.userData.interact = def; mesh.traverse?.((o) => { if (o.isMesh) o.userData.interact = def; }); return mesh; }

export function buildPlace(game) {
  initMats();
  const scene = game.scene;
  const g = new THREE.Group(); g.name = 'place'; scene.add(g);
  const asm = game.asm;
  const surf = (m, cont) => { m.userData.surface = true; if (cont) m.userData.containerId = cont; return m; };

  // ================= GARAGE =================
  const fl = box(g, 12.4, 0.1, 10.4, mats.floor, 0, -0.049, 0); surf(fl);
  const H = 3.2;
  wall(g, 'x', -5.1, -6.2, 6.2, 0, H, 0.2, mats.planks);
  wall(g, 'z', 6.1, -5.2, 5.2, 0, H, 0.2, mats.planks, [[-1.5, 0.5, 1.0, 2.0]]);
  wall(g, 'z', -6.1, -5.2, 5.2, 0, H, 0.2, mats.planks, [[2.4, 3.4, 0, 2.1]]);
  wall(g, 'x', 5.1, -6.2, 6.2, 0, H, 0.2, mats.planks, [[-3.9, 1.9, 0, 2.7]]);
  const win = box(g, 0.02, 1.0, 2.0, MAT.glass, 6.1, 1.5, -0.5); win.userData.glass = true;
  box(g, 12.4, 0.1, 10.4, mats.inner, 0, H + 0.05, 0);
  for (const s of [1, -1]) { const r = box(g, 13.2, 0.08, 6.2, mats.roof, 0, H + 1.05, s * 2.6); r.rotation.x = s * 0.38; }
  box(g, 12.4, 1.15, 0.15, mats.planks, 0, H + 0.6, 5.1); box(g, 12.4, 1.15, 0.15, mats.planks, 0, H + 0.6, -5.1);
  cyl(g, 0.22, 5.9, MAT.darkSteel, -1.0, 2.95, 4.95, 'x', 12); // rolled-up door
  // lights
  for (const x of [-2.2, 2.6]) {
    box(g, 1.3, 0.06, 0.16, mats.fluoro, x, H - 0.05, 0);
    const pl = new THREE.PointLight(0xf0f4ff, 9, 13, 1.6); pl.position.set(x, H - 0.3, 0); g.add(pl);
  }
  const bulb = new THREE.PointLight(0xffe0b0, 3, 6, 1.8); bulb.position.set(3.2, 2.2, -4.2); g.add(bulb);
  // sign
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.5), new THREE.MeshStandardMaterial({ map: labelTex("JC'S GARAGE", 512, 106, '#2a2620', '#f2c14e', 'bold 64px Impact') }));
  sign.position.set(-1, 3.0, 5.21); g.add(sign);

  // ---- workbench ----
  const wb = new THREE.Group(); wb.position.set(3.1, 0, -4.62); g.add(wb);
  surf(box(wb, 3.0, 0.06, 0.72, MAT.wood, 0, 0.9, 0));
  surf(box(wb, 2.9, 0.03, 0.66, MAT.wood, 0, 0.25, 0));
  for (const x of [-1.42, 1.42]) for (const z of [-0.3, 0.3]) box(wb, 0.06, 0.9, 0.06, MAT.wood, x, 0.45, z);
  addBoxCollider(3.1, 0.47, -4.62, 3.0, 0.94, 0.72);
  // vise
  box(wb, 0.14, 0.1, 0.12, MAT.bluePaint, -1.15, 0.98, 0.25); box(wb, 0.16, 0.06, 0.02, MAT.darkSteel, -1.15, 1.0, 0.33);
  // pegboard
  box(g, 3.0, 1.1, 0.02, mats.peg, 3.1, 1.65, -4.99);
  const lamp = box(g, 0.25, 0.12, 0.25, MAT.greenPaint, 2.0, 2.25, -4.75); lamp.material = MAT.greenPaint;
  // calendar / poster
  const poster = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.95), new THREE.MeshStandardMaterial({ map: labelTex('RALLI\nSM\n1988', 256, 340, '#d8c8a0', '#8a2a10', 'bold 56px Impact') }));
  poster.position.set(-3.5, 1.8, -4.99); g.add(poster);

  // ---- toolbox (rolling cabinet with drawers opening toward -x) ----
  const tb = new THREE.Group(); tb.position.set(5.55, 0, -2.4); g.add(tb);
  box(tb, 0.55, 1.0, 0.92, MAT.redPaint, 0.02, 0.56, 0);
  surf(box(tb, 0.57, 0.02, 0.94, MAT.darkSteel, 0.02, 1.07, 0));
  for (const [x, z] of [[0.2, 0.4], [-0.2, 0.4], [0.2, -0.4], [-0.2, -0.4]]) cyl(tb, 0.04, 0.05, MAT.rubber, x, 0.04, z, 'x', 10);
  addBoxCollider(5.57, 0.55, -2.4, 0.57, 1.1, 0.94);
  const drawerY = [0.92, 0.72, 0.52, 0.27];
  drawerY.forEach((y, i) => {
    const d = new THREE.Group(); d.position.set(-0.26, y, 0);
    d.userData.containerId = 'drawer' + (i + 1);
    const hgt = i === 3 ? 0.3 : 0.17;
    const front = box(d, 0.02, hgt - 0.02, 0.86, MAT.redPaint, 0, 0, 0);
    box(d, 0.02, 0.025, 0.4, MAT.chrome, -0.02, hgt * 0.25, 0);
    const bottom = surf(box(d, 0.5, 0.01, 0.82, MAT.darkSteel, 0.26, -hgt / 2 + 0.02, 0), d.userData.containerId);
    box(d, 0.5, hgt - 0.04, 0.01, MAT.darkSteel, 0.26, 0, 0.41); box(d, 0.5, hgt - 0.04, 0.01, MAT.darkSteel, 0.26, 0, -0.41);
    tb.add(d);
    asm.containers.set(d.userData.containerId, d);
    d.userData.open = 0;
    const def = {
      prompt: () => `<span class="k">E</span>${d.userData.openTarget ? 'Close' : 'Open'} drawer ${i + 1}`,
      use: () => { d.userData.openTarget = !d.userData.openTarget; game.audio.drawer(); },
    };
    interact(front, def);
    game.animated.push((dt) => {
      const t = d.userData.openTarget ? 1 : 0;
      d.userData.open += Math.sign(t - d.userData.open) * Math.min(Math.abs(t - d.userData.open), dt * 4);
      d.position.x = -0.26 - d.userData.open * 0.42;
    });
    game.drawers.push(d);
  });

  // ---- shelves (+x wall) ----
  const sh = new THREE.Group(); sh.position.set(5.68, 0, 1.6); g.add(sh);
  for (const y of [0.35, 0.9, 1.45, 2.0]) surf(box(sh, 0.5, 0.03, 2.4, MAT.wood, 0, y, 0));
  for (const z of [-1.18, 1.18]) for (const x of [-0.23, 0.23]) box(sh, 0.04, 2.1, 0.04, MAT.darkSteel, x, 1.05, z);
  addBoxCollider(5.68, 1.05, 1.6, 0.5, 2.1, 2.4);
  // ---- fluids shelf (-x wall, rear) ----
  const fs = new THREE.Group(); fs.position.set(-5.72, 0, -3.6); g.add(fs);
  for (const y of [0.45, 1.05]) surf(box(fs, 0.45, 0.03, 1.6, MAT.wood, 0, y, 0));
  for (const z of [-0.78, 0.78]) box(fs, 0.04, 1.1, 0.04, MAT.darkSteel, 0.2, 0.55, z);
  addBoxCollider(-5.72, 0.6, -3.6, 0.45, 1.2, 1.6);
  // ---- oil barrel, tyre stack, broom (props) ----
  cyl(g, 0.3, 0.88, MAT.bluePaint, -5.5, 0.44, -1.4, 'y', 16); addBoxCollider(-5.5, 0.44, -1.4, 0.6, 0.88, 0.6);
  for (let i = 0; i < 3; i++) cyl(g, 0.3, 0.17, MAT.tire, -5.5, 0.09 + i * 0.18, 0.2, 'y', 18);
  addBoxCollider(-5.5, 0.27, 0.2, 0.6, 0.54, 0.6);
  // radio on bench
  const radio = new THREE.Group(); radio.position.set(4.2, 0.93, -4.75); g.add(radio);
  box(radio, 0.3, 0.16, 0.1, MAT.blackPaint, 0, 0.08, 0); cyl(radio, 0.04, 0.01, MAT.chrome, -0.07, 0.08, 0.051, 'z');
  interact(radio, { prompt: () => `<span class="k">E</span>Radio ${game.audio.radioOn ? 'off' : 'on'}`, use: () => game.audio.toggleRadio(radio) });

  // ---- engine stand (assembly root) ----
  const stand = asm.create('engine_stand', { uid: 'stand' });
  asm.buildVisual(stand);
  stand.loc = { kind: 'root' };
  stand.obj.position.set(3.3, 0, -1.6); stand.obj.rotation.y = 0;
  scene.add(stand.obj);
  game.stand = stand;
  addBoxCollider(3.3, 0.3, -2.0, 0.85, 0.6, 0.15, { car: true });

  // ---- floor jack ----
  game.jack = buildJack(game, g);
  // ---- engine hoist ----
  game.hoist = buildHoist(game, g);

  // ================= HOUSE =================
  const hx0 = -15.2, hx1 = -6.2, hz0 = -5.2, hz1 = 4.2;
  surf(box(g, hx1 - hx0, 0.1, hz1 - hz0, mats.woodFloor, (hx0 + hx1) / 2, -0.049, (hz0 + hz1) / 2));
  wall(g, 'x', hz0 + 0.1, hx0, hx1, 0, 2.7, 0.2, mats.planks, [[-12, -10, 1.0, 2.0]]);
  wall(g, 'x', hz1 - 0.1, hx0, hx1, 0, 2.7, 0.2, mats.planks, [[-12, -11, 0, 2.1], [-9.5, -7.8, 1.0, 2.0]]);
  wall(g, 'z', hx0 + 0.1, hz0, hz1, 0, 2.7, 0.2, mats.planks, [[-2, 0, 1.0, 2.0]]);
  // inner wallpaper skin (no collision)
  box(g, hx1 - hx0 - 0.4, 2.6, 0.01, mats.wallpaper, (hx0 + hx1) / 2, 1.3, hz0 + 0.21);
  box(g, hx1 - hx0, 0.1, hz1 - hz0, mats.inner, (hx0 + hx1) / 2, 2.75, (hz0 + hz1) / 2);
  for (const s of [1, -1]) { const r = box(g, 10, 0.08, 5.4, mats.roof, (hx0 + hx1) / 2, 3.4, -0.5 + s * 2.4); r.rotation.x = s * 0.35; }
  for (const [x0, x1, z] of [[hx0, hx1, hz0 - 0.1], [hx0, hx1, hz1 + 0.1]]) box(g, x1 - x0, 1.0, 0.12, mats.planks, (x0 + x1) / 2, 3.1, z);
  const hl = new THREE.PointLight(0xffe2b8, 6, 12, 1.6); hl.position.set(-10.6, 2.4, -0.5); g.add(hl);
  // bed
  const bed = new THREE.Group(); bed.position.set(-13.9, 0, -3.6); g.add(bed);
  box(bed, 1.0, 0.4, 2.0, MAT.wood, 0, 0.2, 0); box(bed, 0.95, 0.15, 1.95, mats.bedding, 0, 0.47, 0); box(bed, 0.6, 0.12, 0.35, mats.white, 0, 0.6, -0.75);
  addBoxCollider(-13.9, 0.3, -3.6, 1.0, 0.6, 2.0);
  interact(bed, { prompt: () => `<span class="k">E</span>Sleep`, use: () => game.life.sleep() });
  // fridge (container with door)
  const fr = new THREE.Group(); fr.position.set(-7.0, 0, -4.65); g.add(fr);
  box(fr, 0.65, 1.7, 0.08, mats.white, 0, 0.85, -0.28); box(fr, 0.06, 1.7, 0.62, mats.white, -0.3, 0.85, 0); box(fr, 0.06, 1.7, 0.62, mats.white, 0.3, 0.85, 0);
  box(fr, 0.65, 0.06, 0.62, mats.white, 0, 1.7, 0); box(fr, 0.65, 0.1, 0.62, mats.white, 0, 0.05, 0);
  const frIn = new THREE.Group(); frIn.userData.containerId = 'fridge'; fr.add(frIn); asm.containers.set('fridge', frIn);
  for (const y of [0.45, 0.95, 1.35]) surf(box(frIn, 0.54, 0.02, 0.52, MAT.glass, 0, y, 0), 'fridge').material = mats.white;
  const fdoor = new THREE.Group(); fdoor.position.set(0.32, 0, 0.31); fr.add(fdoor);
  box(fdoor, 0.66, 1.68, 0.05, mats.white, -0.33, 0.85, 0); box(fdoor, 0.03, 0.4, 0.04, MAT.chrome, -0.6, 1.1, 0.04);
  fdoor.userData.open = 0;
  interact(fdoor, { prompt: () => `<span class="k">E</span>${fdoor.userData.target ? 'Close' : 'Open'} fridge`, use: () => { fdoor.userData.target = !fdoor.userData.target; game.audio.thunk(0.4); } });
  game.animated.push((dt) => { const t = fdoor.userData.target ? 1 : 0; fdoor.userData.open += Math.sign(t - fdoor.userData.open) * Math.min(Math.abs(t - fdoor.userData.open), dt * 3); fdoor.rotation.y = fdoor.userData.open * 1.8; });
  addBoxCollider(-7.0, 0.85, -4.65, 0.66, 1.7, 0.66);
  // kitchen counter + sink
  const kc = new THREE.Group(); kc.position.set(-8.6, 0, -4.75); g.add(kc);
  surf(box(kc, 2.0, 0.9, 0.6, MAT.wood, 0, 0.45, 0)); box(kc, 2.02, 0.04, 0.62, mats.white, 0, 0.92, 0);
  const sink = box(kc, 0.5, 0.05, 0.4, MAT.steel, 0.5, 0.94, 0); cyl(kc, 0.015, 0.25, MAT.chrome, 0.5, 1.05, -0.22);
  interact(sink, { prompt: () => `<span class="k">E</span>Drink tap water`, use: () => game.life.drinkWater() });
  addBoxCollider(-8.6, 0.45, -4.75, 2.0, 0.92, 0.6);
  // table + computer
  const desk = new THREE.Group(); desk.position.set(-11.0, 0, -4.55); g.add(desk);
  surf(box(desk, 1.4, 0.05, 0.7, MAT.wood, 0, 0.75, 0)); for (const x of [-0.65, 0.65]) for (const z of [-0.3, 0.3]) box(desk, 0.05, 0.75, 0.05, MAT.wood, x, 0.37, z);
  const pc = new THREE.Group(); pc.position.set(0, 0.78, -0.08); desk.add(pc);
  box(pc, 0.48, 0.38, 0.4, mats.white, 0, 0.24, -0.05); const scr = box(pc, 0.38, 0.28, 0.01, mats.screen, 0, 0.26, 0.151);
  box(pc, 0.45, 0.03, 0.16, mats.white, 0, 0.015, 0.3);
  interact(pc, { prompt: () => `<span class="k">E</span>Use computer (parts orders, jobs)`, use: () => game.ui.openComputer() });
  addBoxCollider(-11.0, 0.4, -4.55, 1.4, 0.8, 0.7);
  const chair = box(g, 0.45, 0.45, 0.45, MAT.wood, -11.0, 0.22, -3.7);
  // sofa & rug
  box(g, 2.0, 0.45, 0.8, MAT.seat, -10.8, 0.22, 2.9); box(g, 2.0, 0.5, 0.2, MAT.seat, -10.8, 0.6, 3.25);
  addBoxCollider(-10.8, 0.35, 3.0, 2.0, 0.7, 1.0);
  const rug = box(g, 2.4, 0.01, 1.6, mats.bedding, -10.8, 0.006, 1.2); rug.material = MAT.redPaint;

  // ================= YARD =================
  const pallet = new THREE.Group(); pallet.position.set(3.4, 0, 7.4); g.add(pallet);
  surf(box(pallet, 1.2, 0.12, 1.0, MAT.wood, 0, 0.06, 0));
  game.deliverySpot = new THREE.Vector3(3.4, 0.12, 7.4);
  const rs = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.5), new THREE.MeshStandardMaterial({ map: labelTex('Ruskala 3 km →', 512, 160, '#1a4a9a', '#ffffff', 'bold 70px Arial') }));
  rs.position.set(-6, 2, 41.5); g.add(rs); box(g, 0.08, 2.2, 0.08, MAT.darkSteel, -6, 1.1, 41.45);
  // woodpile & fence posts for atmosphere
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3 - (i % 2); j++) cyl(g, 0.12, 1.0, MAT.wood, -7.5 + j * 0.25 + (i % 2) * 0.12, 0.12 + i * 0.22, 7.5, 'z', 8);
  for (let i = 0; i < 26; i++) { const x = -20 + i * 2.6; box(g, 0.1, 1.1, 0.1, MAT.wood, x, heightAt(x, 22) + 0.55, 22); }

  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  fl.castShadow = false;
  return g;
}

// ---------- floor jack: push it around, pump to lift an axle ----------
function buildJack(game, parent) {
  const j = new THREE.Group(); j.position.set(0.6, 0, 3.7); j.rotation.y = Math.PI; parent.add(j);
  const body = new THREE.Group(); j.add(body);
  box(body, 0.32, 0.12, 0.7, MAT.redPaint, 0, 0.1, 0);
  for (const [x, z] of [[0.14, 0.3], [-0.14, 0.3], [0.14, -0.3], [-0.14, -0.3]]) cyl(body, 0.05, 0.04, MAT.darkSteel, x, 0.05, z, 'x', 10);
  const arm = new THREE.Group(); arm.position.set(0, 0.15, -0.25); j.add(arm);
  box(arm, 0.12, 0.06, 0.5, MAT.redPaint, 0, 0.0, 0.25); const saddle = cyl(arm, 0.06, 0.03, MAT.darkSteel, 0, 0.04, 0.5, 'y', 12);
  const handle = new THREE.Group(); handle.position.set(0, 0.16, -0.3); j.add(handle);
  cyl(handle, 0.015, 1.1, MAT.chrome, 0, 0.45, -0.25).rotation.x = -0.5;
  const grip = box(handle, 0.25, 0.3, 0.5, MAT.hit, 0, 0.5, -0.3); grip.castShadow = false;
  j.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  const state = { obj: j, arm, saddle, grabbed: false, axle: null, pumpT: 0 };
  const def = {
    prompt: () => {
      const a = game.jackAxle();
      let s = state.grabbed ? `<span class="k">E</span>Let go of the jack` : `<span class="k">E</span>Move floor jack`;
      if (a) s += `\n<span class="k">LMB</span>Pump (lift ${a === 'F' ? 'front' : 'rear'})   <span class="k">RMB</span>Release valve`;
      else s += `\n<span class="dim">Roll it under a jacking point (front crossmember / rear axle)</span>`;
      return s;
    },
    use: (btn) => {
      if (btn === 'E') { state.grabbed = !state.grabbed; state.dist = undefined; game.player.pushing = state.grabbed ? state : null; return; }
      const a = game.jackAxle();
      if (!a) return;
      game.pumpJack(a, btn === 'LMB' ? 1 : -1);
    },
    hold: true,
  };
  interact(j, def); j.userData.interactDef = def;
  return state;
}

// ---------- engine hoist ----------
function buildHoist(game, parent) {
  const h = new THREE.Group(); h.position.set(3.7, 0, 2.6); h.rotation.y = -Math.PI / 2; parent.add(h);
  const m = MAT.orangePaint;
  for (const s of [1, -1]) { box(h, 0.08, 0.08, 1.3, m, s * 0.35, 0.06, 0.45); cyl(h, 0.05, 0.05, MAT.rubber, s * 0.35, 0.05, 1.05, 'x', 10); }
  box(h, 0.8, 0.08, 0.08, m, 0, 0.06, -0.2);
  box(h, 0.1, 1.5, 0.1, m, 0, 0.8, -0.2);
  const boom = new THREE.Group(); boom.position.set(0, 1.5, -0.2); h.add(boom);
  box(boom, 0.09, 0.09, 1.55, m, 0, 0, 0.7);
  const hook = new THREE.Group(); hook.position.set(0, -0.05, 1.42); boom.add(hook);
  cyl(hook, 0.006, 0.3, MAT.darkSteel, 0, -0.15, 0, 'y', 6); const hk = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.008, 6, 12, Math.PI * 1.5), MAT.darkSteel); hk.position.y = -0.33; hook.add(hk);
  const ram = cyl(h, 0.035, 0.9, MAT.chrome, 0, 1.0, 0.1, 'y', 10); ram.rotation.x = 0.35;
  h.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  game.asm.hoistHook = hook;
  const state = { obj: h, boom, hook, height: 0, grabbed: false };
  const def = {
    prompt: () => {
      let s = `<span class="k">E</span>${state.grabbed ? 'Let go of the hoist' : 'Move engine hoist'}\n<span class="k">LMB</span>Raise boom  <span class="k">RMB</span>Lower boom`;
      const a = game.hoistAction();
      if (a) s += `\n<span class="k">F</span>${a.label}` + (a.bad ? `\n<span class="bad">${a.bad}</span>` : '');
      return s;
    },
    use: (btn) => {
      if (btn === 'E') { state.grabbed = !state.grabbed; state.dist = undefined; game.player.pushing = state.grabbed ? state : null; return; }
      if (btn === 'F') { game.doHoistAction(); return; }
      state.height = Math.max(-0.35, Math.min(0.35, state.height + (btn === 'LMB' ? 0.01 : -0.01)));
      state.boom.rotation.x = -state.height;
      game.audio.click(0.2);
    },
    hold: true,
  };
  interact(h, def); h.userData.interactDef = def;
  return state;
}
