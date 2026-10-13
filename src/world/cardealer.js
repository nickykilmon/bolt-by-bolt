// Huttusen Autoliike — a used-car lot on Route 54 between your place and Ruskala. Buy a second car
// (simple to drive: no engine to build), park it wherever you like, sell it back for 60 %.
import * as THREE from 'three';
import { MAT } from '../core/materials.js';
import { box, cyl } from '../mechanics/partMeshes.js';
import { ZONES } from './terrain.js';
import { addCollider } from './colliders.js';
import { labelTex } from '../core/textures.js';
import { personModel, npcFace } from './npc.js';
import { carModel } from './traffic.js';
import { WorkVehicle } from '../vehicles/workvehicle.js';
import { mulberry32, fmtMoney } from '../core/util.js';

const K = (k) => `<span class="k">${k}</span>`;
const LOT = { x: 420, z: 130 };
export const CARS = [
  { id: 'lada', name: 'Lada 1200', color: 0xd8c8a0, price: 1800, max: 30, accel: 3.0, turn: 1.1, blurb: 'Soviet-built, unkillable, slow. Heater works. Sometimes.' },
  { id: 'volvo', name: 'Volvo 240', color: 0x1a2a4a, price: 3600, max: 38, accel: 3.6, turn: 1.0, blurb: 'A brick on wheels. Safe, comfy, surprisingly quick on the highway.' },
  { id: 'saab', name: 'Saab 99 Turbo', color: 0xa01818, price: 7200, max: 47, accel: 5.0, turn: 1.15, blurb: 'Turbocharged Swedish rocket. Watch for the boost kicking in.' },
  { id: 'escort', name: 'Ford Escort RS2000', color: 0xf0f0ea, price: 11500, max: 52, accel: 6.0, turn: 1.35, stripes: 0x1a3a9a, blurb: 'The rally legend. Light, nimble and very, very fast.' },
];
const SELL = 0.6;

export class CarDealer {
  constructor(game) {
    this.game = game;
    this.Y = ZONES.find((z) => z.id === 'carlot').h;
    this.root = new THREE.Group(); game.scene.add(this.root);
    this.lamps = new THREE.MeshStandardMaterial({ color: 0xfff6e0, emissive: 0xfff2c0, emissiveIntensity: 0, roughness: 0.2 });
    this.tails = new THREE.MeshStandardMaterial({ color: 0x801010, emissive: 0xff1010, emissiveIntensity: 0, roughness: 0.3 });
    this.owned = {};
    this.build();
    this.cars = CARS.map((c, i) => this.makeCar(c, i));
    game.dealerPos = new THREE.Vector3(LOT.x, this.Y, LOT.z);
  }
  spot(i) { return { pos: new THREE.Vector3(LOT.x - 9 + i * 6, this.Y, LOT.z + 2), yaw: Math.PI }; }
  build() {
    const R = this.root, Y = this.Y;
    // office cabin + sign + bunting
    const wallM = new THREE.MeshStandardMaterial({ color: 0xe8e0c8, roughness: 0.85 });
    box(R, 5, 2.8, 3.5, wallM, LOT.x + 10, Y + 1.4, LOT.z + 9); addCollider(LOT.x + 7.5, Y, LOT.z + 7.25, LOT.x + 12.5, Y + 2.8, LOT.z + 10.75);
    box(R, 5.6, 0.2, 4.1, MAT.blackPaint, LOT.x + 10, Y + 2.9, LOT.z + 9);
    box(R, 1.6, 0.9, 0.05, MAT.glass, LOT.x + 9, Y + 1.6, LOT.z + 7.22);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.1), new THREE.MeshStandardMaterial({ map: labelTex('HUTTUSEN AUTOLIIKE · USED CARS', 768, 140, '#c01818', '#ffffff', 'bold 58px Arial'), roughness: 0.6 }));
    sign.position.set(LOT.x, Y + 3.6, LOT.z - 10); sign.rotation.y = Math.PI; R.add(sign);
    for (const d of [-2.8, 2.8]) cyl(R, 0.08, 4.1, MAT.steel, LOT.x + d, Y + 2.05, LOT.z - 9.95, 'y', 8);
    const flagM = [0xd02020, 0xf0d020, 0x2050d0, 0xf0f0f0].map((c) => new THREE.MeshStandardMaterial({ color: c, side: THREE.DoubleSide }));
    for (let i = 0; i < 16; i++) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.35, 3), flagM[i % 4]); f.position.set(LOT.x - 12 + i * 1.6, Y + 2.8 - Math.sin(i / 15 * Math.PI) * 0.4, LOT.z - 4); f.rotation.x = Math.PI; R.add(f); }
    for (const x of [-12.5, 12.5]) cyl(R, 0.05, 3, MAT.steel, LOT.x + x, Y + 1.5, LOT.z - 4, 'y', 6);
    // price boards in front of each spot
    CARS.forEach((c, i) => {
      const p = this.spot(i).pos;
      const b = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.5), new THREE.MeshStandardMaterial({ map: labelTex(`${c.name} · ${c.price} mk`, 384, 128, '#ffffff', '#c01818', 'bold 34px Arial') }));
      b.position.set(p.x, Y + 0.9, p.z - 3.2); b.rotation.y = Math.PI; R.add(b); this[`board${i}`] = b;
      cyl(R, 0.03, 0.7, MAT.steel, p.x, Y + 0.35, p.z - 3.22, 'y', 6);
    });
    // the salesman
    const m = personModel(0x8a6a3a, 0x3a3a3a, npcFace(mulberry32(91), 2), null);
    m.g.position.set(LOT.x + 8, Y, LOT.z + 5.5); m.g.rotation.y = Math.PI * 1.1; R.add(m.g);
    m.g.traverse((o) => { if (o.isMesh) o.userData.interact = { prompt: () => `${K('E')}Talk to Hessu Huttunen <span class="dim">(used cars)</span>`, use: (b) => b === 'E' && this.talk() }; });
  }
  makeCar(c, i) {
    const g = this.game, s = this.spot(i);
    const v = new WorkVehicle(g, {
      name: c.name, pos: s.pos.clone(), yaw: s.yaw, maxSpeed: c.max, accel: c.accel, turn: c.turn, len: 4.4, wid: 1.75, eye: [0.36, 1.2, -0.38], wheels: [], car: true,
      build: (o, veh) => {
        const { o: body, wheels } = carModel(c.color, this.lamps, this.tails);
        o.add(body);
        if (c.stripes) for (const sx of [-0.2, 0.2]) { const sm = new THREE.MeshStandardMaterial({ color: c.stripes, roughness: 0.4 }); box(o, 0.16, 0.012, 1.15, sm, sx, 0.915, 1.5); box(o, 0.16, 0.012, 1.3, sm, sx, 1.39, -0.37); }
        // driver's view: dashboard, wheel, roof lining, seats
        box(o, 1.5, 0.16, 0.35, MAT.blackPaint, 0, 0.84, 0.82);
        const sw = cyl(o, 0.16, 0.03, MAT.blackPaint, 0.36, 0.92, 0.52, 'z', 16); sw.rotation.x = -0.45;
        // see-through glass from the inside (the traffic cars' glass is opaque)
        const clear = new THREE.MeshStandardMaterial({ color: 0x9ab0c0, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false });
        body.traverse((m) => { if (m.isMesh && m.material?.metalness === 0.9 && m.material.roughness === 0.08) m.material = clear; });
        box(o, 1.5, 0.03, 1.3, MAT.interior, 0, 1.34, -0.35);
        for (const x of [-0.36, 0.36]) { box(o, 0.48, 0.12, 0.5, MAT.seat, x, 0.55, -0.35); box(o, 0.48, 0.6, 0.12, MAT.seat, x, 0.88, -0.62); }
        wheels.forEach((w) => { w.userData.r = 0.32; });
        veh.extWheels = wheels;
      },
      canDrive: () => { if (this.owned[c.id]) return true; this.offer(c); return false; },
      actionPrompt: () => (this.owned[c.id] ? '' : `\n<span class="dim">For sale: ${fmtMoney(c.price)} — E to look at it</span>`),
    });
    v.carDef = c;
    return v;
  }
  offer(c) {
    const g = this.game;
    g.ui.dialog(`${c.name} — ${fmtMoney(c.price)}`, `${c.blurb}\n\nTop speed about ${Math.round(c.max * 3.6)} km/h. No engine to build — get in and go. Hessu buys it back for ${Math.round(SELL * 100)} %.`, [
      { label: `Buy it (${fmtMoney(c.price)})`, go: () => this.buy(c) },
      { label: 'Just looking', go: () => {} },
    ]);
  }
  buy(c) {
    const g = this.game;
    if (g.money < c.price) { g.say(`Hessu: "${fmtMoney(c.price)}, friend. Come back when your wallet agrees."`, 4); return; }
    g.addMoney(-c.price, `Bought a ${c.name}`);
    this.owned[c.id] = true;
    const i = CARS.indexOf(c); if (this[`board${i}`]) this[`board${i}`].visible = false;
    g.ach?.unlock('second_car');
    g.say(`Hessu: "She's all yours! Keys are in it." — the ${c.name} is yours. E to drive.`, 5);
  }
  talk() {
    const g = this.game, mine = CARS.filter((c) => this.owned[c.id]);
    const opts = mine.map((c) => {
      const v = this.cars[CARS.indexOf(c)], here = v.pos.distanceTo(g.dealerPos) < 30;
      return { label: `Sell the ${c.name} back — ${fmtMoney(Math.round(c.price * SELL))}${here ? '' : ' (bring it to the lot)'}`, go: () => this.sell(c) };
    });
    g.ui.dialog('Hessu Huttunen (used cars)', `Best used cars in the parish! ${CARS.filter((c) => !this.owned[c.id]).map((c) => `${c.name} ${fmtMoney(c.price)}`).join(', ') || 'You\'ve bought everything I had!'}. Have a look — E on any car.`, [...opts, { label: 'Just looking', go: () => {} }]);
  }
  sell(c) {
    const g = this.game, i = CARS.indexOf(c), v = this.cars[i];
    if (v.pos.distanceTo(g.dealerPos) > 30) { g.say('Hessu: "I\'ll need to see the car, friend. Drive it over."', 4); return; }
    if (v.driving) v.exit(true);
    this.owned[c.id] = false;
    const s = this.spot(i); v.pos.copy(s.pos); v.yaw = s.yaw; v.place();
    if (this[`board${i}`]) this[`board${i}`].visible = true;
    g.addMoney(Math.round(c.price * SELL), `Sold the ${c.name} to Hessu`);
  }
  update(dt, input) {
    const night = this.game.sky?.dayLight < 0.35;
    this.lamps.emissiveIntensity = night ? 2 : 0; this.tails.emissiveIntensity = night ? 1.2 : 0;
    for (const v of this.cars) v.update(dt, input);
  }
  serialize() { return { owned: this.owned, cars: this.cars.map((v) => v.serialize()) }; }
  restore(d) {
    if (!d) return;
    this.owned = d.owned || {};
    (d.cars || []).forEach((s, i) => { const v = this.cars[i]; if (v && this.owned[CARS[i].id]) v.restore(s); });
    CARS.forEach((c, i) => { if (this[`board${i}`]) this[`board${i}`].visible = !this.owned[c.id]; });
  }
}
