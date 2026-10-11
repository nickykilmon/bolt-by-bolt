// JC's daily life: clock & calendar, hunger / thirst / fatigue, sleeping, weekly bills.
import { clamp } from '../core/util.js';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const MIN_PER_SEC = 1; // 1 real second = 1 game minute

export class Life {
  constructor(game) {
    this.game = game;
    this.minutes = 8 * 60;     // absolute game minutes since day 0, 00:00 (day 0 = Monday)
    this.hunger = 80; this.thirst = 80; this.fatigue = 10;
    this.weeklyBill = 260;
    this.billWeek = 0;
    this.passedOut = false;
  }
  get day() { return Math.floor(this.minutes / 1440); }
  get hours() { return (this.minutes % 1440) / 60; }
  dayName() { return `Day ${this.day + 1} (${DAYS[this.day % 7]})`; }
  clock(m = this.minutes) { const h = Math.floor((m % 1440) / 60), mm = Math.floor(m % 60); return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; }
  fmtTime(m) { return (Math.floor(m / 1440) !== this.day ? DAYS[Math.floor(m / 1440) % 7] + ' ' : '') + this.clock(m); }

  update(dt) {
    const gm = dt * MIN_PER_SEC;
    this.minutes += gm;
    this.hunger = clamp(this.hunger - gm * 100 / (60 * 26), 0, 100);
    this.thirst = clamp(this.thirst - gm * 100 / (60 * 18), 0, 100);
    this.fatigue = clamp(this.fatigue + gm * 100 / (60 * 20), 0, 100);
    // weekly bills every Monday 00:00
    const week = Math.floor(this.day / 7);
    if (week > this.billWeek) {
      this.billWeek = week;
      this.game.addMoney(-this.weeklyBill, 'Weekly bills: rent, electricity, insurance');
      this.game.say('The weekly bills just came out of the account.');
    }
    if ((this.hunger <= 0 || this.thirst <= 0 || this.fatigue >= 100) && !this.passedOut) this.passOut();
    const warn = this.hunger < 15 ? 'I\'m starving. Should eat something.' : this.thirst < 15 ? 'So thirsty… there\'s water at the kitchen tap.' : this.fatigue > 88 ? 'I can barely keep my eyes open. Need sleep.' : null;
    this.warnT = (this.warnT || 0) - dt;
    if (warn && this.warnT <= 0) { this.warnT = 60; this.game.say(warn); }
  }
  canSprint() { return this.fatigue < 85 && this.hunger > 5; }
  exert(x) { this.fatigue = clamp(this.fatigue + x * 0.3, 0, 100); this.thirst = clamp(this.thirst - x * 0.2, 0, 100); }
  consume(p = {}) {
    if (p.hunger) this.hunger = clamp(this.hunger + p.hunger, 0, 100);
    if (p.thirst) this.thirst = clamp(this.thirst + p.thirst, 0, 100);
    if (p.fatigue) this.fatigue = clamp(this.fatigue + p.fatigue, 0, 100);
  }
  drinkWater() { this.thirst = clamp(this.thirst + 30, 0, 100); this.game.audio.pour(); this.game.toast('Drank some tap water'); }

  sleep() {
    if (this.fatigue < 30) { this.game.say('I\'m not tired yet.'); return; }
    this.game.fade(() => {
      const hrs = clamp(this.fatigue / 100 * 9, 4, 9);
      const target = this.minutes + hrs * 60;
      this.skip(target - this.minutes);
      this.fatigue = 0;
      this.game.say(`Slept ${hrs.toFixed(1)} hours. ${this.hunger < 30 ? 'Woke up hungry.' : 'Feeling fresh.'}`);
      this.game.saveGame(true);
    });
  }
  skip(min) {
    this.minutes += min;
    this.hunger = clamp(this.hunger - min * 100 / (60 * 26) * 0.5, 2, 100);
    this.thirst = clamp(this.thirst - min * 100 / (60 * 18) * 0.5, 2, 100);
    this.game.timeSkipped(min);
  }
  passOut() {
    this.passedOut = true;
    this.game.fade(() => {
      this.skip(10 * 60);
      this.hunger = Math.max(this.hunger, 25); this.thirst = Math.max(this.thirst, 25); this.fatigue = 20;
      this.game.addMoney(-80, 'Ambulance call-out fee');
      this.game.say('You passed out. The neighbour found you and called an ambulance. That cost 80 mk.');
      this.passedOut = false;
    });
  }
  serialize() { return { m: this.minutes, h: this.hunger, t: this.thirst, f: this.fatigue, bw: this.billWeek }; }
  restore(d) { if (!d) return; this.minutes = d.m; this.hunger = d.h; this.thirst = d.t; this.fatigue = d.f; this.billWeek = d.bw ?? Math.floor(d.m / 1440 / 7); }
}
