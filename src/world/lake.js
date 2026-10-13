// Lakeside sauna with a jetty, and fishing from the shore or the jetty.
import * as THREE from 'three';
import { MAT } from '../core/materials.js';
import { box, cyl } from '../mechanics/partMeshes.js';
import { LAKE, heightAt, TREES } from './terrain.js';
import { addCollider, FLOORS } from './colliders.js';
import { interact, mats } from './buildings.js';
import { labelTex } from '../core/textures.js';

const K = (k) => `<span class="k">${k}</span>`;
const FISH = [
  { name: 'perch', min: 0.1, max: 0.7, w: 40 }, { name: 'roach', min: 0.1, max: 0.45, w: 30 },
  { name: 'bream', min: 0.5, max: 3.2, w: 15 }, { name: 'zander', min: 0.8, max: 4.5, w: 9 }, { name: 'pike', min: 1, max: 9, w: 6 },
];

export class Lake {
  constructor(game) {
    this.game = game;
    // find the shore towards the north-east (towards the forest road)
    // the nearest real shore (inside the drawn water disc), searching all directions
    let best = null;
    for (let deg = 0; deg < 360; deg += 5) {
      const dv = new THREE.Vector2(Math.cos(deg * Math.PI / 180), Math.sin(deg * Math.PI / 180));
      let dd = 20; while (dd < LAKE.r * 1.45 && heightAt(LAKE.x + dv.x * dd, LAKE.z + dv.y * dd) < LAKE.level + 0.45) dd += 1;
      if (dd < LAKE.r * 1.45 && (!best || dd < best.d)) best = { d: dd, dir: dv };
    }
    const dir = best ? best.dir : new THREE.Vector2(1, 0), d = best ? best.d : LAKE.r;
    this.shore = new THREE.Vector3(LAKE.x + dir.x * d, 0, LAKE.z + dir.y * d);
    const ang = Math.atan2(dir.x, dir.y); // facing outwards from the lake
    this.buildSauna(dir, ang);
    this.buildJetty(dir, ang);
    this.fish = { state: 'idle' };
    this.clearAround();
    game.saunaPos = this.saunaPos;
  }
  // trees/rocks/tufts were scattered before the sauna existed: remove any around the sauna and the jetty
  clearAround() {
    const pts = [this.saunaPos, this.jettyEnd, this.shore];
    const near = (x, z) => pts.some((p) => Math.hypot(p.x - x, p.z - z) < 11);
    const m = new THREE.Matrix4(), p = new THREE.Vector3(), zero = new THREE.Matrix4().makeScale(0, 0, 0);
    this.game.scene.traverse((o) => {
      if (!o.isInstancedMesh) return;
      let changed = false;
      for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m); p.setFromMatrixPosition(m); if (near(p.x, p.z)) { o.setMatrixAt(i, zero); changed = true; } }
      if (changed) o.instanceMatrix.needsUpdate = true;
    });
    for (const [k, l] of TREES.grid) TREES.grid.set(k, l.filter((t) => !near(t.x, t.z))); // no invisible tree collisions either
  }
  buildSauna(dir, ang) {
    const g = this.game;
    const x = this.shore.x + dir.x * 9, z = this.shore.z + dir.y * 9, y = heightAt(x, z);
    this.saunaPos = new THREE.Vector3(x, y, z);
    const s = new THREE.Group(); s.position.set(x, y, z); s.rotation.y = ang + Math.PI; g.scene.add(s); // door faces the lake
    const logM = new THREE.MeshStandardMaterial({ color: 0x6a4a2e, roughness: 0.9 });
    // log walls (round logs stacked), 4 x 3.5 m, with a door gap on the lake side (+z)
    for (let i = 0; i < 8; i++) {
      const yy = 0.15 + i * 0.27;
      cyl(s, 0.14, 4.3, logM, 0, yy, -1.75, 'x', 8);
      cyl(s, 0.14, 3.8, logM, 2.0, yy, 0, 'z', 8); cyl(s, 0.14, 3.8, logM, -2.0, yy, 0, 'z', 8);
      if (i > 6 || true) { cyl(s, 0.14, 1.4, logM, -1.35, yy, 1.75, 'x', 8); if (yy > 1.9) cyl(s, 0.14, 4.3, logM, 0, yy, 1.75, 'x', 8); else cyl(s, 0.14, 1.4, logM, 1.35, yy, 1.75, 'x', 8); }
    }
    const roofM = new THREE.MeshStandardMaterial({ color: 0x3a3a38, roughness: 0.8 });
    for (const sd of [1, -1]) { const r = box(s, 4.8, 0.08, 2.4, roofM, 0, 2.55, sd * 1.0); r.rotation.x = sd * 0.42; }
    box(s, 4.3, 0.06, 3.6, mats.woodFloor, 0, 0.03, 0);
    // benches (lauteet), stove with stones, chimney with smoke
    box(s, 3.8, 0.06, 0.7, MAT.wood, 0, 0.75, -1.25); box(s, 3.8, 0.06, 0.6, MAT.wood, 0, 0.4, -0.65);
    const stove = new THREE.Group(); stove.position.set(1.4, 0, 0.9); s.add(stove);
    box(stove, 0.55, 0.75, 0.5, MAT.darkSteel, 0, 0.38, 0);
    for (let i = 0; i < 9; i++) { const st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.07, 0), new THREE.MeshStandardMaterial({ color: 0x5a5856, roughness: 1 })); st.position.set((i % 3 - 1) * 0.14, 0.8, (Math.floor(i / 3) - 1) * 0.13); stove.add(st); }
    cyl(s, 0.08, 1.6, MAT.darkSteel, 1.4, 2.4, 0.9, 'y', 8);
    this.chimney = s.localToWorld(new THREE.Vector3(1.4, 3.2, 0.9));
    // bucket & ladle
    cyl(s, 0.12, 0.2, MAT.wood, -1.4, 0.55, -0.65, 'y', 10);
    // sign
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.32), new THREE.MeshStandardMaterial({ map: labelTex('SAUNA', 256, 64, '#4a3220', '#f2d8a0', 'bold 40px Georgia') }));
    sign.position.set(0, 2.15, 1.92); s.add(sign);
    s.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    s.updateMatrixWorld(true);
    // colliders: walls except the door gap
    const wall = (lx, lz, w, d) => { const a = s.localToWorld(new THREE.Vector3(lx - w / 2, 0, lz - d / 2)), b = s.localToWorld(new THREE.Vector3(lx + w / 2, 0, lz + d / 2)); addCollider(Math.min(a.x, b.x), y, Math.min(a.z, b.z), Math.max(a.x, b.x), y + 2.4, Math.max(a.z, b.z), { car: true }); };
    wall(0, -1.75, 4.3, 0.3); wall(2.0, 0, 0.3, 3.8); wall(-2.0, 0, 0.3, 3.8); wall(-1.35, 1.75, 1.4, 0.3); wall(1.35, 1.75, 1.4, 0.3);
    const use = { prompt: () => `${K('E')}Have a sauna <span class="dim">(1 hour — great for happiness and tiredness)</span>`, use: (b) => { if (b === 'E') this.sauna(); } };
    s.traverse((o) => { if (o.isMesh) o.userData.interact = use; });
    this.saunaObj = s;
  }
  buildJetty(dir, ang) {
    const g = this.game, j = new THREE.Group();
    const y = LAKE.level + 0.35;
    j.position.set(this.shore.x + dir.x * 1, y, this.shore.z + dir.y * 1); j.rotation.y = ang; g.scene.add(j);
    const plank = new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 0.9 });
    for (let i = 0; i < 26; i++) { const p = box(j, 1.6, 0.05, 0.22, plank, 0, 0, -i * 0.38); p.receiveShadow = true; p.userData.surface = true; }
    for (let i = 0; i < 4; i++) for (const sx of [-0.75, 0.75]) cyl(j, 0.07, 2.2, MAT.wood, sx, -0.9, -i * 3.2, 'y', 6);
    this.jetty = j;
    this.jettyEnd = j.localToWorld(new THREE.Vector3(0, 0, -9.5));
    // walkable floor: register as a box the player can stand on
    j.updateMatrixWorld(true);
    const a = j.localToWorld(new THREE.Vector3(-0.8, 0, 0.2)), b = j.localToWorld(new THREE.Vector3(0.8, 0, -9.8));
    this.jettyBox = { minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minZ: Math.min(a.z, b.z), maxZ: Math.max(a.z, b.z), y: y + 0.03, a, b, half: 0.8, len: 10, ang };
    g.jettyFloor = (x, z) => { // height of the jetty planks under (x,z), or null
      const l = j.worldToLocal(new THREE.Vector3(x, y, z));
      return Math.abs(l.x) < 0.85 && l.z < 0.3 && l.z > -9.9 ? y + 0.03 : null;
    };
    FLOORS.push(g.jettyFloor);
    // bobber + line for fishing
    this.bobber = new THREE.Group();
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xd02020 }));
    const bot = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xf0f0f0 }));
    this.bobber.add(top, bot); this.bobber.visible = false; g.scene.add(this.bobber);
    const lg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    this.line = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0xdddddd, transparent: true, opacity: 0.6 }));
    this.line.frustumCulled = false; this.line.visible = false; g.scene.add(this.line);
  }

  // ---------- sauna ----------
  sauna() {
    const g = this.game, L = g.life;
    if (g.interaction.held && g.interaction.held.def.id !== 'beer') { g.say('Put your stuff down first. You don\'t take a ratchet into the sauna.'); return; }
    const beer = g.interaction.held?.def.id === 'beer';
    g.fade(() => {
      if (beer) { const b = g.interaction.release(); g.asm.remove(b); L.consume(b.def.props); }
      L.skip(60);
      L.fatigue = Math.max(0, L.fatigue - 30); L.thirst = Math.max(5, L.thirst - 15);
      L.cheer(beer ? 30 : 22);
      g.ach?.unlock('sauna'); if (beer) g.ach?.unlock('sauna_beer');
      g.say(beer ? 'Löyly and a cold beer. Then a jump off the jetty into the lake. This is the life.' : 'Löyly! You sweat it all out, then jump off the jetty into the freezing lake. You feel brand new.', 6);
    });
  }

  // ---------- fishing ----------
  // where the line would land if you cast now (on water), or null
  castTarget() {
    const g = this.game, cam = g.camera.position;
    if (Math.hypot(cam.x - LAKE.x, cam.z - LAKE.z) > LAKE.r * 1.6 + 12) return null;
    const f = new THREE.Vector3(); g.camera.getWorldDirection(f); f.y = 0; f.normalize();
    const p = new THREE.Vector3(cam.x + f.x * 9, LAKE.level, cam.z + f.z * 9);
    if (heightAt(p.x, p.z) > LAKE.level - 0.25) return null;
    return p;
  }
  // called every frame while holding the rod; returns the prompt
  rodPrompt(input, dt) {
    const g = this.game, F = this.fish, A = g.audio;
    const tip = new THREE.Vector3(0.35, 0.35, -1.5); g.camera.localToWorld(tip);
    if (F.state === 'idle') {
      this.bobber.visible = this.line.visible = false;
      const t = this.castTarget();
      if (!t) return `Fishing rod <span class="dim">— stand by the lake (the jetty is best) and face the water</span>`;
      if (input.mouse.lDown) {
        F.state = 'wait'; F.at = t; F.from = g.player.pos.clone(); F.t = 4 + Math.random() * 12; A.tone(900, 'triangle', 0.05, 0.2, 0.4);
        this.bobber.position.copy(t); this.bobber.visible = this.line.visible = true;
        setTimeout(() => A.burst(1200, 1, 0.12, 0.15), 450);
      }
      return `${K('LMB')}Cast the line`;
    }
    // line from rod tip to bobber
    const lp = this.line.geometry.attributes.position; lp.setXYZ(0, tip.x, tip.y, tip.z); lp.setXYZ(1, this.bobber.position.x, this.bobber.position.y + 0.03, this.bobber.position.z); lp.needsUpdate = true;
    if (g.player.pos.distanceTo(F.from) > 5) { F.state = 'idle'; g.toast('You walked off and the line went slack.', 2); return ''; }
    F.t -= dt;
    const bob = Math.sin(performance.now() * 0.003) * 0.012;
    if (F.state === 'wait') {
      this.bobber.position.y = LAKE.level + bob;
      if (F.t <= 0) { F.state = 'bite'; F.t = 1.1; A.burst(700, 2, 0.25, 0.2); }
      if (input.mouse.lDown) { F.state = 'idle'; g.toast('Reeled in. Nothing.', 1.5); }
      return `Waiting for a bite… ${K('LMB')}Reel in`;
    }
    if (F.state === 'bite') {
      this.bobber.position.y = LAKE.level - 0.07 + bob * 3;
      if (input.mouse.lDown) { F.state = 'idle'; this.catchFish(); return ''; }
      if (F.t <= 0) { if (Math.random() < 0.5) { F.state = 'wait'; F.t = 3 + Math.random() * 8; } else { F.state = 'idle'; g.toast('It got away! Strike faster when the float goes under.', 2.5); } }
      return `<b style="color:#ff6050">BITE!</b> ${K('LMB')}Strike!`;
    }
    return '';
  }
  catchFish() {
    const g = this.game;
    let r = Math.random() * FISH.reduce((s, f) => s + f.w, 0), sp = FISH[0];
    for (const f of FISH) { r -= f.w; if (r <= 0) { sp = f; break; } }
    const kg = Math.round((sp.min + Math.pow(Math.random(), 2.2) * (sp.max - sp.min)) * 100) / 100;
    const it = g.asm.create('fish', { props: { species: sp.name, kg } });
    if (g.inventory.length < 12) { g.asm.setInventory(it); g.inventory.push(it.uid); }
    else g.asm.dropAt(it, g.player.pos.clone().add(new THREE.Vector3(0, 0.1, 0)), 0, null);
    g.audio.burst(900, 1, 0.3, 0.3);
    g.life.cheer(kg > 2 ? 10 : 5);
    g.stats.fish = (g.stats.fish || 0) + 1;
    g.ach?.unlock('fish'); if (kg >= 3) g.ach?.unlock('big_fish'); if (sp.name === 'pike') g.ach?.unlock('pike');
    g.toast(`🐟 Caught a ${sp.name} — ${kg.toFixed(2)} kg! ${g.inventory.includes(it.uid) ? '(in your pockets)' : '(at your feet)'}`, 4);
  }
  update(dt) {
    const g = this.game;
    if (this.fish.state !== 'idle' && g.interaction.held?.def.type !== 'fishing_rod') this.fish.state = 'idle';
    if (this.fish.state === 'idle') this.bobber.visible = this.line.visible = false;
    // a wisp of smoke from the sauna chimney when you're nearby
    if (g.fx && g.camera.position.distanceToSquared(this.chimney) < 120 * 120 && Math.random() < dt * 4)
      g.fx.emit(this.chimney.x, this.chimney.y, this.chimney.z, (Math.random() - 0.5) * 0.2, 0.5, (Math.random() - 0.5) * 0.2, 0.6, 4, 0.75, 0.75, 0.75, 0.35, 1.5);
  }
}
