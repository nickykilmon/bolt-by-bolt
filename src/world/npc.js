// Villagers with daily schedules, dialogue and services; rival drivers; moose on the road.
import * as THREE from 'three';
import { MAT } from '../core/materials.js';
import { box, cyl } from '../mechanics/partMeshes.js';
import { heightAt, nearestRoad } from './terrain.js';
import { DYNAMIC } from './colliders.js';
import { mulberry32, clamp } from '../core/util.js';

const skinM = new THREE.MeshStandardMaterial({ color: 0xe0b090, roughness: 0.8 });
const hairCols = [0x3a2a1a, 0x8a6a3a, 0xd8c8a0, 0x9a9a9a, 0x1a1a1a, 0xa04a1a];

function personModel(shirt, pants, hair, hat) {
  const g = new THREE.Group();
  const sm = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.85 });
  const pm = new THREE.MeshStandardMaterial({ color: pants, roughness: 0.9 });
  const legs = [];
  for (const s of [-1, 1]) { const leg = new THREE.Group(); leg.position.set(s * 0.1, 0.85, 0); g.add(leg); box(leg, 0.15, 0.82, 0.17, pm, 0, -0.41, 0); box(leg, 0.15, 0.08, 0.26, MAT.blackPaint, 0, -0.8, 0.04); legs.push(leg); }
  box(g, 0.42, 0.62, 0.24, sm, 0, 1.17, 0);
  const arms = [];
  for (const s of [-1, 1]) { const a = new THREE.Group(); a.position.set(s * 0.27, 1.44, 0); g.add(a); box(a, 0.11, 0.6, 0.13, sm, 0, -0.3, 0); box(a, 0.1, 0.1, 0.1, skinM, 0, -0.64, 0); arms.push(a); }
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), skinM); head.position.y = 1.64; g.add(head);
  const hm = new THREE.MeshStandardMaterial({ color: hair, roughness: 0.9 });
  const h = new THREE.Mesh(new THREE.SphereGeometry(0.135, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), hm); h.position.y = 1.66; g.add(h);
  if (hat) { cyl(g, 0.15, 0.06, new THREE.MeshStandardMaterial({ color: hat }), 0, 1.76, 0, 'y', 12); box(g, 0.2, 0.02, 0.14, new THREE.MeshStandardMaterial({ color: hat }), 0, 1.74, 0.12); }
  for (const s of [-1, 1]) { const e = box(g, 0.025, 0.025, 0.01, MAT.blackPaint, s * 0.05, 1.67, 0.125); }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { g, legs, arms };
}

// role -> data. spot keys refer to game.npcSpots
const CAST = [
  { id: 'kalle', name: 'Kalle (gas station)', role: 'kiosk', spot: 'kiosk', hours: [7, 21], shirt: 0xb01010, pants: 0x2a2a3a, hat: 0xb01010,
    lines: ['Fill her up? The pumps are self-service, I just take the money.', 'If your car sounds like that, I would carry a spare fan belt.', 'Coffee is fresh. Well. It was fresh this morning.'] },
  { id: 'teppo', name: 'Teppo (parts store)', role: 'parts', spot: 'parts', hours: [8, 18], shirt: 0x1a3a7a, pants: 0x3a3a3a,
    lines: ['This store has every part for the Ruska. Mostly. If not, I can order it.', 'Head gaskets? Third shelf. And buy a torque wrench, for heaven\'s sake.', 'Rally parts are expensive. Win something first.'] },
  { id: 'helena', name: 'Helena (post office)', role: 'post', spot: 'post', hours: [8, 17], shirt: 0xd08a10, pants: 0x1a1a3a,
    lines: ['The post needs drivers. Parcels go to mailboxes all around the parish.', 'Please don\'t throw the parcels. I know you threw the last one.'] },
  { id: 'maija', name: 'Maija (shop)', role: 'grocery', spot: 'grocery', hours: [8, 20], shirt: 0x2a7a2a, pants: 0x4a3a2a,
    lines: ['Sausages are on offer today.', 'You look like you live on coffee and engine oil.'] },
  { id: 'esa', name: 'Esa (mechanic)', role: 'mechanic', spot: 'mechanic', hours: [8, 18], shirt: 0x3a4a5a, pants: 0x3a4a5a, hat: 0x2a2a2a,
    lines: ['Bent the suspension again? I have an alignment rig.', 'I sometimes have work for someone who knows which end of a ratchet is which.', 'A Ruska 1600. My father had one. It caught fire.'] },
  { id: 'tuula', name: 'Tuula (paint shop)', role: 'painter', spot: 'painter', hours: [9, 17], shirt: 0xe8e8e8, pants: 0x5a2a7a,
    lines: ['Colour sells cars. And rally fans love stripes.', 'Bring it in clean and I\'ll make it shine.'] },
  { id: 'kivela', name: 'Inspector Kivelä', role: 'inspector', spot: 'inspector', hours: [8, 16], voice: { pitch: 0.3, rate: 0.75 }, shirt: 0x0a6a6a, pants: 0x1a1a1a, hat: 0x0a6a6a,
    lines: ['Brakes, lights, exhaust, steering, tyres. In that order. No exceptions.', 'Rally organisers want a valid inspection for anything above amateur level.'] },
  { id: 'matti', name: 'Matti (rally organiser)', role: 'organizer', spot: 'organizer', hours: [9, 19], shirt: 0xa01818, pants: 0x222222,
    lines: ['The SM series is no joke. Start at the Ruskala Sprint and earn your reputation.', 'Liaison times are strict. Late to a stage start costs ten seconds a minute.'] },
  { id: 'ari', name: 'Ari (service crew)', role: 'service', spot: 'service', hours: [8, 21], shirt: 0x1a3a7a, pants: 0x1a3a7a, hat: 0xd0a020,
    lines: ['We can fix most things between stages. For a price.', 'Pull into the service park, we\'ll do the rest.'] },
  { id: 'raimo', name: 'Raimo (scrapyard)', role: 'scrap', spot: 'scrap', hours: [7, 19], voice: { pitch: 0.1, rate: 0.8 }, shirt: 0x5a4a1a, pants: 0x2a2a2a, hat: 0x7a2a1a,
    lines: ['Used parts on the racks. You buy what you pick up. No refunds, no guarantees, no questions.', 'Bring me scrap metal, I pay by the kilo. Put it on the scale.', 'That one? Came out of a Ruska that went into the lake in \'79. Probably fine.'] },
  { id: 'pertti', name: 'Pertti (neighbour)', role: 'pertti', spot: 'pertti', hours: [0, 24], voice: { pitch: 1.9, rate: 1.25 }, shirt: 0x6a8a3a, pants: 0x2a3a5a, hat: 0x2a5a2a, wander: 6,
    lines: ['Is that thing of yours ever going to run, JC?', 'My lawn needs mowing. Interested? Pays a bit.', 'I heard you revving at 3 am. Again.'] },
  { id: 'makela', name: 'Farmer Mäkelä', role: 'makela', spot: 'makela', hours: [0, 24], shirt: 0x7a5a3a, pants: 0x3a3a2a, wander: 5,
    lines: ['There\'s scrap metal all over the forest. Raimo at the scrapyard pays for it.', 'Drive slowly past my cows. I mean it.'] },
  { id: 'pekka', name: 'Pekka "Peltikatto" Mäki', role: 'rival', spot: 'service', offset: [3, 0, 2.5], hours: [10, 18], shirt: 0xffffff, pants: 0xa01818, hat: 0xa01818,
    lines: ['You\'re the guy with the beige Ruska? Brave.', 'Moose Hill hairpins: brake early, turn in late.', 'I took the Rock Lake jumps flat out once. Once.'] },
  { id: 'sirpa', name: 'Sirpa Ruuskanen', role: 'rival', spot: 'service', offset: [-3, 0, 2.5], hours: [10, 18], shirt: 0x1a3a7a, pants: 0x1a1a1a,
    lines: ['Your co-driver should call the crests earlier. Oh, it\'s a machine? Figures.', 'Tyre pressures matter more than horsepower on gravel.'] },
];

export class NPCs {
  constructor(game) {
    this.game = game;
    this.list = [];
    const rnd = mulberry32(5);
    for (const c of CAST) {
      const m = personModel(c.shirt, c.pants, hairCols[Math.floor(rnd() * hairCols.length)], c.hat);
      const npc = { ...c, ...m, pos: new THREE.Vector3(), target: new THREE.Vector3(), walk: 0, present: false, wanderT: 0 };
      m.g.traverse((o) => { if (o.isMesh) o.userData.interact = { prompt: () => this.prompt(npc), use: (b) => b === 'E' && this.talk(npc) }; });
      game.scene.add(m.g);
      this.home(npc);
      npc.pos.copy(npc.target);
      this.list.push(npc);
      this.placeNow(npc);
    }
    this.moose = null; this.mooseT = 40;
  }
  spot(npc) {
    const s = this.game.npcSpots[npc.spot];
    const p = s ? s.clone() : new THREE.Vector3();
    if (npc.offset) p.add(new THREE.Vector3(...npc.offset));
    return p;
  }
  home(npc) { npc.target.copy(this.spot(npc)); }
  // put an NPC at their spot immediately (no walking), hidden if off shift
  placeNow(npc) {
    npc.present = this.isWorking(npc) || npc.hours[1] >= 24;
    npc.g.visible = npc.present;
    this.home(npc);
    npc.pos.copy(npc.target);
    npc.g.position.copy(npc.target);
  }
  placeAll() { for (const n of this.list) this.placeNow(n); }
  // a distinct (and usually silly) text-to-speech voice per character
  voiceProfile(title) {
    const n = this.list.find((x) => x.name === title) || this.list.find((x) => title.startsWith(x.name.split(' ')[0]));
    const key = n ? n.id : title;
    let h = 0; for (const ch of key) h = (h * 131 + ch.charCodeAt(0)) >>> 0;
    const pitches = [0.1, 0.35, 0.55, 0.75, 1.35, 1.6, 1.9];
    return { voice: key, pitch: n?.voice?.pitch ?? pitches[h % pitches.length], rate: n?.voice?.rate ?? 0.85 + ((h >> 4) % 5) * 0.09 };
  }
  isWorking(npc) { const h = this.game.life.hours; return h >= npc.hours[0] && h < npc.hours[1]; }
  get(id) { return this.list.find((n) => n.id === id); }
  available(role) { const n = this.list.find((x) => x.role === role); return n && this.isWorking(n); }

  prompt(npc) {
    if (!this.isWorking(npc) && npc.hours[1] < 24) return `${npc.name}\n<span class="dim">Closed — open ${npc.hours[0]}:00–${npc.hours[1]}:00</span>`;
    return `<span class="k">E</span>Talk to ${npc.name}`;
  }
  talk(npc) {
    const g = this.game;
    if (!this.isWorking(npc) && npc.hours[1] < 24) { g.say(`${npc.name.split(' ')[0]} isn't working now. Open ${npc.hours[0]}–${npc.hours[1]}.`); return; }
    const line = npc.lines[Math.floor(Math.random() * npc.lines.length)];
    const opts = this.options(npc);
    g.ui.dialog(npc.name, this.comment(npc) || line, opts);
  }
  // NPCs react to the state of your car if it's parked nearby
  comment(npc) {
    const g = this.game, car = g.car;
    if (car.chassis.obj.position.distanceTo(npc.pos) > 25 || Math.random() < 0.5) return null;
    const S = car.systems();
    const ch = car.chassis.kids;
    if (!ch.muffler && car.pt.running) return 'Sounds like a tractor! Your Ruska is louder than my combine harvester.';
    if (ch.bumperF?.cond < 0.3) return 'Did you drive through a barn? That bumper has seen things.';
    if (car.chassis.props.paint && car.chassis.props.livery && car.chassis.props.livery !== 'none') return 'Now THAT looks like a rally car. Respect.';
    if (S.issues.filter((i) => i.sev >= 3).length > 5) return 'You know cars are supposed to have all their parts, right?';
    return null;
  }
  options(npc) {
    const g = this.game, ui = g.ui;
    const o = [];
    switch (npc.role) {
      case 'kiosk': o.push({ label: 'Buy snacks & a jerry can', go: () => ui.openStore('kiosk') }); break;
      case 'parts': o.push({ label: 'Buy parts over the counter (no delivery wait)', go: () => ui.openStore('parts') }); break;
      case 'grocery': o.push({ label: 'Buy groceries', go: () => ui.openStore('grocery') }); break;
      case 'post': o.push({ label: 'Parcel delivery work', go: () => g.jobs.offerParcels() }); break;
      case 'mechanic': o.push({ label: 'Services: alignment, body repair, towing', go: () => ui.openGarageServices() }, { label: 'Ask for work', go: () => g.jobs.offerWorkshop() }); break;
      case 'painter': o.push({ label: 'Paint & livery', go: () => ui.openPaint() }); break;
      case 'inspector': o.push({ label: 'Inspect my car (120 mk)', go: () => g.inspectCar() }); break;
      case 'organizer': o.push({ label: 'Rally events & championship', go: () => ui.openRally() }); break;
      case 'service': o.push({ label: 'Service my car', go: () => ui.openService() }, { label: 'Setup / tuning', go: () => ui.openTuning() }); break;
      case 'scrap': o.push({ label: 'Sell what\'s on the scale', go: () => g.jobs.sellScale() }, { label: 'Scrap collection job', go: () => g.jobs.offerScrap() }); break;
      case 'pertti': o.push({ label: 'Mow the lawn job', go: () => g.jobs.offerMowing() }); break;
      case 'makela': o.push({ label: 'Ask about work', go: () => g.jobs.offerScrap() }); break;
    }
    o.push({ label: 'Bye', go: () => {} });
    return o;
  }

  update(dt) {
    const g = this.game, cam = g.camera.position;
    for (const n of this.list) {
      const working = this.isWorking(n);
      // off-shift NPCs go home (teleport out of sight) and become invisible
      const want = working || n.hours[1] >= 24;
      if (want !== n.present) { n.present = want; n.g.visible = want; if (want) { this.home(n); if (n.pos.distanceTo(cam) > 30) n.pos.copy(n.target); } }
      if (!n.present) continue;
      if (n.wander) {
        n.wanderT -= dt;
        if (n.wanderT <= 0) { n.wanderT = 6 + Math.random() * 10; const s = this.spot(n); n.target.set(s.x + (Math.random() - 0.5) * n.wander * 2, 0, s.z + (Math.random() - 0.5) * n.wander * 2); }
      }
      const d = new THREE.Vector3(n.target.x - n.pos.x, 0, n.target.z - n.pos.z);
      const dist = d.length();
      if (dist > 0.3) {
        const sp = Math.min(dist, 1.3 * dt);
        n.pos.addScaledVector(d.normalize(), sp);
        n.walk += dt * 7;
        n.g.rotation.y = Math.atan2(d.x, d.z);
      } else {
        n.walk *= 0.9;
        // face the player when close
        const pd = new THREE.Vector3(cam.x - n.pos.x, 0, cam.z - n.pos.z);
        if (pd.length() < 5) { const want = Math.atan2(pd.x, pd.z); let dd = want - n.g.rotation.y; dd = Math.atan2(Math.sin(dd), Math.cos(dd)); n.g.rotation.y += dd * Math.min(1, dt * 4); }
      }
      n.pos.y = heightAt(n.pos.x, n.pos.z);
      const near = n.target.y && Math.abs(n.target.y - n.pos.y) < 1.5 ? n.target.y : n.pos.y;
      n.g.position.set(n.pos.x, near, n.pos.z);
      const sw = Math.sin(n.walk) * (dist > 0.3 ? 0.5 : 0.03);
      n.legs[0].rotation.x = sw; n.legs[1].rotation.x = -sw; n.arms[0].rotation.x = -sw * 0.8; n.arms[1].rotation.x = sw * 0.8;
    }
    this.updateMoose(dt);
  }

  // ---------------- moose ----------------
  updateMoose(dt) {
    const g = this.game, car = g.car;
    if (!this.moose) {
      this.mooseT -= dt;
      if (this.mooseT > 0 || !g.player.inCar || car.speed < 8) return;
      this.mooseT = 5; // retry soon if there's no road ahead
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(car.chassis.obj.quaternion); fwd.y = 0; fwd.normalize();
      const ahead = car.chassis.obj.position.clone().addScaledVector(fwd, 70 + Math.random() * 40);
      const nr = nearestRoad(ahead.x, ahead.z, 45);
      if (!nr || nr.road.town) return;
      const side = new THREE.Vector3(-nr.dirz, 0, nr.dirx);
      const s0 = Math.random() < 0.5 ? 1 : -1;
      const roadP = new THREE.Vector3(nr.road.samples[nr.i].x, 0, nr.road.samples[nr.i].z);
      const start = roadP.clone().addScaledVector(side, s0 * 14), end = roadP.clone().addScaledVector(side, -s0 * 16);
      this.mooseT = 150 + Math.random() * 300;
      this.moose = this.makeMoose(start, end);
      g.say('Is that… a moose?', 2);
      return;
    }
    const m = this.moose;
    const d = m.end.clone().sub(m.pos); d.y = 0;
    const dist = d.length();
    const speed = m.scared ? 4.5 : 1.3;
    m.pos.addScaledVector(d.normalize(), Math.min(dist, speed * dt));
    m.pos.y = heightAt(m.pos.x, m.pos.z);
    m.g.position.copy(m.pos); m.g.rotation.y = Math.atan2(d.x, d.z);
    m.walk += dt * speed * 3; m.legs.forEach((l, i) => { l.rotation.x = Math.sin(m.walk + i * Math.PI / 2) * 0.4; });
    m.dyn.x = m.pos.x; m.dyn.z = m.pos.z; m.dyn.y = m.pos.y;
    if (m.dyn.hit) {
      m.dyn.hit = false;
      if (!m.scared) { m.scared = true; g.say('BONK! You hit the moose. It looks annoyed and trots off into the forest.', 5); g.audio.crash(12); m.end = m.pos.clone().add(new THREE.Vector3(m.end.x - m.pos.x, 0, m.end.z - m.pos.z).normalize().multiplyScalar(40)); }
    }
    if (dist < 0.5 || m.pos.distanceTo(car.chassis.obj.position) > 300) { g.scene.remove(m.g); DYNAMIC.splice(DYNAMIC.indexOf(m.dyn), 1); this.moose = null; }
  }
  makeMoose(start, end) {
    const g = new THREE.Group();
    const fur = new THREE.MeshStandardMaterial({ color: 0x4a3420, roughness: 1 });
    box(g, 0.9, 1.0, 2.2, fur, 0, 1.75, 0);
    const neck = box(g, 0.45, 0.8, 0.5, fur, 0, 2.2, 1.15); neck.rotation.x = 0.6;
    box(g, 0.4, 0.45, 0.8, fur, 0, 2.45, 1.6);
    const ant = new THREE.MeshStandardMaterial({ color: 0xc8b890, roughness: 0.8 });
    for (const s of [-1, 1]) { const a = box(g, 0.9, 0.06, 0.4, ant, s * 0.55, 2.8, 1.35); a.rotation.z = s * 0.3; }
    const legs = [];
    for (const [x, z] of [[-0.3, 0.8], [0.3, 0.8], [-0.3, -0.8], [0.3, -0.8]]) { const l = new THREE.Group(); l.position.set(x, 1.3, z); g.add(l); box(l, 0.16, 1.3, 0.16, fur, 0, -0.65, 0); legs.push(l); }
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.game.scene.add(g);
    const dyn = { x: start.x, z: start.z, y: 0, r: 1.2, h: 2.3 };
    DYNAMIC.push(dyn);
    return { g, legs, pos: start.clone(), end, walk: 0, dyn };
  }
}
