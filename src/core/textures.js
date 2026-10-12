// Procedural canvas textures (no external assets needed).
import * as THREE from 'three';
import { mulberry32 } from './util.js';

const cache = new Map();

function canvasTex(key, size, draw) {
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  let seed = 7; for (const ch of key) seed = seed * 31 + ch.charCodeAt(0);
  draw(g, size, mulberry32(seed));
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  cache.set(key, t);
  return t;
}

function speckle(g, s, rnd, n, colors, rmin, rmax, alpha = 1) {
  for (let i = 0; i < n; i++) {
    g.globalAlpha = alpha * (0.3 + rnd() * 0.7);
    g.fillStyle = colors[Math.floor(rnd() * colors.length)];
    const r = rmin + rnd() * (rmax - rmin);
    g.beginPath(); g.arc(rnd() * s, rnd() * s, r, 0, Math.PI * 2); g.fill();
  }
  g.globalAlpha = 1;
}

export function repeated(tex, rx, ry) {
  const t = tex.clone(); t.needsUpdate = true; t.repeat.set(rx, ry ?? rx); return t;
}

// soft colour blotches (large-scale variation so tiling is less obvious)
function blotches(g, s, rnd, n, col, rmin, rmax, a) {
  for (let i = 0; i < n; i++) {
    const x = rnd() * s, y = rnd() * s, rad = rmin + rnd() * (rmax - rmin);
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, col.replace('A', String(a * (0.4 + rnd() * 0.6)))); gr.addColorStop(1, col.replace('A', '0'));
    g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
}
// hairline cracks
function cracks(g, s, rnd, n, color, w = 1) {
  g.strokeStyle = color; g.lineWidth = w;
  for (let i = 0; i < n; i++) {
    let x = rnd() * s, y = rnd() * s, a = rnd() * Math.PI * 2;
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 8 + rnd() * 10; k++) { a += (rnd() - 0.5) * 1.2; x += Math.cos(a) * (4 + rnd() * 8); y += Math.sin(a) * (4 + rnd() * 8); g.lineTo(x, y); }
    g.stroke();
  }
}

export const TEX = {
  concrete: () => canvasTex('concrete', 1024, (g, s, r) => {
    g.fillStyle = '#8a8780'; g.fillRect(0, 0, s, s);
    blotches(g, s, r, 40, 'rgba(110,106,98,A)', 40, 160, 0.5);
    blotches(g, s, r, 30, 'rgba(160,156,148,A)', 30, 120, 0.35);
    speckle(g, s, r, 16000, ['#7c7972', '#96938c', '#6f6c66', '#a29f98'], 0.5, 2.2);
    cracks(g, s, r, 10, 'rgba(50,48,44,0.55)', 1.2);
    for (let i = 0; i < 9; i++) { // oil stains
      const x = r() * s, y = r() * s, rad = 20 + r() * 70;
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, 'rgba(30,28,24,0.45)'); gr.addColorStop(1, 'rgba(30,28,24,0)');
      g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    g.strokeStyle = 'rgba(60,58,54,0.6)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, s / 2); g.lineTo(s, s / 2); g.moveTo(s / 2, 0); g.lineTo(s / 2, s); g.stroke();
  }),
  wood: () => canvasTex('wood', 256, (g, s, r) => {
    g.fillStyle = '#8a6239'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 70; i++) {
      g.strokeStyle = `rgba(${60 + r() * 40},${35 + r() * 25},${15 + r() * 15},0.5)`;
      g.lineWidth = 1 + r() * 2; const y = r() * s;
      g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(s * .3, y + r() * 8 - 4, s * .6, y + r() * 8 - 4, s, y); g.stroke();
    }
  }),
  // Falu-red board-and-batten siding: boards with grain, knots, gaps and weathering
  planks: () => canvasTex('planks', 1024, (g, s, r) => {
    g.fillStyle = '#4a1a14'; g.fillRect(0, 0, s, s);
    const n = 8, w = s / n;
    for (let i = 0; i < n; i++) {
      const x = i * w;
      g.fillStyle = `rgb(${112 + r() * 22 | 0},${38 + r() * 10 | 0},${28 + r() * 8 | 0})`;
      g.fillRect(x + 3, 0, w - 6, s);
      for (let k = 0; k < 28; k++) { // grain
        g.strokeStyle = `rgba(${60 + r() * 30 | 0},${18 + r() * 10 | 0},${12 + r() * 8 | 0},${0.15 + r() * 0.25})`; g.lineWidth = 1 + r() * 1.5;
        const gx = x + 6 + r() * (w - 12); g.beginPath(); g.moveTo(gx, 0); g.bezierCurveTo(gx + (r() - 0.5) * 8, s * 0.3, gx + (r() - 0.5) * 8, s * 0.7, gx + (r() - 0.5) * 6, s); g.stroke();
      }
      for (let k = 0; k < 2; k++) { const ky = r() * s, kx = x + w * (0.3 + r() * 0.4); g.fillStyle = 'rgba(50,16,10,0.7)'; g.beginPath(); g.ellipse(kx, ky, 4 + r() * 4, 7 + r() * 6, 0, 0, 7); g.fill(); }
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x + w - 5, 0, 3, s); // shadow by the gap
      g.fillStyle = 'rgba(255,200,180,0.08)'; g.fillRect(x + 3, 0, 4, s);  // lit edge
    }
    blotches(g, s, r, 25, 'rgba(160,110,90,A)', 30, 120, 0.25); // sun-bleached paint
    speckle(g, s, r, 5000, ['#5a1e16', '#9a4a3a', '#c07060'], 0.5, 1.6, 0.5);
    const dirt = g.createLinearGradient(0, s * 0.85, 0, s); dirt.addColorStop(0, 'rgba(40,30,20,0)'); dirt.addColorStop(1, 'rgba(40,30,20,0.35)');
    g.fillStyle = dirt; g.fillRect(0, s * 0.85, s, s * 0.15);
  }),
  metal: () => canvasTex('metal', 256, (g, s, r) => {
    g.fillStyle = '#9aa0a6'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(255,255,255,${r() * 0.06})`; g.fillRect(0, r() * s, s, 1); }
    speckle(g, s, r, 300, ['#7d8389', '#b4b9be'], 0.5, 1.5, 0.5);
  }),
  rust: () => canvasTex('rust', 256, (g, s, r) => {
    g.fillStyle = '#7a4a2a'; g.fillRect(0, 0, s, s);
    speckle(g, s, r, 2500, ['#5e3320', '#9a5b2e', '#3f2416', '#b06a34'], 0.5, 3);
  }),
  // near-white so the terrain's vertex colours tint it: blades, clover and soil specks
  grass: () => canvasTex('grass', 1024, (g, s, r) => {
    g.fillStyle = '#f2f4ea'; g.fillRect(0, 0, s, s);
    blotches(g, s, r, 50, 'rgba(190,200,160,A)', 30, 110, 0.5);
    blotches(g, s, r, 30, 'rgba(255,255,240,A)', 30, 100, 0.4);
    for (let i = 0; i < 22000; i++) {
      const x = r() * s, y = r() * s, len = 3 + r() * 9, a = -Math.PI / 2 + (r() - 0.5) * 0.9;
      const v = 150 + r() * 105;
      g.strokeStyle = `rgba(${v * 0.85 | 0},${v | 0},${v * 0.7 | 0},${0.35 + r() * 0.5})`;
      g.lineWidth = 0.8 + r() * 1.2;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
    }
    speckle(g, s, r, 1500, ['#a89a78', '#8a7c60'], 0.6, 1.6, 0.5);
    speckle(g, s, r, 120, ['#ffffff', '#f6f0a0'], 1, 2, 0.8); // tiny flowers
  }),
  asphalt: () => canvasTex('asphalt', 512, (g, s, r) => {
    g.fillStyle = '#48484a'; g.fillRect(0, 0, s, s);
    blotches(g, s, r, 30, 'rgba(30,30,32,A)', 20, 90, 0.35);   // patches / tar
    blotches(g, s, r, 16, 'rgba(100,100,98,A)', 20, 80, 0.25); // worn, lighter
    speckle(g, s, r, 22000, ['#3a3a3c', '#5c5c5e', '#2e2e30', '#6a6a6a', '#7a7874'], 0.4, 1.5);
    g.fillStyle = 'rgba(20,20,20,0.18)'; g.fillRect(s * 0.18, 0, s * 0.12, s); g.fillRect(s * 0.7, 0, s * 0.12, s); // wheel tracks
    cracks(g, s, r, 8, 'rgba(20,20,20,0.6)', 1);
    // centre dashes and solid edge lines
    g.fillStyle = 'rgba(232,224,204,0.85)';
    g.fillRect(s / 2 - 5, 0, 10, s * 0.42); // one tile = one road width along the road
    g.fillStyle = 'rgba(232,224,204,0.7)'; g.fillRect(s * 0.035, 0, 6, s); g.fillRect(s * 0.965 - 6, 0, 6, s);
  }),
  gravel: () => canvasTex('gravel', 512, (g, s, r) => {
    g.fillStyle = '#8c8070'; g.fillRect(0, 0, s, s);
    blotches(g, s, r, 30, 'rgba(110,98,84,A)', 20, 70, 0.4);
    speckle(g, s, r, 16000, ['#6f6458', '#a89a86', '#7a6e60', '#5a5048', '#b8ad9a'], 0.6, 2.4);
    // individual stones with a lit top and a shadow
    for (let i = 0; i < 900; i++) {
      const x = r() * s, y = r() * s, rad = 1.5 + r() * 3.5, v = 110 + r() * 80;
      g.fillStyle = 'rgba(40,34,28,0.45)'; g.beginPath(); g.ellipse(x + 1, y + 1.5, rad, rad * 0.8, 0, 0, 7); g.fill();
      g.fillStyle = `rgb(${v | 0},${v * 0.93 | 0},${v * 0.84 | 0})`; g.beginPath(); g.ellipse(x, y, rad, rad * 0.8, r() * 3, 0, 7); g.fill();
      g.fillStyle = 'rgba(255,250,235,0.25)'; g.beginPath(); g.ellipse(x - rad * 0.3, y - rad * 0.3, rad * 0.4, rad * 0.3, 0, 0, 7); g.fill();
    }
    g.fillStyle = 'rgba(60,50,40,0.22)'; g.fillRect(s * 0.18, 0, s * 0.14, s); g.fillRect(s * 0.68, 0, s * 0.14, s); // ruts
  }),
  birch: () => canvasTex('birch', 256, (g, s, r) => {
    g.fillStyle = '#ece8de'; g.fillRect(0, 0, s, s);
    speckle(g, s, r, 800, ['#d8d2c4', '#f8f6f0'], 0.5, 2, 0.6);
    for (let i = 0; i < 45; i++) { g.fillStyle = `rgba(25,22,20,${0.5 + r() * 0.5})`; const y = r() * s, w = 6 + r() * 40; g.fillRect(r() * s, y, w, 1.5 + r() * 4); }
  }),
  needles: () => canvasTex('needles', 256, (g, s, r) => {
    g.fillStyle = '#5a7058'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 4000; i++) { const v = 60 + r() * 120; g.strokeStyle = `rgba(${v * 0.6 | 0},${v | 0},${v * 0.65 | 0},0.6)`; g.lineWidth = 1; const x = r() * s, y = r() * s, a = r() * 6.28; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 5, y + Math.sin(a) * 5); g.stroke(); }
  }),
  // alpha-tested grass tuft for ground cover
  tuft: () => canvasTex('tuft', 128, (g, s, r) => {
    g.clearRect(0, 0, s, s);
    for (let i = 0; i < 46; i++) {
      const x0 = s * (0.15 + r() * 0.7), mid = 1 - Math.abs(x0 / s - 0.5) * 2, h = s * (0.2 + mid * 0.6 + r() * 0.2), bend = (x0 / s - 0.5) * s * 0.5 + (r() - 0.5) * s * 0.15, v = 120 + r() * 120;
      g.strokeStyle = `rgb(${v * 0.55 | 0},${v | 0},${v * 0.35 | 0})`; g.lineWidth = 2 + r() * 2.5;
      g.beginPath(); g.moveTo(x0, s); g.quadraticCurveTo(x0 + bend * 0.3, s - h * 0.6, x0 + bend, s - h); g.stroke();
    }
  }),
  cardboard: () => canvasTex('cardboard', 128, (g, s, r) => {
    g.fillStyle = '#b08a58'; g.fillRect(0, 0, s, s);
    speckle(g, s, r, 400, ['#9c7848', '#c09a68'], 0.5, 1.2, 0.5);
    g.fillStyle = '#c8b080'; g.fillRect(0, s / 2 - 6, s, 12);
  }),
  pegboard: () => canvasTex('pegboard', 256, (g, s) => {
    g.fillStyle = '#b89a6a'; g.fillRect(0, 0, s, s);
    g.fillStyle = '#4a3a24';
    for (let x = 8; x < s; x += 16) for (let y = 8; y < s; y += 16) { g.beginPath(); g.arc(x, y, 2, 0, 7); g.fill(); }
  }),
  wallpaper: () => canvasTex('wallpaper', 256, (g, s) => {
    g.fillStyle = '#c9b98e'; g.fillRect(0, 0, s, s);
    g.fillStyle = 'rgba(120,90,50,0.25)';
    for (let x = 0; x < s; x += 32) for (let y = 0; y < s; y += 32) { g.beginPath(); g.arc(x + 16, y + 16, 6, 0, 7); g.fill(); }
  }),
  bark: () => canvasTex('bark', 256, (g, s, r) => {
    g.fillStyle = '#4a3a2c'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 70; i++) { // bark plates
      const x = r() * s, y = r() * s, w = 8 + r() * 18, h = 14 + r() * 30, v = 60 + r() * 40;
      g.fillStyle = `rgb(${v | 0},${v * 0.78 | 0},${v * 0.6 | 0})`; g.fillRect(x, y, w, h);
      g.fillStyle = 'rgba(15,10,6,0.5)'; g.fillRect(x, y + h - 2, w, 2);
    }
    for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(20,14,10,${0.3 + r() * 0.4})`; g.fillRect(r() * s, 0, 1 + r() * 3, s); }
  }),
};

// A canvas texture with text, e.g. signs and labels.
export function labelTex(text, w = 256, h = 64, bg = '#f4ecd8', fg = '#222', font = 'bold 30px Arial') {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
  const lines = String(text).split('\n');
  lines.forEach((l, i) => g.fillText(l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * parseInt(font.match(/(\d+)px/)[1]) * 1.15));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
