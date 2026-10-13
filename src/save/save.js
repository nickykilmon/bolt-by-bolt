// Versioned localStorage save / load with validation.
import { DEFS } from '../mechanics/partsdb.js';
import { breakPart } from '../mechanics/problems.js';

export const SAVE_KEY = 'jcscar.save';
export const SAVE_VERSION = 1;

export function hasSave() {
  try { const s = localStorage.getItem(SAVE_KEY); return !!s && JSON.parse(s).v === SAVE_VERSION; } catch { return false; }
}

export function writeSave(game) {
  const g = game;
  const data = {
    v: SAVE_VERSION,
    at: Date.now(),
    asm: g.asm.serialize(),
    car: g.car.serialize(),
    player: { pos: g.player.pos.toArray(), yaw: g.player.yaw, pitch: g.player.pitch, inCar: g.player.inCar },
    held: g.interaction.held?.uid || null,
    life: g.life.serialize(),
    money: g.money, ledger: g.ledger.slice(-60), orders: g.orders, nextOrder: g.nextOrder,
    inventory: g.inventory, basket: g.basket,
    jack: { p: g.jack.obj.position.toArray(), r: g.jack.obj.rotation.y },
    hoist: { p: g.hoist.obj.position.toArray(), r: g.hoist.obj.rotation.y, h: g.hoist.height },
    drawers: g.drawers.map((d) => !!d.userData.openTarget),
    ctl: { ign: g.ctl.ign, gear: g.ctl.gear },
    weather: g.weather,
    rally: g.rally.serialize(),
    jobs: g.jobs.serialize(), moped: g.moped.serialize(), guide: g.guide.serialize(),
    profile: g.profile,
    pets: g.pets.serialize(),
    ach: g.ach.serialize(), stats: g.stats, fightclub: g.fightclub.serialize(), police: g.police.serialize(),
  };
  const json = JSON.stringify(data);
  const prev = localStorage.getItem(SAVE_KEY);
  if (prev) localStorage.setItem(SAVE_KEY + '.bak', prev);
  localStorage.setItem(SAVE_KEY, json);
  return json.length;
}

export function readSave() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return null;
  const d = JSON.parse(raw);
  if (d.v !== SAVE_VERSION) throw new Error(`Save version ${d.v} is not supported (expected ${SAVE_VERSION})`);
  if (!Array.isArray(d.asm)) throw new Error('Save is missing the assembly data');
  return d;
}

// Rebuild the world state from save data. The car and stand roots already exist.
export function applySave(game, d) {
  const asm = game.asm;
  const items = d.asm.filter((x) => DEFS[x.d]);
  const dropped = d.asm.length - items.length;
  if (dropped) console.warn(`Save: ${dropped} items with unknown definitions were skipped`);
  // 1) create
  for (const x of items) {
    let it = asm.get(x.u);
    if (it) { it.props = { ...it.props, ...x.p }; it.cond = x.c; continue; } // roots
    it = asm.create(x.d, { uid: x.u, cond: x.c, known: !!x.k, props: x.p });
  }
  // 2) place / install
  for (const x of items) {
    const it = asm.get(x.u);
    if (it.def.kind === 'root') continue;
    if (x.s) {
      const host = asm.get(x.s.host);
      if (!host) { console.warn('Save: host missing for', x.u); asm.placeWorld(it, [2, 0.1, 2], 0); continue; }
      asm.install(it, host, x.s.id);
      x.f.forEach((f, i) => { if (it.fast[i]) { it.fast[i].in = !!f[0]; it.fast[i].q = f[1]; it.fast[i].s = !!f[2]; } });
      asm.refreshFasteners(it);
      asm.applyOpen(it);
    } else if (x.l?.kind === 'world') asm.placeWorld(it, x.l.pos, x.l.yaw, asm.containers.has(x.l.cont) ? x.l.cont : null);
    else if (x.l?.kind === 'inv') asm.setInventory(it);
    else if (x.l?.kind === 'hoist') asm.setHoist(it);
    else if (x.l?.kind === 'held') { /* handled below */ }
    else asm.placeWorld(it, [2, 0.1, 2], 0);
    if (it.def.type === 'cam_sprocket' || it.def.type === 'crank_sprocket') asm.updateSprocket(it);
  }
  game.car.restore(d.car);
  game.life.restore(d.life);
  game.money = d.money; game.ledger = d.ledger || []; game.orders = d.orders || []; game.nextOrder = d.nextOrder || 1;
  game.inventory = (d.inventory || []).filter((u) => asm.get(u));
  game.basket = d.basket || [];
  game.jack.obj.position.fromArray(d.jack.p); game.jack.obj.rotation.y = d.jack.r;
  game.hoist.obj.position.fromArray(d.hoist.p); game.hoist.obj.rotation.y = d.hoist.r; game.hoist.height = d.hoist.h || 0; game.hoist.boom.rotation.x = -game.hoist.height;
  (d.drawers || []).forEach((o, i) => { if (game.drawers[i]) game.drawers[i].userData.openTarget = o; });
  game.player.pos.fromArray(d.player.pos); game.player.yaw = d.player.yaw; game.player.pitch = d.player.pitch;
  game.ctl.ign = d.ctl?.ign || 0; game.ctl.gear = d.ctl?.gear || 0;
  if (d.weather) game.weather = d.weather;
  game.rally.restore(d.rally);
  game.jobs.restore(d.jobs);
  game.moped.restore(d.moped);
  game.guide.restore(d.guide);
  game.npcs.placeAll();
  game.pets.restore(d.pets);
  game.fightclub.restore(d.fightclub);
  game.police.restore(d.police);
  game.ach.restore(d.ach); game.stats = d.stats || {};
  game.car.reapplyShellDents();
  for (const it of asm.items.values()) if (Math.abs(it.props.bent || 0) > 0.003 && !it.props.broken) { breakPart(it); asm.buildVisual(it); asm.applyOpen?.(it); }
  if (game.stand.props.flipped && game.stand.kids.engine) game.asm.anchor(game.stand, 'engine').rotation.z = Math.PI;
  if (d.held) { const h = asm.get(d.held); if (h) game.interaction.hold(h); }
  if (d.player.inCar) game.enterCar();
  asm.changed();
}
