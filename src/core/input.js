// Keyboard / mouse state with edge detection. One instance shared by the game.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();   // keys that went down this frame
    this.released = new Set();
    this.mouse = { dx: 0, dy: 0, wheel: 0, l: false, r: false, lDown: false, rDown: false, lUp: false, rUp: false };
    this.locked = false;
    addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code); this.pressed.add(e.code);
    });
    addEventListener('keyup', (e) => { this.keys.delete(e.code); this.released.add(e.code); });
    addEventListener('blur', () => { this.keys.clear(); this.mouse.l = this.mouse.r = false; });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) { this.mouse.l = true; this.mouse.lDown = true; }
      if (e.button === 2) { this.mouse.r = true; this.mouse.rDown = true; }
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0 && this.mouse.l) { this.mouse.l = false; this.mouse.lUp = true; }
      if (e.button === 2 && this.mouse.r) { this.mouse.r = false; this.mouse.rUp = true; }
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouse.dx += e.movementX; this.mouse.dy += e.movementY;
    });
    addEventListener('wheel', (e) => { if (this.locked) this.mouse.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) { this.keys.clear(); this.mouse.l = this.mouse.r = false; }
      this.onLockChange?.(this.locked);
    });
  }
  lock() {
    if (this.locked) return;
    try { const p = this.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { console.warn('pointer lock failed', e); }
  }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }
  down(code) { return this.keys.has(code); }
  hit(code) { return this.pressed.has(code); }
  up(code) { return this.released.has(code); }
  endFrame() {
    this.pressed.clear(); this.released.clear();
    const m = this.mouse;
    m.dx = m.dy = m.wheel = 0; m.lDown = m.rDown = m.lUp = m.rUp = false;
  }
}
