// Player portrait: a procedurally drawn face from a handful of choices (indices into FACE_OPTS).

export const FACE_OPTS = {
  skin: { label: 'Skin tone', list: ['#f6d7c3', '#eac0a0', '#d9a77f', '#c28a62', '#9a6a45', '#714a2e', '#4e3220'] },
  shape: { label: 'Face shape', list: ['Oval', 'Round', 'Square', 'Long', 'Heart'] },
  hair: { label: 'Hair style', list: ['Short', 'Buzz cut', 'Long', 'Mullet', 'Bald', 'Spiky', 'Ponytail', 'Curly', 'Side part', 'Mohawk'] },
  hairColor: { label: 'Hair colour', list: ['#1c1410', '#3b2414', '#6b4423', '#a8743a', '#d8b46a', '#e8dcc0', '#8a8a8a', '#9a3218', '#2a3a8a'] },
  eyes: { label: 'Eyes', list: ['Normal', 'Narrow', 'Wide', 'Sleepy', 'Squint'] },
  eyeColor: { label: 'Eye colour', list: ['#4a2e1a', '#2a5a8a', '#3a7a4a', '#7a6a3a', '#5a5a6a', '#1a1a1a'] },
  brows: { label: 'Eyebrows', list: ['Normal', 'Thick', 'Thin', 'Angry', 'Worried', 'Unibrow'] },
  nose: { label: 'Nose', list: ['Small', 'Big', 'Pointy', 'Wide', 'Button', 'Crooked'] },
  mouth: { label: 'Mouth', list: ['Smile', 'Flat', 'Grin', 'Frown', 'Smirk', 'Open'] },
  beard: { label: 'Facial hair', list: ['None', 'Stubble', 'Moustache', 'Full beard', 'Goatee', 'Mutton chops', 'Walrus'] },
  details: { label: 'Facial details', list: ['None', 'Freckles', 'Scar', 'Mole', 'Rosy cheeks', 'Grease smudge', 'Black eye', 'Wrinkles'] },
  glasses: { label: 'Glasses', list: ['None', 'Round', 'Square', 'Sunglasses', 'Safety goggles'] },
  shirt: { label: 'Shirt', list: ['#2a4a7a', '#7a1a1a', '#2a5a2a', '#3a3a3a', '#c8a030', '#e8e8e8', '#5a2a7a'] },
};
export const FACE_KEYS = Object.keys(FACE_OPTS);
export const DEFAULT_FACE = { skin: 1, shape: 0, hair: 0, hairColor: 2, eyes: 0, eyeColor: 1, brows: 0, nose: 0, mouth: 0, beard: 1, details: 0, glasses: 0, shirt: 0 };
export function randomFace() { const f = {}; for (const k of FACE_KEYS) f[k] = Math.floor(Math.random() * FACE_OPTS[k].list.length); if (Math.random() < 0.5) f.glasses = 0; if (Math.random() < 0.4) f.details = 0; return f; }
export function optLabel(k, i) { const v = FACE_OPTS[k].list[i]; return v.startsWith('#') ? `${i + 1} / ${FACE_OPTS[k].list.length}` : v; }

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const c = (s) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)));
  return `rgb(${c(16)},${c(8)},${c(0)})`;
}

// draws the portrait into a canvas of any size
// opts.decal: only the facial features on a transparent background (for 3D NPC heads)
export function drawFace(canvas, face, opts = {}) {
  const decal = !!opts.decal;
  const f = { ...DEFAULT_FACE, ...face };
  const ctx = canvas.getContext('2d');
  const S = canvas.width / 256;
  ctx.setTransform(S, 0, 0, S, 0, 0);
  ctx.clearRect(0, 0, 256, 256);
  const skin = FACE_OPTS.skin.list[f.skin], hairC = FACE_OPTS.hairColor.list[f.hairColor], shirt = FACE_OPTS.shirt.list[f.shirt];
  const shapeName = FACE_OPTS.shape.list[f.shape], hairName = FACE_OPTS.hair.list[f.hair];
  // background: garage wall
  const bg = ctx.createLinearGradient(0, 0, 0, 256); bg.addColorStop(0, '#4a5a68'); bg.addColorStop(1, '#2a3038');
  if (!decal) { ctx.fillStyle = bg; ctx.fillRect(0, 0, 256, 256); }
  const fill = (c) => { ctx.fillStyle = c; ctx.fill(); };
  const ell = (x, y, rx, ry, rot = 0) => { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); };
  // head geometry
  const g = { Oval: [62, 78], Round: [70, 72], Square: [68, 76], Long: [58, 86], Heart: [66, 78] }[shapeName];
  const cx = 128, cy = 118, rx = g[0], ry = g[1];
  if (!decal) {
  // hair behind the head
  ctx.fillStyle = hairC;
  if (hairName === 'Long') { ctx.beginPath(); ctx.roundRect(cx - rx - 10, cy - ry + 10, (rx + 10) * 2, ry * 2 + 30, 40); ctx.fill(); }
  if (hairName === 'Mullet') { ctx.beginPath(); ctx.roundRect(cx - rx + 4, cy, (rx - 4) * 2, ry + 40, 20); ctx.fill(); }
  if (hairName === 'Ponytail') { ell(cx + rx + 6, cy + 10, 16, 40, -0.3); fill(hairC); }
  if (hairName === 'Curly') { for (let a = Math.PI * 0.85; a < Math.PI * 2.15; a += 0.28) { ell(cx + Math.cos(a) * (rx + 6), cy - 8 + Math.sin(a) * (ry + 2), 20, 20); fill(hairC); } }
  // neck & shoulders
  ctx.fillStyle = shade(skin, 0.85); ctx.fillRect(cx - 24, cy + ry - 20, 48, 50);
  ctx.beginPath(); ctx.moveTo(10, 256); ctx.quadraticCurveTo(20, cy + ry + 26, cx - 30, cy + ry + 18); ctx.lineTo(cx + 30, cy + ry + 18); ctx.quadraticCurveTo(236, cy + ry + 26, 246, 256); ctx.closePath(); fill(shirt);
  ctx.beginPath(); ctx.moveTo(cx - 26, cy + ry + 18); ctx.lineTo(cx, cy + ry + 44); ctx.lineTo(cx + 26, cy + ry + 18); fill(shade(skin, 0.85));
  // ears
  for (const s of [-1, 1]) { ell(cx + s * (rx - 2), cy + 4, 11, 18); fill(shade(skin, 0.92)); }
  // head
  ctx.beginPath();
  if (shapeName === 'Square') ctx.roundRect(cx - rx, cy - ry, rx * 2, ry * 2, 34);
  else if (shapeName === 'Heart') { ctx.moveTo(cx - rx, cy - 20); ctx.quadraticCurveTo(cx - rx, cy - ry, cx, cy - ry); ctx.quadraticCurveTo(cx + rx, cy - ry, cx + rx, cy - 20); ctx.quadraticCurveTo(cx + rx - 6, cy + ry * 0.6, cx, cy + ry); ctx.quadraticCurveTo(cx - rx + 6, cy + ry * 0.6, cx - rx, cy - 20); }
  else ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  fill(skin);
  }
  // subtle cheek shading
  for (const s of [-1, 1]) { ell(cx + s * rx * 0.62, cy + 26, 16, 10); fill('rgba(0,0,0,0.04)'); }
  const eyeY = cy - 6, ex = 26;
  // details (under features)
  const det = FACE_OPTS.details.list[f.details];
  if (det === 'Rosy cheeks') for (const s of [-1, 1]) { ell(cx + s * 36, cy + 22, 13, 8); fill('rgba(220,80,80,0.35)'); }
  if (det === 'Freckles') { ctx.fillStyle = shade(skin, 0.7); for (let i = 0; i < 22; i++) { const s = i % 2 ? 1 : -1, a = (i * 2.399) % 6.28; ell(cx + s * (22 + Math.cos(a) * 14), cy + 18 + Math.sin(a) * 8, 1.8, 1.8); ctx.fill(); } }
  if (det === 'Black eye') { ell(cx + ex, eyeY + 2, 20, 15); fill('rgba(70,30,90,0.45)'); }
  if (det === 'Grease smudge') { ctx.save(); ctx.globalAlpha = 0.55; ell(cx - 34, cy + 30, 16, 6, -0.4); fill('#222'); ell(cx + 14, cy - 48, 10, 4, 0.3); fill('#222'); ctx.restore(); }
  if (det === 'Wrinkles') { ctx.strokeStyle = shade(skin, 0.75); ctx.lineWidth = 1.5; for (const y of [-56, -50]) { ctx.beginPath(); ctx.moveTo(cx - 24, cy + y); ctx.quadraticCurveTo(cx, cy + y - 4, cx + 24, cy + y); ctx.stroke(); } for (const s of [-1, 1]) for (const d of [-4, 2]) { ctx.beginPath(); ctx.moveTo(cx + s * 44, eyeY + d); ctx.lineTo(cx + s * 52, eyeY + d * 1.6); ctx.stroke(); } }
  // eyes
  const eyesN = FACE_OPTS.eyes.list[f.eyes], eyeC = FACE_OPTS.eyeColor.list[f.eyeColor];
  const eh = { Normal: 8, Narrow: 4.5, Wide: 11, Sleepy: 6, Squint: 3 }[eyesN], ew = eyesN === 'Wide' ? 15 : 13;
  for (const s of [-1, 1]) {
    const x = cx + s * ex;
    ell(x, eyeY, ew, eh); fill('#f6f4ee');
    ctx.save(); ell(x, eyeY, ew, eh); ctx.clip();
    ell(x + 1, eyeY, 7, 7); fill(eyeC); ell(x + 1, eyeY, 3.4, 3.4); fill('#111'); ell(x + 3, eyeY - 3, 1.6, 1.6); fill('#fff');
    if (eyesN === 'Sleepy') { ctx.fillStyle = shade(skin, 0.9); ctx.fillRect(x - ew, eyeY - eh - 1, ew * 2, eh); }
    ctx.restore();
    ctx.strokeStyle = 'rgba(40,20,10,0.6)'; ctx.lineWidth = 1.6; ell(x, eyeY, ew, eh); ctx.stroke();
  }
  // eyebrows
  const browN = FACE_OPTS.brows.list[f.brows];
  ctx.strokeStyle = shade(hairC === '#e8dcc0' ? '#b8a880' : hairC, 1); ctx.lineCap = 'round';
  ctx.lineWidth = { Normal: 4, Thick: 7, Thin: 2, Angry: 5, Worried: 4, Unibrow: 6 }[browN];
  for (const s of [-1, 1]) {
    const inner = browN === 'Angry' ? 6 : browN === 'Worried' ? -6 : 0;
    ctx.beginPath(); ctx.moveTo(cx + s * 12, eyeY - 18 + inner); ctx.quadraticCurveTo(cx + s * 26, eyeY - 25, cx + s * 40, eyeY - 18 - inner * 0.3); ctx.stroke();
  }
  if (browN === 'Unibrow') { ctx.beginPath(); ctx.moveTo(cx - 12, eyeY - 18); ctx.lineTo(cx + 12, eyeY - 18); ctx.stroke(); }
  // nose
  const noseN = FACE_OPTS.nose.list[f.nose];
  ctx.strokeStyle = shade(skin, 0.68); ctx.lineWidth = 3; ctx.fillStyle = shade(skin, 0.86);
  const ny = cy + 20;
  ctx.beginPath();
  if (noseN === 'Small') { ctx.moveTo(cx - 2, eyeY + 8); ctx.quadraticCurveTo(cx - 8, ny, cx - 6, ny + 2); ctx.quadraticCurveTo(cx, ny + 6, cx + 6, ny + 2); }
  if (noseN === 'Big') { ell(cx, ny, 16, 12); ctx.fill(); ctx.beginPath(); ctx.moveTo(cx - 4, eyeY + 6); ctx.lineTo(cx - 8, ny - 8); }
  if (noseN === 'Pointy') { ctx.moveTo(cx, eyeY + 6); ctx.lineTo(cx - 12, ny + 4); ctx.lineTo(cx + 2, ny + 4); }
  if (noseN === 'Wide') { ctx.moveTo(cx - 16, ny); ctx.quadraticCurveTo(cx - 10, ny + 8, cx, ny + 6); ctx.quadraticCurveTo(cx + 10, ny + 8, cx + 16, ny); }
  if (noseN === 'Button') { ell(cx, ny, 8, 7); ctx.fill(); ctx.beginPath(); ell(cx - 4, ny + 3, 2, 1.5); ell(cx + 4, ny + 3, 2, 1.5); }
  if (noseN === 'Crooked') { ctx.moveTo(cx, eyeY + 6); ctx.lineTo(cx + 6, ny - 6); ctx.lineTo(cx - 4, ny + 4); ctx.lineTo(cx + 6, ny + 4); }
  ctx.stroke();
  // mouth
  const mouthN = FACE_OPTS.mouth.list[f.mouth], my = cy + 44;
  ctx.strokeStyle = '#7a3a32'; ctx.lineWidth = 3.5;
  ctx.beginPath();
  if (mouthN === 'Smile') { ctx.moveTo(cx - 20, my - 4); ctx.quadraticCurveTo(cx, my + 12, cx + 20, my - 4); ctx.stroke(); }
  if (mouthN === 'Flat') { ctx.moveTo(cx - 17, my); ctx.lineTo(cx + 17, my); ctx.stroke(); }
  if (mouthN === 'Frown') { ctx.moveTo(cx - 18, my + 6); ctx.quadraticCurveTo(cx, my - 8, cx + 18, my + 6); ctx.stroke(); }
  if (mouthN === 'Smirk') { ctx.moveTo(cx - 16, my + 2); ctx.quadraticCurveTo(cx + 6, my + 4, cx + 20, my - 6); ctx.stroke(); }
  if (mouthN === 'Grin') { ctx.moveTo(cx - 24, my - 6); ctx.quadraticCurveTo(cx, my + 22, cx + 24, my - 6); ctx.closePath(); fill('#5a1a18'); ctx.save(); ctx.clip(); ctx.fillStyle = '#f4f0e8'; ctx.fillRect(cx - 24, my - 6, 48, 7); ctx.restore(); }
  if (mouthN === 'Open') { ell(cx, my + 2, 11, 9); fill('#4a1414'); }
  // facial hair
  const beardN = FACE_OPTS.beard.list[f.beard];
  ctx.fillStyle = hairC;
  if (beardN === 'Stubble') { ctx.save(); ctx.globalAlpha = 0.5; for (let i = 0; i < 260; i++) { const a = Math.PI * (0.08 + 0.84 * ((i * 0.618) % 1)), r = 0.55 + ((i * 0.377) % 1) * 0.42; const x = cx + Math.cos(a) * rx * r, y = cy + 6 + Math.sin(a) * ry * r; if (y > cy + 12) { ctx.fillRect(x, y, 1.4, 1.4); } } ctx.restore(); }
  if (beardN === 'Moustache' || beardN === 'Walrus') { const w = beardN === 'Walrus' ? 30 : 22, h = beardN === 'Walrus' ? 14 : 8; ctx.beginPath(); ctx.moveTo(cx - w, my - 2 + (beardN === 'Walrus' ? 8 : 0)); ctx.quadraticCurveTo(cx - w / 2, my - 14, cx, my - 10); ctx.quadraticCurveTo(cx + w / 2, my - 14, cx + w, my - 2 + (beardN === 'Walrus' ? 8 : 0)); ctx.quadraticCurveTo(cx, my - 10 + h, cx - w, my - 2 + (beardN === 'Walrus' ? 8 : 0)); ctx.fill(); }
  if (beardN === 'Full beard') { ctx.beginPath(); ctx.moveTo(cx - rx + 2, cy + 4); ctx.quadraticCurveTo(cx - rx + 6, cy + ry + 14, cx, cy + ry + 18); ctx.quadraticCurveTo(cx + rx - 6, cy + ry + 14, cx + rx - 2, cy + 4); ctx.quadraticCurveTo(cx + rx - 14, cy + 30, cx + 22, my - 8); ctx.quadraticCurveTo(cx, my - 16, cx - 22, my - 8); ctx.quadraticCurveTo(cx - rx + 14, cy + 30, cx - rx + 2, cy + 4); ctx.fill(); ell(cx, my + 3, 14, 6); fill('#7a3a32'); }
  if (beardN === 'Goatee') { ctx.beginPath(); ctx.moveTo(cx - 12, my + 10); ctx.quadraticCurveTo(cx, my + 40, cx + 12, my + 10); ctx.fill(); ctx.beginPath(); ctx.moveTo(cx - 18, my - 6); ctx.quadraticCurveTo(cx, my - 14, cx + 18, my - 6); ctx.lineTo(cx + 14, my - 2); ctx.quadraticCurveTo(cx, my - 8, cx - 14, my - 2); ctx.fill(); }
  if (beardN === 'Mutton chops') for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(cx + s * (rx - 2), cy - 10); ctx.lineTo(cx + s * (rx - 4), cy + 40); ctx.quadraticCurveTo(cx + s * 30, cy + 50, cx + s * 24, cy + 34); ctx.lineTo(cx + s * (rx - 16), cy - 10); ctx.fill(); }
  // scar / mole on top
  if (det === 'Scar') { ctx.strokeStyle = '#a8584a'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(cx + 34, eyeY - 30); ctx.lineTo(cx + 44, eyeY + 24); ctx.stroke(); ctx.lineWidth = 1.5; for (let i = 0; i < 4; i++) { const y = eyeY - 22 + i * 13; ctx.beginPath(); ctx.moveTo(cx + 33 + i * 2.3, y); ctx.lineTo(cx + 43 + i * 2.3, y - 3); ctx.stroke(); } }
  if (det === 'Mole') { ell(cx - 30, cy + 34, 3.2, 3.2); fill('#3a2418'); }
  // hair on top
  ctx.fillStyle = hairC;
  if (!decal) {
  const top = cy - ry;
  if (hairName === 'Short' || hairName === 'Mullet' || hairName === 'Ponytail' || hairName === 'Long') { ctx.beginPath(); ctx.moveTo(cx - rx - 2, cy - 4); ctx.quadraticCurveTo(cx - rx - 4, top - 14, cx, top - 12); ctx.quadraticCurveTo(cx + rx + 4, top - 14, cx + rx + 2, cy - 4); ctx.quadraticCurveTo(cx + rx - 6, top + 22, cx + 10, top + 18); ctx.quadraticCurveTo(cx - 20, top + 30, cx - rx + 6, top + 34); ctx.closePath(); ctx.fill(); }
  if (hairName === 'Buzz cut') { ctx.save(); ctx.globalAlpha = 0.75; ctx.beginPath(); ctx.ellipse(cx, cy, rx + 1, ry + 1, 0, Math.PI * 1.05, Math.PI * 1.95); ctx.quadraticCurveTo(cx, top + 26, cx - rx * 0.95, cy - ry * 0.3); ctx.fill(); ctx.restore(); }
  if (hairName === 'Spiky') { ctx.beginPath(); ctx.moveTo(cx - rx, cy - 10); for (let i = 0; i <= 8; i++) { const x = cx - rx + (i / 8) * rx * 2; ctx.lineTo(x - rx / 8, top + 14 - (i % 2 ? 0 : 0)); ctx.lineTo(x, top - 26 + Math.abs(4 - i) * 3); } ctx.lineTo(cx + rx, cy - 10); ctx.quadraticCurveTo(cx, top + 16, cx - rx, cy - 10); ctx.fill(); }
  if (hairName === 'Curly') { for (let i = 0; i < 9; i++) { ell(cx - rx + 10 + i * (rx * 2 - 20) / 8, top + 10 + (i % 2) * 6, 17, 16); fill(hairC); } }
  if (hairName === 'Side part') { ctx.beginPath(); ctx.moveTo(cx - rx - 2, cy - 2); ctx.quadraticCurveTo(cx - rx, top - 16, cx - 16, top - 12); ctx.quadraticCurveTo(cx + rx + 8, top - 18, cx + rx + 2, cy - 6); ctx.quadraticCurveTo(cx + 10, top + 6, cx - 18, top + 12); ctx.quadraticCurveTo(cx - rx + 4, top + 26, cx - rx - 2, cy - 2); ctx.fill(); ctx.strokeStyle = shade(skin, 0.9); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx - 18, top - 10); ctx.lineTo(cx - 20, top + 12); ctx.stroke(); }
  if (hairName === 'Mohawk') { ctx.beginPath(); ctx.moveTo(cx - 12, cy - ry * 0.4); ctx.lineTo(cx - 14, top - 36); ctx.quadraticCurveTo(cx, top - 50, cx + 14, top - 36); ctx.lineTo(cx + 12, cy - ry * 0.4); ctx.fill(); }
  if (hairName === 'Bald') { ell(cx - 20, top + 22, 14, 7, -0.3); fill('rgba(255,255,255,0.25)'); }
  }
  // glasses
  const gl = FACE_OPTS.glasses.list[f.glasses];
  if (gl !== 'None') {
    ctx.lineWidth = gl === 'Safety goggles' ? 5 : 3; ctx.strokeStyle = gl === 'Safety goggles' ? '#e0c020' : '#1a1a1a';
    for (const s of [-1, 1]) {
      const x = cx + s * ex; ctx.beginPath();
      if (gl === 'Round') ctx.ellipse(x, eyeY, 17, 15, 0, 0, Math.PI * 2);
      else if (gl === 'Safety goggles') ctx.roundRect(x - 21, eyeY - 15, 42, 30, 10);
      else ctx.roundRect(x - 19, eyeY - 13, 38, 26, 4);
      if (gl === 'Sunglasses') { ctx.fillStyle = 'rgba(10,10,20,0.9)'; ctx.fill(); }
      if (gl === 'Safety goggles') { ctx.fillStyle = 'rgba(200,230,255,0.25)'; ctx.fill(); }
      ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(cx - 8, eyeY - 2); ctx.quadraticCurveTo(cx, eyeY - 8, cx + 8, eyeY - 2); ctx.stroke();
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(cx + s * (ex + 19), eyeY - 3); ctx.lineTo(cx + s * (rx - 2), eyeY - 6); ctx.stroke(); }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
