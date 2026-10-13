// One shop UI for the computer (delivery) and the over-the-counter stores:
// search, categories, "what my car needs", clear "fits" labels and a real cart with quantities.
import { DEFS, HOSTS } from '../mechanics/partsdb.js';
import { fmtMoney } from '../core/util.js';
import { partProblems } from '../mechanics/problems.js';

const CORNER = { FL: 'front-left', FR: 'front-right', RL: 'rear-left', RR: 'rear-right' };
const words = (s) => s.replace(/\b(FL|FR|RL|RR)\b/g, (m) => CORNER[m]);
// add-ons the car runs fine without: never listed as "missing"
const OPTIONAL = new Set(['lightPod', 'splitter', 'skirtL', 'skirtR', 'spoiler', 'turbo', 'seatR']);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// slot names that accept each part type, e.g. control_arm -> ['Lower control arm front-left', ...]
let FITS = null;
function fitsOf(type) {
  if (!FITS) {
    FITS = {};
    for (const slots of Object.values(HOSTS)) for (const s of slots) (FITS[s.accepts] ||= new Set()).add(words(s.name));
  }
  return [...(FITS[type] || [])];
}

// what the player's car / engine is missing or has worn out
export function carNeeds(g) {
  const asm = g.asm, out = new Map();
  const roots = [g.car.chassis, g.stand];
  const hosts = new Set();
  for (const r of roots) { hosts.add(r); for (const d of asm.descendants(r)) hosts.add(d); }
  for (const it of asm.items.values()) if (it.def.host && !it.slot && !it.props.forSale && it.props.owner !== 'esa' && !g.guide?.isJobItem?.(it) && it.def.kind === 'part') hosts.add(it); // e.g. the head on the bench
  const inCar = (i) => { for (let h = i; h; h = asm.hostOf(h)) if (h === g.car.chassis) return true; return false; };
  // you already own one that isn't in the car yet (on the stand, the bench, the floor, in the basket or on order)
  const spare = (type) => [...asm.items.values()].some((i) => i.def.type === type && i.cond >= 0.3 && !i.props.forSale && i.props.owner !== 'esa' && !g.guide?.isJobItem?.(i) && !inCar(i))
    || g.orders.some((o) => o.items.some((id) => DEFS[id].type === type)) || g.basket.some((id) => DEFS[id].type === type);
  const cheapest = (type) => Object.values(DEFS).filter((d) => d.type === type && d.shop).sort((a, b) => a.price - b.price)[0];
  for (const p of partProblems(asm, [...hosts].filter((h) => !asm.hostOf(h) || !hosts.has(asm.hostOf(h))), { missing: true })) {
    const d = cheapest(p.type); if (!d) continue;
    out.set(p.kind + ':' + p.host.uid + ':' + p.slot.id, { id: d.id, why: p.why, have: spare(p.type) });
  }
  return [...out.values()];
}

// mode: 'order' (computer: basket -> delivery) or 'counter' (store: pay and take now)
export function mountShop(root, g, opts) {
  const st = g.shopState ||= { q: '', cat: '⭐ My car needs' };
  const cart = opts.mode === 'order' ? g.basket : (opts.cart ||= []);
  const all = opts.items(); // defs (stores may add pseudo-defs for extras)
  const D = {}; for (const d of all) D[d.id] = d;
  const cats = ['⭐ My car needs', 'All', ...[...new Set(all.map((d) => d.cat || 'Misc'))]];
  if (!cats.includes(st.cat)) st.cat = cats[0];
  const fee = opts.mode === 'order' ? 25 : 0;
  const render = () => {
    const q = st.q.trim().toLowerCase();
    let list, needs = [];
    if (q) list = all.filter((d) => { const hay = `${d.name} ${d.cat || ''} ${fitsOf(d.type).join(' ')} ${d.desc || ''}`.toLowerCase(); return q.split(/\s+/).every((w) => hay.includes(w)); });
    else if (st.cat === '⭐ My car needs') { needs = carNeeds(g).filter((n) => all.some((d) => d.id === n.id)); list = null; }
    else list = st.cat === 'All' ? all : all.filter((d) => (d.cat || 'Misc') === st.cat);
    const count = (id) => cart.filter((x) => x === id).length;
    const row = (d, why, have) => {
      const fits = fitsOf(d.type);
      const n = count(d.id);
      return `<div class="sh-item"><div class="sh-main"><b>${esc(d.name)}</b>${why ? `<div class="sh-why ${have ? 'ok' : ''}">${esc(why)}${have ? ' — <i>you already have a spare one</i>' : ''}</div>` : ''}
        ${fits.length ? `<div class="sh-fits">Fits: ${esc(fits.slice(0, 4).join(', '))}${fits.length > 4 ? ` +${fits.length - 4} more` : ''}</div>` : ''}${d.desc ? `<div class="sh-desc">${esc(d.desc)}</div>` : ''}</div>
        <div class="sh-price">${fmtMoney(d.price)}</div>
        <div class="sh-btns">${n ? `<button data-dec="${d.id}">−</button><span class="sh-n">${n}</span>` : ''}<button data-inc="${d.id}">${n ? '+' : 'Add'}</button></div></div>`;
    };
    let body = '';
    if (list) body = list.length ? list.map((d) => row(d)).join('') : `<div class="sh-empty">Nothing found for "${esc(st.q)}". Try fewer words, e.g. "control arm".</div>`;
    else body = needs.length ? (() => {
      const buy = needs.filter((n) => !n.have), own = needs.filter((n) => n.have);
      return (buy.length ? `<div class="sh-hint">Parts your car or engine is missing or has worn out. One click adds the right part.</div>` + buy.map((n) => row(D[n.id], n.why)).join('') : '<div class="sh-empty">✔ Nothing you need to buy — you already own everything that is missing.</div>')
        + (own.length ? `<div class="sh-sub">Missing, but you already own one — just fit it (no need to buy):</div>` + own.map((n) => row(D[n.id], n.why, true)).join('') : '');
    })()
      : '<div class="sh-empty">Your car isn\'t missing anything sold here. Use the search box or the categories for upgrades.</div>';
    const groups = {}; for (const id of cart) groups[id] = (groups[id] || 0) + 1;
    const sub = cart.reduce((s, id) => s + D[id].price, 0), total = sub + (cart.length ? fee : 0);
    root.innerHTML = `<div class="sh">
      <div class="sh-side"><input class="sh-search" placeholder="🔍 Search, e.g. front left control arm" value="${esc(st.q)}">
        ${cats.map((c) => `<button class="sh-cat ${!q && c === st.cat ? 'on' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}</div>
      <div class="sh-list">${body}</div>
      <div class="sh-cart"><div class="sh-ct">🛒 ${opts.mode === 'order' ? 'Basket' : 'Your items'}</div>
        ${cart.length ? Object.entries(groups).map(([id, n]) => `<div class="sh-cl"><span>${n > 1 ? n + ' × ' : ''}${esc(D[id].name)}</span><span>${fmtMoney(D[id].price * n)} <button data-dec="${id}">✕</button></span></div>`).join('') : '<div class="sh-empty">Empty — click Add on a part.</div>'}
        ${cart.length && fee ? `<div class="sh-cl muted"><span>Delivery</span><span>${fmtMoney(fee)}</span></div>` : ''}
        <div class="sh-total"><span>Total</span><span>${fmtMoney(total)}</span></div>
        <div class="sh-money">You have ${fmtMoney(g.money)}${total > g.money ? ' — <b class="bad">not enough</b>' : ''}</div>
        <button class="sh-buy" ${!cart.length || total > g.money ? 'disabled' : ''}>${opts.mode === 'order' ? 'Order — delivered in ~2 h' : 'Pay & take'}</button>
        ${cart.length ? '<button class="sh-clear">Empty the basket</button>' : ''}
        <div class="sh-note">${opts.mode === 'order' ? 'Deliveries arrive on the pallet outside your garage.' : 'Paid items are put on the counter.'}</div></div></div>`;
    const inp = root.querySelector('.sh-search');
    inp.oninput = () => { st.q = inp.value; const pos = inp.selectionStart; render(); const n2 = root.querySelector('.sh-search'); n2.focus(); n2.setSelectionRange(pos, pos); };
    inp.addEventListener('keydown', (e) => e.stopPropagation());
    root.querySelectorAll('[data-cat]').forEach((b) => b.onclick = () => { st.cat = b.dataset.cat; st.q = ''; render(); });
    root.querySelectorAll('[data-inc]').forEach((b) => b.onclick = () => { cart.push(b.dataset.inc); g.audio.click(0.3); render(); });
    root.querySelectorAll('[data-dec]').forEach((b) => b.onclick = () => { const i = cart.lastIndexOf(b.dataset.dec); if (i >= 0) cart.splice(i, 1); render(); });
    root.querySelector('.sh-buy').onclick = () => { opts.onBuy(cart, total); render(); };
    const clr = root.querySelector('.sh-clear'); if (clr) clr.onclick = () => { cart.length = 0; render(); };
    opts.onRender?.();
  };
  render();
  return render;
}
