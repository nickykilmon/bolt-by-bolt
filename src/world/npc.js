// Villagers with daily schedules, dialogue and services; rival drivers; moose on the road.
import * as THREE from 'three';
import { MAT } from '../core/materials.js';
import { box, cyl } from '../mechanics/partMeshes.js';
import { heightAt, nearestRoad } from './terrain.js';
import { DYNAMIC } from './colliders.js';
import { mulberry32, clamp } from '../core/util.js';

import { FACE_OPTS, drawFace } from '../ui/face.js';
import { mergeByMaterial } from '../core/merge.js';

const shoeM = new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 0.6 });
const cap = (r, len, mat) => { const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 10), mat); m.castShadow = true; return m; };

// a seeded random face for each villager
export function npcFace(rnd, hairIdx) {
  const pick = (k) => Math.floor(rnd() * FACE_OPTS[k].list.length);
  return { skin: Math.floor(rnd() * 5), shape: pick('shape'), hair: pick('hair'), hairColor: hairIdx, eyes: pick('eyes'), eyeColor: pick('eyeColor'),
    brows: pick('brows'), nose: pick('nose'), mouth: rnd() < 0.6 ? 0 : pick('mouth'), beard: rnd() < 0.5 ? 0 : pick('beard'),
    details: rnd() < 0.6 ? 0 : pick('details'), glasses: rnd() < 0.7 ? 0 : 1 + Math.floor(rnd() * 2), shirt: 0 };
}

export function personModel(shirt, pants, face, hat) {
  const g = new THREE.Group();
  const skinHex = FACE_OPTS.skin.list[face.skin], hairHex = FACE_OPTS.hairColor.list[face.hairColor];
  const skinM = new THREE.MeshStandardMaterial({ color: skinHex, roughness: 0.75 });
  const sm = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.85 });
  const pm = new THREE.MeshStandardMaterial({ color: pants, roughness: 0.9 });
  const hm = new THREE.MeshStandardMaterial({ color: hairHex, roughness: 0.85 });
  // legs: hip group (swings) -> thigh, knee group -> shin + shoe
  const legs = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(s * 0.1, 0.92, 0); g.add(hip);
    const thigh = cap(0.075, 0.32, pm); thigh.position.y = -0.22; hip.add(thigh);
    const knee = new THREE.Group(); knee.position.y = -0.45; hip.add(knee);
    const shin = cap(0.065, 0.32, pm); shin.position.y = -0.2; knee.add(shin);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.27), shoeM); shoe.position.set(0, -0.43, 0.05); knee.add(shoe);
    hip.userData.knee = knee; legs.push(hip);
  }
  // pelvis, tapered torso, chest/shoulders, belt
  const pelvis = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.16, 0.18, 12), pm); pelvis.scale.z = 0.7; pelvis.position.y = 0.95; g.add(pelvis);
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.15, 0.52, 14), sm); torso.scale.z = 0.62; torso.position.y = 1.29; g.add(torso);
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.18, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), sm); chest.scale.set(1, 0.42, 0.62); chest.position.y = 1.55; g.add(chest);
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.172, 0.172, 0.04, 12), shoeM); belt.scale.z = 0.7; belt.position.y = 1.04; g.add(belt);
  // arms: shoulder group (swings) -> upper arm, elbow group -> forearm + hand
  const arms = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(s * 0.215, 1.5, 0); g.add(sh);
    const up = cap(0.052, 0.24, sm); up.position.y = -0.16; sh.add(up);
    const el = new THREE.Group(); el.position.y = -0.33; el.rotation.x = -0.15; sh.add(el);
    const fore = cap(0.044, 0.22, skinM); fore.position.y = -0.14; el.add(fore);
    const sleeve = cap(0.05, 0.06, sm); sleeve.position.y = -0.02; el.add(sleeve);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), skinM); hand.scale.set(0.8, 1.15, 0.6); hand.position.y = -0.31; el.add(hand);
    sh.rotation.z = s * 0.06;
    arms.push(sh);
  }
  // neck & head
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.12, 10), skinM); neck.position.y = 1.62; g.add(neck);
  const headG = new THREE.Group(); headG.position.y = 1.79; g.add(headG);
  const shapeName = FACE_OPTS.shape.list[face.shape];
  const sx = { Oval: 0.92, Round: 1, Square: 1, Long: 0.86, Heart: 0.95 }[shapeName], sy = { Oval: 1.12, Round: 1.02, Square: 1.05, Long: 1.2, Heart: 1.1 }[shapeName];
  const R = 0.125;
  const head = new THREE.Mesh(new THREE.SphereGeometry(R, 20, 16), skinM); head.scale.set(sx, sy, 0.98); headG.add(head);
  for (const s of [-1, 1]) { const ear = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), skinM); ear.scale.set(0.5, 1, 0.8); ear.position.set(s * R * sx, 0, 0); headG.add(ear); }
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.04, 6), skinM); nose.rotation.x = Math.PI / 2; nose.position.set(0, -0.012, R * 0.98); headG.add(nose);
  // painted face (eyes, brows, mouth, beard, glasses) on a patch just above the skin
  const c = document.createElement('canvas'); c.width = c.height = 256;
  drawFace(c, face, { decal: true });
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const decal = new THREE.Mesh(new THREE.SphereGeometry(R * 1.012, 24, 18, Math.PI / 2 - 0.8, 1.6, 0.72, 1.6),
    new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.05, roughness: 0.7, depthWrite: false }));
  decal.scale.set(sx, sy, 0.98); decal.castShadow = false; headG.add(decal);
  headG.userData.decal = decal;
  // hair
  const hairName = FACE_OPTS.hair.list[face.hair];
  if (hairName !== 'Bald') {
    const capH = hairName === 'Buzz cut' ? 0.42 : 0.5;
    const hcap = new THREE.Mesh(new THREE.SphereGeometry(R * 1.07, 18, 10, 0, Math.PI * 2, 0, Math.PI * capH), hm);
    hcap.scale.set(sx, sy, 1.02); hcap.rotation.x = -0.25; headG.add(hcap);
    if (hairName === 'Long' || hairName === 'Mullet' || hairName === 'Ponytail') {
      const back = new THREE.Mesh(new THREE.BoxGeometry(R * 2 * sx, hairName === 'Long' ? 0.26 : 0.16, 0.06), hm);
      back.position.set(0, hairName === 'Long' ? -0.08 : -0.04, -R * 0.85); headG.add(back);
      if (hairName === 'Ponytail') { const pt = cap(0.03, 0.14, hm); pt.position.set(0, -0.1, -R - 0.04); pt.rotation.x = 0.3; headG.add(pt); }
    }
    if (hairName === 'Spiky') for (let i = 0; i < 7; i++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.07, 5), hm); const a = i / 7 * Math.PI * 2; sp.position.set(Math.cos(a) * 0.06, R * sy * 0.95, Math.sin(a) * 0.06); sp.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5); headG.add(sp); }
    if (hairName === 'Mohawk') { const m = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.08, 0.2), hm); m.position.y = R * sy + 0.02; headG.add(m); }
    if (hairName === 'Curly') for (let i = 0; i < 9; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), hm); const a = i / 9 * Math.PI * 2; b.position.set(Math.cos(a) * R * 0.85, R * 0.55, Math.sin(a) * R * 0.85); headG.add(b); }
  }
  if (hat) {
    const hatM = new THREE.MeshStandardMaterial({ color: hat, roughness: 0.7 });
    const crown = new THREE.Mesh(new THREE.SphereGeometry(R * 1.1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), hatM); crown.scale.set(sx, 0.75, 1.02); crown.position.y = R * 0.35; headG.add(crown);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.012, 14, 1, false, -Math.PI / 2, Math.PI), hatM); brim.position.set(0, R * 0.4, R * 0.85); brim.scale.z = 1.1; headG.add(brim);
  }
  // one invisible box so talking works when aiming anywhere at the person
  const hit = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.9, 0.4), MAT.hit); hit.position.y = 0.95; g.add(hit);
  g.traverse((o) => { if (o.isMesh && o.material !== MAT.hit && o !== decal) o.castShadow = true; });
  mergeByMaterial(g, (m) => m.parent === g && m.material !== MAT.hit);
  mergeByMaterial(headG);
  return { g, legs, arms, headG };
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
    lines: ['Is that thing of yours ever going to run, {name}?', 'My lawn needs mowing. Interested? Pays a bit.', 'I heard you revving at 3 am. Again.'] },
  { id: 'makela', name: 'Farmer Mäkelä', role: 'makela', spot: 'makela', hours: [0, 24], shirt: 0x7a5a3a, pants: 0x3a3a2a, wander: 5,
    lines: ['There\'s scrap metal all over the forest. Raimo at the scrapyard pays for it.', 'Drive slowly past my cows. I mean it.'] },
  { id: 'pekka', name: 'Pekka "Peltikatto" Mäki', role: 'rival', spot: 'service', offset: [3, 0, 2.5], hours: [10, 18], shirt: 0xffffff, pants: 0xa01818, hat: 0xa01818,
    lines: ['You\'re {name}, with the beige Ruska? Brave.', 'Moose Hill hairpins: brake early, turn in late.', 'I took the Rock Lake jumps flat out once. Once.'] },
  { id: 'sirpa', name: 'Sirpa Ruuskanen', role: 'rival', spot: 'service', offset: [-3, 0, 2.5], hours: [10, 18], shirt: 0x1a3a7a, pants: 0x1a1a1a,
    lines: ['Your co-driver should call the crests earlier. Oh, it\'s a machine? Figures.', 'Tyre pressures matter more than horsepower on gravel.'] },
];

export class NPCs {
  constructor(game) {
    this.game = game;
    this.list = [];
    const rnd = mulberry32(5);
    for (const c of CAST) {
      const m = personModel(c.shirt, c.pants, npcFace(rnd, [0, 1, 2, 3, 4, 6, 7][Math.floor(rnd() * 7)]), c.hat);
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
  isWorking(npc) { const h = this.game.life.hours, [a, b] = npc.hours; return a < b ? h >= a && h < b : h >= a || h < b; }
  get(id) { return this.list.find((n) => n.id === id); }
  available(role) { const n = this.list.find((x) => x.role === role); return n && this.isWorking(n); }

  prompt(npc) {
    if (!this.isWorking(npc) && npc.hours[1] < 24) return `${npc.name}\n<span class="dim">Closed — open ${npc.hours[0]}:00–${npc.hours[1]}:00</span>`;
    return `<span class="k">E</span>Talk to ${npc.name}`;
  }
  talk(npc) {
    const g = this.game;
    if (!this.isWorking(npc) && npc.hours[1] < 24) { g.say(`${npc.name.split(' ')[0]} isn't working now. Open ${npc.hours[0]}–${npc.hours[1]}.`); return; }
    const name = g.profile?.name || 'JC';
    const line = npc.lines[Math.floor(Math.random() * npc.lines.length)].replaceAll('{name}', name);
    const hello = ['Hi, {name}.', 'Oh, {name}! ', 'Morning, {name}.', '{name}! Good to see you.', 'Ah, {name}.', 'Hey {name}.'][Math.floor(Math.random() * 6)].replaceAll('{name}', name);
    const opts = this.options(npc);
    g.ui.dialog(npc.name, `${hello} ${this.comment(npc) || line}`, opts);
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
      case 'kiosk': o.push({ label: '⛽ Fill up my car (Kalle pumps it for you)', go: () => g.openFuelService() }, { label: 'Buy snacks & a jerry can', go: () => ui.openStore('kiosk') }); break;
      case 'parts': o.push({ label: 'Buy parts over the counter (no delivery wait)', go: () => ui.openStore('parts') }); break;
      case 'grocery': o.push({ label: 'Buy groceries', go: () => ui.openStore('grocery') }, { label: 'Sell the fish I caught', go: () => {
        const fish = [...g.asm.items.values()].filter((it) => it.def.id === 'fish' && (it.loc?.kind === 'inv' || g.interaction.held === it));
        if (!fish.length) { g.say('Maija: "Fish? I don\'t see any fish. Bring them in your pockets."'); return; }
        const kg = fish.reduce((s, f) => s + (f.props.kg || 0.3), 0), pay = Math.round(kg * 14);
        for (const f of fish) { if (g.interaction.held === f) g.interaction.release(); g.inventory = g.inventory.filter((u) => u !== f.uid); g.asm.remove(f); }
        g.addMoney(pay, `Sold ${fish.length} fish (${kg.toFixed(1)} kg) to Maija`);
        g.say(`Maija: "${kg > 4 ? 'Now THAT is a catch!' : 'Fresh fish, lovely.'}" (${pay} mk)`);
      } }); break;
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
      if (n.down > 0) { // knocked over by a car: lie there a while, then get up
        n.down -= dt;
        const lie = n.down > 1 ? 1 : Math.max(0, n.down);
        n.g.rotation.x = -lie * Math.PI / 2; n.g.position.y = heightAt(n.pos.x, n.pos.z) + lie * 0.2;
        if (n.down <= 0) n.g.rotation.x = 0;
        continue;
      }
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
      n.legs.forEach((l, i) => { const ph = i ? -sw : sw; l.userData.knee.rotation.x = Math.max(0, -ph) * 1.1 + 0.05; });
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
