// What the player is looking at, what they're holding, and what pressing a button does.
import * as THREE from 'three';
import { DEFS, slotById, SIZE_LABEL, HOSTS } from '../mechanics/partsdb.js';
import { TIGHT_OK, OVER_WARN, STRIP_AT } from '../mechanics/assembly.js';
import { MAT } from '../core/materials.js';
import { buildPartMesh } from '../mechanics/partMeshes.js';
import { OIL_CAP, COOLANT_CAP, GEAROIL_CAP, BRAKE_CAP, FUEL_CAP } from '../vehicles/systems.js';
import { clamp } from '../core/util.js';

const REACH = 2.4;
const MAX_CARRY = 45;
const TOOL_RATE = { ratchet: 0.95, torque_wrench: 0.75, wrench: 0.55, lug_wrench: 0.6, screwdriver: 1.2, plug_socket: 0.9, hand: 1.6 };
const K = (k) => `<span class="k">${k}</span>`;

export class Interaction {
  constructor(game) {
    this.game = game;
    this.ray = new THREE.Raycaster();
    this.ray.far = REACH;
    this.held = null;
    this.heldRot = 0;
    this.holder = new THREE.Group();
    game.camera.add(this.holder);
    this.target = null;
    this.ghosts = new THREE.Group();
    game.scene.add(this.ghosts);
    this.ghostKey = '';
    this.inspecting = false;
    this.inspectQ = new THREE.Quaternion();
    this.holdT = 0;
    this.unthread = 0;
    this.lastCue = 0;
    this.pourT = 0;
  }

  // ---------- held item ----------
  hold(inst) {
    this.held = inst;
    this.heldRot = 0;
    this.game.asm.setHeld(inst, this.holder);
    this.layoutHeld();
    this.game.player.carryMass = this.game.asm.subtreeMass(inst);
    this.game.audio.pickup(inst.def.mass);
  }
  release() { const h = this.held; this.held = null; this.game.player.carryMass = 0; this.clearGhosts(); return h; }

  heldKind() {
    const h = this.held;
    if (!h) return 'none';
    if (h.def.kind === 'tool' && ['ratchet', 'torque_wrench', 'wrench', 'lug_wrench', 'screwdriver', 'plug_socket'].includes(h.def.type)) return 'fasten';
    return h.def.kind;
  }
  toolSize(inst = this.held) {
    if (!inst) return 'hand';
    const d = inst.def;
    if (d.type === 'ratchet' || d.type === 'torque_wrench') return inst.props.socket ?? null;
    return d.size;
  }

  layoutHeld() {
    const o = this.held?.obj;
    if (!o) return;
    const b = this.held.bounds;
    const size = b ? b.getSize(new THREE.Vector3()).length() : 0.2;
    if (this.inspecting) {
      o.position.set(0, -0.02 - (b ? (b.min.y + b.max.y) / 2 : 0), -Math.max(0.45, size * 1.1));
      o.quaternion.copy(this.inspectQ);
    } else if (this.held.def.kind === 'tool' || this.held.def.kind === 'food' || this.held.def.kind === 'fluid' || this.held.def.kind === 'kit') {
      o.position.set(0.22, -0.22 - (b ? b.min.y * 0.3 : 0), -0.42);
      o.rotation.set(0.1, this.held.def.type === 'fluid' ? -0.4 : 0.15, 0);
      if (this.held.def.type === 'lug_wrench' || this.held.def.type === 'torque_wrench' || this.held.def.type === 'ratchet') o.rotation.set(0.3, 0.5, 0);
    } else {
      const dist = Math.max(0.55, size * 0.9 + 0.25);
      o.position.set(0.0, -0.28 - (b ? b.min.y : 0) * 0.5 - size * 0.15, -dist);
      // world yaw = camera yaw + rot*90°: done by counter-rotating pitch
      // camera = Ry(yaw)·Rx(pitch); undo the pitch so the part stays level and its world yaw = yaw + rot·90°
      o.rotation.set(-this.game.player.pitch, this.heldRot * Math.PI / 2, 0, 'XYZ');
    }
  }

  // ---------- ghosts for slots the held part could go into ----------
  clearGhosts() { while (this.ghosts.children.length) this.ghosts.remove(this.ghosts.children[0]); this.ghostKey = ''; }
  updateGhosts() {
    const h = this.held;
    const asm = this.game.asm;
    if (!h || h.def.kind !== 'part') { if (this.ghostKey) this.clearGhosts(); return; }
    const key = h.uid + ':' + asm.version;
    if (key === this.ghostKey) return;
    this.clearGhosts();
    this.ghostKey = key;
    const pp = this.game.player.pos;
    for (const host of asm.items.values()) {
      if (!host.def.host || host === h || asm.isAncestor(h, host)) continue;
      if (host.loc?.kind === 'held' || host.loc?.kind === 'inv') continue;
      const hp = host.obj.getWorldPosition(new THREE.Vector3());
      if (hp.distanceTo(pp) > 6) continue;
      for (const s of HOSTS[host.def.host]) {
        if (s.accepts !== h.def.type || host.kids[s.id]) continue;
        if (s.hoist) continue;
        const chk = asm.checkInstall(h, host, s.id);
        const gm = buildPartMesh(h.def);
        gm.traverse((o) => { if (o.isMesh) { o.material = chk.ok ? MAT.ghostOk : MAT.ghostBad; o.castShadow = false; o.userData.ghost = { host, slot: s.id, chk }; } });
        gm.matrixAutoUpdate = false;
        gm.matrix.copy(asm.slotWorldMatrix(host, s.id));
        gm.userData.ghost = { host, slot: s.id, chk };
        this.ghosts.add(gm);
      }
    }
  }
  refreshGhostMatrices() {
    for (const gm of this.ghosts.children) gm.matrix.copy(this.game.asm.slotWorldMatrix(gm.userData.ghost.host, gm.userData.ghost.slot));
  }

  // ---------- raycast ----------
  pick() {
    const g = this.game;
    g.camera.updateMatrixWorld();
    this.ray.setFromCamera(new THREE.Vector2(0, 0), g.camera);
    const kind = this.heldKind();
    // 1) fasteners
    if (kind === 'fasten' || kind === 'none' || this.held?.def.id === 'bolt_kit') {
      const hits = this.ray.intersectObjects(g.fastenerTargets(), false);
      if (hits.length) {
        const fx = hits[0].object.userData.fastener;
        // make sure nothing solid is in between
        const solid = this.firstSolid();
        if (!solid || solid.distance > hits[0].distance - 0.03 || solid.object.userData.inst === fx.inst) return { type: 'fastener', ...fx, dist: hits[0].distance };
      }
    }
    // 2) ghosts
    if (kind === 'part' && this.ghosts.children.length) {
      const hits = this.ray.intersectObjects(this.ghosts.children, true);
      if (hits.length) return { type: 'slot', ...hits[0].object.userData.ghost, dist: hits[0].distance };
    }
    const solid = this.firstSolid(true);
    if (!solid) {
      // nothing in reach but maybe the ground: march the ray over the heightfield
      const o = this.ray.ray.origin, d = this.ray.ray.direction;
      for (let s = 0.2; s <= REACH; s += 0.05) {
        const x = o.x + d.x * s, y = o.y + d.y * s, z = o.z + d.z * s;
        const gy = g.floorAt(x, z, y);
        if (y <= gy) return { type: 'surface', point: new THREE.Vector3(x, gy, z), obj: null };
      }
      return null;
    }
    const o = solid.object, u = o.userData;
    // holding a part and looking at something it can bolt onto: target the nearest free compatible slot
    if (kind === 'part' && u.inst) {
      const asm = g.asm;
      for (let host = u.inst; host; host = asm.hostOf(host)) {
        if (!host.def.host || host === this.held) continue;
        let best = null, bd = 0.6;
        for (const s of HOSTS[host.def.host]) {
          if (s.accepts !== this.held.def.type || host.kids[s.id] || s.hoist) continue;
          const d = new THREE.Vector3().setFromMatrixPosition(asm.slotWorldMatrix(host, s.id)).distanceTo(solid.point);
          if (d < bd) { bd = d; best = s; }
        }
        if (best) return { type: 'slot', host, slot: best.id, dist: solid.distance };
      }
    }
    if (u.fill && kind === 'fluid') return { type: 'fill', ...u.fill, point: solid.point };
    if (u.action) return { type: 'action', action: u.action, point: solid.point, obj: o };
    if (u.interact) return { type: 'interact', def: u.interact, point: solid.point, obj: o };
    if (u.inst) {
      const inst = u.inst;
      // the top-most object the player would grab: walk up to the item that is loose (or the installed part itself)
      if (inst.slot) return { type: 'installed', inst, point: solid.point, obj: o, face: solid.face };
      if (inst.loc?.kind === 'world') return { type: 'loose', inst, point: solid.point, obj: o };
      if (inst.loc?.kind === 'hoist') return { type: 'hoisted', inst, point: solid.point };
    }
    if (u.surface || u.terrain || u.shell) return { type: 'surface', point: solid.point, obj: o, normal: solid.face?.normal };
    return { type: 'surface', point: solid.point, obj: o };
  }
  firstSolid(includeFill = false) {
    const g = this.game;
    const hits = this.ray.intersectObjects(g.pickables(), true);
    for (const h of hits) {
      const u = h.object.userData;
      if (u.glass || u.fastener || u.ghost) continue;
      if (h.object.material === MAT.hit && !u.action && !u.interact && !u.grabProxy && !(u.fill && includeFill)) continue;
      if (u.grabProxy && h.object.userData.inst?.slot) continue; // only for loose items
      if (!h.object.visible) continue;
      return h;
    }
    return null;
  }

  // ---------- per frame ----------
  update(dt, input) {
    const g = this.game;
    if (g.player.inCar || g.player.onMoped) { this.updateInCar(dt, input); return; }
    this.updateGhosts();
    if (this.ghosts.children.length) this.refreshGhostMatrices();
    // inspect mode
    const kind = this.heldKind();
    const wasInspecting = this.inspecting;
    this.inspecting = !!this.held && (kind === 'part' || kind === 'fluid' || kind === 'kit' || kind === 'food' || kind === 'tool') && kind !== 'fasten' && input.mouse.r && this.held.def.type !== 'axle_stands';
    g.player.lookLocked = this.inspecting;
    if (this.inspecting) {
      if (!wasInspecting) this.inspectQ.copy(this.held.obj.quaternion);
      const qx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), input.mouse.dx * 0.01);
      const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), input.mouse.dy * 0.01);
      this.inspectQ.premultiply(qx).premultiply(qy);
      if (this.held.known === false) { this.held.known = true; g.toast(`Inspected: ${this.held.def.name} — condition ${Math.round(this.held.cond * 100)}%`); }
    }
    this.layoutHeld();
    g.ui.partInfo(this.inspecting ? this.held : (this.target?.type === 'installed' || this.target?.type === 'loose') && input.down('Tab') ? this.target.inst : null);

    // pushing a jack / hoist: controls go to the equipment
    const push = g.player.pushing;
    if (push) {
      this.target = null;
      const def = push.obj.userData.interactDef;
      let p = def.prompt();
      if (input.hit('KeyE')) def.use('E');
      if (input.hit('KeyF')) def.use('F');
      this.holdT -= dt;
      if ((input.mouse.l || input.mouse.r) && this.holdT <= 0) { this.holdT = 0.14; def.use(input.mouse.l ? 'LMB' : 'RMB'); }
      g.ui.prompt(p, true);
      return;
    }
    const t = this.target = this.pick();
    if (g.pets.carried) { g.ui.prompt(g.pets.carryPrompt(input), true); g.ui.torque(null); return; }
    let prompt = '';
    let active = !!t;
    g.ui.torque(null);

    if (input.hit('KeyR') && this.held && kind === 'part') { this.heldRot = (this.heldRot + 1) % 4; g.audio.click(0.3); }
    if (input.hit('KeyG') && this.held) { this.putDown(t); return; }
    if (input.hit('KeyQ') && this.held) { this.pocket(); return; }

    switch (t?.type) {
      case 'fastener': prompt = this.handleFastener(t, dt, input); break;
      case 'slot': prompt = this.handleSlot(t, input); break;
      case 'fill': prompt = this.handleFill(t, dt, input); break;
      case 'action': prompt = this.handleAction(t, input); break;
      case 'interact': prompt = this.handleInteract(t, dt, input); break;
      case 'installed': prompt = this.handleInstalled(t, input); break;
      case 'loose': prompt = this.handleLoose(t, input); break;
      case 'hoisted': prompt = `${t.inst.def.name} (on the hoist)`; break;
      case 'surface': prompt = this.handleSurface(t, input); active = !!this.held; break;
      default: prompt = this.held ? `${K('G')}Put down` : '';
    }
    // things you can do anywhere
    if (this.held && kind === 'food' && this.held.def.props?.pet) { if (!(t?.type === 'interact' && t.def?.pet)) prompt = `<span class="dim">Pet food — aim at your pet and press LMB to feed it</span>\n` + prompt; }
    else if (this.held && kind === 'food' && t?.type !== 'fill' && !(t?.type === 'interact' && t.def?.pet)) {
      prompt = `${K('LMB')}Eat / drink ${this.held.def.name}\n` + prompt;
      if (input.mouse.lDown) { g.life.consume(this.held.def.props); g.audio.eat(); const it = this.release(); g.asm.remove(it); g.toast(`Consumed ${it.def.name}`); }
    }
    if (this.held && this.held.def.type === 'axle_stands') {
      const a = g.standAxleNear();
      if (a) {
        prompt = `${K('LMB')}Place axle stands under the ${a === 'F' ? 'front' : 'rear'}` + (g.car.support[a].lift < 0.2 ? `\n<span class="bad">Jack the car higher first</span>` : '');
        if (input.mouse.lDown && g.car.support[a].lift >= 0.2) g.placeStands(this.release(), a);
      }
    }
    if ((kind === 'fasten') && input.mouse.wheel) this.cycleSocket(input.mouse.wheel);
    // lie down / get up (creeper) hint near the car
    const P = g.player, lp = g.car.chassis.obj.worldToLocal(P.pos.clone());
    if (P.prone || (Math.abs(lp.x) < 2.4 && Math.abs(lp.z) < 3.3 && g.car.mode === 'parked')) {
      const hint = P.prone
        ? (g.car.raisedForCreeper() || !(Math.abs(lp.x) < 2.4 && Math.abs(lp.z) < 3.3) ? `${K('Z')}Get up` : `<span class="bad">The car is too low to slide under — jack it up and put it on axle stands first</span>\n${K('Z')}Get up`)
        : `${K('Z')}Lie down on the creeper${g.car.raisedForCreeper() ? ' (slide under the car)' : ''}`;
      prompt = prompt ? prompt + '\n' + hint : hint;
    }
    g.ui.prompt(prompt, active);
  }

  // ---------- fasteners ----------
  handleFastener(t, dt, input) {
    const g = this.game, asm = g.asm;
    const f = t.inst.fast[t.i];
    const grp = t.g;
    const name = `${grp.name || (grp.kind === 'clamp' ? 'hose clamp' : grp.kind === 'clip' ? 'connector' : 'bolt')} — ${t.inst.def.name}`;
    const state = !f.in ? 'removed' : f.s ? 'STRIPPED' : f.q < 0.05 ? 'finger tight' : f.q < TIGHT_OK ? 'loose' : f.q <= OVER_WARN ? 'tight' : 'over-tightened';
    let p = `${name}\n<span class="dim">${grp.thread} · ${SIZE_LABEL(grp.size)}${typeof grp.size === 'number' ? '' : ''} · spec ${grp.torque} Nm · ${state}</span>\n`;
    // bolt kit fixes stripped threads
    if (this.held?.def.id === 'bolt_kit') {
      if (f.s || !f.in && grp.kind === 'bolt') {
        p += `${K('LMB')}Fit a new ${grp.thread} ${grp.kind}`;
        if (input.mouse.lDown) {
          f.s = false; f.in = true; f.q = 0;
          this.held.props.uses = (this.held.props.uses ?? 6) - 1;
          asm.refreshFasteners(t.inst); asm.changed(); g.audio.click(0.6);
          if (this.held.props.uses <= 0) { g.asm.remove(this.release()); g.toast('Bolt kit used up'); }
        }
      } else p += '<span class="dim">This fastener is fine</span>';
      return p;
    }
    const need = grp.size;
    const have = this.toolSize();
    const kind = this.heldKind();
    const toolName = kind === 'none' ? 'hands' : this.held.def.name + (this.held.props.socket ? ` + ${this.held.props.socket} mm socket` : '');
    let fits = need === have;
    if (need === 'hand' && kind === 'none') fits = true;
    if (!fits) {
      if (kind === 'none') p += `<span class="bad">Needs ${need === 'hand' ? 'hands' : typeof need === 'number' ? `a ${need} mm socket or wrench` : 'a ' + SIZE_LABEL(need)}</span>`;
      else if (have === null) p += `<span class="bad">No socket on the ${this.held.def.name.toLowerCase()} — pick one from the socket case</span>`;
      else if (typeof need === 'number' && typeof have === 'number') p += `<span class="bad">${have} mm is too ${have > need ? 'big' : 'small'} for this head</span>`;
      else p += `<span class="bad">The ${toolName} doesn't fit this (${SIZE_LABEL(need)})</span>`;
      if (input.mouse.lDown || input.mouse.rDown) g.audio.clink();
      return p;
    }
    if (f.s) return p + `<span class="bad">Thread stripped — needs a new ${grp.kind} (bolt kit)</span>`;
    p += `${K('LMB')}Tighten   ${K('RMB')}Loosen`;
    const toolType = kind === 'none' ? 'hand' : this.held.def.type;
    const rate = TOOL_RATE[toolType] * (g.life.fatigue > 80 ? 0.7 : 1) * (grp.torque > 60 ? 0.7 : 1);
    if (input.mouse.l) {
      if (!f.in) { f.in = true; f.q = 0; g.audio.click(0.5); asm.changed(); }
      else {
        const before = f.q;
        let nq = f.q + rate * dt;
        if (toolType === 'torque_wrench' && nq >= 1) { nq = 1; if (before < 1) g.audio.torqueClick(); }
        if (toolType !== 'torque_wrench' && before < 1 && nq >= 1) g.audio.snug();
        if (before < 1 && nq >= 1) g.life.cheer(0.6, true);
        f.q = nq;
        if (f.q > STRIP_AT && grp.kind === 'bolt') { f.s = true; f.q = 0; g.audio.snap(); g.say('*SNAP* — I stripped the thread. Overdid that one.'); }
        if (f.q > STRIP_AT && grp.kind !== 'bolt') f.q = STRIP_AT;
        this.ratchetSound(toolType, dt);
        if (g.settings.quick && f.q >= 1 && before < 1) this.quickAll(t, true);
        asm.refreshFasteners(t.inst); asm.changed();
        g.life.exert(dt * 0.15);
      }
    } else if (input.mouse.r && f.in) {
      f.q -= rate * 1.4 * dt;
      this.ratchetSound(toolType, dt);
      if (f.q <= 0) {
        f.q = 0; this.unthread += dt;
        if (this.unthread > 0.45) { f.in = false; this.unthread = 0; g.audio.boltOut(); if (g.settings.quick) this.quickAll(t, false); }
      }
      asm.refreshFasteners(t.inst); asm.changed();
    } else this.unthread = 0;
    if (f.in) g.ui.torque({ q: f.q, spec: grp.torque, exact: toolType === 'torque_wrench', ok: TIGHT_OK, over: OVER_WARN, strip: STRIP_AT });
    return p;
  }
  quickAll(t, tighten) {
    const asm = this.game.asm;
    const s = asm.slotDef(t.inst);
    let i = 0;
    for (const grp of s.fast) for (const _ of grp.pts) {
      if (grp === t.g) { const f = t.inst.fast[i]; if (!f.s) { if (tighten) { f.in = true; f.q = 1; } else { f.in = false; f.q = 0; } } }
      i++;
    }
    asm.refreshFasteners(t.inst); asm.changed();
  }
  ratchetSound(type, dt) {
    this.lastCue += dt;
    const period = type === 'ratchet' || type === 'torque_wrench' ? 0.09 : type === 'hand' ? 0.3 : 0.22;
    if (this.lastCue > period) { this.lastCue = 0; this.game.audio.ratchet(type); }
  }
  cycleSocket(dir) {
    const g = this.game;
    const tool = this.held;
    if (tool.def.type !== 'ratchet' && tool.def.type !== 'torque_wrench') return;
    const kase = g.nearestSocketCase(2.5);
    if (!kase) { g.say('The socket case is too far away.'); return; }
    const list = [...kase.props.sockets].sort((a, b) => a - b);
    if (!list.length) return;
    let i = list.indexOf(tool.props.socket);
    i = i < 0 ? 0 : (i + (dir > 0 ? 1 : -1) + list.length) % list.length;
    tool.props.socket = list[i];
    g.audio.click(0.4);
    g.toast(`${list[i]} mm socket on the ${tool.def.name.toLowerCase()}`, 1.2);
  }

  // ---------- installing ----------
  handleSlot(t, input) {
    const g = this.game, asm = g.asm, h = this.held;
    const slot = slotById(t.host.def.host, t.slot);
    const chk = asm.checkInstall(h, t.host, t.slot);
    let p = `${slot.name}\n`;
    let orientOk = true;
    if ((h.def.orient || 1) > 1) {
      const m = asm.slotWorldMatrix(t.host, t.slot);
      const sf = new THREE.Vector3(0, 0, 1).transformDirection(m);
      const hf = new THREE.Vector3(0, 0, 1).applyQuaternion(h.obj.getWorldQuaternion(new THREE.Quaternion()));
      const sy = Math.atan2(sf.x, sf.z), hy = Math.atan2(hf.x, hf.z);
      let d = Math.abs(Math.atan2(Math.sin(hy - sy), Math.cos(hy - sy)));
      if (h.def.orient === 2) d = Math.min(d, Math.PI - d);
      orientOk = d < Math.PI / 4;
    }
    if (!chk.ok) p += chk.reasons.map((r) => `<span class="bad">${r}</span>`).join('\n');
    else if (!orientOk) p += `<span class="bad">Wrong way round — ${h.def.desc || 'check the orientation'} (${K('R')}rotate)</span>`;
    else p += `${K('LMB')}Fit ${h.def.name}`;
    if (input.mouse.lDown && chk.ok && orientOk) {
      const inst = this.release();
      asm.install(inst, t.host, t.slot);
      g.life.cheer(2, true);
      if (inst.def.type === 'timing_belt') {
        const cam = asm.at(t.host, 'head/camSprocket'), crank = t.host.kids.crankSprocket;
        inst.props.offset = (cam?.props.tooth || 0) - (crank?.props.tooth || 0);
      }
      g.audio.install(inst.def.mass);
      if (asm.slotDef(inst).fast?.length) g.toast(`${inst.def.name} fitted — fasteners finger tight`, 2);
    }
    return p;
  }

  // ---------- removing / interacting with installed parts ----------
  handleInstalled(t, input) {
    const g = this.game, asm = g.asm, inst = t.inst;
    const slot = asm.slotDef(inst);
    const sum = asm.fastenerSummary(inst);
    let p = `${inst.def.name}${inst.known ? ` <span class="dim">${Math.round(inst.cond * 100)}%</span>` : ''}\n`;
    if (sum.total) p += `<span class="dim">${sum.total - sum.out}/${sum.total} fasteners in${sum.loose ? `, ${sum.loose} loose` : ''}${sum.stripped ? `, ${sum.stripped} stripped` : ''}</span>\n`;
    // sprocket: turn by hand to set the timing marks
    if ((inst.def.type === 'cam_sprocket' || inst.def.type === 'crank_sprocket') && !this.held) {
      const block = inst.def.type === 'crank_sprocket' ? asm.hostOf(inst) : asm.hostOf(asm.hostOf(inst));
      const belt = block?.kids?.timingBelt;
      const tooth = inst.props.tooth || 0;
      p += belt ? `<span class="dim">Turns with the belt fitted</span>\n` : `<span class="dim">Mark ${tooth === 0 ? 'lined up ✔' : `${tooth > 0 ? '+' : ''}${tooth} teeth from the mark`}</span> ${K('Wheel')}Turn\n`;
      if (input.mouse.wheel && !belt) {
        const n = inst.def.type === 'cam_sprocket' ? 24 : 12;
        let tt = tooth + Math.sign(input.mouse.wheel);
        if (tt > n / 2) tt -= n; if (tt < -n / 2 + 1) tt += n;
        inst.props.tooth = tt; asm.updateSprocket(inst); g.audio.click(0.25); asm.changed();
      }
    }
    // openables
    if (slot.openable) {
      const lz = asm.looseness(inst);
      if (sum.out === sum.total) {
        p += `${K('E')}Lift off ${inst.def.name}`;
        if (input.hit('KeyE')) this.takeInstalled(inst);
      } else {
        p += `${K('E')}${inst.props.open ? 'Close' : 'Open'}` + (lz > 0.4 ? ` <span class="bad">(hinges loose — it sags)</span>` : '');
        if (input.hit('KeyE')) { inst.props.open = !inst.props.open; inst.props.openT = inst.props.openT ?? (inst.props.open ? 0 : 1); g.audio.door(inst.props.open, inst.def.type); }
      }
      return p;
    }
    const chk = asm.checkRemove(inst);
    if (this.held) return p + `<span class="dim">Hands full</span>`;
    if (slot.hoist) return p + `<span class="dim">Use the engine hoist to lift the engine out (${K('F')} at the hoist)</span>`;
    if (!chk.ok) p += chk.reasons.map((r) => `<span class="bad">${r}</span>`).join('\n');
    else {
      const m = asm.subtreeMass(inst);
      if (m > MAX_CARRY) p += `<span class="bad">Too heavy to lift by hand (${Math.round(m)} kg)</span>`;
      else { p += `${K('E')}Remove`; if (input.hit('KeyE')) this.takeInstalled(inst); }
    }
    return p;
  }
  takeInstalled(inst) {
    const g = this.game;
    const host = g.asm.hostOf(inst);
    g.asm.uninstall(inst);
    this.hold(inst);
    if (host === g.car.chassis && ['radiator', 'hose_upper', 'hose_lower'].includes(inst.def.type) && g.car.chassis.props.coolant > 0.2) {
      g.car.leaked('coolant', g.car.chassis.props.coolant, g.car.chassis.obj.localToWorld(new THREE.Vector3(0, 0, 1.6)));
      g.car.chassis.props.coolant = 0; g.say('Coolant gushes all over the floor.');
    }
    if (inst.def.type === 'oil_pan' || inst.def.type === 'oil_filter') {
      const blk = host?.def.type === 'block' ? host : null;
      if (blk && blk.props.oil > 0.1) { g.car.leaked('oil', blk.props.oil, blk.obj.getWorldPosition(new THREE.Vector3())); blk.props.oil = inst.def.type === 'oil_filter' ? blk.props.oil * 0.85 : 0; g.say('Oil everywhere. Should have drained it first.'); }
    }
  }

  // ---------- loose items ----------
  handleLoose(t, input) {
    const g = this.game, inst = t.inst;
    const m = g.asm.subtreeMass(inst);
    let p = `${inst.def.name}${inst.def.type === 'fluid' ? ` <span class="dim">${inst.props.amount.toFixed(1)} / ${inst.def.cap} L</span>` : ''}${inst.def.kind === 'part' && inst.known ? ` <span class="dim">${Math.round(inst.cond * 100)}%</span>` : inst.def.kind === 'part' ? ' <span class="dim">condition unknown</span>' : ''}\n`;
    // socket case: pick a socket while holding a ratchet / add a loose socket
    if (inst.def.type === 'socket_case' && this.held && (this.held.def.type === 'ratchet' || this.held.def.type === 'torque_wrench')) {
      p += `${K('E')}Choose socket ${K('Wheel')}Cycle`;
      if (input.hit('KeyE')) g.ui.openSockets(inst, this.held);
      return p;
    }
    if (inst.def.type === 'socket_case' && this.held?.def.type === 'socket') {
      p += `${K('E')}Put the ${this.held.def.name} in the case`;
      if (input.hit('KeyE')) { const s = this.release(); inst.props.sockets.push(s.props.size); g.asm.remove(s); g.audio.click(0.5); }
      return p;
    }
    if (inst.def.type === 'box') {
      p += `${K('E')}Open package`;
      if (input.hit('KeyE')) g.openPackage(inst);
      return p;
    }
    if (inst.props.forSale) {
      p += `<span class="dim">Used part — condition unknown until inspected</span>\n${K('E')}Buy for ${inst.props.forSale} mk`;
      if (input.hit('KeyE')) {
        if (this.held) { g.say('Hands full.'); return p; }
        if (g.money < inst.props.forSale) { g.say('Raimo: "No money, no part."'); return p; }
        g.addMoney(-inst.props.forSale, `Used ${inst.def.name} from Romu-Raimo`);
        delete inst.props.forSale;
        this.hold(inst);
      }
      return p;
    }
    if (this.held) return p + `<span class="dim">Hands full (${K('G')}put down)</span>`;
    if (m > MAX_CARRY) return p + `<span class="bad">Too heavy to carry (${Math.round(m)} kg) — use the hoist</span>`;
    p += `${K('E')}Pick up` + (m > 20 ? ` <span class="dim">(heavy, ${Math.round(m)} kg)</span>` : '');
    if (input.hit('KeyE')) { const why = g.canPickUp(inst); if (why) g.say(why); else this.hold(inst); }
    return p;
  }

  // ---------- surfaces: place held things ----------
  handleSurface(t, input) {
    if (!this.held) return '';
    const kind = this.heldKind();
    if (this.held.def.type === 'axle_stands') return '';
    let p = `${K('LMB')}Place ${this.held.def.name}   ${K('G')}Drop`;
    if (kind === 'part') p = `${K('LMB')}Place   ${K('R')}Rotate   ${K('RMB')}Inspect`;
    if (kind === 'fasten' || kind === 'food') p = `${K('G')}Put down`;
    if (kind === 'fluid') p = `${K('LMB')}Place   <span class="dim">aim at a filler cap to pour</span>`;
    if (input.mouse.lDown && kind !== 'fasten' && kind !== 'food') this.placeAt(t);
    return p;
  }
  placeAt(t) {
    const g = this.game;
    let cont = null;
    for (let o = t.obj; o; o = o.parent) if (o.userData.containerId) { cont = o; break; }
    const it = this.release();
    const yaw = g.player.yaw + this.heldRot * Math.PI / 2;
    g.asm.dropAt(it, t.point, yaw, cont);
    g.audio.putDown(it.def.mass);
  }
  putDown(t) {
    const g = this.game;
    if (t && (t.type === 'surface' || t.type === 'loose') && t.point) return this.placeAt({ ...t, obj: t.type === 'loose' ? t.obj : t.obj });
    const p = g.player.pos.clone().add(new THREE.Vector3(-Math.sin(g.player.yaw) * 0.6, 0, -Math.cos(g.player.yaw) * 0.6));
    p.y = g.floorAt(p.x, p.z, g.player.pos.y + 0.5);
    const it = this.release();
    g.asm.dropAt(it, p, g.player.yaw, null);
    g.audio.putDown(it.def.mass);
  }
  pocket() {
    const g = this.game;
    if (g.asm.subtreeMass(this.held) > 2.5) { g.say('That won\'t fit in my pockets.'); return; }
    if (g.inventory.length >= 12) { g.say('Pockets are full.'); return; }
    const it = this.release();
    g.asm.setInventory(it);
    g.inventory.push(it.uid);
    g.audio.click(0.3);
    g.toast(`Pocketed ${it.def.name}`, 1.5);
  }

  // ---------- fluids ----------
  handleFill(t, dt, input) {
    const g = this.game, asm = g.asm, can = this.held;
    const target = this.fillTarget(t);
    let p = `${t.name[0].toUpperCase() + t.name.slice(1)} <span class="dim">${target.level.toFixed(2)} / ${target.cap} L</span>\n`;
    const wrong = can.def.fluid !== t.fluid;
    p += can.def.infinite ? `${K('LMB')}Fill up <span class="dim">(7,90 mk/L)</span>` : `${K('LMB')}Pour ${can.def.name.split('(')[0].trim()} <span class="dim">(${can.props.amount.toFixed(1)} L left)</span>`;
    if (wrong) p += `\n<span class="bad">Wait — this is the ${t.name}!</span>`;
    if (input.mouse.l && can.props.amount > 0) {
      const d = Math.min(can.props.amount, dt * (t.fluid === 'fuel' ? (can.def.infinite ? 2.5 : 1.2) : 0.45), Math.max(0, target.cap - target.level) + (can.def.infinite ? 0 : 99));
      if (can.def.infinite) { if (d <= 0) return p + '\n<span class="dim">Full.</span>'; g.chargeFuel(d); } else can.props.amount -= d;
      this.pourT += dt;
      if (this.pourT > 0.35) { this.pourT = 0; g.audio.pour(); }
      if (wrong) {
        target.contaminate?.(d);
        if (!this.warnedWrong) { this.warnedWrong = true; g.say(`Uh oh. That was ${can.def.fluid === 'fuel' ? 'petrol' : can.def.fluid}, not ${t.fluid === 'gearoil' ? 'gear oil' : t.fluid}.`); }
      } else if (target.spills) { g.car.leaked(t.fluid === 'coolant' ? 'coolant' : 'oil', d, target.spillAt); if (!this.warnedSpill) { this.warnedSpill = true; g.say(target.spillMsg); } }
      else {
        const room = target.cap - target.level;
        target.add(Math.min(d, room));
        if (d > room) { g.car.leaked(t.fluid === 'coolant' ? 'coolant' : 'oil', d - room, t.inst.obj.getWorldPosition(new THREE.Vector3())); if (!this.warnedOver) { this.warnedOver = true; g.say('Overfilled it — it\'s running down the side.'); } }
      }
      asm.changed();
    } else { this.warnedWrong = false; this.warnedSpill = false; this.warnedOver = false; }
    return p;
  }
  fillTarget(t) {
    const g = this.game, asm = g.asm, inst = t.inst;
    const up = (type) => { let x = inst; while (x && x.def.type !== type) x = asm.hostOf(x); return x; };
    const here = inst.obj.getWorldPosition(new THREE.Vector3());
    if (inst.def.type === 'fluid') return { level: inst.props.amount || 0, cap: inst.def.cap, add: (d) => { inst.props.amount = (inst.props.amount || 0) + d; }, spills: false, contaminate: () => {} };
    switch (t.fluid) {
      case 'oil': {
        const blk = up('block');
        const spills = !blk || !blk.kids.oilPan || !asm.fastenerByRole(blk.kids.oilPan, 'drain')?.f?.in;
        return { level: blk?.props.oil || 0, cap: OIL_CAP, add: (d) => { blk.props.oil = (blk.props.oil || 0) + d; }, spills, spillAt: blk ? blk.obj.getWorldPosition(new THREE.Vector3()) : here,
          spillMsg: !blk ? 'There is no engine under this cover.' : !blk.kids.oilPan ? 'It\'s pouring straight through — there\'s no oil pan!' : 'It\'s draining out of the drain plug hole!',
          contaminate: (d) => { if (blk) blk.props.contam = (blk.props.contam || 0) + d; } };
      }
      case 'coolant': {
        const car = g.car;
        const inCar = asm.root(inst) === car.chassis;
        const S = car.systems();
        const spills = !inCar || S.coolLeak >= 1;
        return { level: car.chassis.props.coolant || 0, cap: COOLANT_CAP, add: (d) => { car.chassis.props.coolant = (car.chassis.props.coolant || 0) + d; }, spills, spillAt: here,
          spillMsg: inCar ? 'It\'s running straight out — the cooling circuit isn\'t closed (hoses, pump, thermostat, engine).' : 'The radiator isn\'t connected to anything.',
          contaminate: (d) => { car.chassis.props.coolContam = (car.chassis.props.coolContam || 0) + d; } };
      }
      case 'fuel': return { level: inst.props.fuel || 0, cap: FUEL_CAP, add: (d) => { inst.props.fuel = (inst.props.fuel || 0) + d; }, spills: false, contaminate: (d) => { inst.props.fuelContam = (inst.props.fuelContam || 0) + d; } };
      case 'brake': return { level: inst.props.fluid || 0, cap: BRAKE_CAP, add: (d) => { inst.props.fluid = (inst.props.fluid || 0) + d; }, spills: false, contaminate: () => {} };
      case 'gearoil': {
        const spills = !inst.kids.gbCover;
        return { level: inst.props.oil || 0, cap: GEAROIL_CAP, add: (d) => { inst.props.oil = (inst.props.oil || 0) + d; }, spills, spillAt: here, spillMsg: 'It pours out of the bottom — the gearbox cover is off.', contaminate: () => {} };
      }
    }
    return { level: 0, cap: 1, add: () => {} };
  }

  // ---------- misc interactables ----------
  handleAction(t, input) {
    const g = this.game;
    if (t.action === 'enter') {
      const door = g.car.chassis.kids.doorL;
      if (this.held) return `<span class="dim">Hands full</span>`;
      let p = `${K('E')}Get in`;
      if (g.car.isUpsideDown()) p = `${K('E')}Push the car back onto its wheels`;
      if (input.hit('KeyE')) { if (g.car.isUpsideDown()) { g.car.flipUpright(); g.life.exert(15); g.say('Hnnngh… there.'); } else g.enterCar(); }
      return p;
    }
    if (t.action === 'ignition') return `<span class="dim">Get in to use the ignition</span>`;
    return '';
  }
  handleInteract(t, dt, input) {
    const d = t.def;
    let p = typeof d.prompt === 'function' ? d.prompt() : d.prompt;
    if (input.hit('KeyE')) d.use('E');
    if (input.hit('KeyF')) d.use('F');
    if (d.hold) {
      this.holdT -= dt;
      if ((input.mouse.l || input.mouse.r) && this.holdT <= 0) { this.holdT = 0.14; d.use(input.mouse.l ? 'LMB' : 'RMB'); }
    } else {
      if (input.mouse.lDown) d.use('LMB');
    }
    return p;
  }

  // ---------- in the car ----------
  updateInCar(dt, input) {
    this.clearGhosts();
    // look at a door from inside: E opens / closes it (handled in driveControls, which owns E in the car)
    const g = this.game;
    this.carDoor = null;
    if (g.player.inCar) {
      const doors = ['doorL', 'doorR'].map((k) => g.car.chassis.kids[k]).filter(Boolean);
      if (doors.length) {
        g.camera.updateMatrixWorld();
        this.ray.setFromCamera(new THREE.Vector2(0, 0), g.camera);
        const hit = this.ray.intersectObjects(doors.map((d) => d.obj), true).find((h) => h.distance < 1.8);
        if (hit) this.carDoor = doors.find((d) => { let o = hit.object; while (o) { if (o === d.obj) return true; o = o.parent; } return false; });
      }
    }
    if (this.carDoor) { g.ui.prompt(`${K('E')}${this.carDoor.props.open ? 'Close' : 'Open'} the door <span class="dim">(look away from the door and press E to get out)</span>`, true); g.ui.torque(null); return; }
    this.game.ui.prompt('', false);
    this.game.ui.torque(null);
  }
}
