// Radio Ruskala: a procedural music engine with a playlist of songs in different styles,
// played through a tinny "radio speaker" filter at the radio's position, with a DJ between songs.
import { mulberry32 } from '../core/util.js';

const MAJOR = [0, 2, 4, 5, 7, 9, 11], MINOR = [0, 2, 3, 5, 7, 8, 10];
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

// drum strings: one char per 16th (or per 8th-triplet for 3/4): k kick, s snare, h hat, o open hat, . rest
export const SONGS = [
  { title: 'Rally Humppa', artist: 'Kalle & the Accelerators', bpm: 132, key: 57, mode: 'major', beats: 4, prog: [1, 1, 5, 5, 1, 1, 5, 1], progB: [4, 4, 1, 1, 5, 5, 1, 1],
    drums: 'k.h.s.h.k.h.s.h.', bass: 'x.......x.......', bassStyle: 'oompa', chords: '....x.......x...', lead: 'accordion', rhythm: ['x.x.x.x.x.xxx...', 'x.xxx.x.x...x...'], form: 'AABA' },
  { title: 'Tango of the Rusty Sill', artist: 'Tuula Tamminen', bpm: 116, key: 50, mode: 'minor', beats: 4, prog: [1, 1, 5, 5, 4, 4, 5, 1], progB: [6, 6, 3, 3, 4, 4, 5, 5],
    drums: 'k..hk.h.k..hs.h.', bass: 'x..x....x...x...', chords: 'x..x.x..x.x.x...', lead: 'violin', rhythm: ['x..x..x.x.......', 'x.x.x.x.xx..x...'], form: 'ABAB' },
  { title: 'Ruskala Disco Fever', artist: 'DJ Peltikatto', bpm: 120, key: 53, mode: 'minor', beats: 4, prog: [1, 1, 6, 6, 4, 4, 5, 5], progB: [6, 6, 7, 7, 1, 1, 5, 5],
    drums: 'k.o.k.o.k.o.k.o.', drums2: '....s.......s...', bass: 'x.x.x.x.x.x.x.x.', bassStyle: 'octave', chords: '..x...x...x...x.', lead: 'synth', rhythm: ['x.x...x.x.x.x...', '..x.x.x...xx.x..'], form: 'AABAB' },
  { title: 'Hot Exhaust', artist: 'Kuuma Kaasu', bpm: 146, key: 52, mode: 'minor', beats: 4, prog: [1, 1, 7, 7, 6, 6, 7, 7], progB: [4, 4, 6, 6, 7, 7, 1, 1],
    drums: 'k.h.s.h.k.k.s.h.', bass: 'x.x.x.x.x.x.x.x.', chords: 'x.x.x.x.x.x.x.x.', chordStyle: 'power', lead: 'guitar', rhythm: ['x...x.x.x...x.x.', 'x.xxx...x.x.x...'], form: 'AABA' },
  { title: 'Polka for a Broken Fan Belt', artist: 'Pertin Pelimannit', bpm: 150, key: 58, mode: 'major', beats: 2, prog: [1, 5, 5, 1, 1, 5, 5, 1], progB: [4, 1, 5, 1, 4, 1, 5, 1],
    drums: 'k.s.k.s.', bass: 'x...x...', bassStyle: 'oompa', chords: '..x...x.', lead: 'accordion', rhythm: ['x.x.xxx.', 'xxx.x.x.'], form: 'AABBAABA' },
  { title: 'Lakeside Waltz', artist: 'Helena & Strings', bpm: 150, key: 55, mode: 'major', beats: 3, prog: [1, 1, 4, 4, 5, 5, 1, 1], progB: [6, 6, 2, 2, 5, 5, 1, 1],
    drums: 'k.h.h.', bass: 'x.....', chords: '..x.x.', lead: 'flute', rhythm: ['x.x.x.', 'x...x.'], form: 'ABABAB' },
  { title: 'Night Drive on Route 54', artist: 'Yöajo', bpm: 100, key: 45, mode: 'minor', beats: 4, prog: [1, 1, 6, 6, 3, 3, 7, 7], progB: [4, 4, 5, 5, 6, 6, 5, 5],
    drums: 'k...s...k.k.s...', drums2: 'h.h.h.h.h.h.h.h.', bass: 'x.x.x.x.x.x.x.x.', chords: 'x...............', chordStyle: 'pad', lead: 'synth', arp: true, rhythm: ['x..x..x.x..x....', 'x.x.x..x..x.x...'], form: 'AABA' },
  { title: 'Sauna Evening', artist: 'Esa & the Steam', bpm: 92, key: 53, mode: 'major', beats: 4, prog: [1, 1, 4, 4, 2, 5, 1, 1], progB: [6, 6, 4, 4, 2, 2, 5, 5],
    drums: 'k...s...k...s...', drums2: 'h.h.h.h.h.h.h.h.', bass: 'x...x...x...x...', chords: 'x.......x.......', chordStyle: 'pad', lead: 'organ', rhythm: ['x...x.x.x.......', 'x.x.x...x...x...'], form: 'ABAB' },
];
const DJ = ['Radio Ruskala, playing the hits your car is too loud to hear.', 'That was {last}. Next up: {next}.', 'Weather in Ruskala: probably rain. Here\'s {next}.', 'Mustard yellow cars are back in fashion, and so is {next}.', 'You\'re listening to Radio Ruskala. Drive safe and mind the moose.'];

export class Radio {
  constructor(audio) {
    this.a = audio;
    this.on = false;
    this.order = [];
    this.idx = -1;
    this.song = null;
    this.sourcePos = null;
  }
  ensureChain() {
    if (this.out) return;
    const c = this.a.ctx;
    this.pan = c.createPanner(); this.pan.panningModel = 'HRTF'; this.pan.refDistance = 1.5; this.pan.rolloffFactor = 1.4; this.pan.distanceModel = 'inverse';
    this.pan.connect(this.a.master);
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 220;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3800;
    const shaper = c.createWaveShaper();
    const curve = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * 1.8); } shaper.curve = curve;
    this.vol = c.createGain(); this.vol.gain.value = 0;
    this.out = c.createGain(); this.out.gain.value = 0.55;
    this.out.connect(shaper).connect(hp).connect(lp).connect(this.vol).connect(this.pan);
    // faint radio hiss
    const n = this.a.noise(); const nf = c.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 3000; nf.Q.value = 0.5;
    const ng = c.createGain(); ng.gain.value = 0.004; n.connect(nf).connect(ng).connect(this.vol); n.start();
  }
  setPos(p) { if (!this.pan || !p) return; if (this.pan.positionX) { this.pan.positionX.value = p.x; this.pan.positionY.value = p.y; this.pan.positionZ.value = p.z; } else this.pan.setPosition(p.x, p.y, p.z); }
  toggle(where) {
    if (!this.a.ctx) return;
    this.ensureChain();
    if (this.on && this.where === where) { this.on = false; this.vol.gain.setTargetAtTime(0, this.a.ctx.currentTime, 0.05); this.song = null; return; }
    this.on = true; this.where = where;
    this.vol.gain.setTargetAtTime(1, this.a.ctx.currentTime, 0.05);
    if (!this.song) this.next(true);
  }
  next(first = false) {
    if (!this.order.length || this.idx >= this.order.length - 1) { const r = mulberry32(Date.now() & 0xffff); this.order = SONGS.map((_, i) => i).sort(() => r() - 0.5); this.idx = -1; }
    const last = this.song;
    this.idx++;
    const s = SONGS[this.order[this.idx]];
    const djLine = DJ[Math.floor(Math.random() * DJ.length)].replace('{last}', last ? `${last.def.title} by ${last.def.artist}` : 'a classic').replace('{next}', `${s.title} by ${s.artist}`);
    const delay = first ? 0.2 : 3.2;
    // the DJ is on the same speaker as the music: only heard when you're close enough to hear the radio
    if (!first && this.a.speak && (this.hear ?? 1) > 0.06) this.a.speak(djLine, { pitch: 1.1, rate: 1.15, voice: 'dj', volume: Math.min(1, this.hear ?? 1) });
    this.song = this.prepare(s, this.a.ctx.currentTime + delay);
    this.onSong?.(s);
  }
  // pre-compute the arrangement: per bar chord + melody notes
  prepare(def, t0) {
    const r = mulberry32(def.title.length * 977 + def.bpm);
    const scale = def.mode === 'major' ? MAJOR : MINOR;
    const stepsPerBar = def.beats === 3 ? 6 : def.beats === 2 ? 8 : 16;
    const stepDur = def.beats === 3 ? 60 / def.bpm / 2 : 60 / def.bpm / 4;
    const phrases = {};
    const mkPhrase = (sec) => {
      const prog = sec === 'B' ? def.progB : def.prog;
      let deg = 4 + Math.floor(r() * 3);
      const notes = [];
      prog.forEach((chord, bar) => {
        const rh = def.rhythm[(bar + (sec === 'B' ? 1 : 0)) % def.rhythm.length];
        for (let st = 0; st < stepsPerBar; st++) {
          if (rh[st % rh.length] !== 'x') continue;
          const chordTones = [chord - 1, chord + 1, chord + 3].map((d) => d + 7);
          if (r() < 0.55) deg = chordTones[Math.floor(r() * 3)];
          else deg += r() < 0.5 ? 1 : -1;
          deg = Math.max(5, Math.min(14, deg));
          const len = rh.slice(st + 1).search(/x/) + 1 || stepsPerBar - st;
          notes.push({ bar, st, deg, len: Math.min(len, 4) });
        }
      });
      return { prog, notes };
    };
    for (const sec of new Set(def.form)) phrases[sec] = mkPhrase(sec);
    const bars = [];
    for (const sec of def.form) { const ph = phrases[sec]; ph.prog.forEach((c, b) => bars.push({ chord: c, notes: ph.notes.filter((n) => n.bar === b), sec })); }
    return { def, t0, scale, stepsPerBar, stepDur, bars, nextStep: 0, total: bars.length * stepsPerBar };
  }

  // schedule notes slightly ahead of the audio clock
  update(listenerPos, sourcePos) {
    if (!this.on || !this.song) return;
    this.setPos(sourcePos);
    // how loud the speaker is where you stand (same 'inverse' falloff as the panner)
    if (listenerPos && sourcePos) { const d = Math.max(1.5, listenerPos.distanceTo(sourcePos)); this.hear = 1.5 / (1.5 + 1.4 * (d - 1.5)); }
    const c = this.a.ctx, S = this.song, d = S.def;
    const ahead = c.currentTime + 0.25;
    while (S.nextStep < S.total) {
      const t = S.t0 + S.nextStep * S.stepDur;
      if (t > ahead) break;
      if (t >= c.currentTime - 0.05) this.playStep(S, S.nextStep, t);
      S.nextStep++;
    }
    if (S.nextStep >= S.total && c.currentTime > S.t0 + S.total * S.stepDur + 0.5) this.next();
  }
  note(deg, scale, root) { const oct = Math.floor(deg / 7), i = ((deg % 7) + 7) % 7; return root + oct * 12 + scale[i]; }
  playStep(S, n, t) {
    const d = S.def, spb = S.stepsPerBar;
    const bar = S.bars[Math.floor(n / spb)], st = n % spb;
    const root = d.key - 12;
    const chordDegs = [bar.chord - 1, bar.chord + 1, bar.chord + 3];
    const ch = (s, i) => s[i % s.length];
    // drums
    const dc = ch(d.drums, st);
    if (dc === 'k') this.kick(t); if (dc === 's') this.snare(t); if (dc === 'h') this.hat(t, 0.03); if (dc === 'o') this.hat(t, 0.12);
    if (d.drums2) { const d2 = ch(d.drums2, st); if (d2 === 's') this.snare(t); if (d2 === 'h') this.hat(t, 0.03); }
    // bass
    if (ch(d.bass, st) === 'x') {
      let deg = chordDegs[0];
      if (d.bassStyle === 'oompa' && (Math.floor(st / (spb / 2)) % 2)) deg = chordDegs[2] - 7;
      let m = this.note(deg, S.scale, root);
      if (d.bassStyle === 'octave' && st % 4 === 2) m += 12;
      this.tone(midi(m), t, S.stepDur * (d.bassStyle === 'octave' ? 1.6 : 3), 'triangle', 0.32, 900);
    }
    // chords
    if (ch(d.chords, st) === 'x') {
      const len = d.chordStyle === 'pad' ? S.stepDur * spb * 0.95 : S.stepDur * 1.6;
      const degs = d.chordStyle === 'power' ? [chordDegs[0], chordDegs[0] + 4, chordDegs[0] + 7] : chordDegs;
      for (const dg of degs) this.tone(midi(this.note(dg + 7, S.scale, root)), t, len, d.chordStyle === 'power' ? 'sawtooth' : d.chordStyle === 'pad' ? 'sawtooth' : 'square', d.chordStyle === 'pad' ? 0.05 : 0.07, d.chordStyle === 'power' ? 1800 : 1400, d.chordStyle === 'pad' ? 0.3 : 0.01);
    }
    if (d.arp && st % 2 === 0) this.tone(midi(this.note(chordDegs[(st / 2) % 3] + 14, S.scale, root)), t, S.stepDur * 1.5, 'square', 0.035, 2500);
    // melody
    for (const nt of bar.notes) if (nt.st === st) this.lead(d.lead, midi(this.note(nt.deg + 7, S.scale, root)), t, nt.len * S.stepDur * 0.95);
  }
  tone(f, t, dur, type, vol, cutoff = 2000, attack = 0.01) {
    const c = this.a.ctx;
    const o = c.createOscillator(); o.type = type; o.frequency.value = f;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cutoff;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(dur, attack + 0.02));
    o.connect(lp).connect(g).connect(this.out); o.start(t); o.stop(t + dur + 0.05);
  }
  lead(kind, f, t, dur) {
    const c = this.a.ctx;
    const voices = kind === 'accordion' ? [['sawtooth', 1, 0.05], ['sawtooth', 1.004, 0.05], ['square', 0.5, 0.025]]
      : kind === 'violin' ? [['sawtooth', 1, 0.07]]
      : kind === 'guitar' ? [['sawtooth', 1, 0.07], ['square', 0.5, 0.04]]
      : kind === 'flute' ? [['sine', 1, 0.09], ['triangle', 2, 0.015]]
      : kind === 'organ' ? [['sine', 1, 0.06], ['sine', 2, 0.03], ['square', 0.5, 0.015]]
      : [['square', 1, 0.05], ['sawtooth', 1.005, 0.03]];
    const atk = kind === 'violin' || kind === 'flute' ? 0.06 : 0.012;
    for (const [type, mult, vol] of voices) {
      const o = c.createOscillator(); o.type = type; o.frequency.value = f * mult;
      if (kind === 'violin' || kind === 'flute') { const v = c.createOscillator(); v.frequency.value = 5.5; const vg = c.createGain(); vg.gain.value = f * 0.012; v.connect(vg).connect(o.frequency); v.start(t); v.stop(t + dur + 0.1); }
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = kind === 'guitar' ? 2600 : 3200;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + atk); g.gain.setValueAtTime(vol, t + Math.max(atk, dur * 0.7)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
      o.connect(lp).connect(g).connect(this.out); o.start(t); o.stop(t + dur + 0.1);
    }
  }
  kick(t) { const c = this.a.ctx; const o = c.createOscillator(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.18); const g = c.createGain(); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22); o.connect(g).connect(this.out); o.start(t); o.stop(t + 0.25); }
  snare(t) { const c = this.a.ctx; const n = this.a.noise(); const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.8; const g = c.createGain(); g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14); n.connect(f).connect(g).connect(this.out); n.start(t); n.stop(t + 0.16); this.tone(190, t, 0.08, 'triangle', 0.12, 1000); }
  hat(t, len) { const c = this.a.ctx; const n = this.a.noise(); const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000; const g = c.createGain(); g.gain.setValueAtTime(0.09, t); g.gain.exponentialRampToValueAtTime(0.0001, t + len); n.connect(f).connect(g).connect(this.out); n.start(t); n.stop(t + len + 0.02); }
  nowPlaying() { return this.on && this.song ? `${this.song.def.title} — ${this.song.def.artist}` : null; }
}
