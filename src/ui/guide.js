// Build guide: works out the next job from the real state of the car and parts, shows it
// top-left, and marks (through walls) what to grab, which tool, where it goes and every
// bolt that still needs tightening.
import * as THREE from 'three';
import { DEFS, slotById, fastenerList, SIZE_LABEL } from '../mechanics/partsdb.js';
import { TIGHT_OK } from '../mechanics/assembly.js';

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
  pick(type, minCond = 0) {
    const held = this.game.interaction.held;
    if (held && held.def.type === type && held.cond >= minCond) return held;
    let best = null;
    for (const it of this.asm.items.values()) {
      if (it.def.type !== type || it.slot || it.props.forSale || this.isJobItem(it)) continue;
      if (it.loc?.kind === 'hoist') continue;
      if (it.cond < minCond) continue;
      if (!best || it.cond > best.cond) best = it;
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
      return { text: `Get the ratchet${r?.loc?.cont === 'drawer1' ? ' (red toolbox, top drawer)' : ' (marked)'} for the ${size} mm bolts${held ? ' — put down what you\'re holding first (G)' : ''}`, targets: r ? [{ ...this.itemTarget(r), col: COL.tool }] : [] };
    }
    const type = size === 'flat' || size === 'ph' ? 'screwdriver' : size === 'plug' ? 'plug_socket' : null;
    let tool = null;
    for (const x of this.asm.items.values()) if (x.def.type === type && (x.def.size === size) && !x.slot) tool = tool || x;
    return { text: `Get the ${SIZE_LABEL(size)}${tool?.loc?.cont === 'drawer2' ? ' (red toolbox, drawer 2)' : ' (marked)'}${held ? ' — put down what you\'re holding first (G)' : ''}`, targets: tool ? [{ ...this.itemTarget(tool), col: COL.tool }] : [] };
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
    const tool = stripped ? { text: 'A thread is stripped (brown ring) — get the bolt kit (drawer 3) and press LMB on it', targets: [] } : this.toolFor(g0.size);
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
          const item = this.pick(type, o.minCond || 0);
          if (!item) return this.buyGuide(type, o.minCond);
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
    const box = [...this.asm.items.values()].find((i) => i.def.type === 'box');
    if (box) return { text: `A delivery has arrived — open the box on the pallet (E)`, targets: [{ kind: 'mark', pos: this.center(box), text: 'Open the delivery box', col: COL.grab }] };
    const ordered = g.orders.some((o) => o.items.some((id) => DEFS[id].type === (def?.type)));
    if (ordered) { const o = g.orders.find((x) => x.items.some((id) => DEFS[id].type === def?.type)); return { text: `Waiting for the delivery of the ${short(name)} (arrives ${g.life.fmtTime(o.eta)}). Sleep or do other jobs meanwhile.`, targets: [{ kind: 'mark', pos: g.deliverySpot.clone(), text: 'Delivery pallet', col: COL.go }] }; }
    return { text: `You need a new ${short(name)}${minCond ? ' (yours is worn out)' : ''}. Order it on the computer in the house (Parts shop → Add → Order basket).`, targets: [{ kind: 'mark', pos: this.pcPos(), text: 'Computer: order parts', col: COL.go }] };
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
    const H = () => this.block()?.kids.head || null;
    const onStandOrCar = () => { const b = B(); return b && b.slot ? this.asm.hostOf(b) : null; };
    const inCar = () => (this.C.kids.engine ? this.C : null);
    const car = () => this.C;
    const piston4 = () => this.pick('piston') ;
    const steps = [];
    // 0: order the parts that are definitely needed
    steps.push({
      title: 'Order the missing parts',
      state: () => {
        const need = this.shoppingList();
        if (!need.length) return { done: true };
        const box = [...this.asm.items.values()].find((i) => i.def.type === 'box');
        if (box) return { text: 'Your delivery has arrived — open the box on the pallet (E).', targets: [{ kind: 'mark', pos: this.center(box), text: 'Open the delivery box', col: COL.grab }] };
        return { text: `Order on the computer in the house (Parts shop → Add each → Order basket): ${need.join(', ')}. Delivery takes ~2 game hours — you can keep working meanwhile.`, targets: [{ kind: 'mark', pos: this.pcPos(), text: 'Computer: order parts', col: COL.go }] };
      },
    });
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
    steps.push(this.fit('Fit piston #4 into the block', B, 'piston4', 'piston', { tip: 'Press R until the ARROW on the piston top points to the front (pulley end) — the ghost turns green. Then tighten the rod nuts from underneath (crouch: Ctrl).' }));
    steps.push(this.fit('Fit the oil pan', B, 'oilPan', 'oil_pan', { tip: 'Bolts and the drain plug are underneath — crouch (Ctrl) and look up.' }));
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
      title: 'Unbolt the engine from the stand',
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
      title: 'Lift the engine with the hoist',
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
      title: 'Lower the engine into the car',
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
    steps.push(this.fluid('Fill the cooling system', () => this.C.props.coolant || 0, 5.5, 'coolant', () => this.C.kids.radiator, { car: true, capName: 'radiator cap' }));
    steps.push({
      title: 'Start the engine!',
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
      title: 'Take it for a drive',
      state: () => {
        if (this.driven) return { done: true };
        if (this.car.speed > 8) this.driven = true;
        return { text: 'Hold Shift (clutch), press R for 1st gear, ease off Shift while pressing W. Head down the driveway — Ruskala is east along Route 54.', targets: [] };
      },
    });
    return steps;
  }

  shoppingList() {
    const out = [];
    const b = this.block();
    const have = (type, minCond = 0) => [...this.asm.items.values()].some((i) => i.def.type === type && i.cond >= minCond && !i.props.forSale && !this.isJobItem(i));
    const ordered = (type) => this.game.orders.some((o) => o.items.some((id) => DEFS[id].type === type));
    const need = (type, name, minCond = 0) => { if (!have(type, minCond) && !ordered(type)) out.push(name); };
    if (b && !b.kids.headGasket) need('head_gasket', 'head gasket', 0.3);
    if (!b?.kids.piston4 || !b.kids.piston4.kids.rings) {
      const p4rings = [...this.asm.items.values()].some((i) => i.def.type === 'piston_rings' && i.cond >= 0.3 && !(this.asm.hostOf(i)?.def.type === 'piston' && this.asm.hostOf(i)?.slot));
      if (!p4rings && !ordered('piston_rings')) out.push('piston ring set');
    }
    if (b && !b.kids.oilFilter) need('oil_filter', 'oil filter');
    if (b && !b.kids.timingBelt) need('timing_belt', 'timing belt', 0.3);
    const head = b?.kids.head || [...this.asm.items.values()].find((i) => i.def.type === 'cylinder_head' && !this.isJobItem(i));
    if (head) {
      const empty = [1, 2, 3, 4].filter((n) => !head.kids['plug' + n]).length;
      const spare = [...this.asm.items.values()].filter((i) => i.def.type === 'spark_plug' && !i.slot && !this.isJobItem(i)).length + this.game.orders.reduce((n, o) => n + o.items.filter((id) => id === 'spark_plug').length, 0);
      if (spare < empty) out.push(`spark plug ×${empty - spare}`);
    }
    const fluidHave = (f) => [...this.asm.items.values()].reduce((s, i) => s + (i.def.type === 'fluid' && i.def.fluid === f && !i.def.infinite ? i.props.amount || 0 : 0), 0) + this.game.orders.reduce((s, o) => s + o.items.filter((id) => DEFS[id].fluid === f).reduce((t, id) => t + DEFS[id].cap, 0), 0);
    if (b && (b.props.oil || 0) + fluidHave('oil') < 3.7) out.push('motor oil (4 L)');
    const coolNeed = 6 - (this.C.props.coolant || 0) - fluidHave('coolant');
    if (coolNeed > 0.5) out.push(`coolant ×${Math.ceil(coolNeed / 5)}`);
    const stands = [...this.asm.items.values()].filter((i) => i.def.type === 'axle_stands').length + this.game.orders.reduce((n, o) => n + o.items.filter((id) => id === 'axle_stands').length, 0);
    if (stands < 2 && !(this.C.kids.muffler && this.C.kids.propshaft && this.C.kids.gearboxMount && this.C.kids.midpipe)) out.push('a second pair of axle stands');
    return out;
  }

  // ---------------- per frame ----------------
  update(dt) {
    const g = this.game;
    if (g.car.pt.running) this.started = true;
    this.t += dt;
    if (this.t > 0.2) {
      this.t = 0;
      this.cur = null;
      let doneCount = 0;
      for (const st of this.steps) {
        let s;
        try { s = st.state(); } catch (e) { console.error('guide step failed', st.title, e); continue; }
        if (s.done) { doneCount++; continue; }
        if (s.blocked) continue;
        if (!this.cur) this.cur = { st, s, idx: this.steps.indexOf(st) + 1 };
      }
      this.doneCount = doneCount; this.total = this.steps.length;
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
    const show = !this.hidden && !g.player.inCar;
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
    this.el.innerHTML = `<div class="gp">BUILD THE RUSKA · STEP ${this.cur.idx} OF ${this.total}</div><div class="gt">${st.title}${dist}</div><div class="gs">${s.text || ''}</div><div class="gk2"><span class="gk">H</span> hide guide</div>`;
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
  serialize() { return { hidden: this.hidden, started: this.started, driven: this.driven }; }
  restore(d) { if (!d) return; this.hidden = !!d.hidden; this.started = !!d.started; this.driven = !!d.driven; }
}

function short(name) { return name.replace(/\s*\(.*?\)\s*/g, ' ').trim(); }
