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
    this.happiness = 70;   // 0..100: working on the car, driving and pets keep it up
    this.griefUntil = 0;   // after a pet dies you can't be properly happy for a while
    this.bladder = 10; this.drunk = 0; this.smoked = 0; this.lastSmoke = -1e9;
  }
  get day() { return Math.floor(this.minutes / 1440); }
  get hours() { return (this.minutes % 1440) / 60; }
  dayName() { return `Day ${this.day + 1} (${DAYS[this.day % 7]})`; }
  clock(m = this.minutes) { const h = Math.floor((m % 1440) / 60), mm = Math.floor(m % 60); return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; }
  fmtTime(m) { return (Math.floor(m / 1440) !== this.day ? DAYS[Math.floor(m / 1440) % 7] + ' ' : '') + this.clock(m); }

  update(dt) {
    const gm = dt * MIN_PER_SEC;
    this.minutes += gm;
    const nm = { relaxed: 0.6, harsh: 1.5 }[this.game.profile?.needs] || 1;
    this.hunger = clamp(this.hunger - gm * nm * 100 / (60 * 26), 0, 100);
    this.thirst = clamp(this.thirst - gm * nm * 100 / (60 * 18), 0, 100);
    this.fatigue = clamp(this.fatigue + gm * 100 / (60 * 20), 0, 100);
    // weekly bills every Monday 00:00
    const week = Math.floor(this.day / 7);
    if (week > this.billWeek) {
      this.billWeek = week;
      this.game.addMoney(-this.weeklyBill, 'Weekly bills: rent, electricity, insurance');
      this.game.say('The weekly bills just came out of the account.');
    }
    // happiness slowly drains; hunger and exhaustion drain it faster
    this.happiness = clamp(this.happiness - gm / 60 * (1.2 + (this.hunger < 20 ? 0.8 : 0) + (this.fatigue > 85 ? 0.6 : 0)), 0, this.cap());
    this.sadT = (this.sadT || 0) - dt;
    if (this.sadT <= 0 && this.happiness < 25) {
      this.sadT = 150;
      this.game.say(this.minutes < this.griefUntil ? `I keep thinking about ${this.griefName}…` : this.happiness < 10 ? 'I feel awful. Nothing gets done like this. Maybe some time in the garage would help.' : 'Feeling a bit down. Working on the Ruska always cheers me up.', 5);
    }
    // bladder fills slowly (and fast after drinks); drunkenness wears off
    this.bladder = clamp(this.bladder + gm * 100 / (60 * 16), 0, 100);
    if (this.bladder >= 100) { this.bladder = 0; this.happiness = clamp(this.happiness - 12, 0, 100); this.game.say('Oh no. You couldn\'t hold it any longer… You wet yourself.', 5); this.game.ach?.unlock('pee_self'); }
    else if (this.bladder > 80 && (this.peeWarnT || 0) <= this.minutes) { this.peeWarnT = this.minutes + 45; this.game.say('I really need to pee. (Hold U somewhere discreet.)', 4); }
    this.drunk = Math.max(0, this.drunk - gm / 60 * 0.22);
    // smokers get cravings
    if (this.smoked >= 5 && this.minutes - this.lastSmoke > 8 * 60) {
      this.happiness = clamp(this.happiness - gm / 60 * 1.2, 0, this.cap());
      if ((this.craveT || 0) <= this.minutes) { this.craveT = this.minutes + 120; this.game.say('I could really use a smoke…', 3); }
    }
    if ((this.hunger <= 0 || this.thirst <= 0 || this.fatigue >= 100) && !this.passedOut) this.passOut();
    const warn = this.hunger < 15 ? 'I\'m starving. Should eat something.' : this.thirst < 15 ? 'So thirsty… there\'s water at the kitchen tap.' : this.fatigue > 88 ? 'I can barely keep my eyes open. Need sleep.' : null;
    this.warnT = (this.warnT || 0) - dt;
    if (warn && this.warnT <= 0) { this.warnT = 60; this.game.say(warn); }
  }
  canSprint() { return this.fatigue < 85 && this.hunger > 5 && this.happiness >= 15; }
  cap() { return this.minutes < this.griefUntil ? 45 : 100; }
  // add happiness (quiet = no popup)
  cheer(x, quiet) {
    const before = this.happiness;
    this.happiness = clamp(this.happiness + x, 0, this.cap());
    if (!quiet && x >= 3 && this.happiness > before) this.game.toast(`☺ +${Math.round(this.happiness - before)} happiness`, 1.5);
  }
  grieve(name) { this.happiness = clamp(this.happiness - 60, 0, 100); this.griefUntil = this.minutes + 2 * 1440; this.griefName = name; }
  exert(x) { this.fatigue = clamp(this.fatigue + x * 0.3, 0, 100); this.thirst = clamp(this.thirst - x * 0.2, 0, 100); }
  consume(p = {}) {
    if (p.thirst > 0) this.bladder = clamp(this.bladder + p.thirst * 0.6, 0, 100);
    if (p.beer) { this.drunk = Math.min(2, this.drunk + 0.3); this.cheer(5); this.bladder = clamp(this.bladder + 12, 0, 100); if (this.drunk > 1) this.game.ach?.unlock('drunk'); }
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
    this.happiness = clamp(this.happiness - min / 60 * 0.6, 0, this.cap());
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
  serialize() { return { m: this.minutes, h: this.hunger, t: this.thirst, f: this.fatigue, bw: this.billWeek, hp: this.happiness, gu: this.griefUntil, gn: this.griefName, bl: this.bladder, dr: this.drunk, sm: this.smoked, ls: this.lastSmoke }; }
  restore(d) { if (!d) return; this.minutes = d.m; this.hunger = d.h; this.thirst = d.t; this.fatigue = d.f; this.billWeek = d.bw ?? Math.floor(d.m / 1440 / 7); this.happiness = d.hp ?? 70; this.griefUntil = d.gu || 0; this.griefName = d.gn; this.bladder = d.bl ?? 10; this.drunk = d.dr || 0; this.smoked = d.sm || 0; this.lastSmoke = d.ls ?? -1e9; }
}
