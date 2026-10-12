// JC'S CAR — entry point and game orchestration.
import * as THREE from 'three';
import { Input } from './core/input.js';
import { initMaterials } from './core/materials.js';
import { clamp, fmtMoney } from './core/util.js';
import { createRenderer, Sky } from './world/sky.js';
import { buildTerrainData, buildTerrainMesh, buildTrees, surfaceAt, heightAt, WEATHER } from './world/terrain.js';
import { floorAt } from './world/colliders.js';
import { buildPlace } from './world/buildings.js';
import { Assembly } from './mechanics/assembly.js';
import { DEFS } from './mechanics/partsdb.js';
import { Car } from './vehicles/car.js';
import { Player } from './player/player.js';
import { Interaction } from './player/interaction.js';
import { UI } from './ui/ui.js';
import { Audio } from './audio/audio.js';
import { Life } from './economy/life.js';
import { setupNewGame } from './save/newgame.js';
import { Rally } from './racing/rally.js';
import { buildTown } from './world/town.js';
import { NPCs } from './world/npc.js';
import { Jobs } from './economy/jobs.js';
import { Moped } from './vehicles/moped.js';
import { Traffic } from './world/traffic.js';
import './ui/screens.js';
import { Guide } from './ui/guide.js';
import { hasSave, writeSave, readSave, applySave } from './save/save.js';

const $ = (id) => document.getElementById(id);
const SETTINGS_KEY = 'jcscar.settings';
const DEFAULT_SETTINGS = { quality: 'medium', sens: 1, fov: 72, vol: 0.8, quick: false, autoClutch: false, debug: false };

class Game {
  constructor() {
    this.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
    this.canvas = $('game');
    this.input = new Input(this.canvas);
    this.audio = new Audio();
    this.audio.setVolume(this.settings.vol);
    this.started = false;
    this.paused = false;
    this.animated = [];
    this.drawers = [];
    this.money = 0; this.ledger = []; this.orders = []; this.nextOrder = 1; this.inventory = []; this.basket = [];
    this.ctl = { throttle: 0, brake: 0, clutch: 0, steer: 0, hand: 1, ign: 0, crank: false, gear: 0 };
    this.tHeld = 0;
    this.weather = { rain: 0, target: 0, nextChange: 600, fog: 0 };
    this.underT = 0;
    this.autosaveT = 0;
    this.fps = 60;
    this.bindMenus();
  }

  // ---------------- boot ----------------
  boot(mode) {
    $('loading').classList.remove('hidden');
    $('title').classList.add('hidden');
    setTimeout(() => {
      try { this.build(mode); }
      catch (e) { console.error(e); $('loading').innerHTML = `<div style="max-width:700px">Failed to start: ${e.message}<br><small>${(e.stack || '').split('\n').slice(0, 4).join('<br>')}</small></div>`; return; }
      $('loading').classList.add('hidden');
      $('hud').classList.remove('hidden');
      this.started = true;
      this.input.lock();
      this.last = performance.now();
      requestAnimationFrame((t) => this.frame(t));
    }, 30);
  }

  build(mode) {
    const q = this.settings.quality;
    initMaterials();
    this.renderer = createRenderer(this.canvas, q);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, innerWidth / innerHeight, 0.03, 2200);
    this.scene.add(this.camera);
    addEventListener('resize', () => { this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); this.renderer.setSize(innerWidth, innerHeight); });
    this.sky = new Sky(this.scene, q);
    buildTerrainData();
    this.terrain = buildTerrainMesh(this.scene, q);
    buildTrees(this.scene, q);
    this.asm = new Assembly(this.scene);
    this.ui = new UI(this);
    this.life = new Life(this);
    this.player = new Player(this.camera);
    this.car = new Car(this.asm, this.scene);
    this.place = buildPlace(this);
    this.interaction = new Interaction(this);
    buildTown(this);
    this.npcs = new NPCs(this);
    this.jobs = new Jobs(this);
    this.moped = new Moped(this);
    this.traffic = new Traffic(this);
    this.rally = new Rally(this);
    this.guide = new Guide(this);
    this.flashlight = new THREE.SpotLight(0xfff4e0, 0, 18, 0.5, 0.5, 1.5);
    this.flashlight.position.set(0.15, -0.1, 0); this.flashlight.target.position.set(0, 0, -1);
    this.camera.add(this.flashlight, this.flashlight.target);
    this.audio.init();
    this.audio.radio.onSong = (s) => this.toast(`📻 ${s.title} — ${s.artist}`, 4);
    let loaded = false;
    if (mode === 'continue') {
      try { const d = readSave(); if (d) { applySave(this, d); loaded = true; this.toast('Game loaded'); } }
      catch (e) { console.error('Load failed', e); this.say('The save file could not be loaded (' + e.message + '). Starting a new game.'); }
    }
    if (!loaded) {
      setupNewGame(this);
      this.jobs.seedScrap();
      this.say('Home at last. The old Ruska is in the garage, its engine in pieces on the stand. Time to get to work. (Tab = what\'s missing, Esc = menu)', 9);
      setTimeout(() => this.say('Tip: the computer in the house orders parts. My notes are on it too.', 6), 10000);
    }
    this.asm.onChange = () => { this.dirty = true; };
  }

  // ---------------- helpers used across systems ----------------
  toast(t, s) { this.ui?.toast(t, s); }
  say(t, s) { this.ui?.say(t, s); }
  addMoney(amount, text) {
    this.money += amount;
    this.ledger.push({ when: `${this.life.dayName()} ${this.life.clock()}`, text, amount });
    this.toast(`${amount > 0 ? '+' : ''}${fmtMoney(amount)} — ${text}`);
    if (amount > 0) this.audio.cash();
  }
  fade(cb) { const f = $('fade'); f.classList.add('on'); setTimeout(() => { try { cb(); } finally { setTimeout(() => f.classList.remove('on'), 300); } }, 650); }
  floorAt(x, z, y) { return floorAt(x, z, y); }
  surfaceUnderPlayer() {
    const p = this.player.pos;
    if (p.x < -6.2 && p.x > -15.2 && p.z > -5.2 && p.z < 4.2) return 'wood';
    return surfaceAt(p.x, p.z).name;
  }
  dynamicBoxes() {
    const o = this.car.chassis.obj;
    o.updateMatrixWorld();
    return [{ m: o.matrixWorld, inv: o.matrixWorld.clone().invert(), half: new THREE.Vector3(0.86, 0, 2.08), cz: 0, minY: 0.2, maxY: 1.42 }];
  }
  pickables() {
    const list = [this.place, this.car.chassis.obj, this.stand.obj, this.townRoot, this.moped.obj, this.jobs.mower.obj, ...this.npcs.list.map((n) => n.g)];
    for (const it of this.asm.items.values()) if (it.loc?.kind === 'world' && !it.loc.cont) list.push(it.obj);
    return list;
  }
  fastenerTargets() {
    const out = [];
    const cp = this.camera.position;
    const tmp = new THREE.Vector3();
    for (const it of this.asm.items.values()) {
      if (!it.fastMeshes || !it.slot) continue;
      it.obj.getWorldPosition(tmp);
      if (tmp.distanceToSquared(cp) > 16) continue;
      for (const f of it.fastMeshes) if (f) out.push(f.children[1]);
    }
    return out;
  }
  diagFocus() {
    const p = this.player.pos;
    const ds = p.distanceTo(this.stand.obj.position);
    const dc = p.distanceTo(this.car.chassis.obj.position);
    return ds < dc && ds < 3 ? 'stand' : 'car';
  }
  nearestSocketCase(r) {
    const p = this.camera.position; let best = null, bd = r;
    for (const it of this.asm.items.values()) {
      if (it.def.type !== 'socket_case') continue;
      if (it.loc?.kind === 'inv') return it;
      const d = it.obj.getWorldPosition(new THREE.Vector3()).distanceTo(p);
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }
  canPickUp(inst) {
    for (const a of ['F', 'R']) {
      const s = this.car.support[a];
      if (s.standsUid === inst.uid && s.stands) {
        if (s.lift <= 0.245 && !s.jack) return 'The car is resting on these stands — jack it up off them first';
        s.stands = false; s.standsUid = null;
      }
    }
    return null;
  }

  // ---------------- jack & axle stands ----------------
  jackPoint(a) { return this.car.chassis.obj.localToWorld(new THREE.Vector3(0, 0.2, a === 'F' ? 1.55 : -1.2)); }
  jackAxle() {
    const s = this.jack.obj.localToWorld(new THREE.Vector3(0, 0.2, 0.25));
    for (const a of ['F', 'R']) { const p = this.jackPoint(a); if (Math.hypot(p.x - s.x, p.z - s.z) < 0.45) return a; }
    return null;
  }
  pumpJack(a, dir) {
    const car = this.car;
    if (car.mode === 'physics') { if (car.speed > 0.3) return; car.sleep(); }
    if (car.driverInside) { this.say('Not while sitting in it.'); return; }
    const s = car.support[a];
    if (dir > 0) { s.jack = true; s.lift = Math.min(0.34, s.lift + 0.012); this.audio.click(0.5); this.life.exert(0.3); }
    else {
      const nl = s.lift - 0.025;
      if (s.stands && nl <= 0.24) { s.lift = 0.24; s.jack = false; }
      else { s.lift = Math.max(0, nl); if (s.lift === 0) s.jack = false; }
      this.audio.burst?.(600, 1, 0.05, 0.15, 'lowpass');
    }
  }
  standAxleNear() {
    const p = this.player.pos;
    for (const a of ['F', 'R']) { const j = this.jackPoint(a); if (Math.hypot(j.x - p.x, j.z - p.z) < 2.3 && this.car.support[a].lift > 0.03 && !this.car.support[a].stands) return a; }
    return null;
  }
  placeStands(inst, a) {
    const s = this.car.support[a];
    s.stands = true; s.standsUid = inst.uid;
    const p = this.jackPoint(a); p.y = 0;
    const yaw = Math.atan2(...(() => { const f = new THREE.Vector3(0, 0, 1).applyQuaternion(this.car.chassis.obj.quaternion); return [f.x, f.z]; })()) + Math.PI / 2;
    this.asm.dropAt(inst, new THREE.Vector3(p.x, heightAt(p.x, p.z), p.z), yaw, null);
    this.audio.thunk(0.6);
    this.toast(`Axle stands under the ${a === 'F' ? 'front' : 'rear'}. Lower the jack onto them.`);
  }
  updateJack(dt) {
    const car = this.car;
    for (const a of ['F', 'R']) {
      const s = car.support[a];
      if (s.jack && this.jackAxle() !== a) {
        // jack rolled out from under a lifted car
        if (s.stands) { s.lift = 0.24; s.jack = false; }
        else { if (s.lift > 0.05) { this.audio.crash(6); this.say('CRASH! The car dropped off the jack.'); } s.lift = 0; s.jack = false; }
      }
    }
    const a = this.jackAxle();
    this.jack.arm.rotation.x = a && car.support[a].jack ? -car.support[a].lift * 1.6 : -0.0;
    // safety: crawling under a car held only by a jack
    const unsafe = ['F', 'R'].some((k) => car.support[k].lift > 0.05 && !car.support[k].stands);
    if (unsafe && this.player.crouch && this.player.underCar(car)) {
      this.underT += dt;
      if (this.underT > 2.0) {
        this.underT = 0;
        for (const k of ['F', 'R']) if (!car.support[k].stands) { car.support[k].lift = 0; car.support[k].jack = false; }
        this.audio.crash(10);
        this.life.fatigue = Math.min(100, this.life.fatigue + 35);
        this.addMoney(-150, 'Health centre: crushed hand');
        this.say('The jack slipped and the car came down on my arm! Never get under a car that\'s only on a jack — use axle stands.', 8);
      }
    } else this.underT = 0;
  }

  // ---------------- engine hoist ----------------
  hookPos() { return this.hoist.hook.getWorldPosition(new THREE.Vector3()); }
  hoistLoad() { for (const it of this.asm.items.values()) if (it.loc?.kind === 'hoist') return it; return null; }
  hoistAction() {
    const asm = this.asm, h = this.hookPos(), load = this.hoistLoad();
    const hd = (p) => Math.hypot(p.x - h.x, p.z - h.z);
    if (load) {
      const cp = new THREE.Vector3().setFromMatrixPosition(asm.slotWorldMatrix(this.car.chassis, 'engine'));
      if (hd(cp) < 0.7) {
        const chk = asm.checkInstall(load, this.car.chassis, 'engine');
        if (this.car.chassis.kids.hood && !this.car.chassis.kids.hood.props.open) chk.reasons.push('Open the bonnet first');
        if (this.car.lifted) chk.reasons.push('Lower the car off the jack first');
        return { label: 'Lower the engine onto the mounts', bad: chk.reasons.join(', '), go: () => { asm.install(load, this.car.chassis, 'engine'); this.toast('Engine in! Now bolt it to the mounts (17 mm).'); } };
      }
      const sp = new THREE.Vector3().setFromMatrixPosition(asm.slotWorldMatrix(this.stand, 'engine'));
      if (hd(sp) < 0.7 && !this.stand.kids.engine) return { label: 'Mount the engine on the stand', bad: '', go: () => asm.install(load, this.stand, 'engine') };
      return { label: 'Lower the engine to the floor', bad: '', go: () => { const p = new THREE.Vector3(h.x, heightAt(h.x, h.z), h.z); asm.dropAt(load, p, this.hoist.obj.rotation.y + Math.PI / 2, null); } };
    }
    let best = null, bd = 0.8;
    for (const it of asm.items.values()) {
      if (it.def.type !== 'block') continue;
      const p = it.obj.getWorldPosition(new THREE.Vector3());
      const d = hd(p);
      if (d < bd) { bd = d; best = it; }
    }
    if (!best) return null;
    if (best.slot) {
      const chk = asm.checkRemove(best);
      if (asm.hostOf(best) === this.car.chassis && this.car.chassis.kids.hood && !this.car.chassis.kids.hood.props.open) chk.reasons.push('Open the bonnet first');
      return { label: 'Hook up and lift the engine', bad: chk.reasons.join(', '), go: () => asm.setHoist(best) };
    }
    return { label: 'Hook up and lift the engine', bad: '', go: () => asm.setHoist(best) };
  }
  doHoistAction() {
    const a = this.hoistAction();
    if (!a) { this.say('The hook isn\'t over an engine.'); return; }
    if (a.bad) { this.say(a.bad); this.audio.clink(); return; }
    a.go(); this.audio.thunk(1.2); this.life.exert(4);
  }

  // ---------------- car ----------------
  enterCar() {
    if (this.interaction.held) { this.say('I need my hands free.'); return; }
    if (!this.car.chassis.kids.seatL) { this.say('There\'s no driver\'s seat. Sitting on the floor pan is not an option.'); return; }
    this.player.enterCar();
    this.car.driverInside = true;
    this.ctl.hand = 1;
    this.audio.door(false, 'door');
  }
  exitCar() {
    if (this.car.speed > 2) { this.say('Not while moving!'); return; }
    this.player.exitCar(this.car);
    this.car.driverInside = false;
    this.ctl.hand = 1; this.ctl.throttle = 0; this.ctl.crank = false;
    this.audio.door(false, 'door');
  }
  driveControls(dt) {
    const i = this.input, c = this.ctl, car = this.car;
    if (!this.player.inCar) { c.throttle = 0; c.brake = 0; c.clutch = 0; c.crank = false; c.steer *= 0.9; c.hand = 1; this.handOn = true; return; }
    c.throttle += ((i.down('KeyW') || i.down('ArrowUp') ? 1 : 0) - c.throttle) * Math.min(1, dt * 8);
    c.brake = i.down('KeyS') || i.down('ArrowDown') ? 1 : 0;
    const clutchKey = i.down('ShiftLeft') || i.down('ShiftRight');
    c.clutch += ((clutchKey ? 1 : 0) - c.clutch) * Math.min(1, dt * 12);
    const st = (i.down('KeyA') || i.down('ArrowLeft') ? 1 : 0) - (i.down('KeyD') || i.down('ArrowRight') ? 1 : 0);
    const rate = st ? 2.2 : 3.5;
    const lim = 1 - clamp(car.speed / 45, 0, 0.55);
    c.steer += clamp(st * lim - c.steer, -rate * dt, rate * dt);
    // handbrake is a toggle: Space pulls it on / releases it
    if (this.handOn === undefined) this.handOn = true;
    if (i.hit('Space')) { this.handOn = !this.handOn; this.audio.click(0.5); this.toast(this.handOn ? 'Handbrake ON' : 'Handbrake off', 1.2); }
    c.hand = this.handOn ? 1 : 0;
    // ignition: tap T toggles, hold T cranks
    if (i.hit('KeyT')) { this.tHeld = 0; if (!c.ign) { c.ign = 1; this.audio.click(0.6); } else this.tWasOn = true; }
    if (i.down('KeyT')) { this.tHeld += dt; if (this.tHeld > 0.25) c.crank = true; }
    if (i.up('KeyT')) {
      if (this.tHeld <= 0.25 && this.tWasOn) { c.ign = 0; car.pt.running = false; this.audio.click(0.6); }
      c.crank = false; this.tWasOn = false;
    }
    if (!c.ign) car.pt.running = false;
    // gears
    let shift = 0;
    if (i.hit('KeyR') || i.mouse.wheel < 0) shift = 1;
    if (i.hit('KeyF') || i.mouse.wheel > 0) shift = -1;
    // direct gear keys (hold Shift = clutch while you press them): 1 2 3 4 = gears, 5 = reverse, same key again = neutral
    const direct = { Digit1: 1, Digit2: 2, Digit3: 3, Digit4: 4, Digit5: -1 };
    let pick = null;
    for (const [k, gr] of Object.entries(direct)) if (i.hit(k)) pick = c.gear === gr ? 0 : gr;
    if (pick !== null) {
      const S = car.systems();
      if (pick === 0) { c.gear = 0; this.audio.shift(false); }
      else if (!clutchKey && !this.settings.autoClutch && car.pt.running) { this.audio.shift(true); this.toast('Hold Shift (clutch) while you change gear', 1.8); }
      else if (!S.clutchCable && car.pt.running) { this.audio.shift(true); this.say('GRRRK — the clutch pedal does nothing. Is the clutch cable connected?'); }
      else if (pick === -1 && car.speed > 2) { this.audio.shift(true); this.toast('Stop before you put it in reverse', 1.8); }
      else { c.gear = pick; this.audio.shift(false); if (this.settings.autoClutch) car.pt.autoClutchT = 0.35; }
    }
    if (shift) {
      const S = car.systems();
      const ng = clamp(c.gear + shift, -1, 4);
      if (ng !== c.gear) {
        const free = c.clutch > 0.7 || this.settings.autoClutch || !S.clutchCable && false || (car.pt.rpm < 60) || !S.drive;
        if (!S.clutchCable && car.pt.running) { this.audio.shift(true); this.say('GRRRK — the clutch pedal does nothing. Is the clutch cable connected?'); }
        else if (free) { c.gear = ng; this.audio.shift(false); if (this.settings.autoClutch) car.pt.autoClutchT = 0.35; }
        else this.audio.shift(true);
      }
    }
    car.pt.autoClutchT = Math.max(0, (car.pt.autoClutchT || 0) - dt);
    if (i.hit('KeyL')) { car.lightsOn = !car.lightsOn; this.audio.click(0.4); }
    if (i.hit('KeyN')) { if (car.S?.electric) { this.audio.radio.toggle('car'); this.audio.click(0.4); } else this.say('The radio is dead. No battery power.'); }
    if (i.hit('KeyB') && this.audio.radio.on && this.audio.radio.where === 'car') this.audio.radio.next();
    if (i.hit('KeyE')) this.exitCar();
  }

  // ---------------- economy ----------------
  placeOrder() {
    if (!this.basket.length) return;
    const total = this.ui.basketTotal();
    if (total > this.money) { this.toast('Not enough money for that order'); this.audio.clink(); return; }
    this.addMoney(-total, `Parts order #${this.nextOrder}`);
    this.orders.push({ id: this.nextOrder++, items: [...this.basket], eta: this.life.minutes + 110 + Math.random() * 40 });
    this.basket = [];
    this.say('Order placed. The van should come by in a couple of hours.');
  }
  checkDeliveries() {
    const now = this.life.minutes;
    for (const o of [...this.orders]) {
      if (o.eta > now) continue;
      this.orders = this.orders.filter((x) => x !== o);
      const box = this.asm.create('package', { props: { contents: o.items, order: o.id } });
      const p = this.deliverySpot.clone(); p.x += (Math.random() - 0.5) * 0.4; p.z += (Math.random() - 0.5) * 0.3;
      this.asm.dropAt(box, p, Math.random(), null);
      this.toast(`Delivery: order #${o.id} is on the pallet outside the garage`, 5);
      this.audio.beep(false);
    }
  }
  openPackage(box) {
    const items = box.props.contents || [];
    const at = box.obj.getWorldPosition(new THREE.Vector3());
    this.asm.remove(box);
    items.forEach((id, k) => {
      const it = this.asm.create(id, { cond: 1 });
      const a = (k / Math.max(1, items.length)) * Math.PI * 2;
      const p = new THREE.Vector3(at.x + Math.cos(a) * 0.45, 0, at.z + Math.sin(a) * 0.4);
      p.y = this.floorAt(p.x, p.z, at.y + 0.5);
      if (Math.hypot(p.x - this.deliverySpot.x, p.z - this.deliverySpot.z) < 0.6) p.y = 0.12;
      this.asm.dropAt(it, p, Math.random() * 6, null);
    });
    this.audio.thunk(0.5);
    this.toast(`Unpacked: ${items.map((i) => DEFS[i].name).join(', ')}`, 6);
  }
  palletItems() {
    const s = this.deliverySpot;
    return [...this.asm.items.values()].filter((it) => it.loc?.kind === 'world' && !it.loc.cont && it.def.kind !== 'box' && it.def.kind !== 'root' && Math.hypot(it.loc.pos[0] - s.x, it.loc.pos[2] - s.z) < 0.75);
  }
  sellPrice(it) {
    let v = 0;
    const walk = (x) => { const d = x.def; v += d.type === 'fluid' ? d.price * (x.props.amount / d.cap) * 0.5 : (d.price || 0) * (d.kind === 'part' ? 0.4 + 0.3 * x.cond : 0.5); for (const k of Object.values(x.kids)) walk(k); };
    walk(it);
    return Math.round(v);
  }
  sellItem(uid) {
    const it = this.asm.get(uid); if (!it) return;
    const p = this.sellPrice(it);
    this.asm.remove(it);
    this.addMoney(p, `Sold ${it.def.name}`);
  }

  flipStand() {
    const st = this.stand;
    if (!st.kids.engine) { this.say('There\'s nothing on the stand.'); return; }
    if (this.interaction.held) { this.say('I need both hands to turn the engine over.'); return; }
    st.props.flipped = !st.props.flipped;
    this.asm.anchor(st, 'engine'); // make sure the swivel exists
    this.audio.thunk(1); this.audio.ratchet('ratchet');
    this.toast(st.props.flipped ? 'Engine turned upside down — the bottom end faces up' : 'Engine turned back upright', 3);
    this.asm.changed();
  }
  die(reason) {
    if (this.dead) return;
    this.dead = true;
    const d = $('death'); d.querySelector('.why').textContent = reason; d.classList.add('on');
    this.audio.hush();
    setTimeout(() => {
      if (this.player.inCar) this.exitCar();
      if (this.moped.riding) { this.moped.riding = false; this.player.onMoped = false; this.moped.speed = 0; this.moped.lean = 0; this.moped.place(); }
      if (this.interaction.held) this.interaction.putDown(null);
      this.traffic.clearNear(this.player.pos.x, this.player.pos.z);
      this.player.pos.set(2, 0, 9); this.player.yaw = 0; this.player.pitch = 0; this.player.vel?.set(0, 0, 0);
      this.life.skip(12 * 60);
      this.life.hunger = Math.max(this.life.hunger, 40); this.life.thirst = Math.max(this.life.thirst, 40); this.life.fatigue = 10;
      this.addMoney(-300, 'Hospital bill');
      d.classList.remove('on');
      this.dead = false;
      this.say('You woke up at home after a night in hospital. The bill was 300 mk. Watch out for traffic on Route 54!', 7);
    }, 3500);
  }
  timeSkipped() { this.checkDeliveries(); this.npcs?.placeAll(); }

  // ---------------- gas station ----------------
  gasPumpPrompt(pump) {
    const h = this.interaction.held;
    if (this.nozzle?.pump === pump && h === this.nozzle.inst) return '<span class="k">E</span>Hang up the nozzle';
    if (h) return 'Fuel pump — <span class="dim">hands full</span>';
    return `<span class="k">E</span>Take the fuel nozzle <span class="dim">(7,90 mk/L, paid automatically)</span>`;
  }
  gasPumpUse(pump, btn) {
    if (btn !== 'E') return;
    const h = this.interaction.held;
    if (this.nozzle && h === this.nozzle.inst) { this.interaction.release(); this.asm.remove(this.nozzle.inst); this.nozzle = null; this.audio.thunk(0.4); this.payFuel(); return; }
    if (h) return;
    const n = this.asm.create('fuel_nozzle');
    this.nozzle = { inst: n, pump };
    this.fuelBill = 0;
    this.interaction.hold(n);
  }
  payFuel() { if (this.fuelBill) { this.ledger.push({ when: `${this.life.dayName()} ${this.life.clock()}`, text: 'Fuel', amount: -this.fuelBill }); this.toast(`Paid ${this.fuelBill.toFixed(2)} mk for fuel`); this.fuelBill = 0; } }
  updateNozzle() {
    const nz = this.nozzle;
    if (!nz) return;
    const held = this.interaction.held === nz.inst;
    const far = this.player.pos.distanceTo(nz.pump.pos()) > 5.5;
    if (!held || far) {
      if (held) this.interaction.release();
      if (this.asm.get(nz.inst.uid)) this.asm.remove(nz.inst);
      this.nozzle = null;
      if (far) this.say('The hose snapped back. It doesn\'t reach that far.');
      this.payFuel();
    }
  }
  chargeFuel(litres) {
    const c = litres * 7.9;
    if (this.money < c) { this.say('Card declined! Out of money.'); this.interaction.release(); this.updateNozzle(); return; }
    this.money -= c; this.fuelBill = (this.fuelBill || 0) + c;
  }

  // ---------------- tow / taxi / inspection ----------------
  towCar(dest) {
    const price = dest === 'home' ? 250 : 200;
    if (this.money < price) { this.toast('Not enough money for the tow truck'); return; }
    if (this.player.inCar) this.exitCar();
    this.ui.closeModal();
    this.fade(() => {
      this.addMoney(-price, `Tow truck to ${dest === 'home' ? 'home' : 'Esa\'s workshop'}`);
      const c = this.car;
      if (c.mode === 'physics') c.sleep();
      c.support.F = { lift: 0, jack: false, stands: false }; c.support.R = { lift: 0, jack: false, stands: false };
      if (dest === 'home') { c.park.pos.set(-1.2, 0, 0.3); c.park.yaw = 0; } else { c.park.pos.set(593, 0, 112); c.park.yaw = -Math.PI / 2; }
      c.pt.running = false;
      this.life.skip(60);
      this.say(dest === 'home' ? 'The tow truck dropped the Ruska in your garage.' : 'The Ruska is at Esa\'s workshop.');
    });
  }
  taxiHome() {
    if (this.money < 60) { this.toast('Not enough money'); return; }
    if (this.player.inCar) this.exitCar();
    if (this.moped.riding) this.moped.dismount();
    this.ui.closeModal();
    this.fade(() => { this.addMoney(-60, 'Taxi home'); this.player.pos.set(2, 0, 9); this.player.yaw = 0; this.life.skip(30); });
  }
  inspectCar() {
    const c = this.car, lane = this.inspectionLane, p = c.chassis.obj.position;
    if (Math.hypot(p.x - lane.x, p.z - lane.z) > 7) { this.ui.dialog('Inspector Kivelä', 'Drive the car into the inspection lane first. Between the yellow lines.', [{ label: 'OK', go: () => {} }]); return; }
    if (this.money < 120) { this.toast('Inspection costs 120 mk'); return; }
    this.addMoney(-120, 'Vehicle inspection');
    const S = c.systems(), ch = c.chassis.kids, fails = [], ok = [];
    const chk = (cond, good, bad) => (cond ? ok : fails).push(cond ? good : bad);
    for (const k of ['FL', 'FR', 'RL', 'RR']) chk(S.corners[k].brake > 0.55, `Brakes ${k} OK`, `Brakes ${k} weak or incomplete`);
    chk(S.brakeFluid > 0.3, 'Brake fluid OK', 'Brake fluid low');
    chk(ch.headlightL && ch.headlightR && ch.headlightL.cond > 0.2 && ch.headlightR.cond > 0.2, 'Headlights OK', 'Headlight missing or broken');
    chk(ch.taillightL && ch.taillightR && ch.taillightL.cond > 0.2 && ch.taillightR.cond > 0.2, 'Tail lights OK', 'Tail light missing or broken');
    chk(ch.muffler && ch.midpipe && S.exLeak < 0.3, 'Exhaust OK', 'Exhaust incomplete or leaking');
    chk(S.steerOk && ch.tieRodFL && ch.tieRodFR && Math.abs(S.corners.FL.toe) < 0.035 && Math.abs(S.corners.FR.toe) < 0.035, 'Steering & alignment OK', 'Steering play or alignment out');
    for (const k of ['FL', 'FR', 'RL', 'RR']) chk(S.corners[k].wheel && S.corners[k].tyre > 0.25 && S.corners[k].wheelLoose < 0.05, `Tyre ${k} OK`, `Tyre ${k} worn, missing or loose`);
    chk(ch.seatL && ch.seatR, 'Seats OK', 'Seat missing');
    chk(ch.bumperF && ch.bumperR, 'Bumpers OK', 'Bumper missing');
    chk(S.oilLeak < 0.01 && S.coolLeak < 0.03, 'No fluid leaks', 'Fluid leaking onto the floor');
    chk(ch.doorL && ch.doorR && ch.hood && ch.trunk, 'Body panels OK', 'Body panels missing');
    const pass = fails.length === 0;
    if (pass) c.chassis.props.inspected = this.life.day + 90;
    this.ui.dialog('Inspector Kivelä', pass ? `Passed. Valid for 90 days. ${ok.length} checks OK. Drive safely.` : `FAILED. ${fails.join('; ')}. Fix those and come back.`, [{ label: 'OK', go: () => {} }]);
  }


  // ---------------- save / menus ----------------
  saveGame(silent) {
    try {
      const n = writeSave(this);
      if (!silent) this.toast(`Game saved (${Math.round(n / 1024)} KB)`);
    } catch (e) { console.error('Save failed', e); this.toast('SAVE FAILED: ' + e.message, 6); }
  }
  bindMenus() {
    $('btnContinue').disabled = !hasSave();
    $('btnContinue').onclick = () => this.boot('continue');
    $('btnNew').onclick = () => this.boot('new');
    $('btnSettingsT').onclick = () => this.openSettings();
    $('btnQuit').onclick = () => { document.querySelector('.title-inner').innerHTML = '<h1>JC\'S CAR</h1><div class="sub">Thanks for playing. You can close this tab.</div>'; };
    $('btnResume').onclick = () => this.resume();
    $('btnSave').onclick = () => { this.saveGame(); };
    $('btnLoad').onclick = () => { sessionStorage.setItem('jcscar.boot', 'continue'); location.reload(); };
    $('btnSettingsP').onclick = () => this.openSettings();
    $('btnHelp').onclick = () => { $('help').classList.remove('hidden'); };
    $('btnHelpClose').onclick = () => { $('help').classList.add('hidden'); };
    $('btnTitle').onclick = () => { this.saveGame(true); location.reload(); };
    $('btnSetClose').onclick = () => { $('settings').classList.add('hidden'); this.saveSettings(); };
    this.input.onLockChange = (locked) => {
      if (!this.started) return;
      if (!locked && !this.ui.modal && !this.paused) this.pause();
    };
    this.canvas.addEventListener('click', () => { if (this.started && !this.paused && !this.ui.modal) this.input.lock(); });
    addEventListener('keydown', (e) => {
      if (!this.started) return;
      if (e.code === 'Escape' && this.ui.modal) { this.ui.closeModal(); }
      if (e.code === 'KeyM' && this.ui.modal === 'mapscreen') this.ui.closeModal();
    });
    addEventListener('beforeunload', () => { if (this.started) this.saveGame(true); });
  }
  openSettings() {
    const s = this.settings;
    $('setQuality').value = s.quality; $('setSens').value = s.sens; $('setFov').value = s.fov; $('setVol').value = s.vol;
    $('setQuick').checked = s.quick; $('setAutoClutch').checked = s.autoClutch; $('setDebug').checked = s.debug;
    $('settings').classList.remove('hidden');
  }
  saveSettings() {
    const s = this.settings;
    const oldQ = s.quality;
    s.quality = $('setQuality').value; s.sens = +$('setSens').value; s.fov = +$('setFov').value; s.vol = +$('setVol').value;
    s.quick = $('setQuick').checked; s.autoClutch = $('setAutoClutch').checked; s.debug = $('setDebug').checked;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    this.audio.setVolume(s.vol);
    if (this.camera) { this.camera.fov = s.fov; this.camera.updateProjectionMatrix(); }
    if (this.started && oldQ !== s.quality) this.toast('Graphics quality applies after reloading (Save & quit to title).', 5);
  }
  pause() { this.paused = true; $('pause').classList.remove('hidden'); }
  resume() { this.paused = false; $('pause').classList.add('hidden'); $('settings').classList.add('hidden'); $('help').classList.add('hidden'); this.input.lock(); }
  resumeFromModal() { if (this.started && !this.paused) setTimeout(() => this.input.lock(), 50); }

  // ---------------- weather ----------------
  updateWeather(dt) {
    const w = this.weather;
    w.nextChange -= dt;
    if (w.nextChange <= 0) { w.nextChange = 300 + Math.random() * 900; w.target = Math.random() < 0.3 ? 0.5 + Math.random() * 0.5 : 0; w.fog = Math.random() < 0.15 ? 0.6 : 0; }
    w.rain += clamp(w.target - w.rain, -dt * 0.02, dt * 0.02);
    this.sky.rainAmt = w.rain;
    this.sky.fogAmt += clamp((w.fog || 0) - this.sky.fogAmt, -dt * 0.01, dt * 0.01);
    WEATHER.wet = clamp(WEATHER.wet + (w.rain > 0.2 ? dt * 0.01 : -dt * 0.002), 0, 1);
    this.car.ambient = 12 + 8 * (this.sky.dayLight ?? 0.5) - w.rain * 5;
  }

  // ---------------- main loop ----------------
  frame(t) {
    requestAnimationFrame((tt) => this.frame(tt));
    let dt = (t - this.last) / 1000; this.last = t;
    if (!(dt > 0)) dt = 0.016;
    dt = Math.min(dt, 0.05);
    this.fps += (1 / dt - this.fps) * 0.05;
    try { this.tick(dt); }
    catch (e) { console.error(e); this.toast('Error: ' + e.message, 6); }
    this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
  }

  tick(dt) {
    const i = this.input;
    const active = !this.paused && !this.ui.modal && !this.dead;
    if (active) {
      this.life.update(dt);
      this.player.update(dt, i, this);
      this.moped.update(dt, i);
      this.traffic.update(dt);
      this.driveControls(dt);
      this.npcs.update(dt);
      this.jobs.update(dt);
      this.updateNozzle();
      this.interaction.update(dt, i);
      if (!this.player.inCar && i.hit('KeyF') && this.interaction.target?.type !== 'interact') { this.flashlight.intensity = this.flashlight.intensity ? 0 : 25; this.audio.click(0.4); }
      if (i.hit('KeyI')) this.ui.openInventory();
      if (i.hit('KeyM')) this.ui.openMap();
      if (i.hit('KeyP')) this.ui.openPhone();
      if (i.hit('KeyH')) this.guide.toggle();
      this.guide.update(dt);
      if (i.hit('F3')) { this.settings.debug = !this.settings.debug; }
      const tab = i.down('Tab');
      if (tab !== this.xray) { this.xray = tab; this.asm.setFastenerXray(tab); }
      this.ui.diagnostics(tab);
      this.checkDeliveries();
      this.updateWeather(dt);
      this.updateJack(dt);
      for (const a of this.animated) a(dt);
    }
    // car always simulates (engine may be idling)
    const carDt = active ? dt : 0;
    if (carDt > 0) {
      this.car.update(carDt, this.ctl, this.settings);
      this.rally.update(carDt);
      for (const m of this.car.messages) this.say(m);
      this.car.messages.length = 0;
      for (const ev of this.car.pt.events) {
        if (ev === 'stall' && this.player.inCar) this.say('Stalled.', 2);
        if (ev === 'start') this.say(this.car.S.firing < 4 ? 'It runs! …roughly. Not all cylinders are firing.' : 'VROOM! It\'s alive!', 4);
        if (ev === 'nofuel') this.say('The engine sputters and dies. Out of fuel?');
      }
      this.car.pt.events.length = 0;
      if (this.car.lastImpact > 6) { this.audio.crash(this.car.lastImpact); this.car.lastImpact = 0; }
      if (this.player.inCar) this.player.updateSeated(this);
    }
    this.sky.update(this.life.hours, this.camera.position, dt);
    // audio
    const S = this.car.S, pt = this.car.pt;
    const wheels = this.car.body.wheels;
    let slip = 0, gravel = 0;
    if (this.car.mode === 'physics') for (const w of wheels) if (w.contact) { slip = Math.max(slip, Math.abs(w.slipV) / 6 + Math.abs(w.slipA) * 2 - 0.25); if (w.surface?.dust) gravel = 1; }
    const inside = Math.abs(this.player.pos.x) < 15.2 && this.player.pos.z > -5.2 && this.player.pos.z < 5.2 && this.player.pos.x < 6.2;
    this.audio.update(dt, {
      camPos: this.camera.position, camFwd: this.camera.getWorldDirection(new THREE.Vector3()), enginePos: this.moped.riding && !pt.running ? this.moped.pos : this.car.engineWorldPos(),
      engine: this.moped.riding && !pt.running ? { rpm: this.moped.rpm, running: true, load: 0.5, throttle: i.down('KeyW') ? 0.8 : 0.1, misfire: 0, loud: 1.7, starter: 0, knock: 0 } : { rpm: pt.rpm, running: pt.running, load: pt.load, throttle: pt.throttleEff || 0, misfire: pt.misfire || 0, loud: S?.loud || 1, starter: pt.cranking ? pt.starterSpin : 0, knock: pt.knock + (pt.detonation > 2 ? 0.3 : 0) },
      slip: this.car.speed > 1 ? slip : 0, gravel, speed: this.moped.riding ? Math.abs(this.moped.speed) : this.car.speed, rain: this.weather.rain, day: this.sky.dayLight, outdoors: !inside, indoors: inside,
    });
    if (this.audio.ctx) {
      const R = this.audio.radio;
      if (R.on && R.where === 'car' && !this.car.S?.electric) R.toggle('car');
      R.update(this.camera.position, R.where === 'car' ? this.car.chassis.obj.localToWorld(new THREE.Vector3(0, 0.95, 0.55)) : this.garageRadioPos);
    }
    this.ui.hud(dt);
    if (this.settings.debug) {
      const c = this.car, b = c.body;
      this.ui.el.dbg.classList.remove('hidden');
      this.ui.debug(`FPS ${this.fps.toFixed(0)}  draws ${this.renderer.info.render.calls}  tris ${(this.renderer.info.render.triangles / 1000).toFixed(0)}k\ncar ${c.mode} ${(c.speed * 3.6).toFixed(1)} km/h mass ${Math.round(c.mass)}\nrpm ${pt.rpm.toFixed(0)} run ${pt.running} gear ${pt.gear} clutch ${pt.clutch?.toFixed(2)} temp ${pt.temp.toFixed(1)} oilP ${pt.oilP.toFixed(2)}\nwheels ${b.wheels.map((w) => `${w.key}:${(w.load / 1000).toFixed(1)}kN ${w.omega.toFixed(1)}`).join(' ')}\nsupport F ${c.support.F.lift.toFixed(2)}${c.support.F.stands ? 'S' : ''} R ${c.support.R.lift.toFixed(2)}${c.support.R.stands ? 'S' : ''}\nplayer ${this.player.pos.toArray().map((v) => v.toFixed(2)).join(', ')} items ${this.asm.items.size}`);
    } else this.ui.el.dbg.classList.add('hidden');
    // autosave every 3 real minutes
    this.autosaveT += dt;
    if (this.autosaveT > 180 && active) { this.autosaveT = 0; this.saveGame(true); this.toast('Autosaved', 1.5); }
  }
}

const game = new Game();
window.__jc = game; // debug handle
const bootMode = sessionStorage.getItem('jcscar.boot');
if (bootMode) { sessionStorage.removeItem('jcscar.boot'); game.boot(bootMode); }
