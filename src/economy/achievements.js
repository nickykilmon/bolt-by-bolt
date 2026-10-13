// Achievements: unlocked by events around the game, saved, shown on the phone.
export const ACH = [
  { id: 'start', icon: '🔑', title: 'It\'s alive!', desc: 'Start the Ruska\'s engine for the first time.' },
  { id: 'drive_1km', icon: '🛣', title: 'First kilometre', desc: 'Drive the Ruska 1 km.' },
  { id: 'speed_100', icon: '💨', title: 'Ton up', desc: 'Hit 100 km/h.' },
  { id: 'speed_150', icon: '🚀', title: 'Warp speed', desc: 'Hit 150 km/h.' },
  { id: 'airtime', icon: '🦅', title: 'Flying Finn', desc: 'Get all four wheels off the ground for a whole second.' },
  { id: 'crash', icon: '💥', title: 'Crumple zone', desc: 'Have a really big crash.' },
  { id: 'bolts_100', icon: '🔩', title: 'Bolt by bolt', desc: 'Tighten 100 bolts.' },
  { id: 'bolts_1000', icon: '🧰', title: 'Grease monkey', desc: 'Tighten 1000 bolts.' },
  { id: 'turbo', icon: '🌀', title: 'Spool up', desc: 'Fit a turbo to the engine.' },
  { id: 'aero', icon: '🪽', title: 'Downforce', desc: 'Fit a rear wing.' },
  { id: 'dyno_100', icon: '📈', title: 'Three digits', desc: 'Make 100 hp at the wheels on Esa\'s dyno.' },
  { id: 'dyno_150', icon: '🔥', title: 'Fire-breather', desc: 'Make 150 hp at the wheels on Esa\'s dyno.' },
  { id: 'job', icon: '💼', title: 'Working class hero', desc: 'Finish a job.' },
  { id: 'rally_stage', icon: '🏁', title: 'Stage finisher', desc: 'Finish a rally stage in an event.' },
  { id: 'rally_win', icon: '🏆', title: 'Winner', desc: 'Win a rally.' },
  { id: 'champion', icon: '👑', title: 'Champion', desc: 'Win the National Championship Final.' },
  { id: 'pet', icon: '🐾', title: 'New best friend', desc: 'Adopt a stray.' },
  { id: 'pets_3', icon: '🐈', title: 'Crazy pet person', desc: 'Have three pets at once.' },
  { id: 'pet_died', icon: '💔', title: 'Never again', desc: 'Let a pet starve. (You monster.)' },
  { id: 'sauna', icon: '🧖', title: 'Löyly', desc: 'Have a sauna.' },
  { id: 'sauna_beer', icon: '🍺', title: 'Sauna beer', desc: 'Take a beer into the sauna.' },
  { id: 'fish', icon: '🐟', title: 'Gone fishing', desc: 'Catch a fish.' },
  { id: 'big_fish', icon: '🎣', title: 'The one that didn\'t get away', desc: 'Catch a fish of 3 kg or more.' },
  { id: 'pike', icon: '🐊', title: 'Hauki', desc: 'Catch a pike.' },
  { id: 'pee', icon: '🚽', title: 'Nature calls', desc: 'Pee outside.' },
  { id: 'pee_npc', icon: '😡', title: 'Social pariah', desc: 'Pee on a villager.' },
  { id: 'pee_car', icon: '🚗', title: 'Marking territory', desc: 'Pee on your own car.' },
  { id: 'pee_self', icon: '😳', title: 'Accident', desc: 'Wet yourself.' },
  { id: 'poop', icon: '💩', title: 'Back to nature', desc: 'Poo outside.' },
  { id: 'poop_public', icon: '🙈', title: 'Public indecency', desc: 'Poo in front of a villager.' },
  { id: 'poop_pants', icon: '🩲', title: 'Code brown', desc: 'Poop your pants.' },
  { id: 'drunk', icon: '🥴', title: 'Hyvää juhannusta', desc: 'Get properly drunk.' },
  { id: 'smoke_20', icon: '🚬', title: 'Pack a day', desc: 'Smoke 20 cigarettes.' },
  { id: 'fight_win', icon: '🥊', title: 'First blood', desc: 'Win a fight in The Cellar.' },
  { id: 'fight_champ', icon: '👊', title: 'King of the Cellar', desc: 'Beat all five fighters, Iso-Jussi included.' },
  { id: 'bet_win', icon: '🎲', title: 'Called it', desc: 'Win a bet at The Cellar.' },
  { id: 'clubbing', icon: '🪩', title: 'On the list', desc: 'Get into Klubi Revontuli.' },
  { id: 'dance', icon: '💃', title: 'Dancing queen', desc: 'Hit the dance floor.' },
  { id: 'dj', icon: '🎧', title: 'Selecta', desc: 'Play a good DJ set at the club.' },
  { id: 'dj_fight', icon: '🤜', title: 'Meet me outside', desc: 'Win the fight after a bad DJ set.' },
  { id: 'died', icon: '☠', title: 'Roadkill', desc: 'Get hit by a car.' },
  { id: 'rich', icon: '💰', title: 'Rich', desc: 'Have 10 000 mk in the bank.' },
];

export class Achievements {
  constructor(game) { this.game = game; this.got = {}; }
  unlock(id) {
    if (id in this.got) return; // (the stored value is the day — day 0 is falsy)
    const a = ACH.find((x) => x.id === id); if (!a) return;
    this.got[id] = this.game.life?.day ?? 0;
    const el = document.createElement('div'); el.className = 'ach-pop';
    el.innerHTML = `<div class="ach-i">${a.icon}</div><div><div class="ach-t">Achievement unlocked</div><div class="ach-n">${a.title}</div><div class="ach-d">${a.desc}</div></div>`;
    document.body.appendChild(el);
    setTimeout(() => el.classList.add('on'), 20); setTimeout(() => el.classList.remove('on'), 4200); setTimeout(() => el.remove(), 5000);
    this.game.audio?.cash();
  }
  // threshold-style checks
  check(kind, v) {
    if (kind === 'dyno') { if (v >= 100) this.unlock('dyno_100'); if (v >= 150) this.unlock('dyno_150'); }
  }
  count() { return Object.keys(this.got).length; }
  serialize() { return this.got; }
  restore(d) { this.got = d || {}; }
}
