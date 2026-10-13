// One list of "what's wrong with the car", used by the Tab diagnostics, the repair objective and
// the shop's "My car needs" — so all three always agree (same parts, same threshold, same words).
import { HOSTS } from './partsdb.js';

export const BROKEN = 0.2; // condition below this = broken / needs replacing
export const BODY_SLOTS = new Set(['bumperF', 'bumperR', 'hood', 'trunk', 'doorL', 'doorR', 'headlightL', 'headlightR', 'taillightL', 'taillightR', 'lightPod', 'splitter', 'skirtL', 'skirtR', 'radiator']);
// add-ons the car runs fine without — never reported as "missing"
export const OPTIONAL_SLOTS = new Set(['lightPod', 'splitter', 'skirtL', 'skirtR', 'spoiler', 'turbo', 'seatR']);
const CORNER = { FL: 'front-left', FR: 'front-right', RL: 'rear-left', RR: 'rear-right' };
export const words = (s) => s.replace(/\b(FL|FR|RL|RR)\b/g, (m) => CORNER[m]);
const short = (n) => n.replace(/\s*\(.*?\)\s*/g, ' ').trim();

// kinds: 'missing' | 'bent' | 'crash' | 'worn'
export function partProblems(asm, roots, { missing = false } = {}) {
  const out = [];
  const hosts = [];
  for (const r of roots) { if (!r) continue; hosts.push(r); for (const d of asm.descendants(r)) hosts.push(d); }
  for (const h of hosts) {
    for (const s of HOSTS[h.def.host] || []) {
      const occ = h.kids[s.id];
      const where = words(s.name);
      if (!occ) {
        if (missing && !OPTIONAL_SLOTS.has(s.id)) out.push({ host: h, slot: s, inst: null, type: s.accepts, kind: 'missing', where, why: `Missing: ${where}` });
        continue;
      }
      if (occ.def.kind !== 'part' || occ.def.type === 'block') continue;
      const name = short(occ.def.name).toLowerCase(), pct = Math.round(occ.cond * 100);
      if (Math.abs(occ.props.bent || 0) > 0.003) out.push({ host: h, slot: s, inst: occ, type: occ.def.type, kind: 'bent', where, why: `Bent ${name} (crash damage)` });
      else if (occ.cond < BROKEN) {
        const crash = BODY_SLOTS.has(s.id);
        const dead = /light/.test(occ.def.type) && occ.cond < 0.15 ? ' — gives no light' : '';
        out.push({ host: h, slot: s, inst: occ, type: occ.def.type, kind: crash ? 'crash' : 'worn', where, why: `${crash ? 'Crash-damaged' : 'Worn out'} ${name} (${pct}%)${dead}` });
      }
    }
  }
  return out;
}
