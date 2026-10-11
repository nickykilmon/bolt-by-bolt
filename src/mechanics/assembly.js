// The assembly graph: every item instance, where it is, what it is bolted to,
// slot prerequisites, fastener state, and the 3D objects that represent all of it.
import * as THREE from 'three';
import { DEFS, HOSTS, slotById, fastenerList, fastenerCount, SIZE_LABEL, FILL_POINTS } from './partsdb.js';
import { buildPartMesh } from './partMeshes.js';
import { MAT, wornMat } from '../core/materials.js';
import { newUid } from '../core/util.js';

const _v = new THREE.Vector3(), _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

export const TIGHT_OK = 0.85;   // fraction of spec torque that counts as properly tight
export const OVER_WARN = 1.3;   // over-torque that starts damaging threads
export const STRIP_AT = 1.6;    // over-torque that strips the thread

export class Assembly {
  constructor(scene) {
    this.scene = scene;
    this.items = new Map();
    this.containers = new Map(); // id -> Object3D (drawers, shelves...)
    this.hoistHook = null;       // Object3D the hoist load hangs from
    this.ctx = { isLifted: () => false };
    this.version = 0;            // bumps on any assembly change (sim caches key off this)
    this.onChange = null;
  }

  // ---------- creation ----------
  create(defId, opts = {}) {
    const def = DEFS[defId];
    if (!def) throw new Error('Unknown item def ' + defId);
    const inst = {
      uid: opts.uid || newUid(def.kind === 'root' ? 'r' : 'i'),
      defId, def,
      cond: opts.cond ?? 1,
      known: opts.known ?? true,
      props: { ...(def.props ? structuredClone(def.props) : {}), ...(opts.props || {}) },
      slot: null,         // { host: uid, id }
      loc: null,          // { kind: 'world'|'held'|'inv'|'hoist'|'root', pos, yaw, cont }
      fast: [],           // per-fastener { in, q, s }
      kids: {},           // slotId -> inst
      anchors: {},        // slotId -> Object3D
      obj: new THREE.Group(),
    };
    if (def.type === 'fluid' && inst.props.amount === undefined) inst.props.amount = opts.amount ?? def.cap;
    inst.obj.userData.inst = inst;
    if (def.kind !== 'root') this.buildVisual(inst);
    this.items.set(inst.uid, inst);
    return inst;
  }

  buildVisual(inst) {
    if (inst.vis) inst.obj.remove(inst.vis);
    const vis = buildPartMesh(inst.def);
    vis.traverse((o) => {
      if (o.isMesh) {
        o.userData.inst = inst;
        if (o.material !== MAT.glass) o.material = wornMat(o.material, inst.cond);
      }
    });
    let fp = FILL_POINTS[inst.def.type];
    if (inst.def.type === 'fluid' && !inst.def.infinite) { const bb = new THREE.Box3().setFromObject(vis); fp = { fluid: inst.def.fluid, pos: [0, bb.max.y, 0], name: inst.def.name.split('(')[0].trim().toLowerCase() }; }
    if (fp) {
      const hit = new THREE.Mesh(FILL_GEO, MAT.hit);
      hit.position.set(...fp.pos);
      hit.userData.fill = { inst, fluid: fp.fluid, name: fp.name };
      vis.add(hit);
    }
    inst.vis = vis;
    inst.obj.add(vis);
    if (inst.def.type === 'cam_sprocket' || inst.def.type === 'crank_sprocket') this.updateSprocket(inst);
    this.computeBounds(inst);
  }

  computeBounds(inst) {
    const b = new THREE.Box3();
    inst.vis.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(inst.obj.matrixWorld).invert();
    inst.vis.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry.computeBoundingBox();
      const bb = o.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      b.union(bb);
    });
    inst.bounds = b.isEmpty() ? new THREE.Box3(new THREE.Vector3(-0.05, 0, -0.05), new THREE.Vector3(0.05, 0.1, 0.05)) : b;
  }

  updateSprocket(inst) {
    const rot = inst.vis?.getObjectByName('rot');
    if (rot) rot.rotation.z = -(inst.props.tooth || 0) * (Math.PI * 2 / (inst.def.type === 'cam_sprocket' ? 24 : 12));
  }

  // ---------- queries ----------
  get(uid) { return this.items.get(uid); }
  hostOf(inst) { return inst.slot ? this.items.get(inst.slot.host) : null; }
  slotDef(inst) { const h = this.hostOf(inst); return h ? slotById(h.def.host, inst.slot.id) : null; }
  root(inst) { let r = inst; while (r.slot) r = this.items.get(r.slot.host); return r; }
  isAncestor(a, b) { let r = b; while (r) { if (r === a) return true; r = this.hostOf(r); } return false; }
  *descendants(inst) { for (const k of Object.values(inst.kids)) { yield k; yield* this.descendants(k); } }
  subtreeMass(inst) { let m = inst.def.mass || 0; for (const d of this.descendants(inst)) m += d.def.mass || 0; return m; }
  occupant(host, slotId) { return host?.kids[slotId] || null; }
  findDesc(inst, type) { for (const d of this.descendants(inst)) if (d.def.type === type) return d; return null; }

  // Resolve 'a/b/c' relative to host: walk occupants a, b, then return {host, slot: 'c'}.
  resolve(host, path) {
    const segs = path.split('/');
    let h = host;
    for (let i = 0; i < segs.length - 1; i++) { h = h?.kids[segs[i]]; if (!h) return null; }
    return { host: h, slot: segs[segs.length - 1] };
  }
  at(host, path) { const r = this.resolve(host, path); return r ? r.host.kids[r.slot] || null : null; }

  slotName(host, slotId) { return slotById(host.def.host, slotId)?.name || slotId; }

  // ---------- fasteners ----------
  fastenerSummary(inst) {
    const s = this.slotDef(inst);
    let total = 0, out = 0, loose = 0, over = 0, stripped = 0;
    if (s) for (const { i } of fastenerList(s)) {
      total++;
      const f = inst.fast[i];
      if (!f || !f.in) out++;
      else if (f.s) stripped++;
      else if (f.q < TIGHT_OK) loose++;
      else if (f.q > OVER_WARN) over++;
    }
    return { total, out, loose, over, stripped, secure: total === 0 || (out === 0 && loose === 0 && stripped === 0) };
  }
  // 0 = perfectly fastened, 1 = nothing holding it
  looseness(inst) {
    const s = this.slotDef(inst);
    const n = s ? fastenerCount(s) : 0;
    if (!n) return 0;
    let bad = 0;
    for (let i = 0; i < n; i++) {
      const f = inst.fast[i];
      if (!f || !f.in || f.s) bad += 1; else if (f.q < TIGHT_OK) bad += 1 - f.q / TIGHT_OK * 0.7;
    }
    return bad / n;
  }
  fastenerByRole(inst, role) {
    const s = this.slotDef(inst);
    if (!s) return null;
    for (const { i, g } of fastenerList(s)) if (g.role === role) return { f: inst.fast[i], g, i };
    return null;
  }

  // ---------- install / remove checks ----------
  checkInstall(inst, host, slotId) {
    const slot = slotById(host.def.host, slotId);
    const reasons = [];
    if (!slot) return { ok: false, reasons: ['no such slot'] };
    if (slot.accepts !== inst.def.type) reasons.push(`${inst.def.name} does not fit here`);
    if (host.kids[slotId]) reasons.push(`${slot.name} is already fitted`);
    for (const r of slot.req || []) {
      if (!this.at(host, r)) {
        const res = this.resolve(host, r);
        reasons.push('Needs ' + (res ? this.slotName(res.host, res.slot) : r.split('/').map((s) => s).join(' → ')) + ' fitted first');
      }
    }
    for (const c of slot.needChildren || []) {
      if (!inst.kids[c]) reasons.push(`Fit the ${slotById(inst.def.host, c).name.toLowerCase()} to the ${inst.def.name.toLowerCase()} first`);
    }
    if (slot.lift && !this.ctx.isLifted(host, slot.lift)) reasons.push(`Raise the ${slot.lift === 'F' ? 'front' : 'rear'} of the car first (jack)`);
    if (this.isAncestor(inst, host)) reasons.push('Cannot fit a part into itself');
    return { ok: reasons.length === 0, reasons, slot };
  }

  // Parts outside inst's subtree whose prerequisites point into inst's subtree.
  dependents(inst) {
    const root = this.root(inst);
    const out = [];
    const all = [root, ...this.descendants(root)];
    for (const x of all) {
      if (!x.slot || this.isAncestor(inst, x)) continue;
      const xs = this.slotDef(x);
      const xh = this.hostOf(x);
      for (const r of xs.req || []) {
        const res = this.resolve(xh, r);
        if (!res) continue;
        const target = res.host.kids[res.slot];
        if (target && this.isAncestor(inst, target)) { out.push(x); break; }
      }
    }
    return out;
  }

  checkRemove(inst) {
    const reasons = [];
    const slot = this.slotDef(inst);
    if (!slot) return { ok: false, reasons: ['not installed'] };
    const sum = this.fastenerSummary(inst);
    if (sum.total && sum.out < sum.total) {
      const bySize = {};
      for (const { i, g } of fastenerList(slot)) if (inst.fast[i]?.in) bySize[g.size] = (bySize[g.size] || 0) + 1;
      reasons.push('Undo ' + Object.entries(bySize).map(([s, n]) => `${n}× ${SIZE_LABEL(isNaN(s) ? s : +s)}`).join(', ') + ' first');
    }
    const deps = this.dependents(inst);
    if (deps.length) reasons.push('Remove first: ' + [...new Set(deps.map((d) => d.def.name))].slice(0, 3).join(', ') + (deps.length > 3 ? '…' : ''));
    const host = this.hostOf(inst);
    if (slot.lift && !this.ctx.isLifted(host, slot.lift)) reasons.push(`Raise the ${slot.lift === 'F' ? 'front' : 'rear'} of the car first`);
    return { ok: reasons.length === 0, reasons, slot };
  }

  // ---------- transforms ----------
  anchor(host, slotId) {
    let a = host.anchors[slotId];
    if (!a) {
      const s = slotById(host.def.host, slotId);
      a = new THREE.Group();
      a.position.set(...s.pos);
      if (s.rot) a.rotation.set(...s.rot);
      a.userData.slot = { host, id: slotId };
      host.obj.add(a);
      host.anchors[slotId] = a;
    }
    return a;
  }
  slotWorldMatrix(host, slotId) {
    const a = this.anchor(host, slotId);
    a.updateWorldMatrix(true, false);
    return a.matrixWorld;
  }

  // ---------- state changes ----------
  detachFromWorld(inst) {
    if (inst.obj.parent) inst.obj.parent.remove(inst.obj);
  }

  install(inst, host, slotId, { fastened = false, q = 1 } = {}) {
    if (inst.slot) this.uninstall(inst, { silent: true });
    this.detachFromWorld(inst);
    inst.loc = null;
    inst.slot = { host: host.uid, id: slotId };
    host.kids[slotId] = inst;
    const a = this.anchor(host, slotId);
    inst.obj.position.set(0, 0, 0); inst.obj.rotation.set(0, 0, 0); inst.obj.quaternion.identity();
    a.add(inst.obj);
    const s = slotById(host.def.host, slotId);
    const n = fastenerCount(s);
    inst.fast = [];
    for (let i = 0; i < n; i++) inst.fast.push({ in: true, q: fastened ? q : 0, s: false });
    this.buildFasteners(inst);
    if (s.openable) this.applyOpen(inst);
    this.changed();
  }

  uninstall(inst, { silent = false } = {}) {
    const host = this.hostOf(inst);
    if (!host) return;
    delete host.kids[inst.slot.id];
    inst.slot = null;
    inst.fast = [];
    if (inst.fastG) { inst.obj.remove(inst.fastG); inst.fastG = null; }
    this.detachFromWorld(inst);
    inst.obj.rotation.set(0, 0, 0);
    if (inst.vis) inst.vis.rotation.set(0, 0, 0);
    if (!silent) this.changed();
  }

  placeWorld(inst, pos, yaw = 0, cont = null) {
    if (inst.slot) this.uninstall(inst, { silent: true });
    this.detachFromWorld(inst);
    inst.loc = { kind: 'world', pos: [pos.x ?? pos[0], pos.y ?? pos[1], pos.z ?? pos[2]], yaw, cont };
    const parent = cont ? this.containers.get(cont) : this.scene;
    (parent || this.scene).add(inst.obj);
    inst.obj.position.set(...inst.loc.pos);
    inst.obj.rotation.set(0, yaw, 0);
    this.changed();
  }

  // Place so the bounding box bottom sits on surface height y (world point p).
  dropAt(inst, worldPoint, yaw, contObj) {
    const by = inst.bounds ? -inst.bounds.min.y : 0;
    const p = worldPoint.clone(); p.y += by + 0.002;
    let cont = null;
    if (contObj) {
      cont = contObj.userData.containerId;
      contObj.updateWorldMatrix(true, false);
      const local = contObj.worldToLocal(p.clone());
      // yaw relative to the container
      contObj.getWorldQuaternion(_q);
      const e = new THREE.Euler().setFromQuaternion(_q, 'YXZ');
      this.placeWorld(inst, local, yaw - e.y, cont);
    } else this.placeWorld(inst, p, yaw, null);
  }

  setHeld(inst, holder) {
    if (inst.slot) this.uninstall(inst, { silent: true });
    this.detachFromWorld(inst);
    inst.loc = { kind: 'held' };
    holder.add(inst.obj);
    this.changed();
  }
  setInventory(inst) {
    this.detachFromWorld(inst);
    inst.loc = { kind: 'inv' };
    this.changed();
  }
  setHoist(inst) {
    if (inst.slot) this.uninstall(inst, { silent: true });
    this.detachFromWorld(inst);
    inst.loc = { kind: 'hoist' };
    this.hoistHook.add(inst.obj);
    inst.obj.position.set(0, -0.62, 0); inst.obj.rotation.set(0, Math.PI / 2, 0);
    this.changed();
  }

  remove(inst) { // destroy an item (eaten, consumed)
    for (const k of [...Object.values(inst.kids)]) this.remove(k);
    if (inst.slot) this.uninstall(inst, { silent: true });
    this.detachFromWorld(inst);
    this.items.delete(inst.uid);
    this.changed();
  }

  changed() { this.version++; this.onChange?.(); }

  // ---------- openables (hood, doors, boot) ----------
  applyOpen(inst) {
    const s = this.slotDef(inst);
    if (!s?.openable) return;
    const t = inst.props.openT ?? (inst.props.open ? 1 : 0);
    const a = s.openable.angle * t;
    inst.vis.rotation.set(0, 0, 0);
    if (s.openable.axis === 'x') inst.vis.rotation.x = a; else inst.vis.rotation.y = a;
    if (inst.fastG) inst.fastG.rotation.copy(inst.vis.rotation);
  }

  // ---------- fastener meshes ----------
  buildFasteners(inst) {
    if (inst.fastG) inst.obj.remove(inst.fastG);
    const s = this.slotDef(inst);
    const g = new THREE.Group();
    g.name = 'fasteners';
    inst.fastG = g;
    inst.fastMeshes = [];
    if (s) for (const { i, g: grp, p } of fastenerList(s)) {
      const f = new THREE.Group();
      f.position.set(...p);
      const dir = new THREE.Vector3(...grp.dir).normalize();
      f.quaternion.setFromUnitVectors(UP, dir);
      const head = new THREE.Mesh(fastenerGeo(grp), fastenerMat(grp));
      head.castShadow = false;
      f.add(head);
      const hit = new THREE.Mesh(HIT_GEO, MAT.hit);
      hit.userData.fastener = { inst, i, g: grp };
      f.add(hit);
      f.userData.head = head;
      g.add(f);
      inst.fastMeshes[i] = f;
    }
    inst.obj.add(g);
    this.refreshFasteners(inst);
  }
  refreshFasteners(inst) {
    if (!inst.fastMeshes) return;
    inst.fastMeshes.forEach((f, i) => {
      const st = inst.fast[i];
      const head = f.userData.head;
      head.visible = !!st?.in;
      // threaded-out bolts sit proud of the surface
      head.position.y = st?.in ? (st.q >= TIGHT_OK ? 0 : 0.006 + (1 - Math.min(st.q / TIGHT_OK, 1)) * 0.01) : 0;
      if (st?.s) head.material = STRIPPED_MAT;
      else head.material = fastenerMat(f.children[1].userData.fastener.g);
    });
  }
  // Inspection colouring
  setFastenerXray(on) {
    for (const inst of this.items.values()) {
      if (!inst.fastMeshes) continue;
      inst.fastMeshes.forEach((f, i) => {
        const head = f.userData.head;
        const st = inst.fast[i];
        if (!on) { head.material = st?.s ? STRIPPED_MAT : fastenerMat(f.children[1].userData.fastener.g); head.visible = !!st?.in; head.renderOrder = 0; return; }
        head.visible = true;
        head.renderOrder = 10;
        head.material = !st?.in ? XRAY.out : st.s ? XRAY.stripped : st.q < TIGHT_OK ? XRAY.loose : st.q > OVER_WARN ? XRAY.over : XRAY.ok;
      });
    }
  }

  // ---------- serialisation ----------
  serialize() {
    const out = [];
    for (const it of this.items.values()) {
      out.push({
        u: it.uid, d: it.defId, c: +it.cond.toFixed(4), k: it.known ? 1 : 0, p: it.props,
        s: it.slot, l: it.loc, f: it.fast.map((f) => [f.in ? 1 : 0, +f.q.toFixed(3), f.s ? 1 : 0]),
      });
    }
    return out;
  }
  clear() {
    for (const it of this.items.values()) this.detachFromWorld(it);
    this.items.clear();
  }
}

// --- fastener visuals ---
const HIT_GEO = new THREE.SphereGeometry(0.022, 6, 4);
const FILL_GEO = new THREE.SphereGeometry(0.05, 6, 4);
const fgCache = new Map();
function fastenerGeo(g) {
  const key = g.kind + g.size;
  if (fgCache.has(key)) return fgCache.get(key);
  let geo;
  if (g.kind === 'clamp') geo = new THREE.TorusGeometry(0.028, 0.004, 4, 12).rotateX(Math.PI / 2);
  else if (g.kind === 'clip') geo = new THREE.BoxGeometry(0.03, 0.02, 0.03).translate(0, 0.01, 0);
  else if (g.kind === 'plug') geo = new THREE.CylinderGeometry(0.01, 0.01, 0.04, 6).translate(0, 0.02, 0);
  else {
    const r = typeof g.size === 'number' ? g.size * 0.0006 : 0.004;
    geo = new THREE.CylinderGeometry(r, r, r * 0.9, 6).translate(0, r * 0.45, 0);
  }
  fgCache.set(key, geo);
  return geo;
}
const STRIPPED_MAT = new THREE.MeshStandardMaterial({ color: 0x6a3a2a, roughness: 0.9, metalness: 0.4 });
function fastenerMat(g) {
  if (g.kind === 'clip') return MAT.plastic;
  if (g.kind === 'plug') return MAT.ceramic;
  if (g.kind === 'clamp') return MAT.steel;
  return MAT.darkSteel;
}
const xm = (c) => new THREE.MeshBasicMaterial({ color: c, depthTest: false, transparent: true, opacity: 0.95 });
const XRAY = { ok: xm(0x40e060), loose: xm(0xffc030), out: xm(0xff3030), over: xm(0xff40ff), stripped: xm(0x904020) };
