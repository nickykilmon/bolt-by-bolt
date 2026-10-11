// Procedural audio: engine synth driven by RPM/load, tyre & surface noise, workshop
// one-shots (ratchets, clunks), footsteps, ambience. No sample files needed.
import { clamp } from '../core/util.js';

export class Audio {
  constructor() {
    this.ctx = null;
    this.volume = 0.8;
    this.radioOn = false;
  }
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = this.volume; this.master.connect(c.destination);
    // noise buffer
    const len = c.sampleRate * 2;
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.buildEngine();
    this.buildLoops();
    this.birdT = 3;
  }
  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }
  noise() { const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true; return s; }

  buildEngine() {
    const c = this.ctx;
    this.engPan = c.createPanner(); this.engPan.panningModel = 'HRTF'; this.engPan.distanceModel = 'inverse'; this.engPan.refDistance = 2; this.engPan.rolloffFactor = 1.2;
    this.engPan.connect(this.master);
    this.engGain = c.createGain(); this.engGain.gain.value = 0; this.engGain.connect(this.engPan);
    this.engLP = c.createBiquadFilter(); this.engLP.type = 'lowpass'; this.engLP.Q.value = 2; this.engLP.connect(this.engGain);
    this.o1 = c.createOscillator(); this.o1.type = 'sawtooth';
    this.o2 = c.createOscillator(); this.o2.type = 'square';
    this.o3 = c.createOscillator(); this.o3.type = 'triangle';
    const g1 = c.createGain(); g1.gain.value = 0.5; const g2 = c.createGain(); g2.gain.value = 0.35; const g3 = c.createGain(); g3.gain.value = 0.3;
    this.o1.connect(g1).connect(this.engLP); this.o2.connect(g2).connect(this.engLP); this.o3.connect(g3).connect(this.engLP);
    this.exNoise = this.noise(); this.exBP = c.createBiquadFilter(); this.exBP.type = 'bandpass'; this.exBP.Q.value = 3;
    this.exGain = c.createGain(); this.exGain.gain.value = 0;
    this.exNoise.connect(this.exBP).connect(this.exGain).connect(this.engPan);
    // starter motor
    this.stOsc = c.createOscillator(); this.stOsc.type = 'square'; this.stOsc.frequency.value = 14;
    this.stWhine = c.createOscillator(); this.stWhine.type = 'sawtooth'; this.stWhine.frequency.value = 520;
    this.stGain = c.createGain(); this.stGain.gain.value = 0;
    const stLP = c.createBiquadFilter(); stLP.type = 'lowpass'; stLP.frequency.value = 900;
    const wg = c.createGain(); wg.gain.value = 0.15;
    this.stOsc.connect(stLP); this.stWhine.connect(wg).connect(stLP); stLP.connect(this.stGain).connect(this.engPan);
    for (const o of [this.o1, this.o2, this.o3, this.stOsc, this.stWhine]) o.start();
    this.exNoise.start();
  }
  buildLoops() {
    const c = this.ctx;
    const mk = (type, f, q) => { const n = this.noise(); const flt = c.createBiquadFilter(); flt.type = type; flt.frequency.value = f; flt.Q.value = q; const g = c.createGain(); g.gain.value = 0; n.connect(flt).connect(g).connect(this.master); n.start(); return g; };
    this.skidG = mk('bandpass', 900, 2);
    this.gravelG = mk('bandpass', 2200, 0.7);
    this.windG = mk('lowpass', 400, 0.5);
    this.rainG = mk('highpass', 3000, 0.3);
    this.ambG = mk('lowpass', 250, 0.3);
  }

  // ---- continuous update ----
  update(dt, st) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const L = c.listener;
    const cam = st.camPos, f = st.camFwd;
    if (L.positionX) { L.positionX.value = cam.x; L.positionY.value = cam.y; L.positionZ.value = cam.z; L.forwardX.value = f.x; L.forwardY.value = f.y; L.forwardZ.value = f.z; L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0; }
    else { L.setPosition(cam.x, cam.y, cam.z); L.setOrientation(f.x, f.y, f.z, 0, 1, 0); }
    const ep = st.enginePos;
    if (this.engPan.positionX) { this.engPan.positionX.value = ep.x; this.engPan.positionY.value = ep.y; this.engPan.positionZ.value = ep.z; } else this.engPan.setPosition(ep.x, ep.y, ep.z);
    const e = st.engine;
    const rpm = Math.max(e.rpm, 1);
    const fire = rpm / 60 * 2;
    let jitter = 1;
    if (e.misfire > 0 && Math.random() < 0.08 * e.misfire) jitter = 0.35;
    this.o1.frequency.setTargetAtTime(fire, t, 0.02);
    this.o2.frequency.setTargetAtTime(fire / 2, t, 0.02);
    this.o3.frequency.setTargetAtTime(fire * 1.5, t, 0.02);
    this.engLP.frequency.setTargetAtTime(180 + rpm * 0.28 * e.loud + e.throttle * 1400 * e.loud, t, 0.04);
    const run = e.running ? 1 : clamp(rpm / 400, 0, 1) * 0.5;
    this.engGain.gain.setTargetAtTime((e.running || rpm > 30) ? 0.22 * run * (0.45 + 0.55 * e.load) * Math.min(e.loud, 2.2) * jitter : 0, t, 0.03);
    this.exBP.frequency.setTargetAtTime(fire * 3 + 200, t, 0.05);
    this.exGain.gain.setTargetAtTime(e.running ? 0.05 * e.throttle * e.loud * e.loud + (e.knock || 0) * 0.15 : 0, t, 0.05);
    this.stGain.gain.setTargetAtTime(e.starter ? 0.14 * e.starter : 0, t, 0.03);
    this.stOsc.frequency.setTargetAtTime(Math.max(6, rpm / 60 * 2), t, 0.05);
    // tyres & environment
    this.skidG.gain.setTargetAtTime(clamp(st.slip, 0, 1) * 0.18, t, 0.05);
    this.gravelG.gain.setTargetAtTime(clamp(st.speed / 25, 0, 1) * st.gravel * 0.1, t, 0.1);
    this.windG.gain.setTargetAtTime(clamp(st.speed / 40, 0, 1) * 0.12 + 0.012 * (st.outdoors ? 1 : 0.2), t, 0.2);
    this.rainG.gain.setTargetAtTime(st.rain * 0.06, t, 0.5);
    this.ambG.gain.setTargetAtTime(st.indoors ? 0.01 : 0.004, t, 0.5);
    // birds in daytime outdoors
    if (st.day > 0.5 && st.outdoors && st.rain < 0.3) {
      this.birdT -= dt;
      if (this.birdT < 0) { this.birdT = 2 + Math.random() * 7; this.bird(); }
    }
  }

  // ---- one-shots ----
  env(gainPeak, attack, decay) {
    const g = this.ctx.createGain(); const t = this.ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gainPeak, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(this.master); return g;
  }
  tone(freq, type, gain, dur, slide = 0) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), this.ctx.currentTime + dur);
    o.connect(this.env(gain, 0.005, dur)); o.start(); o.stop(this.ctx.currentTime + dur + 0.05);
  }
  burst(freq, q, gain, dur, type = 'bandpass') {
    if (!this.ctx) return;
    const n = this.noise(); const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    n.connect(f).connect(this.env(gain, 0.002, dur)); n.start(); n.stop(this.ctx.currentTime + dur + 0.05);
  }
  click(v = 0.5) { this.burst(3500, 4, 0.15 * v, 0.03); }
  clink() { this.tone(2400, 'triangle', 0.08, 0.15); this.tone(3700, 'sine', 0.04, 0.1); }
  ratchet(type) {
    if (type === 'hand') { this.burst(1200, 2, 0.05, 0.05); return; }
    if (type === 'screwdriver') { this.burst(2500, 6, 0.05, 0.04); return; }
    this.burst(4200, 8, 0.12, 0.018); this.tone(5200, 'square', 0.015, 0.01);
  }
  torqueClick() { this.burst(2000, 10, 0.3, 0.05); this.tone(900, 'square', 0.06, 0.04); }
  snug() { this.tone(180, 'triangle', 0.15, 0.08); }
  snap() { this.burst(1800, 1, 0.5, 0.15); this.tone(300, 'sawtooth', 0.15, 0.2, 0.3); }
  boltOut() { this.tone(1800, 'triangle', 0.08, 0.2); this.burst(5000, 3, 0.04, 0.05); }
  thunk(v = 0.5) { this.tone(110, 'sine', 0.3 * v, 0.18, 0.6); this.burst(400, 1, 0.12 * v, 0.08, 'lowpass'); }
  install(mass) { this.thunk(clamp(mass / 10, 0.25, 1.2)); this.tone(1400, 'triangle', 0.04, 0.12); }
  pickup(mass) { this.burst(600, 1, clamp(mass / 40, 0.03, 0.2), 0.08, 'lowpass'); }
  putDown(mass) { this.thunk(clamp(mass / 15, 0.15, 1)); }
  drawer() { this.burst(1500, 1.5, 0.08, 0.25); this.tone(220, 'triangle', 0.05, 0.1); }
  door(open, type) { if (open) { this.tone(160, 'triangle', 0.08, 0.1); this.burst(900, 3, 0.06, 0.1); } else { this.thunk(type === 'hood' ? 1.2 : 0.9); this.burst(2500, 2, 0.06, 0.05); } }
  pour() { this.burst(700 + Math.random() * 500, 5, 0.06, 0.3); }
  eat() { for (let i = 0; i < 3; i++) setTimeout(() => this.burst(1200 + Math.random() * 800, 3, 0.08, 0.06), i * 120); }
  footstep(surface, v) {
    const f = surface === 'gravel' || surface === 'dirt' ? 1800 : surface === 'grass' ? 900 : surface === 'wood' ? 300 : 600;
    this.burst(f + Math.random() * 300, surface === 'gravel' ? 0.8 : 1.5, 0.05 * v, surface === 'gravel' ? 0.12 : 0.07, surface === 'concrete' ? 'bandpass' : 'lowpass');
  }
  shift(grind) { if (grind) { this.burst(3000, 2, 0.25, 0.35); this.tone(140, 'sawtooth', 0.08, 0.3); } else { this.burst(1200, 3, 0.08, 0.06); this.tone(260, 'triangle', 0.06, 0.05); } }
  crash(v) { this.burst(500, 0.7, clamp(v / 15, 0.1, 0.8), 0.4, 'lowpass'); this.burst(3000, 1, clamp(v / 25, 0.05, 0.4), 0.25); }
  bird() { const f = 2400 + Math.random() * 1800; for (let i = 0; i < 2 + Math.random() * 3; i++) setTimeout(() => this.tone(f * (1 + Math.random() * 0.2), 'sine', 0.025, 0.09, 1.3), i * 140); }
  beep(hi) { this.tone(hi ? 1320 : 660, 'square', 0.12, hi ? 0.5 : 0.18); }
  cash() { this.tone(1200, 'triangle', 0.1, 0.1); setTimeout(() => this.tone(1800, 'triangle', 0.1, 0.25), 90); }

  toggleRadio() {
    if (!this.ctx) return;
    this.radioOn = !this.radioOn;
    if (this.radioOn) {
      // a cheerful little humppa loop
      const notes = [0, 4, 7, 4, 2, 5, 9, 5, 0, 4, 7, 12, 7, 4, 2, -1];
      let i = 0;
      this.radioTimer = setInterval(() => {
        const n = notes[i++ % notes.length];
        const base = 220 * Math.pow(2, n / 12);
        this.tone(base, 'square', 0.025, 0.16);
        if (i % 2) this.tone(110 * Math.pow(2, (i % 4 < 2 ? 0 : 7) / 12), 'triangle', 0.04, 0.12);
        if (Math.random() < 0.3) this.burst(6000, 1, 0.01, 0.05);
      }, 190);
    } else clearInterval(this.radioTimer);
  }
  speak(text) {
    try { const u = new SpeechSynthesisUtterance(text); u.rate = 1.15; u.pitch = 0.9; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch (e) { console.warn('speech unavailable', e); }
  }
}
