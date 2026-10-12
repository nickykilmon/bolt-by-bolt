// Rally: stages built on the stage roads (both directions), multi-stage events with
// timed liaisons, practice runs, generated pace notes read by the co-driver, AI field,
// prizes, reputation and a championship with rival points.
import * as THREE from 'three';
import { ROADS, heightAt } from '../world/terrain.js';
import { MAT } from '../core/materials.js';
import { labelTex } from '../core/textures.js';
import { mulberry32, fmtMoney } from '../core/util.js';

export const STAGES = {
  harju: { road: 'Harju', rev: false, name: 'Harju Ridge' },
  harjuR: { road: 'Harju', rev: true, name: 'Harju Ridge (reverse)' },
  hirvi: { road: 'Hirvimäki', rev: false, name: 'Moose Hill (Hirvimäki)' },
  hirviR: { road: 'Hirvimäki', rev: true, name: 'Moose Hill (reverse)' },
  kallio: { road: 'Kalliojärvi', rev: false, name: 'Rock Lake (Kalliojärvi)' },
  kallioR: { road: 'Kalliojärvi', rev: true, name: 'Rock Lake (reverse)' },
  metsa: { road: 'Metsätie', rev: false, name: 'Forest Road (Metsätie)' },
  metsaR: { road: 'Metsätie', rev: true, name: 'Forest Road (reverse)' },
  ss: { road: 'Super Special', rev: false, name: 'Ruskala Super Special' },
};
export const EVENTS = [
  { id: 'sprint', name: 'Ruskala Sprint', tier: 1, stages: ['harju'], fee: 150, prizes: [900, 450, 200], pace: 10.5, rep: 0, insp: false, desc: 'One dirt stage for local amateurs. Muffler, lights, bumpers and a seat required.' },
  { id: 'kesa', name: 'Ruskala Summer Rally', tier: 2, stages: ['harju', 'metsa'], fee: 350, prizes: [2200, 1100, 500], pace: 11.5, rep: 3, insp: true, desc: 'Two stages with a liaison in between. Valid inspection required.' },
  { id: 'hirvi', name: 'Moose Hill Rally', tier: 3, stages: ['hirvi', 'harjuR', 'kallio'], fee: 650, prizes: [4500, 2200, 1000], pace: 12.5, rep: 8, insp: true, desc: 'Hairpins up the mountain, the ridge backwards and the lake jumps.' },
  { id: 'jarvi', name: 'Lake District Regional', tier: 4, stages: ['kallioR', 'metsaR', 'ss', 'hirviR'], fee: 1100, prizes: [8000, 4000, 2000], pace: 13.5, rep: 15, insp: true, desc: 'Four stages, every surface. Professional field.' },
  { id: 'sm', name: 'National Championship Final', tier: 5, stages: ['hirvi', 'kallio', 'harju', 'metsa', 'ss'], fee: 2000, prizes: [20000, 9000, 4000], pace: 14.5, rep: 25, insp: true, desc: 'The championship decider. Five stages. Bring spare everything.' },
];
const RIVALS = ['Pekka "Peltikatto" Mäki', 'Sirpa Ruuskanen', 'Jarmo Lahtinen', 'Teuvo Kärkkäinen', 'Aki Hirvonen', 'Mervi Laakso', 'Ossi Valtonen', 'Rane Ketola', 'Kimi Rämö', 'Hannele Vuori'];
const NUM = ['', 'one', 'two', 'three', 'four', 'five', 'six'];
const POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

export class Rally {
  constructor(game) {
    this.game = game;
    this.state = 'idle'; // idle | armed | countdown | running
    this.best = {}; this.rep = 0; this.points = 0; this.results = [];
    this.rivalPts = Object.fromEntries(RIVALS.map((r) => [r, 0]));
    this.active = null; // { evId, idx, times:[], due }
    this.group = new THREE.Group(); game.scene.add(this.group);
    this.stages = {};
    for (const [id, def] of Object.entries(STAGES)) this.stages[id] = this.buildStage(id, def);
    this.arches();
  }

  buildStage(id, def) {
    const road = ROADS.find((r) => r.name === def.road);
    let s = road.samples.map((p) => ({ x: p.x, z: p.z, h: p.h }));
    if (def.rev) s = s.reverse();
    s = s.slice(5, s.length - 5);
    const st = { id, def, samples: s, road, notes: [], cps: [], length: (s.length - 1) * 2 };
    for (let i = 80; i < s.length - 25; i += 80) st.cps.push(i);
    st.cps.push(s.length - 1);
    const head = s.map((p, i) => { const q = s[Math.min(i + 1, s.length - 1)], o = s[Math.max(i - 1, 0)]; return Math.atan2(q.x - o.x, q.z - o.z); });
    const dAng = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
    let i = 4;
    while (i < s.length - 16) {
      const d = dAng(head[i], head[i + 12]);
      if (Math.abs(d) > 0.3) {
        let j = i, mx = 0;
        while (j < s.length - 13 && Math.abs(dAng(head[j], head[j + 12])) > 0.22) { mx = Math.max(mx, Math.abs(dAng(head[j], head[j + 12]))); j++; }
        const sev = mx > 1.9 ? 'hairpin' : mx > 1.3 ? 2 : mx > 0.95 ? 3 : mx > 0.7 ? 4 : mx > 0.48 ? 5 : 6;
        const dir = d > 0 ? 'left' : 'right';
        let text = sev === 'hairpin' ? `hairpin ${dir}` : `${dir} ${NUM[sev]}`;
        if ((j - i) * 2 > 60) text += ' long';
        if (sev === 'hairpin' || sev === 2) text += ', don\'t cut';
        st.notes.push({ i, text, sev });
        i = j + 3;
      } else i++;
    }
    for (let k = 12; k < s.length - 12; k += 2) {
      const c = s[k].h - (s[k - 10].h + s[k + 6].h) / 2;
      if (c > 0.9 && !st.notes.some((n) => Math.abs(n.i - k) < 14 && n.jump)) { st.notes.push({ i: k - 4, text: c > 1.3 ? 'jump! keep it straight' : 'over crest', jump: true }); k += 16; }
    }
    if (road.rough >= 0.07) for (let k = 30; k < s.length - 30; k += 120) st.notes.push({ i: k, text: 'rough, bumpy' });
    st.notes.sort((a, b) => a.i - b.i);
    for (const ci of st.cps.slice(0, -1)) {
      const p = s[ci], q = s[Math.min(ci + 1, s.length - 1)];
      const nx = -(q.z - p.z), nz = q.x - p.x, nl = Math.hypot(nx, nz) || 1;
      for (const sd of [-1, 1]) {
        const x = p.x + nx / nl * sd * (road.w / 2 + 0.8), z = p.z + nz / nl * sd * (road.w / 2 + 0.8);
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.4, 6), MAT.yellowPaint); post.position.set(x, heightAt(x, z) + 0.7, z); this.group.add(post);
        const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.3), new THREE.MeshStandardMaterial({ color: def.rev ? 0x2080ff : 0xff6010, side: THREE.DoubleSide })); flag.position.set(x, heightAt(x, z) + 1.25, z); this.group.add(flag);
      }
    }
    return st;
  }
  arches() {
    for (const st of Object.values(this.stages)) {
      const s = st.samples;
      const p = s[0], q = s[2];
      const ang = Math.atan2(q.x - p.x, q.z - p.z);
      const g = new THREE.Group(); g.position.set(p.x, heightAt(p.x, p.z), p.z); g.rotation.y = ang;
      const w = st.road.w / 2 + 1.2;
      for (const sd of [-1, 1]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 4, 0.2), MAT.darkSteel); post.position.set(sd * w, 2, 0); post.castShadow = true; g.add(post); }
      const text = 'RALLY STAGE START: ' + st.def.name.replace(/\s*\(.*\)/, '').toUpperCase() + (st.def.rev ? ' (REVERSE)' : '');
      const ban = new THREE.Mesh(new THREE.PlaneGeometry(w * 2, 0.9), new THREE.MeshStandardMaterial({ map: labelTex(text, 512, 110, st.def.rev ? '#1a50a0' : '#a01818', '#fff', 'bold 54px Impact'), side: THREE.DoubleSide }));
      ban.position.y = 3.6; g.add(ban);
      this.group.add(g);
    }
  }
  stage(id) { return this.stages[id]; }
  // rally day: every Saturday (day 5 of the week), stages run 08:00-20:00
  isRallyDay(day = this.game.life.day) { return day % 7 === 5; }
  nextRallyDay() { const d = this.game.life.day; const late = this.isRallyDay(d) && this.game.life.hours >= 15; return d + ((5 - d % 7 + 7) % 7 || (late ? 7 : 0)); }
  rallyDayText() {
    const L = this.game.life, d = this.nextRallyDay();
    return d === L.day ? 'TODAY (Saturday) — first stages from 10:00' : `Saturday, day ${d + 1} (${d - L.day === 1 ? 'tomorrow' : `in ${d - L.day} days`})`;
  }
  ev(id) { return EVENTS.find((e) => e.id === id); }

  // -------- entry --------
  eligibility(ev) {
    const g = this.game, ch = g.car.chassis.kids, out = [];
    if (ev.rep && this.rep < ev.rep) out.push(`Needs ${ev.rep} reputation (you have ${this.rep})`);
    if (!ch.muffler) out.push('Muffler required (noise rules)');
    if (!ch.seatL) out.push('Driver seat required');
    if (!ch.headlightL || !ch.headlightR) out.push('Both headlights required');
    if (!ch.bumperF || !ch.bumperR) out.push('Bumpers required');
    if (ev.insp && !((g.car.chassis.props.inspected ?? -1) >= g.life.day)) out.push('Valid inspection (Katsastus) required');
    if (this.active && this.active.evId !== ev.id) out.push('Finish or retire from your current event first');
    if (this.isRallyDay() && g.life.hours >= 15 && !this.active) out.push('Entries for today\'s rally are closed — next rally is next Saturday');
    return out;
  }
  enter(evId) {
    const g = this.game, ev = this.ev(evId);
    const bad = this.eligibility(ev);
    if (bad.length) { g.toast(bad[0]); return false; }
    if (this.active) { g.toast('Already entered'); return false; }
    if (g.money < ev.fee) { g.toast('Not enough money for the entry fee'); return false; }
    g.addMoney(-ev.fee, `Entry fee: ${ev.name}`);
    const sat = this.nextRallyDay();
    const due = sat === g.life.day ? Math.max(g.life.minutes + 120, sat * 1440 + 600) : sat * 1440 + 600;
    this.active = { evId, idx: 0, times: [], due, sat };
    g.say(`Entered ${ev.name}. The rally runs on Saturday (day ${sat + 1}). SS1 ${STAGES[ev.stages[0]].name} — be at the start by ${sat === g.life.day ? g.life.clock(due) : 'Sat ' + g.life.clock(due)}.`, 8);
    return true;
  }
  retire() {
    if (!this.active) return;
    const ev = this.ev(this.active.evId);
    this.results.push({ day: this.game.life.day, ev: ev.name, pos: 'DNF', t: 0 });
    this.active = null; this.state = 'idle';
    this.game.say(`Retired from ${ev.name}.`);
  }
  nextStageId() { if (!this.active) return null; return this.ev(this.active.evId).stages[this.active.idx]; }

  // -------- runtime --------
  nearestIdx(st, p, from = 0, span = 9999) {
    let best = from, bd = Infinity;
    const a = Math.max(0, from - 40), b = Math.min(st.samples.length - 1, from + span);
    for (let i = a; i <= b; i++) { const s = st.samples[i]; const d = (s.x - p.x) ** 2 + (s.z - p.z) ** 2; if (d < bd) { bd = d; best = i; } }
    return { i: best, d: Math.sqrt(bd) };
  }
  update(dt) {
    const g = this.game, car = g.car;
    if (this.active) {
      if (this.active.sat === undefined) this.active.sat = this.nextRallyDay();
      if (g.life.day > this.active.sat && this.state !== 'running' && this.state !== 'countdown') {
        const ev = this.ev(this.active.evId);
        this.results.push({ day: g.life.day, ev: ev.name, pos: 'DNF', t: 0 });
        this.active = null;
        g.say(`You missed Saturday's ${ev.name} — DNF. The next rally is next Saturday.`, 7);
      }
    }
    const p = car.chassis.obj.position;
    if (!g.player.inCar) {
      if (this.state === 'armed') this.state = 'idle';
      if (this.state === 'running' || this.state === 'countdown') this.failStage('You left the car — stage abandoned.');
      return;
    }
    if (this.state === 'idle' || this.state === 'armed') {
      this.armed = null;
      if (car.speed < 1.5) for (const st of Object.values(this.stages)) {
        const s0 = st.samples[0];
        if (Math.hypot(p.x - s0.x, p.z - s0.z) < 8) { this.armed = st; if (st.id === this.nextStageId()) break; }
      }
      this.state = this.armed ? 'armed' : 'idle';
      if (this.armed && g.input.hit('Enter')) this.startCountdown(this.armed);
      return;
    }
    if (this.state === 'countdown') {
      const before = Math.ceil(this.cd);
      this.cd -= dt;
      if (Math.ceil(this.cd) < before && this.cd > 0) { g.audio.beep(false); g.say(String(Math.ceil(this.cd)), 0.8); }
      if (car.speed > 1.5 && this.cd > 0.3) { this.penalty += 10; g.say('Jump start! +10 s', 2); this.cd = 0; }
      if (this.cd <= 0) { this.state = 'running'; this.t = 0; g.audio.beep(true); g.say('GO!', 1); }
      return;
    }
    if (this.state === 'running') {
      const st = this.st;
      this.t += dt;
      const n = this.nearestIdx(st, p, this.prog, 60);
      if (n.d < 25) this.prog = Math.max(this.prog, n.i);
      if (n.d > 60) { this.offT = (this.offT || 0) + dt; if (this.offT > 10) return this.failStage('Way off the stage — stage abandoned.'); } else this.offT = 0;
      if (this.t > st.length / 2.5) return this.failStage('Out of time on the stage (maximum time).');
      const next = st.cps[this.cp];
      if (next !== undefined) {
        const c = st.samples[next];
        const last = this.cp === st.cps.length - 1;
        if (Math.hypot(p.x - c.x, p.z - c.z) < st.road.w / 2 + 6 || (last && this.prog >= st.samples.length - 4 && n.d < 20)) {
          this.cp++; g.audio.click(1);
          if (this.cp >= st.cps.length) return this.finishStage();
          g.toast(`Split ${this.cp}/${st.cps.length - 1}  ${this.fmt(this.t)}`, 2);
        } else if (this.prog > next + 30) {
          this.cp++; this.penalty += 30; g.say('Missed a checkpoint! +30 s penalty', 3);
          if (this.cp >= st.cps.length) return this.finishStage();
        }
      }
      const ahead = Math.max(20, (car.speed * 2.8) / 2);
      while (this.note < st.notes.length && st.notes[this.note].i <= this.prog + ahead) {
        const nt = st.notes[this.note++];
        if (nt.i < this.prog - 5) continue;
        g.audio.speak(nt.text); g.say('🗣 ' + nt.text, 2);
      }
    }
  }
  startCountdown(st) {
    const g = this.game;
    this.st = st; this.forEvent = !!this.active && st.id === this.nextStageId() && this.isRallyDay();
    if (this.active && st.id === this.nextStageId() && !this.isRallyDay()) g.say('The rally is on Saturday — this run is just practice.', 3);
    this.state = 'countdown'; this.cd = 4.99; this.penalty = 0; this.cp = 0; this.prog = 0; this.note = 0; this.t = 0;
    if (this.forEvent) {
      const late = Math.max(0, Math.floor(g.life.minutes - this.active.due));
      if (late) { this.penalty += late * 10; g.toast(`Late to the start: ${late} min → +${late * 10} s`, 4); }
    }
    const label = this.forEvent ? `SS${this.active.idx + 1} ${st.def.name}` : `Practice: ${st.def.name}`;
    g.say(`${label}. Co-driver: "${st.notes[0]?.text || 'flat out'}"`, 3);
    g.audio.speak(`${label}. ${st.notes[0]?.text || ''}`);
  }
  failStage(msg) {
    const g = this.game;
    this.state = 'idle';
    if (this.forEvent && this.active) {
      const max = this.st.length / 4;
      g.say(msg + ` Maximum stage time given (${this.fmt(max)}).`, 6);
      this.recordEventStage(max + this.penalty);
    } else g.say(msg);
  }
  finishStage() {
    const g = this.game, st = this.st;
    const total = this.t + this.penalty;
    this.state = 'idle';
    g.life.cheer(10);
    const prev = this.best[st.id];
    if (!prev || total < prev) this.best[st.id] = total;
    const head = `${this.forEvent ? `SS${this.active.idx + 1} ` : ''}${st.def.name}: ${this.fmt(this.t)}${this.penalty ? ` + ${this.penalty} s = ${this.fmt(total)}` : ''}`;
    if (!this.forEvent) { g.say(`FINISH! ${head}${prev ? ` (best ${this.fmt(Math.min(prev, total))})` : ' — new stage record'}`, 8); return; }
    g.say(`FINISH! ${head}`, 6);
    this.recordEventStage(total);
  }
  recordEventStage(time) {
    const g = this.game, a = this.active, ev = this.ev(a.evId);
    a.times.push(time);
    a.idx++;
    if (a.idx < ev.stages.length) {
      const nxt = this.stage(ev.stages[a.idx]);
      const here = g.car.chassis.obj.position;
      const dist = Math.hypot(nxt.samples[0].x - here.x, nxt.samples[0].z - here.z);
      const allow = Math.round(dist * 1.7 / 9 + 25); // game minutes, includes time for service
      a.due = g.life.minutes + allow;
      setTimeout(() => g.say(`Liaison to SS${a.idx + 1} ${nxt.def.name}: ${allow} minutes (due ${g.life.fmtTime(a.due)}). The service park is in Ruskala.`, 8), 6500);
      return;
    }
    this.finishEvent();
  }
  finishEvent() {
    const g = this.game, a = this.active, ev = this.ev(a.evId);
    const rnd = mulberry32(ev.tier * 1000 + g.life.day * 7 + 1);
    const rows = RIVALS.map((name, ri) => {
      let t = 0;
      for (const sid of ev.stages) {
        const st = this.stage(sid);
        const skill = 1 - ri * 0.012;
        t += st.length / (ev.pace * skill) * (0.93 + rnd() * 0.2) + (rnd() < 0.06 ? 20 + rnd() * 90 : 0);
      }
      return { name, t };
    });
    const mine = a.times.reduce((s, x) => s + x, 0);
    rows.push({ name: `${this.game.profile?.name || 'JC'} (you)`, t: mine, me: true });
    rows.sort((x, y) => x.t - y.t);
    const pos = rows.findIndex((r) => r.me) + 1;
    const prize = ev.prizes[pos - 1] || 0;
    rows.forEach((r, i) => { const pts = (POINTS[i] || 0) * ev.tier; if (r.me) this.points += pts; else this.rivalPts[r.name] = (this.rivalPts[r.name] || 0) + pts; });
    const repGain = pos === 1 ? 2 + ev.tier : pos <= 3 ? 1 + ev.tier : pos <= 6 ? 1 : 0;
    this.rep += repGain;
    if (prize) g.addMoney(prize, `Prize: ${ev.name}, P${pos}`);
    this.results.push({ day: g.life.day, ev: ev.name, pos, t: mine });
    this.active = null;
    let msg = `${ev.name} finished: P${pos} of ${rows.length}, total ${this.fmt(mine)}. ${prize ? 'Prize ' + fmtMoney(prize) + '. ' : ''}+${repGain} reputation.`;
    if (ev.tier === 5 && pos === 1) msg += ` 🏆 ${(this.game.profile?.name || 'JC').toUpperCase()} IS THE FINNISH RALLY CHAMPION! From a pile of rusty parts to the top step.`;
    g.say(msg, 12);
    g.ui.showResults({ ev: ev.name, rows });
  }

  hud() {
    const g = this.game;
    if (this.state === 'armed') return `At the start of ${this.armed.def.name}${this.armed.id === this.nextStageId() ? ` — SS${this.active.idx + 1} of your event` : ' (practice)'} — press Enter`;
    if (this.state === 'countdown') return `Get ready… ${Math.max(0, Math.ceil(this.cd))}`;
    if (this.state === 'running') return `${this.forEvent ? `SS${this.active.idx + 1} ` : ''}${this.fmt(this.t)}${this.penalty ? ` +${this.penalty}s` : ''} · split ${this.cp}/${this.st.cps.length - 1} · ${Math.round(this.prog / (this.st.samples.length - 1) * 100)}%`;
    if (this.active && !this.isRallyDay()) return `${this.ev(this.active.evId).name}: Saturday (day ${this.active.sat + 1}) — SS1 starts at ${g.life.clock(this.active.due)}`;
    if (this.active) { const left = Math.round(this.active.due - g.life.minutes); return `Next: SS${this.active.idx + 1} ${STAGES[this.nextStageId()].name} — ${left >= 0 ? left + ' min to the start' : -left + ' min LATE'}`; }
    return '';
  }
  standings() {
    const rows = Object.entries(this.rivalPts).map(([name, p]) => ({ name, p }));
    rows.push({ name: `${this.game.profile?.name || 'JC'} (you)`, p: this.points, me: true });
    return rows.sort((a, b) => b.p - a.p);
  }
  fmt(t) { const m = Math.floor(t / 60), s = (t % 60).toFixed(1); return `${m}:${s.padStart(4, '0')}`; }
  serialize() { return { best: this.best, rep: this.rep, points: this.points, results: this.results.slice(-40), rivalPts: this.rivalPts, active: this.active }; }
  restore(d) { if (!d) return; Object.assign(this, { best: d.best || {}, rep: d.rep || 0, points: d.points || 0, results: d.results || [], active: d.active || null }); if (d.rivalPts) this.rivalPts = d.rivalPts; }
}
