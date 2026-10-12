// Character & game settings: name, portrait (face parts) and, for a new game, the game rules.
import { FACE_OPTS, FACE_KEYS, DEFAULT_FACE, drawFace, randomFace, optLabel } from './face.js';

export const DEFAULT_PROFILE = { name: 'JC', permadeath: false, money: 'normal', needs: 'normal', traffic: true, face: { ...DEFAULT_FACE } };
export const MONEY = { low: { label: 'Low (200 mk)', v: 200 }, normal: { label: 'Normal (400 mk)', v: 400 }, high: { label: 'High (900 mk)', v: 900 } };
export const NEEDS = { relaxed: { label: 'Relaxed (get hungry/thirsty slower)', v: 0.6 }, normal: { label: 'Normal', v: 1 }, harsh: { label: 'Harsh (get hungry/thirsty faster)', v: 1.5 } };
export function playerName(game) { return game.profile?.name || 'JC'; }

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Renders the editor into `root`. opts: { profile, isNew, onDone(profile), onCancel() }
export function renderProfileEditor(root, opts) {
  const p = structuredClone({ ...DEFAULT_PROFILE, ...(opts.profile || {}) });
  p.face = { ...DEFAULT_FACE, ...p.face };
  const sel = (id, obj, cur) => `<select id="${id}">${Object.entries(obj).map(([k, o]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${o.label}</option>`).join('')}</select>`;
  root.innerHTML = `
    <div class="pf">
      <h2>${opts.isNew ? 'New game — who are you?' : 'Your profile'}</h2>
      <div class="pf-cols">
        <div class="pf-left">
          <canvas id="pfFace" width="256" height="256"></canvas>
          <label class="pf-name">Name <input id="pfName" maxlength="24" value="${esc(p.name)}" placeholder="Your name"></label>
          <div class="muted" style="font-size:12px">People in Ruskala will call you this.</div>
          <button id="pfRandom" class="small">🎲 Random face</button>
          ${opts.isNew ? `
          <h3>Game settings</h3>
          <label class="pf-chk"><input id="pfPerma" type="checkbox" ${p.permadeath ? 'checked' : ''}> <b>Permadeath</b> <span class="muted">— die once and the save is deleted. No hospital, no second chances.</span></label>
          <label>Starting money ${sel('pfMoney', MONEY, p.money)}</label>
          <label>Hunger &amp; thirst ${sel('pfNeeds', NEEDS, p.needs)}</label>
          <label class="pf-chk"><input id="pfTraffic" type="checkbox" ${p.traffic ? 'checked' : ''}> Traffic &amp; rally-day cars on the roads</label>`
          : `<div class="muted" style="margin-top:10px">Permadeath: <b>${p.permadeath ? 'ON' : 'off'}</b> (set when the game was started)</div>`}
        </div>
        <div class="pf-right">${FACE_KEYS.map((k) => `<div class="pf-row"><span>${FACE_OPTS[k].label}</span><button class="small" data-k="${k}" data-d="-1">◀</button><b id="pfv_${k}"></b><button class="small" data-k="${k}" data-d="1">▶</button></div>`).join('')}</div>
      </div>
      <div class="pf-btns"><button id="pfOk">${opts.isNew ? 'Start the game' : 'Save'}</button><button id="pfCancel">${opts.isNew ? 'Back' : 'Cancel'}</button></div>
    </div>`;
  const $ = (id) => root.querySelector('#' + id);
  const canvas = $('pfFace');
  const refresh = () => {
    drawFace(canvas, p.face);
    for (const k of FACE_KEYS) {
      const v = FACE_OPTS[k].list[p.face[k]], el = $('pfv_' + k);
      el.innerHTML = v.startsWith('#') ? `<span class="pf-sw" style="background:${v}"></span>` : esc(optLabel(k, p.face[k]));
    }
  };
  root.querySelectorAll('[data-k]').forEach((b) => b.onclick = () => {
    const k = b.dataset.k, n = FACE_OPTS[k].list.length;
    p.face[k] = (p.face[k] + Number(b.dataset.d) + n) % n; refresh();
  });
  $('pfRandom').onclick = () => { p.face = randomFace(); refresh(); };
  $('pfOk').onclick = () => {
    p.name = $('pfName').value.trim().slice(0, 24) || 'JC';
    if (opts.isNew) { p.permadeath = $('pfPerma').checked; p.money = $('pfMoney').value; p.needs = $('pfNeeds').value; p.traffic = $('pfTraffic').checked; }
    opts.onDone(p);
  };
  $('pfCancel').onclick = () => opts.onCancel?.();
  // typing in the name box must not trigger game keys
  $('pfName').addEventListener('keydown', (e) => e.stopPropagation());
  refresh();
}
