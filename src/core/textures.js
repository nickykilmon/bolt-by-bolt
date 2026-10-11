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

export const TEX = {
  concrete: () => canvasTex('concrete', 512, (g, s, r) => {
    g.fillStyle = '#8a8780'; g.fillRect(0, 0, s, s);
    speckle(g, s, r, 4000, ['#7c7972', '#96938c', '#6f6c66'], 0.5, 2.2);
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
  planks: () => canvasTex('planks', 512, (g, s, r) => {
    g.fillStyle = '#7d2d22'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 8; i++) {
      g.fillStyle = `rgb(${110 + r() * 25},${38 + r() * 10},${28 + r() * 8})`;
      g.fillRect(i * s / 8 + 2, 0, s / 8 - 4, s);
    }
    speckle(g, s, r, 1500, ['#5a1e16', '#9a4a3a'], 0.5, 1.5, 0.6);
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
  grass: () => canvasTex('grass', 512, (g, s, r) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, s, s);
    speckle(g, s, r, 9000, ['#d8e0c8', '#c0caa8', '#eef2e0', '#b0b898'], 0.6, 2.2);
  }),
  asphalt: () => canvasTex('asphalt', 256, (g, s, r) => {
    g.fillStyle = '#4a4a4c'; g.fillRect(0, 0, s, s);
    speckle(g, s, r, 5000, ['#3a3a3c', '#5c5c5e', '#2e2e30', '#6a6a6a'], 0.4, 1.4);
    g.fillStyle = 'rgba(230,220,200,0.75)';
    for (let y = 0; y < s; y += 64) g.fillRect(s / 2 - 2, y, 4, 34);
  }),
  gravel: () => canvasTex('gravel', 256, (g, s, r) => {
    g.fillStyle = '#8c8070'; g.fillRect(0, 0, s, s);
    speckle(g, s, r, 6000, ['#6f6458', '#a89a86', '#7a6e60', '#5a5048', '#b8ad9a'], 0.6, 2.4);
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
  bark: () => canvasTex('bark', 128, (g, s, r) => {
    g.fillStyle = '#4a3a2c'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(20,14,10,${0.3 + r() * 0.4})`; g.fillRect(r() * s, 0, 1 + r() * 3, s); }
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
