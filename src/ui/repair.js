// Repair & upgrade planner for the guide. Once the car runs (or is fully built), it watches for
// broken / crash-bent parts and for upgrade parts you own but haven't fitted, and turns them into
// a step-by-step plan in the best order:
//   1. buy anything missing (nothing gets taken apart before you have the new part)
//   2. take apart — outermost first — everything in the way, shared blockers only once
//   3. fit the new / upgrade parts, deepest first (with the usual grab / fit / tighten markers)
//   4. the normal build guide then refits whatever was taken off, in build order
import * as THREE from 'three';
import { DEFS, HOSTS, slotById } from '../mechanics/partsdb.js';

const COL = { grab: '#ffd23c', go: '#4ad8ff', tool: '#ff9a3c', bolt: '#ff7a2a', buy: '#ff6ad5' };
const UPGRADE_CATS = new Set(['Performance', 'Body kits']);
const BODY = new Set(['bumperF', 'bumperR', 'hood', 'trunk', 'doorL', 'doorR', 'headlightL', 'headlightR', 'taillightL', 'taillightR', 'lightPod', 'splitter', 'skirtL', 'skirtR']);
const NO_SWAP = new Set(['block', 'chassis', 'stand']);   // too big to plan automatically
const CORNER = { FL: 'front-left', FR: 'front-right', RL: 'rear-left', RR: 'rear-right' };
const words = (s) => s.replace(/\b(FL|FR|RL|RR)\b/g, (m) => CORNER[m]);
const short = (n) => n.replace(/\s*\(.*?\)\s*/g, ' ').trim();
// things that matter most get fixed first
const PRIO = { brake_pads: 9, brake_disc: 9, caliper: 9, master_cylinder: 9, tie_rod: 8, control_arm: 8, steering_rack: 8, wheel: 8, shock: 6, spring: 6,
  timing_belt: 7, head_gasket: 7, radiator: 6, hose_upper: 6, hose_lower: 6, water_pump: 6, oil_pump: 7, fuel_pump: 6, spark_plug: 5, distributor: 5, clutch_disc: 5 };

export function installRepair(Guide) {
  const P = Guide.prototype;

  P.repairHosts = function () {
    const asm = this.asm, out = [];
    for (const r of [this.C, this.game.stand]) { out.push(r); for (const d of asm.descendants(r)) out.push(d); }
    return out;
  };
  P.owned = function (it) { return !it.props.forSale && it.props.owner !== 'esa' && !this.isJobItem(it); };

  // look for new problems / upgrades and add them to the plan
  P.scanRepairs = function () {
    const asm = this.asm, plan = this.repair ||= [];
    const has = (h, s) => plan.some((t) => t.h === h.uid && t.s === s);
    for (const h of this.repairHosts()) {
      for (const s of HOSTS[h.def.host] || []) {
        const occ = h.kids[s.id];
        if (!occ || NO_SWAP.has(occ.def.type) || occ.def.kind !== 'part' || has(h, s.id)) continue;
        const bent = Math.abs(occ.props.bent || 0) > 0.003;
        if (occ.cond < 0.2 || bent) {
          plan.push({ h: h.uid, s: s.id, type: occ.def.type, kind: 'fix', why: bent ? `Bent ${short(occ.def.name).toLowerCase()} (crash damage)` : BODY.has(s.id) || s.id === 'radiator' ? `Crash-damaged ${short(occ.def.name).toLowerCase()} (${Math.round(occ.cond * 100)}%)` : `Worn out ${short(occ.def.name).toLowerCase()} (${Math.round(occ.cond * 100)}%)`, where: words(s.name) });
          this.game.toast(`🔧 New repair job: ${bent ? 'bent' : BODY.has(s.id) || s.id === 'radiator' ? 'crash-damaged' : 'worn out'} ${words(s.name).toLowerCase()} — see the guide (H)`, 4);
        }
      }
    }
    // upgrade parts you own that aren't fitted yet
    const used = new Set();
    for (const it of asm.items.values()) {
      if (it.slot || it.cond < 0.3 || !UPGRADE_CATS.has(it.def.cat) || !this.owned(it) || it.loc?.kind === 'hoist' || plan.some((t) => t.item === it.uid)) continue;
      let best = null;
      for (const h of this.repairHosts()) for (const s of HOSTS[h.def.host] || []) {
        if (s.accepts !== it.def.type || used.has(h.uid + s.id) || has(h, s.id)) continue;
        const occ = h.kids[s.id];
        if (occ && (occ.def.id === it.def.id || UPGRADE_CATS.has(occ.def.cat))) continue; // already upgraded there
        // a slot's prerequisites must at least exist (e.g. the wing needs the boot lid)
        best = { h, s }; break;
      }
      if (!best) continue;
      used.add(best.h.uid + best.s.id);
      plan.push({ h: best.h.uid, s: best.s.id, type: it.def.type, defId: it.def.id, item: it.uid, kind: 'upgrade', why: `Upgrade: ${short(it.def.name)}`, where: words(best.s.name) });
      this.game.toast(`⚙ Upgrade ready to fit: ${short(it.def.name)} — see the guide (H)`, 4);
    }
    // order: safety first, upgrades last
    const rank = { fix: 0, upgrade: 1, refit: 2 };
    plan.sort((a, b) => rank[a.kind] - rank[b.kind] || (PRIO[b.type] || 3) - (PRIO[a.type] || 3));
  };

  // is a plan entry finished? (the right, good part is in and bolted up)
  P.repairDone = function (t) {
    const h = this.asm.get(t.h); if (!h) return true;
    const occ = h.kids[t.s];
    if (!occ) return false;
    if (t.defId ? occ.def.id !== t.defId : (occ.cond < 0.3 || Math.abs(occ.props.bent || 0) > 0.003)) return false;
    return this.asm.fastenerSummary(occ).secure;
  };
  // does the current occupant of the slot have to come out?
  P.mustRemove = function (t) {
    const h = this.asm.get(t.h), occ = h?.kids[t.s];
    if (!occ) return null;
    if (t.defId ? occ.def.id === t.defId : (occ.cond >= 0.3 && Math.abs(occ.props.bent || 0) <= 0.003)) return null;
    return occ;
  };
  // the replacement / upgrade part to fit
  P.repairPart = function (t) {
    if (t.item) { const it = this.asm.get(t.item); if (it && !it.slot && this.owned(it)) return it; }
    return this.pick(t.type, 0.3, t.defId);
  };
  // first thing that can actually come off on the way to `occ` (things that need it come off first)
  P.removable = function (occ) {
    let cur = occ, guard = 0;
    while (guard++ < 30) { const deps = this.asm.dependents(cur); if (!deps.length) return cur; cur = deps[0]; }
    return cur;
  };
  P.inBay = function (inst) { // engine bay parts need the bonnet open
    let h = inst; while (h && this.asm.hostOf(h) && this.asm.hostOf(h) !== this.C) h = this.asm.hostOf(h);
    if (!h || this.asm.hostOf(h) !== this.C) return false;
    const s = this.asm.slotDef(h); return s && s.pos[2] > 0.4 && s.pos[1] > 0.3;
  };
  P.isUnder = function (inst) {
    if (this.asm.root(inst) !== this.C) return false;
    const s = this.asm.slotDef(inst); if (!s) return false;
    return this.asm.hostOf(inst) === this.C && s.pos[1] < 0.35 && !/^(wheel|disc|pads|caliper|shock|spring)/.test(s.id) && !s.id.startsWith('skirt') && s.id !== 'splitter';
  };

  // ---------- the objective ----------
  P.repairObjective = function () {
    const g = this.game;
    if (!(this.started || this.doneCount === this.total)) return null;
    this.scanRepairs();
    const plan = this.repair = this.repair.filter((t) => !this.repairDone(t) && this.asm.get(t.h));
    if (!plan.length) return null;
    const n = plan.filter((t) => t.kind !== 'refit').length || plan.length;
    const list = plan.filter((t) => t.kind !== 'refit').map((t, i) => `${i + 1}) ${t.why} — ${t.where}`).join('<br>') + (plan.some((t) => t.kind === 'refit') ? `<br>…then put back what was taken off (${plan.filter((t) => t.kind === 'refit').length})` : '');
    const wrap = (title, s) => ({ repair: `${n} JOB${n > 1 ? 'S' : ''}`, st: { title }, s: { ...s, text: `${s.text}<div class="gplan">${list}</div>` } });
    const held = g.interaction.held;
    // 1) buy what's missing before taking anything apart
    const noPart = plan.filter((t) => !this.repairPart(t) && !(this.asm.get(t.h)?.kids[t.s] && !this.mustRemove(t)));
    if (noPart.length) {
      const names = [...new Set(noPart.map((t) => { const d = Object.values(DEFS).filter((x) => x.type === t.type && x.shop).sort((a, b) => a.price - b.price)[0]; return d ? `${d.name} (${d.price} mk)` : t.type; }))];
      const bentOnly = noPart.every((t) => /Bent/.test(t.why)), bodyOnly = noPart.every((t) => /Crash-damaged/.test(t.why));
      return wrap(names.length === 1 ? `Get a new ${names[0].replace(/ \(\d+ mk\)$/, '').toLowerCase()}` : `Get new parts (${names.length})`, {
        text: `You need: ${names.join(', ')}. Order on the computer (⭐ My car needs) or buy at the parts store in Ruskala.${bentOnly ? ' Or let Esa or Ari straighten it ("Straighten suspension & alignment").' : bodyOnly ? ' Cheaper: drive (or tow) the car to Esa’s workshop or Ari’s service park and pick "Repair body panels & lights" — that fixes them all without new parts.' : ''} Nothing gets taken apart until you have it.`,
        targets: [{ kind: 'mark', pos: this.pcPos(), text: 'Computer: order parts', col: COL.buy }],
      });
    }
    // 2) take apart: union of everything in the way, outermost first
    for (const t of plan) {
      const occ = this.mustRemove(t);
      if (!occ) continue;
      const x = this.removable(occ);
      const isOld = x === occ;
      if (this.inBay(x)) { const hb = this.hoodBlock(); if (hb) return wrap(`${t.why}: open the bonnet`, hb); }
      if (this.isUnder(x) && !this.underOk()) return wrap(`${t.why}: raise the car`, this.raiseGuide());
      const chk = this.asm.checkRemove(x);
      const lift = chk.reasons.find((r) => /Raise/.test(r));
      if (lift) return wrap(`${t.why}: raise the car`, { text: lift + ' (floor jack under the jack point, pump with LMB).', targets: [] });
      const name = short(x.def.name);
      // remember to put back whatever is only in the way
      if (!isOld && !plan.some((p) => p.item === x.uid)) plan.push({ h: this.asm.hostOf(x).uid, s: x.slot.id, type: x.def.type, defId: x.def.id, item: x.uid, kind: 'refit', why: `Put back the ${name}`, where: words(this.asm.slotDef(x).name) });
      const fj = this.fastenerJob(x, true);
      if (fj) {
        let text = fj.g0.size === 'hand' ? `Disconnect ${fj.total - fj.done} by hand: empty hands, RMB on each marked clip`
          : `Undo ${fj.dots.length} × ${fj.sizeText}${fj.g0.name ? ' (' + fj.g0.name + ')' : ''}: hold RMB on each marked bolt until it comes out`;
        const tg = [{ kind: 'mark', pos: this.center(x), text: `${isOld ? 'Remove' : 'Take off'}: ${name}`, col: COL.grab }];
        if (fj.tool) { text = fj.tool.text; tg.push(...fj.tool.targets); }
        return wrap(isOld ? `Remove the ${t.kind === 'upgrade' ? 'old ' : /Bent/.test(t.why) ? 'bent ' : 'worn-out '}${name}` : `Take off the ${name} (it's in the way)`, { text: text + (isOld ? '' : ` — it has to come off to reach the ${t.where.toLowerCase()}; it goes back on afterwards.`), targets: tg, dots: fj.dots });
      }
      if (held) return wrap(`Put down the ${short(held.def.name)}`, { text: `Free your hands: put the ${short(held.def.name)} down out of the way (G).`, targets: [] });
      return wrap(isOld ? `Lift out the ${name}` : `Take off the ${name}`, { text: `All bolts are out — look at the ${name} and press E to take it off, then put it down out of the way (G).${isOld && t.kind === 'fix' ? ' The old one is scrap (sell it to Raimo).' : ''}`, targets: [{ kind: 'mark', pos: this.center(x), text: `E: take off ${name}`, col: COL.grab }] });
    }
    // 3) fit the new parts, deepest first (blocked ones wait until what they sit on is back)
    for (const t of plan) {
      const h = this.asm.get(t.h);
      const part = this.repairPart(t);
      const step = this.fit(`${t.why}`, () => h, t.s, t.type, { minCond: 0.3, defId: t.defId, car: this.asm.root(h) === this.C, bay: this.asm.root(h) === this.C, under: h === this.C && slotById(h.def.host, t.s)?.pos[1] < 0.35 && !/^(wheel|disc|pads|caliper|shock|spring|skirt|splitter)/.test(t.s) }).state();
      if (step.done || step.blocked || step.buy) continue;
      const title = h.kids[t.s] ? `Bolt up the ${short(h.kids[t.s].def.name)}` : `Fit the ${part ? short(part.def.name) : t.type} — ${t.where.toLowerCase()}`;
      return wrap(title, step);
    }
    return null; // what's left is putting the removed parts back: the normal build steps do that
  };
}
