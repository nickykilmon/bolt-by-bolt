// Seasons: a week each — summer, autumn, winter, spring — then round again.
//  autumn: birches turn orange, the grass goes straw-coloured, more rain
//  winter: snow on the ground, the roads and the spruces, bare birches, snowfall instead of rain,
//          icy roads (studded winter tyres from Esa / Ari fix that) and a frozen lake you can walk on
//  spring: fresh light-green leaves, the snow melts away
import * as THREE from 'three';
import { SEASON_REFS, WEATHER, LAKE } from './terrain.js';
import { FLOORS } from './colliders.js';
import { clamp, lerp } from '../core/util.js';

export const SEASONS = ['Summer', 'Autumn', 'Winter', 'Spring'];
const ICON = ['☀', '🍂', '❄', '🌱'];
const LEAF = [new THREE.Color(0x6f9440), new THREE.Color(0xd8902a), new THREE.Color(0x6f9440), new THREE.Color(0x96c050)];
const NEEDLE = new THREE.Color(0x2c4a30), NEEDLE_SNOW = new THREE.Color(0xc8d4d8);
const WATER = new THREE.Color(0x2a4a5a), ICE = new THREE.Color(0xd4e2ea);

export class Seasons {
  constructor(game) {
    this.game = game;
    this.snow = 0; this.autumn = 0; this.leaf = LEAF[0].clone();
    this.uni = { uSnow: { value: 0 }, uAutumn: { value: 0 } };
    for (const { mat, k, autumn } of SEASON_REFS.snowMats) {
      const u = this.uni;
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.uSnow = u.uSnow; sh.uniforms.uAutumn = u.uAutumn;
        sh.fragmentShader = 'uniform float uSnow;\nuniform float uAutumn;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
          ${autumn ? 'diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.45, 1.12, 0.55), uAutumn);' : ''}
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.93, 0.97), uSnow * ${k.toFixed(2)});`);
      };
      mat.needsUpdate = true;
    }
    // frozen lake: walkable ice
    FLOORS.push((x, z) => (this.snow > 0.6 && Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.SHORE ? LAKE.level + 0.02 : null));
    this.last = -1;
  }
  get index() { return Math.floor(this.game.life.day / 7) % 4; }
  get name() { return SEASONS[this.index]; }
  get icon() { return ICON[this.index]; }
  get winter() { return this.index === 2; }
  // how much it rains / snows (used by the weather)
  rainChance() { return [0.25, 0.5, 0.45, 0.35][this.index]; }
  update(dt) {
    const g = this.game, i = this.index;
    if (this.last !== i) {
      if (this.last !== -1) g.toast(`${ICON[i]} ${SEASONS[i]} has arrived${i === 2 ? ' — roads are icy. Esa or Ari can fit studded winter tyres.' : i === 1 ? ' — the leaves are turning.' : i === 3 ? ' — the snow is melting.' : '.'}`, 6);
      const first = this.last === -1; this.last = i;
      if (first) { this.snow = i === 2 ? 1 : 0; this.autumn = i === 1 ? 1 : 0; this.leaf.copy(LEAF[i]); }
    }
    const rate = dt * 0.02;
    this.snow += clamp((i === 2 ? 1 : 0) - this.snow, -rate, rate);
    this.autumn += clamp((i === 1 ? 1 : 0) - this.autumn, -rate, rate);
    this.leaf.lerp(LEAF[i], Math.min(1, rate * 2));
    this.uni.uSnow.value = this.snow; this.uni.uAutumn.value = this.autumn;
    WEATHER.ice = this.snow;
    const R = SEASON_REFS;
    if (R.needles) R.needles.color.copy(NEEDLE).lerp(NEEDLE_SNOW, this.snow * 0.55);
    if (R.birch) { R.birch.c.material.color.copy(this.leaf); R.birch.c.visible = this.snow < 0.5; }
    if (R.tufts) R.tufts.visible = this.snow < 0.4;
    if (R.water) { const m = R.water.material; m.color.copy(WATER).lerp(ICE, this.snow); m.opacity = lerp(0.88, 1, this.snow); m.roughness = lerp(0.08, 0.35, this.snow); }
    g.sky.snowing = this.snow > 0.5;
  }
}
