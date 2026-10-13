// Build guide: works out the next job from the real state of the car and parts, shows it
// top-left, and marks (through walls) what to grab, which tool, where it goes and every
// bolt that still needs tightening.
import * as THREE from 'three';
import { DEFS, slotById, fastenerList, SIZE_LABEL } from '../mechanics/partsdb.js';
import { TIGHT_OK } from '../mechanics/assembly.js';
import { installRepair } from './repair.js';

// once the car has been built, the late build steps read as upkeep, not as starting over
const AFTER = { 'Fill the cooling system': 'Top up the coolant', 'Lower the car back onto its wheels': 'Lower the car back down when you’re done underneath', 'Fill the engine with oil': 'Top up the engine oil', 'Fill the gearbox with gear oil': 'Top up the gear oil', 'Fill the brake fluid': 'Top up the brake fluid' };
const COL = { grab: '#ffd23c', go: '#4ad8ff', tool: '#ff9a3c', bolt: '#ff7a2a', done: '#5ce05c' };

function makeLabelTex(text, col) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.font = 'bold 34px Arial';
  const w = Math.min(500, g.measureText(text).width + 34);
  g.fillStyle = 'rgba(10,10,10,0.75)'; g.beginPath(); g.roundRect?.((512 - w) / 2, 6, w, 52, 10); g.fill();
  g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 256, 33);
  g.beginPath(); g.moveTo(236, 72); g.lineTo(276, 72); g.lineTo(256, 112); g.closePath(); g.fill();
  g.strokeStyle = '#000'; g.lineWidth = 3; g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const dotTexCache = {};
function dotTex(col) {
  if (dotTexCache[col]) return dotTexCache[col];
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.strokeStyle = '#000'; g.lineWidth = 8; g.beginPath(); g.arc(32, 32, 22, 0, 7); g.stroke();
  g.strokeStyle = col; g.lineWidth = 5; g.beginPath(); g.arc(32, 32, 22, 0, 7); g.stroke();
  g.fillStyle = col; g.beginPath(); g.arc(32, 32, 6, 0, 7); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return (dotTexCache[col] = t);
}

export class Guide {
  constructor(game) {
    this.game = game;
    this.hidden = false;
    this.started = false; // engine has run at least once
    this.group = new THREE.Group(); this.group.renderOrder = 999;
    game.scene.add(this.group);
    this.labels = []; this.dots = [];
    this.el = document.getElementById('guide');
    this.t = 0; this.cur = null;
    this.steps = this.buildSteps();
  }

  // ---------------- helpers ----------------
  get asm() { return this.game.asm; }
  get car() { return this.game.car; }
  get C() { return this.game.car.chassis; }
  block() { for (const it of this.asm.items.values()) if (it.def.type === 'block' && !it.props.forSale && !this.isJobItem(it)) return it; return null; }
  isJobItem(it) { return (this.game.jobs?.workshop?.items || []).includes(it.uid) || this.asm.isAncestor && (this.game.jobs?.workshop?.items || []).some((u) => { const j = this.asm.get(u); return j && this.asm.isAncestor(j, it); }); }
  wp(obj) { obj.updateWorldMatrix(true, false); return obj.getWorldPosition(new THREE.Vector3()); }
  center(inst) { const b = new THREE.Box3().setFromObject(inst.obj); return b.isEmpty() ? this.wp(inst.obj) : b.getCenter(new THREE.Vector3()); }
  slotPos(host, slot) { return new THREE.Vector3().setFromMatrixPosition(this.asm.slotWorldMatrix(host, slot)); }
  fillPos(inst) { let p = null; inst.vis?.traverse((o) => { if (o.userData.fill && !p) p = this.wp(o); }); return p || this.center(inst); }
  // best loose (or held / pocketed) item of a type, optionally needing a minimum condition
  pick(type, minCond = 0, defId = null) {
    const held = this.game.interaction.held;
    if (held && held.def.type === type && held.cond >= minCond && !(held.def.kind === 'part' && (held.props.broken || held.cond < 0.2)) && (!defId || held.def.id === defId)) return held;
    let best = null;
    for (const it of this.asm.items.values()) {
      if (it.def.type !== type || it.slot || it.props.forSale || this.isJobItem(it) || (defId && it.def.id !== defId)) continue;
      if (it.def.kind === 'part' && (it.props.broken || it.cond < 0.2)) continue; // scrap — never refit it
      if (it.loc?.kind === 'hoist') continue;
      if (it.cond < minCond) continue;
      const p = it.loc?.kind === 'inv' ? this.game.player.pos : it.obj.getWorldPosition(new THREE.Vector3());
      it._score = it.cond - p.distanceTo(this.game.player.pos) / 150;
      if (!best || it._score > best._score) best = it;
    }
    return best;
  }
  // target for an item: open the drawer first if it's shut inside one
  itemTarget(it, verb = 'Grab') {
    const name = it.def.name;
    if (it.loc?.kind === 'inv') return { kind: 'note', text: `${name} is in your pockets — press I and take it out` };
    const cont = it.loc?.cont;
    if (cont && cont.startsWith('drawer')) {
      const d = this.game.drawers[+cont.slice(6) - 1];
      if (d && !d.userData.openTarget) return { kind: 'mark', pos: this.wp(d.children[0]), text: `Open drawer ${cont.slice(6)}`, col: COL.grab };
    }
    if (cont === 'fridge') return { kind: 'mark', pos: this.center(it), text: `${verb}: ${name} (fridge)`, col: COL.grab };
    return { kind: 'mark', pos: this.center(it), text: `${verb}: ${short(name)}`, col: COL.grab };
  }
  // what to do to have the right tool for a fastener group
  toolFor(size) {
    const it = this.game.interaction, held = it.held;
    const have = it.toolSize();
    if (size === 'hand') return held ? { text: 'Use empty hands — press G to put down what you\'re holding', targets: [] } : null;
    if (held && have === size && held.def.kind === 'tool') return null;
    if (typeof size === 'number') {
      if (size === 19) { const lw = this.pick('lug_wrench'); return { text: 'Get the 19 mm lug wrench', targets: lw ? [this.itemTarget(lw)] : [] }; }
      if (held && (held.def.type === 'ratchet' || held.def.type === 'torque_wrench')) {
        const kase = this.pick('socket_case');
        return { text: `Fit the ${size} mm socket: look at the socket case and press E (or scroll near it)`, targets: kase ? [{ ...this.itemTarget(kase, 'Socket case'), col: COL.tool, text: `${size} mm socket` }] : [] };
      }
      const r = this.pick('ratchet') || this.pick('torque_wrench');
      return { text: `Get the ratchet${r?.loc?.cont === 'drawer1' ? ' (red toolbox, top drawer)' : r?.props.owner === 'esa' ? " (Esa's tool table)" : ' (marked)'} for the ${size} mm bolts${held ? ' — put down what you\'re holding first (G)' : ''}`, targets: r ? [{ ...this.itemTarget(r), col: COL.tool }] : [] };
    }
    const type = size === 'flat' || size === 'ph' ? 'screwdriver' : size === 'plug' ? 'plug_socket' : null;
    let tool = null, bd = Infinity;
    for (const x of this.asm.items.values()) {
      if (x.def.type !== type || x.def.size !== size || x.slot) continue;
      const d = (x.loc?.kind === 'inv' ? this.game.player.pos : x.obj.getWorldPosition(new THREE.Vector3())).distanceTo(this.game.player.pos);
      if (d < bd) { bd = d; tool = x; }
    }
    return { text: `Get the ${SIZE_LABEL(size)}${tool?.loc?.cont === 'drawer2' ? ' (red toolbox, drawer 2)' : tool?.props.owner === 'esa' ? " (Esa's tool table)" : ' (marked)'}${held ? ' — put down what you\'re holding first (G)' : ''}`, targets: tool ? [{ ...this.itemTarget(tool), col: COL.tool }] : [] };
  }
  // fasteners still to tighten (or loosen) on an installed part
  fastenerJob(inst, loosen = false) {
    const s = this.asm.slotDef(inst);
    if (!s) return null;
    const todo = [];
    for (const { i, g } of fastenerList(s)) {
      const f = inst.fast[i];
      const bad = loosen ? f?.in : (!f?.in || f.s || f.q < TIGHT_OK);
      if (bad) todo.push({ i, g, f });
    }
    if (!todo.length) return null;
    // work one tool size at a time (prefer the size of the tool already in hand)
    const have = this.game.interaction.toolSize();
    const g0 = (todo.find((t) => t.g.size === have) || todo[0]).g;
    const cur = todo.filter((t) => t.g.size === g0.size);
    const later = todo.filter((t) => t.g.size !== g0.size);
    const dots = cur.map((t) => ({ pos: this.wp(inst.fastMeshes[t.i]), col: t.f?.s ? '#a04020' : COL.bolt }));
    const sameSize = [...fastenerList(s)].filter((x) => x.g.size === g0.size).length;
    const total = sameSize, done = sameSize - cur.length;
    const thenText = later.length ? ` Then ${later.length} × ${SIZE_LABEL(later[0].g.size)}${later[0].g.name ? ' (' + later[0].g.name + ')' : ''}.` : '';
    const stripped = cur.some((t) => t.f?.s);
    let kit = null;
    if (stripped) { let bd = 1e9; for (const it of this.asm.items.values()) if (it.def.id === 'bolt_kit' && !it.slot) { const d = it.obj.getWorldPosition(new THREE.Vector3()).distanceTo(this.game.player.pos); if (d < bd) { bd = d; kit = it; } } }
    const holdingKit = this.game.interaction.held?.def.id === 'bolt_kit';
    const tool = stripped ? (holdingKit ? { text: 'A thread is stripped (brown ring): press LMB on it with the bolt kit to fit a new bolt', targets: [] } : { text: 'A thread is stripped (brown ring) — grab a bolt kit (marked) and press LMB on the stripped bolt', targets: kit ? [this.itemTarget(kit)] : [] }) : this.toolFor(g0.size);
    const verb = loosen ? 'Undo' : g0.size === 'hand' ? 'Connect' : g0.size === 'flat' ? 'Tighten the clamps on' : 'Tighten';
    return { verb, g0, dots, done, total, tool, sizeText: SIZE_LABEL(g0.size), thenText };
  }
  hoodBlock() {
    const h = this.C.kids.hood;
    if (h && !h.props.open) return { text: 'Open the bonnet (E on the bonnet)', targets: [{ kind: 'mark', pos: this.center(h), text: 'Open bonnet', col: COL.go }] };
    return null;
  }

  // ---------------- step factories ----------------
  // install `type` into slot of host, then tighten its fasteners
  fit(title, getHost, slot, type, o = {}) {
    return {
      title,
      state: () => {
        const host = getHost();
        if (!host) return { done: false, blocked: true };
        const inst = host.kids[slot];
        const sum = inst ? this.asm.fastenerSummary(inst) : null;
        if (inst && sum.secure) return { done: true };
        if (o.car && !inst) { const hb = this.hoodBlock(); if (hb && o.bay) return hb; }
        if (o.under && !this.underOk()) return this.raiseGuide();
        if (!inst) {
          const item = this.pick(type, o.minCond || 0, o.defId);
          if (!item) return this.buyGuide(type, o.minCond);
          if (!this.asm.checkInstall(item, host, slot).ok) return { blocked: true }; // something else has to go on first
          const held = this.game.interaction.held;
          if (held !== item) {
            if (held) return { text: `Put down the ${short(held.def.name)} (G) and grab the ${short(item.def.name)}`, targets: [this.itemTarget(item)] };
            return { text: `Grab the ${short(item.def.name)}${item.def.mass > 20 ? ' (heavy — you\'ll walk slowly)' : ''}`, targets: [this.itemTarget(item)] };
          }
          const sp = this.slotPos(host, slot);
          const chk = this.asm.checkInstall(item, host, slot);
          return { text: `Fit it: look at the green ghost and press LMB${o.tip ? '. ' + o.tip : ''}${!chk.ok ? ` (${chk.reasons[0]})` : ''}`, targets: [{ kind: 'mark', pos: sp, text: `Fit ${short(item.def.name)} here`, col: COL.go }] };
        }
        const fj = this.fastenerJob(inst);
        if (!fj) return { done: true };
        const tgt = [];
        let text = fj.g0.size === 'hand' ? `Connect ${fj.total - fj.done} more by hand: empty hands, LMB on each marked clip (${fj.done}/${fj.total})`
          : fj.g0.size === 'flat' ? `Tighten ${fj.total - fj.done} hose clamp(s) with the flat screwdriver: LMB on each marked clamp (${fj.done}/${fj.total})`
          : `Tighten ${fj.total - fj.done} × ${fj.sizeText}: hold LMB on each marked bolt until the bar is green (${fj.done}/${fj.total} done, ${fj.g0.torque} Nm)`;
        text += fj.thenText;
        if (fj.tool) { text = fj.tool.text; tgt.push(...fj.tool.targets); }
        return { text, targets: tgt, dots: fj.dots };
      },
    };
  }
  fluid(title, level, need, fluid, targetInst, o = {}) {
    return {
      title,
      state: () => {
        const tgt = targetInst();
        if (!tgt) return { done: false, blocked: true };
        const lv = level();
        if (lv >= need) return { done: true };
        if (o.car) { const hb = this.hoodBlock(); if (hb) return hb; }
        const held = this.game.interaction.held;
        const fp = this.fillPos(tgt);
        if (held?.def.type === 'fluid' && held.def.fluid === fluid && (held.props.amount > 0.01 || held.def.infinite)) {
          return { text: `Hold LMB on the ${o.capName || 'filler cap'} to pour (${lv.toFixed(1)} / ${need} L)`, targets: [{ kind: 'mark', pos: fp, text: `Pour here (${lv.toFixed(1)}/${need} L)`, col: COL.go }] };
        }
        let best = null;
        for (const it of this.asm.items.values()) if (it.def.type === 'fluid' && it.def.fluid === fluid && !it.def.infinite && (it.props.amount || 0) > 0.05 && !this.isJobItem(it)) if (!best || it.props.amount > best.props.amount) best = it;
        if (!best) return this.buyGuide(fluid === 'oil' ? 'oil_jug' : fluid === 'coolant' ? 'coolant_jug' : fluid === 'gearoil' ? 'gear_oil' : fluid === 'brake' ? 'brake_fluid' : 'jerrycan', 0, true);
        return { text: `${held ? 'Put down what you\'re holding (G), then g' : 'G'}rab the ${short(best.def.name)} (${best.props.amount.toFixed(1)} L)`, targets: [this.itemTarget(best)] };
      },
    };
  }
  buyGuide(typeOrId, minCond = 0, isId = false) {
    const def = isId ? DEFS[typeOrId] : Object.values(DEFS).find((d) => d.type === typeOrId && d.shop && d.kind === 'part' && !['Performance'].includes(d.cat)) || Object.values(DEFS).find((d) => d.type === typeOrId);
    const name = def ? def.name : typeOrId;
    const g = this.game;
    return { buy: true, need: name };
  }
  pcPos() { return new THREE.Vector3(-11.0, 1.1, -4.6); }
  underOk() { const s = this.car.support; return s.F.stands && s.R.stands; }
  raiseGuide() {
    const g = this.game, s = this.car.support;
    const ax = !s.F.stands ? 'F' : 'R';
    const name = ax === 'F' ? 'front' : 'rear';
    const jp = g.jackPoint(ax);
    const stands = [...this.asm.items.values()].filter((i) => i.def.type === 'axle_stands' && i.uid !== s.F.standsUid && i.uid !== s.R.standsUid);
    const pre = 'Underneath the car: raise both ends onto axle stands. ';
    if (s[ax].lift < 0.2) {
      if (g.jackAxle() !== ax) return { text: pre + `Grab the floor jack by its handle (E) and push it under the ${name} ${ax === 'F' ? 'crossmember' : 'axle'}.`, targets: [{ kind: 'mark', pos: this.wp(g.jack.obj).add(new THREE.Vector3(0, 0.6, 0)), text: 'Floor jack', col: COL.grab }, { kind: 'mark', pos: jp, text: `Jack point (${name})`, col: COL.go }] };
      return { text: pre + `Pump the jack: hold LMB while holding the jack handle (or looking at it) until the ${name} is high.`, targets: [{ kind: 'mark', pos: jp, text: 'Pump (LMB)', col: COL.go }] };
    }
    if (!stands.length) return { text: pre + 'You need another pair of axle stands — order them on the computer.', targets: [{ kind: 'mark', pos: this.pcPos(), text: 'Computer', col: COL.go }] };
    const st = stands[0];
    if (g.interaction.held !== st) return { text: pre + `Grab a pair of axle stands${g.player.pushing ? ' (let go of the jack first: E)' : ''}.`, targets: [this.itemTarget(st)] };
    return { text: pre + `Stand beside the ${name} and press LMB to put the stands under it.`, targets: [{ kind: 'mark', pos: jp, text: `Place stands (${name})`, col: COL.go }] };
  }

  // ---------------- the build ----------------
  buildSteps() {
    const B = () => this.block();
    const H = () => this.block()?.kids.head || [...this.asm.items.values()].find((i) => i.def.type === 'cylinder_head' && !i.slot && !i.props.forSale && !this.isJobItem(i)) || null;
    const onStandOrCar = () => { const b = B(); return b && b.slot ? this.asm.hostOf(b) : null; };
    const inCar = () => (this.C.kids.engine ? this.C : null);
    const car = () => this.C;
    const piston4 = () => this.pick('piston') ;
    const steps = [];
    steps.push({
      title: 'Fit new rings to piston #4',
      state: () => {
        const b = B(); if (b?.kids.piston4) return { done: true };
        const p = [...this.asm.items.values()].find((i) => i.def.type === 'piston' && !i.slot && !i.props.forSale && !this.isJobItem(i));
        if (!p) return { done: true };
        if (p.kids.rings && p.kids.rings.cond >= 0.3) return { done: true };
        if (p.kids.rings) return { text: 'Those rings are broken — take them off the piston (E) and put them aside.', targets: [{ kind: 'mark', pos: this.center(p.kids.rings), text: 'Broken rings', col: COL.grab }] };
        const r = this.pick('piston_rings', 0.3);
        if (!r) return this.buyGuide('piston_rings', 0.3);
        if (this.game.interaction.held !== r) return { text: 'Grab the NEW piston ring set (not the broken one on the bench).', targets: [this.itemTarget(r)] };
        return { text: 'Look at piston #4 on the workbench and press LMB to fit the rings.', targets: [{ kind: 'mark', pos: this.center(p), text: 'Piston #4', col: COL.go }] };
      },
    });
    steps.push(this.fit('Fit piston #4 into the block', B, 'piston4', 'piston', { tip: 'Press R until the ARROW on the piston top points to the front (pulley end) — the ghost turns green. Then turn the engine upside down (E on the engine stand) and tighten the 2 rod nuts, which are then on top.' }));
    steps.push(this.fit('Fit the oil pan', B, 'oilPan', 'oil_pan', { tip: 'Easiest with the engine turned upside down (E on the engine stand): the bolts and drain plug then face up. Turn it back upright afterwards.' }));
    steps.push(this.fit('Fit a new oil filter', B, 'oilFilter', 'oil_filter', { tip: 'It screws on by hand: LMB with empty hands.' }));
    steps.push(this.fit('Fit the new head gasket', B, 'headGasket', 'head_gasket', { minCond: 0.3 }));
    steps.push(this.fit('Fit the cylinder head', B, 'head', 'cylinder_head', {}));
    steps.push({
      title: 'Line up the timing marks',
      state: () => {
        const b = B(); const h = b?.kids.head;
        if (!b || !h) return { done: false, blocked: true };
        if (b.kids.timingBelt) return { done: true };
        const cr = b.kids.crankSprocket, cm = h.kids.camSprocket;
        const bad = [cr, cm].filter((x) => x && (x.props.tooth || 0) !== 0);
        if (!bad.length) return { done: true };
        const held = this.game.interaction.held;
        return { text: `${held ? 'Put down what you\'re holding (G). ' : ''}Look at each timing gear with empty hands and turn it with the mouse wheel until the prompt says "Mark lined up ✔".`, targets: bad.map((x) => ({ kind: 'mark', pos: this.center(x), text: `${x.def.type === 'cam_sprocket' ? 'Cam' : 'Crank'} gear: ${x.props.tooth > 0 ? '+' : ''}${x.props.tooth} teeth`, col: COL.go })) };
      },
    });
    steps.push(this.fit('Fit the new timing belt', B, 'timingBelt', 'timing_belt', { minCond: 0.3 }));
    steps.push(this.fit('Fit the timing cover', B, 'timingCover', 'timing_cover', {}));
    steps.push(this.fit('Fit the crank pulley', B, 'crankPulley', 'crank_pulley', { tip: 'The crank bolt takes 110 Nm — keep pulling.' }));
    steps.push(this.fit('Fit the V-belt', B, 'fanBelt', 'fan_belt', {}));
    steps.push(this.fit('Fit the valve cover', H, 'valveCover', 'valve_cover', {}));
    for (const n of [1, 2, 3, 4]) steps.push(this.fit(`Fit spark plug #${n}`, H, 'plug' + n, 'spark_plug', { tip: 'Tighten it with the spark plug socket (drawer 2).' }));
    steps.push(this.fit('Fit the spark plug wires', H, 'plugWires', 'plug_wires', { tip: 'Each boot clips on by hand.' }));
    steps.push(this.fit('Fit the clutch disc', B, 'clutchDisc', 'clutch_disc', {}));
    steps.push(this.fit('Fit the clutch pressure plate', B, 'pressurePlate', 'pressure_plate', {}));
    steps.push(this.fit('Fit the gearbox to the engine', B, 'gearbox', 'gearbox', { tip: 'It goes on the back of the engine, behind the clutch.' }));
    steps.push(this.fluid('Fill the engine with oil', () => B()?.props.oil || 0, 3.7, 'oil', () => B()?.kids.head?.kids.valveCover, { capName: 'oil filler cap on the valve cover' }));
    steps.push(this.fluid('Fill the gearbox with gear oil', () => B()?.kids.gearbox?.props.oil || 0, 1.5, 'gearoil', () => B()?.kids.gearbox, { capName: 'gearbox filler plug (side of the gearbox)' }));
    // engine into the car
    steps.push({
      title: 'Unbolt the engine from the stand', gate: true,
      state: () => {
        const b = B(); if (!b) return { done: false, blocked: true };
        if (this.asm.hostOf(b) !== this.game.stand) return { done: true };
        const fj = this.fastenerJob(b, true);
        if (!fj) return { done: true };
        if (fj.tool) return { text: fj.tool.text, targets: fj.tool.targets, dots: fj.dots };
        return { text: `Undo the ${fj.total - fj.done} stand bolts (${fj.sizeText}) — hold RMB on each.`, targets: [], dots: fj.dots.map((d) => ({ ...d, col: COL.go })) };
      },
    });
    steps.push({
      title: 'Lift the engine with the hoist', gate: true,
      state: () => {
        const b = B(); if (!b) return { done: false, blocked: true };
        if (b.loc?.kind === 'hoist' || this.asm.hostOf(b) === this.C) return { done: true };
        if (this.car.lifted) return { text: 'Lower the car off the jack / stands first — the engine can only go in with the car on its wheels.', targets: [{ kind: 'mark', pos: this.wp(this.C.obj).add(new THREE.Vector3(0, 1.5, 0)), text: 'Lower the car', col: COL.go }] };
        const g = this.game;
        if (g.player.pushing !== g.hoist) return { text: 'Grab the engine hoist (E) and push it so the hook hangs over the engine.', targets: [{ kind: 'mark', pos: this.wp(g.hoist.obj).add(new THREE.Vector3(0, 1.7, 0)), text: 'Engine hoist', col: COL.grab }, { kind: 'mark', pos: this.center(b), text: 'Engine', col: COL.go }] };
        return { text: 'Hook over the engine? Press F to hook it up and lift.', targets: [{ kind: 'mark', pos: this.center(b), text: 'Hook goes over here — F', col: COL.go }] };
      },
    });
    steps.push({
      title: 'Lower the engine into the car', gate: true,
      state: () => {
        const b = B(); if (!b) return { done: false, blocked: true };
        if (this.asm.hostOf(b) === this.C) return { done: true };
        const hb = this.hoodBlock(); if (hb) return hb;
        const g = this.game;
        if (g.player.pushing !== g.hoist) return { text: 'Grab the hoist again (E) to push it.', targets: [{ kind: 'mark', pos: this.wp(g.hoist.obj).add(new THREE.Vector3(0, 1.7, 0)), text: 'Engine hoist', col: COL.grab }] };
        return { text: 'Push the hoist to the car until the engine hangs over the engine bay, then press F to lower it onto the mounts.', targets: [{ kind: 'mark', pos: this.slotPos(this.C, 'engine'), text: 'Engine goes here — F', col: COL.go }] };
      },
    });
    steps.push(this.fit('Bolt the engine to its mounts', inCar, 'engine', 'block', { car: true }));
    steps.push(this.fit('Fit the upper radiator hose', inCar, 'hoseUpper', 'hose_upper', { car: true, bay: true }));
    steps.push(this.fit('Fit the lower radiator hose', inCar, 'hoseLower', 'hose_lower', { car: true, bay: true }));
    steps.push(this.fit('Fit the exhaust downpipe', inCar, 'downpipe', 'downpipe', { car: true, bay: true }));
    steps.push(this.fit('Connect the coil lead', inCar, 'coilLead', 'coil_lead', { car: true, bay: true }));
    steps.push(this.fit('Connect the engine wiring harness', inCar, 'harness', 'engine_harness', { car: true, bay: true }));
    steps.push(this.fit('Fit the fuel line', inCar, 'fuelLine', 'fuel_line', { car: true, bay: true }));
    steps.push(this.fit('Connect the throttle cable', inCar, 'throttleCable', 'throttle_cable', { car: true, bay: true }));
    steps.push(this.fit('Connect the clutch cable', inCar, 'clutchCable', 'clutch_cable', { car: true, bay: true }));
    steps.push(this.fit('Fit the steering wheel', car, 'steeringWheel', 'steering_wheel', { car: true, tip: 'Reach in through the driver\'s door.' }));
    steps.push(this.fit('Fit the gearbox mount (under the car)', inCar, 'gearboxMount', 'gearbox_mount', { car: true, under: true, tip: 'Lie on the creeper (Z) and slide under.' }));
    steps.push(this.fit('Fit the propeller shaft (under the car)', inCar, 'propshaft', 'propshaft', { car: true, under: true, tip: 'Creeper: Z.' }));
    steps.push(this.fit('Fit the mid pipe (under the car)', inCar, 'midpipe', 'midpipe', { car: true, under: true, tip: 'Creeper: Z.' }));
    steps.push(this.fit('Fit the muffler (under the car)', inCar, 'muffler', 'muffler', { car: true, under: true, tip: 'Creeper: Z.' }));
    steps.push({
      title: 'Lower the car back onto its wheels',
      state: () => {
        if (!this.car.lifted) return { done: true };
        const g = this.game, s = this.car.support;
        const ax = s.F.lift > 0.02 ? 'F' : 'R';
        const name = ax === 'F' ? 'front' : 'rear';
        if (g.player.prone) return { text: 'Get up off the creeper first (Z).', targets: [] };
        if (s[ax].stands) {
          if (g.jackAxle() !== ax || s[ax].lift <= 0.245) return { text: `Push the jack under the ${name} and pump it (LMB) to lift the car off the stands, then pick up the stands (E).`, targets: [{ kind: 'mark', pos: g.jackPoint(ax), text: `Jack the ${name} up a little`, col: COL.go }] };
          const st = this.asm.get(s[ax].standsUid);
          return { text: `Now pick up the ${name} axle stands (E).`, targets: st ? [this.itemTarget(st, 'Pick up')] : [] };
        }
        return { text: `Lower the ${name}: hold the jack handle and press RMB.`, targets: [{ kind: 'mark', pos: g.jackPoint(ax), text: 'Release jack (RMB)', col: COL.go }] };
      },
    });
    steps.push({ gate: true, ...this.fluid('Fill the cooling system', () => this.C.props.coolant || 0, 5.5, 'coolant', () => this.C.kids.radiator, { car: true, capName: 'radiator cap' }) });
    steps.push({
      title: 'Start the engine!', gate: true,
      state: () => {
        if (this.started) return { done: true };
        const g = this.game;
        const S = this.car.systems();
        const sev = S.issues.filter((i) => i.sev >= 3);
        if (sev.length) return { text: `Hold Tab at the car: still a problem — ${sev[0].text}.`, targets: [] };
        if (!g.player.inCar) return { text: 'Close the bonnet if you like, then get in: E at the driver\'s door.', targets: [{ kind: 'mark', pos: this.C.obj.localToWorld(new THREE.Vector3(0.9, 1.2, 0)), text: 'Get in (E)', col: COL.go }] };
        return { text: g.ctl.ign ? 'Hold T to crank the engine.' : 'Tap T to switch the ignition on, then HOLD T to crank.', targets: [] };
      },
    });
    steps.push({
      title: 'Take it for a drive', gate: true,
      state: () => {
        if (this.driven) return { done: true };
        if (this.car.speed > 8) this.driven = true;
        return { text: 'Release the handbrake (Space), hold Shift (clutch) and press 1 for 1st gear, then ease off Shift while pressing W. Head down the driveway — Ruskala is east along Route 54.', targets: [] };
      },
    });
    return steps;
  }

  // what still has to be bought (and isn't owned or on order), with prices
  shoppingItems() {
    const out = [];
    const b = this.block();
    const add = (id, qty = 1) => { if (qty > 0) out.push({ id, qty, name: DEFS[id].name, price: DEFS[id].price * qty }); };
    const have = (type, minCond = 0) => [...this.asm.items.values()].some((i) => i.def.type === type && i.cond >= minCond && !i.props.forSale && !this.isJobItem(i));
    const ordered = (type) => this.game.orders.some((o) => o.items.some((id) => DEFS[id].type === type));
    const need = (type, id, minCond = 0) => { if (!have(type, minCond) && !ordered(type)) add(id); };
    if (b && !b.kids.headGasket) need('head_gasket', 'head_gasket_16', 0.3);
    if (!b?.kids.piston4 || !b.kids.piston4.kids.rings) {
      const ok = [...this.asm.items.values()].some((i) => i.def.type === 'piston_rings' && i.cond >= 0.3 && !(this.asm.hostOf(i)?.def.type === 'piston' && this.asm.hostOf(i)?.slot));
      if (!ok && !ordered('piston_rings')) add('rings_16');
    }
    if (b && !b.kids.oilFilter) need('oil_filter', 'oil_filter');
    if (b && !b.kids.timingBelt) need('timing_belt', 'timing_belt', 0.3);
    const head = b?.kids.head || [...this.asm.items.values()].find((i) => i.def.type === 'cylinder_head' && !this.isJobItem(i) && !i.props.forSale);
    if (head) {
      const empty = [1, 2, 3, 4].filter((n) => !head.kids['plug' + n]).length;
      const spare = [...this.asm.items.values()].filter((i) => i.def.type === 'spark_plug' && !i.slot && !this.isJobItem(i) && !i.props.forSale).length + this.game.orders.reduce((n, o) => n + o.items.filter((id) => id === 'spark_plug').length, 0);
      add('spark_plug', empty - spare);
    }
    const fluidHave = (f) => [...this.asm.items.values()].reduce((t, i) => t + (i.def.type === 'fluid' && i.def.fluid === f && !i.def.infinite ? i.props.amount || 0 : 0), 0) + this.game.orders.reduce((t, o) => t + o.items.filter((id) => DEFS[id].fluid === f).reduce((u, id) => u + DEFS[id].cap, 0), 0);
    if (b && (b.props.oil || 0) + fluidHave('oil') < 3.7) add('oil_jug');
    const coolNeed = 6 - (this.C.props.coolant || 0) - fluidHave('coolant');
    if (coolNeed > 0.5) add('coolant_jug', Math.ceil(coolNeed / 5));
    const stands = [...this.asm.items.values()].filter((i) => i.def.type === 'axle_stands').length + this.game.orders.reduce((n, o) => n + o.items.filter((id) => id === 'axle_stands').length, 0);
    if (stands < 2 && !(this.C.kids.muffler && this.C.kids.propshaft && this.C.kids.gearboxMount && this.C.kids.midpipe)) add('axle_stands');
    return out;
  }
  shoppingList() { return this.shoppingItems().map((x) => (x.qty > 1 ? `${x.name} ×${x.qty}` : x.name)); }

  // when nothing else can be done: buy parts, or earn the money for them, or wait for the van
  moneyStep() {
    const g = this.game;
    const items = this.shoppingItems();
    const fmt = (v) => Math.round(v).toLocaleString('fi-FI') + ' mk';
    if (items.length) {
      const total = items.reduce((t, x) => t + x.price, 0) + 25;
      const list = items.map((x) => `${x.qty > 1 ? x.qty + '× ' : ''}${short(x.name)} (${fmt(x.price)})`).join(', ');
      if (g.money >= total) return { st: { title: 'Order the parts you still need' }, s: { text: `You've done everything you can with what you have. Order on the computer in the house (Parts shop → Add each → Order basket): ${list}. Total ${fmt(total)} incl. delivery — you have ${fmt(g.money)}.`, targets: [{ kind: 'mark', pos: this.pcPos(), text: 'Computer: order parts', col: COL.go }] } };
      const short_ = total - g.money;
      const sp = g.npcSpots || {};
      const job = (pos, label) => pos ? [{ kind: 'mark', pos: pos.clone().add(new THREE.Vector3(0, 2.2, 0)), text: `${label} — ${Math.round(pos.distanceTo(g.camera.position))} m`, col: COL.grab }] : [];
      return { st: { title: `Earn ${fmt(short_)} for parts` }, s: {
        text: `You've done everything you can with the parts you have. Still needed: ${list} — ${fmt(total)} with delivery, and you have ${fmt(g.money)}. Do some jobs: parcels at the post office and work at Esa's garage (Ruskala village, east — take the moped), mowing Pertti's lawn (west), or scrap metal for Raimo's scrapyard (far west). You can also order the cheapest parts now and the rest later.`,
        targets: [...job(sp.post, 'Jobs: post office'), ...job(sp.mechanic, "Jobs: Esa's garage"), ...job(sp.pertti, 'Job: mow the lawn'), ...job(g.scrapScale?.center, 'Job: sell scrap')],
      } };
    }
    const o = g.orders[0];
    if (o) return { st: { title: 'Wait for your parts' }, s: { text: `Your order arrives ${g.life.fmtTime(o.eta)} on the pallet outside the garage. Sleep, eat, or do a job meanwhile.`, targets: [{ kind: 'mark', pos: g.deliverySpot.clone(), text: 'Delivery pallet', col: COL.go }] } };
    return null;
  }

  // ---------------- active job objective ----------------
  jobObjective() {
    const g = this.game, J = g.jobs, asm = this.asm;
    const here = g.camera.position;
    const dist = (p) => Math.round(Math.hypot(p.x - here.x, p.z - here.z));
    const mark = (pos, text, col = COL.go, up = 0) => ({ kind: 'mark', pos: pos.clone().add(new THREE.Vector3(0, up, 0)), text, col });
    const npcMark = (id, text) => { const n = g.npcs.get(id); return n ? mark(n.g.position, text, COL.go, 1.9) : null; };
    const focus = J.focus || (J.workshop ? 'workshop' : J.parcels ? 'parcels' : J.mowing ? 'mowing' : J.scrapActive ? 'scrap' : null);
    if (!focus) return null;
    const others = ['workshop', 'parcels', 'mowing', 'scrap'].filter((k) => k !== focus && (k === 'workshop' ? J.workshop : k === 'parcels' ? J.parcels : k === 'mowing' ? J.mowing : J.scrapActive));
    const also = others.length ? ` (Also on the go: ${others.join(', ')}.)` : '';
    const held = g.interaction.held;

    if (focus === 'workshop' && J.workshop) {
      const w = J.workshop;
      const shop = g.esaShopPos;
      const title = `Esa's job: ${w.title.toLowerCase()}`;
      if (dist(shop) > 30) return { job: 'WORKSHOP JOB', st: { title }, s: { text: `Go to Esa's garage in Ruskala village (east along Route 54). The job and Esa's tools are on the benches at the back.${also}`, targets: [mark(shop, "Esa's garage", COL.go, 3)] } };
      for (const t of w.tasks) {
        if (J.taskDone(t)) continue;
        const host = J.taskHost(t); if (!host) continue;
        if (t.fluid) {
          const oil = w.items.map((u) => asm.get(u)).find((i) => i && i.def.type === 'fluid' && i.props.amount > 0.05) || this.pick('fluid');
          if (held?.def.type === 'fluid') return { job: 'WORKSHOP JOB', st: { title }, s: { text: `${t.label}: hold LMB on the filler plug on the side of the gearbox (${(host.props.oil || 0).toFixed(1)} / ${t.min} L).`, targets: [mark(this.fillPos(host), 'Pour here', COL.go)] } };
          return { job: 'WORKSHOP JOB', st: { title }, s: { text: `${t.label}: ${held ? 'put down what you\'re holding (G) and ' : ''}grab the gear oil from the workbench.`, targets: oil ? [this.itemTarget(oil)] : [] } };
        }
        const inst = host.kids[t.slot];
        if (!inst) {
          const accepts = slotById(host.def.host, t.slot).accepts;
          const item = w.items.map((u) => asm.get(u)).find((i) => i && i.def.type === accepts && !i.slot);
          if (!item) continue;
          if (held !== item) return { job: 'WORKSHOP JOB', st: { title }, s: { text: `Next: ${t.label}. ${held ? 'Put down what you\'re holding (G), then g' : 'G'}rab the ${short(item.def.name)} from the workbench.`, targets: [this.itemTarget(item)] } };
          return { job: 'WORKSHOP JOB', st: { title }, s: { text: `Fit it: look at the green ghost on the customer's part and press LMB.`, targets: [mark(this.slotPos(host, t.slot), `Fit ${short(item.def.name)} here`)] } };
        }
        const fj = this.fastenerJob(inst);
        if (!fj) continue;
        const how = fj.g0.size === 'hand' ? `with empty hands, hold LMB on each marked spot to do it up by hand (${fj.done}/${fj.total})` : fj.g0.size === 'flat' ? `tighten each marked clamp with the flat screwdriver (${fj.done}/${fj.total})` : `tighten ${fj.total - fj.done} × ${fj.sizeText} — hold LMB on each marked bolt until the bar is green (${fj.done}/${fj.total}).${fj.thenText}`;
        const text = fj.tool ? `${t.label}: ${fj.tool.text}` : `${t.label}: ${how}`;
        return { job: 'WORKSHOP JOB', st: { title }, s: { text, targets: fj.tool ? fj.tool.targets : [], dots: fj.dots } };
      }
      return { job: 'WORKSHOP JOB', st: { title: 'Job finished — get paid' }, s: { text: `Everything's done. Talk to Esa (E) to get your ${w.pay} mk.${also}`, targets: [npcMark('esa', 'Talk to Esa')].filter(Boolean) } };
    }

    if (focus === 'parcels' && J.parcels) {
      const left = J.parcels.list.map((p) => ({ ...p, it: asm.get(p.uid) })).filter((p) => p.it);
      const due = g.life.fmtTime(J.parcels.deadline);
      const late = g.life.minutes > J.parcels.deadline ? ' You\'re late — they now pay half.' : '';
      if (held?.def.type === 'parcel') {
        const mb = g.mailboxes.find((m) => m.id === held.props.dest);
        const others = left.filter((p) => p.dest !== held.props.dest).map((p) => g.mailboxes.find((m) => m.id === p.dest)).filter(Boolean).map((m) => mark(m.pos, `📦 ${m.name} — ${dist(m.pos)} m`, COL.grab, 1.5));
        return { job: 'PARCEL DELIVERY', st: { title: `Deliver the parcel to ${held.props.destName}` }, s: { text: `Take it to ${held.props.destName}'s mailbox (${dist(mb.pos)} m) and press E on the mailbox. Deliver all ${left.length} by ${due}.${late} The moped's box holds 2 parcels: look at the moped while holding one and press E.${also}`, targets: [mark(mb.pos, `📦 ${held.props.destName}'s mailbox — ${dist(mb.pos)} m`, COL.go, 1.5), ...others] } };
      }
      const next = left.sort((a, b) => dist(a.it.obj.getWorldPosition(new THREE.Vector3())) - dist(b.it.obj.getWorldPosition(new THREE.Vector3())))[0];
      if (!next) return null;
      const inCar = next.it.loc?.cont === 'car', onMoped = next.it.loc?.cont === 'moped';
      return { job: 'PARCEL DELIVERY', st: { title: `Parcels: ${left.length} left, due ${due}` }, s: { text: `${held ? 'Put down what you\'re holding (G), then p' : 'P'}ick up the parcel for ${next.name}${inCar ? ' (it\'s in your car)' : onMoped ? ' (it\'s in the moped box — look at the moped and press F to take it out)' : next.it.loc?.kind === 'inv' ? ' (it\'s in your pockets — press I)' : ' from the post office counter'}. Destinations: ${left.map((p) => p.name).join(', ')}.${late}${also}`, targets: [{ ...this.itemTarget(next.it, 'Parcel for ' + next.name) }, ...left.map((p) => g.mailboxes.find((m) => m.id === p.dest)).filter(Boolean).map((m) => mark(m.pos, `📦 ${m.name} — ${dist(m.pos)} m`, COL.grab, 1.5))] } };
    }

    if (focus === 'mowing' && J.mowing) {
      const pct = Math.round(J.mowProgress() * 100);
      if (pct >= 90) return { job: 'MOWING JOB', st: { title: 'Lawn mowed — get paid' }, s: { text: `Talk to Pertti (E) to get your 180 mk.${also}`, targets: [npcMark('pertti', 'Talk to Pertti')].filter(Boolean) } };
      const L = g.lawn;
      if (g.player.pushing !== J.mower) return { job: 'MOWING JOB', st: { title: `Mow Pertti's lawn (${pct}%)` }, s: { text: `Pertti's farm is just west of your place along Route 54. Grab the red push mower (E) and push it over every patch of tall grass.${also}`, targets: [mark(J.mower.obj.position, 'Lawn mower', COL.grab, 1.2), mark(new THREE.Vector3(L.x, L.y, L.z), `Lawn — ${pct}% done`, COL.go, 0.6)] } };
      // point at the nearest uncut grass
      let best = null, bd = 1e9; J.tufts.forEach((t, i) => { if (J.mowCut[i]) return; const d = (t.x - J.mower.obj.position.x) ** 2 + (t.z - J.mower.obj.position.z) ** 2; if (d < bd) { bd = d; best = t; } });
      return { job: 'MOWING JOB', st: { title: `Mow Pertti's lawn (${pct}%)` }, s: { text: `Walk the mower over the tall grass until the lawn is at least 90% done. E lets go.${also}`, targets: best ? [mark(new THREE.Vector3(best.x, L.y, best.z), 'Uncut grass', COL.go, 0.5)] : [] } };
    }

    if (focus === 'scrap' && J.scrapActive) {
      const scale = g.scrapScale.center;
      const onScale = J.scaleItems().length;
      if (held?.def.kind === 'scrap') return { job: 'SCRAP COLLECTING', st: { title: 'Take the scrap to the scale' }, s: { text: `Carry it to the scrap scale at Raimo's scrapyard (far west, ${dist(scale)} m) and put it down on the steel plate (G or LMB). Heavy? Put it in the car's boot instead.${also}`, targets: [mark(scale, `Scrap scale — ${dist(scale)} m`, COL.go, 0.8)] } };
      if (onScale) return { job: 'SCRAP COLLECTING', st: { title: `Sell the scrap (${onScale} on the scale)` }, s: { text: `Talk to Raimo (E) and choose "Sell what's on the scale". You can also bring more first.${also}`, targets: [npcMark('raimo', 'Talk to Raimo')].filter(Boolean) } };
      let best = null, bd = 1e9;
      for (const it of asm.items.values()) { if (it.def.kind !== 'scrap' || it.slot) continue; const p = it.obj.getWorldPosition(new THREE.Vector3()); const d = dist(p); if (d < bd) { bd = d; best = it; } }
      if (!best) return { job: 'SCRAP COLLECTING', st: { title: 'No more scrap around' }, s: { text: 'You\'ve collected all the scrap out there. More turns up later.', targets: [] } };
      return { job: 'SCRAP COLLECTING', st: { title: 'Find scrap metal' }, s: { text: `Nearest piece: ${short(best.def.name)}, ${bd} m away (brown dots on the map, M). Pick it up and bring it to the scale at Raimo's scrapyard. Raimo pays 1.4 mk per kilo.${also}`, targets: [mark(best.obj.getWorldPosition(new THREE.Vector3()), `Scrap — ${bd} m`, COL.grab, 0.6)] } };
    }
    return null;
  }

  // ---------------- per frame ----------------
  update(dt) {
    const g = this.game;
    if (g.car.pt.running) this.started = true;
    this.t += dt;
    if (this.t > 0.2) {
      this.t = 0;
      this.cur = null;
      let doneCount = 0, allPrevDone = true;
      const box = [...this.asm.items.values()].find((i) => i.def.type === 'box');
      for (const st of this.steps) {
        let s;
        try { s = st.state(); } catch (e) { console.error('guide step failed', st.title, e); allPrevDone = false; continue; }
        if (s.done) { doneCount++; continue; }
        const gated = st.gate && !allPrevDone;
        allPrevDone = false;
        if (s.blocked || s.buy || gated) continue;
        if (!this.cur) this.cur = { st, s, idx: this.steps.indexOf(st) + 1 };
      }
      this.doneCount = doneCount; this.total = this.steps.length;
      if (box) this.cur = { st: { title: 'Your delivery has arrived' }, s: { text: 'Open the box on the pallet outside the garage door (E) to unpack the parts.', targets: [{ kind: 'mark', pos: this.center(box), text: 'Open the delivery box', col: COL.grab }] }, idx: doneCount + 1 };
      else if (!this.cur && doneCount < this.total) { const m = this.moneyStep(); if (m) this.cur = { ...m, idx: doneCount + 1 }; }
      // repairs & upgrades take over from the build steps (the build steps then put back what was removed)
      let rp = null;
      try { rp = this.repairObjective(); } catch (e) { console.error('repair plan failed', e); }
      if (rp) this.cur = { ...rp, idx: 0 };
      // a job you've taken takes over the objective until it's finished
      let jo = null;
      try { jo = this.jobObjective(); } catch (e) { console.error('job objective failed', e); }
      if (jo) this.cur = { ...jo, idx: 0 };
      this.render();
    }
    // keep markers pulsing
    const pulse = 0.8 + Math.sin(performance.now() * 0.006) * 0.2;
    for (const d of this.dots) d.scale.setScalar(0.04 * pulse);
    for (const l of this.labels) l.position.y = l.userData.baseY + Math.sin(performance.now() * 0.004) * 0.04;
  }

  clearMarkers() {
    for (const o of [...this.labels, ...this.dots]) { this.group.remove(o); o.material.dispose(); if (o.userData.ownTex) o.material.map?.dispose(); }
    this.labels = []; this.dots = [];
  }
  render() {
    this.clearMarkers();
    const g = this.game;
    const show = !this.hidden && (!g.player.inCar || !!this.cur?.job);
    if (!this.cur || this.hidden) {
      this.el.innerHTML = this.hidden ? '' : (this.started ? `<div class="gt">✔ Car built!</div><div class="gs">Drive to Ruskala (east), pass the inspection and enter the Ruskala Sprint at the Rally HQ. <span class="gk">H</span> hides this.</div>` : '');
      this.el.classList.toggle('hidden', this.hidden || !this.el.innerHTML);
      return;
    }
    this.el.classList.remove('hidden');
    const { st, s } = this.cur;
    let dist = '';
    const main = (s.targets || []).find((t) => t.kind === 'mark') || (s.dots?.length ? { pos: s.dots[0].pos } : null);
    if (main) { const d = main.pos.distanceTo(g.camera.position); if (d > 4) dist = ` <span class="gd">${Math.round(d)} m</span>`; }
    this.el.innerHTML = `<div class="gp">${this.cur.job ? 'JOB · ' + this.cur.job + ' · cancel it on the phone (P)' : this.cur.repair ? `REPAIRS & UPGRADES · ${this.cur.repair}` : this.started ? 'BACK ON THE ROAD · finishing up' : `BUILD THE RUSKA · STEP ${this.cur.idx} OF ${this.total}`}</div><div class="gt">${this.started && !this.cur.job && !this.cur.repair ? (AFTER[st.title] || st.title) : st.title}${dist}</div><div class="gs">${s.text || ''}</div><div class="gk2"><span class="gk">H</span> hide guide</div>`;
    if (!show) return;
    for (const t of s.targets || []) {
      if (t.kind !== 'mark') continue;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeLabelTex(t.text, t.col || COL.go), depthTest: false, depthWrite: false, transparent: true, sizeAttenuation: false }));
      sp.userData.ownTex = true;
      sp.scale.set(0.46, 0.115, 1); sp.center.set(0.5, 0.05);
      sp.position.copy(t.pos).add(new THREE.Vector3(0, 0.08, 0)); sp.userData.baseY = sp.position.y;
      sp.renderOrder = 1000;
      this.group.add(sp); this.labels.push(sp);
    }
    for (const d of (s.dots || []).slice(0, 40)) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex(d.col), depthTest: false, depthWrite: false, transparent: true, sizeAttenuation: false }));
      sp.scale.setScalar(0.04); sp.position.copy(d.pos); sp.renderOrder = 1001;
      this.group.add(sp); this.dots.push(sp);
    }
  }
  toggle() { this.hidden = !this.hidden; this.t = 1; this.game.toast(this.hidden ? 'Build guide hidden (H to show)' : 'Build guide on'); }
  serialize() { return { hidden: this.hidden, started: this.started, driven: this.driven, repair: this.repair || [] }; }
  restore(d) { if (!d) return; this.hidden = !!d.hidden; this.started = !!d.started; this.driven = !!d.driven; this.repair = d.repair || []; }
}

function short(name) { return name.replace(/\s*\(.*?\)\s*/g, ' ').trim(); }

installRepair(Guide);
