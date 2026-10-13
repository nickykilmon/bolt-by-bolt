// Derives the car's mechanical capabilities from what is actually bolted to it, and
// runs the engine / clutch / gearbox / fluids / temperature simulation.
import { clamp, lerp } from '../core/util.js';
import { CORNERS } from '../mechanics/partsdb.js';
import { TIGHT_OK } from '../mechanics/assembly.js';
import { partProblems } from '../mechanics/problems.js';

export const OIL_CAP = 3.8, COOLANT_CAP = 6, GEAROIL_CAP = 1.6, BRAKE_CAP = 0.5, FUEL_CAP = 45;

// ---------------- static analysis ----------------
export function analyze(asm, car) {
  const ch = car.chassis;
  const at = (p) => asm.at(ch, p);
  const S = { issues: [], cyl: [], corners: {} };
  const issue = (sev, text, cat = 'engine') => S.issues.push({ sev, text, cat });
  const sec = (inst) => inst && asm.fastenerSummary(inst).secure;
  const loose = (inst) => (inst ? asm.looseness(inst) : 1);
  const cond = (inst) => (inst ? inst.cond : 0);

  const b = ch.kids.engine || null;
  S.block = b;
  const head = b?.kids.head || null;
  S.head = head;
  const k = (p) => (b ? asm.at(b, p) : null);

  // --- bottom end ---
  const crank = k('crankshaft');
  S.canRotate = !!crank && !b?.props.seized;
  if (!b) issue(3, 'No engine in the car');
  else {
    if (!crank) issue(3, 'Crankshaft missing — nothing to turn');
    if (crank && !k('mainBearings')) issue(3, 'Main bearings missing — crank runs metal-on-metal');
    if (crank && !sec(crank)) issue(2, 'Main cap bolts not torqued');
    if (crank && !k('rodBearings')) issue(3, 'Rod bearings missing');
    if (b.props.seized) issue(3, 'Engine is seized (oil starvation)');
  }
  // --- valvetrain / timing ---
  const belt = k('timingBelt');
  const camOk = head && head.kids.camshaft && head.kids.camBearings && head.kids.rockers;
  const valvesOk = head && head.kids.valvesIn && head.kids.valvesEx;
  const springsOk = head && head.kids.valveSprings && head.kids.retainers;
  S.timingOffset = belt ? (belt.props.offset || 0) : null;
  let timingF = 1;
  if (b && head) {
    if (!valvesOk) issue(3, 'Valves missing from the cylinder head');
    else if (!springsOk) issue(3, 'Valve springs / retainers missing — valves won\'t close');
    if (!camOk) issue(3, 'Camshaft, cam bearings or rockers missing');
    if (!belt) issue(3, 'Timing belt not fitted — camshaft won\'t turn');
    else {
      const o = Math.abs(S.timingOffset);
      timingF = o === 0 ? 1 : o === 1 ? 0.78 : o === 2 ? 0.42 : 0.08;
      if (o) issue(o >= 2 ? 3 : 2, `Valve timing is ${o} tooth${o > 1 ? 's' : ''} off`);
      if (belt.cond < 0.3) issue(2, 'Timing belt is cracked and could snap');
    }
  }
  // --- per cylinder compression and spark ---
  const gasket = k('headGasket');
  const headLoose = head ? loose(head) : 1;
  const battery = ch.kids.battery;
  let termOk = !!battery;
  if (battery) {
    let i = 0;
    for (const g of asm.slotDef(battery).fast) for (const _ of g.pts) { if (g.role === 'terminal' && !(battery.fast[i]?.in && battery.fast[i].q > 0.4)) termOk = false; i++; }
  }
  S.battery = { present: !!battery, connected: !!termOk, charge: battery ? battery.props.charge ?? 0 : 0 };
  S.electric = S.battery.present && S.battery.connected && S.battery.charge > 0.05;
  const harness = ch.kids.harness;
  const harnessOk = harness && asm.looseness(harness) < 0.01;
  S.harness = !!harnessOk;
  const coilOk = ch.kids.coil && ch.kids.coilLead && asm.looseness(ch.kids.coilLead) < 0.01;
  const dist = head?.kids.distributor;
  const wires = head?.kids.plugWires;
  const distOk = !!dist && asm.looseness(dist) < 0.8;
  const ignBase = S.electric && harnessOk && coilOk && distOk ? 1 : 0;
  if (b) {
    if (!ch.kids.coil) issue(3, 'Ignition coil missing', 'ignition');
    else if (!ch.kids.coilLead || asm.looseness(ch.kids.coilLead) > 0) issue(3, 'Coil lead not connected', 'ignition');
    if (!dist) issue(3, 'Distributor missing', 'ignition');
    if (!wires) issue(3, 'Spark plug wires not fitted', 'ignition');
  }
  let powerSum = 0, firing = 0;
  for (let i = 0; i < 4; i++) {
    const p = k('piston' + (i + 1));
    let c = 0;
    if (p && head && gasket) {
      c = 1;
      c *= p.kids.rings ? 0.35 + 0.65 * p.kids.rings.cond : 0.12;
      c *= 0.5 + 0.5 * p.cond;
      const gc = gasket.cond;
      if (gc < 0.4 && (i === 1 || i === 2)) c *= gc / 0.4 * 0.5;
      c *= 1 - headLoose * 0.9;
      if (!valvesOk) c = 0; else if (!springsOk) c *= 0.1;
      else c *= Math.min(head.kids.valvesIn.cond, head.kids.valvesEx.cond) < 0.3 ? 0.15 : 1;
      if (!belt || !camOk) c *= 0.1; else c *= timingF;
      const plug = head.kids['plug' + (i + 1)];
      if (!plug) c *= 0.05; // open plug hole
      else c *= 1 - asm.looseness(plug) * 0.8;
    }
    const plug = head?.kids['plug' + (i + 1)];
    let s = ignBase && wires && plug ? 1 : 0;
    if (s && wires) { const f = wires.fast[i]; if (!f?.in) s = 0; }
    if (s && plug) s *= plug.cond < 0.25 ? 0.2 : 0.6 + 0.4 * plug.cond;
    S.cyl.push({ comp: c, spark: s });
    if (b && head && !plug) issue(2, `Spark plug #${i + 1} missing`, 'ignition');
    else if (plug && plug.cond < 0.3) issue(1, `Spark plug #${i + 1} is fouled`, 'ignition');
    if (p && !p.kids.rings) issue(2, `Piston #${i + 1} has no rings — no compression`);
  }
  if (b && !gasket) issue(3, 'Head gasket missing');
  else if (gasket && gasket.cond < 0.4) issue(2, 'Head gasket is damaged — compression & coolant leak');
  if (head && headLoose > 0.05) issue(2, 'Cylinder head bolts not torqued');
  if (b && !head) issue(3, 'Cylinder head not fitted');

  // --- fuel & air ---
  const tank = ch.kids.fuelTank;
  const intake = head?.kids.intake;
  const carb = intake?.kids.carb;
  S.fuel = tank ? tank.props.fuel || 0 : 0;
  S.fuelOk = !!(tank && S.fuel > 0.05 && ch.kids.fuelLine && asm.looseness(ch.kids.fuelLine) < 0.5 && k('fuelPump') && carb && intake);
  if (b) {
    if (!tank) issue(3, 'No fuel tank', 'fuel');
    else if (S.fuel <= 0.05) issue(3, 'Fuel tank is empty', 'fuel');
    if (!ch.kids.fuelLine) issue(3, 'Fuel line not connected', 'fuel');
    if (!k('fuelPump')) issue(3, 'Fuel pump missing', 'fuel');
    if (!intake) issue(3, 'Intake manifold missing', 'fuel');
    else if (!carb) issue(3, 'Carburettor missing', 'fuel');
    if (carb && !carb.kids.airFilter) issue(1, 'No air filter — dirt goes straight in', 'fuel');
    if (!ch.kids.throttleCable) issue(2, 'Throttle cable disconnected — engine will only idle', 'fuel');
  }
  S.vacuumLeak = intake ? asm.looseness(intake) + (carb ? asm.looseness(carb) : 0) : 0;
  if (S.vacuumLeak > 0.1) issue(2, 'Vacuum leak — intake or carb nuts loose', 'fuel');
  S.throttleOk = !!ch.kids.throttleCable;

  // --- power multipliers from parts ---
  let pm = 1;
  for (const pp of [head?.kids.camshaft, carb, head?.kids.exManifold, ch.kids.muffler, ...[1, 2, 3, 4].map((i) => k('piston' + i))]) if (pp?.props.power) pm *= (pp.props.power - 1) / (pp.def.type === 'piston' ? 4 : 1) + 1;
  S.idleRough = head?.kids.camshaft?.props.idle ? 1 - head.kids.camshaft.props.idle : 0;
  const turbo = head?.kids.turbo;
  S.boost = turbo ? (turbo.props.boost || 0.45) * (0.4 + 0.6 * turbo.cond) * (1 - asm.looseness(turbo) * 0.8) : 0;
  if (turbo && asm.looseness(turbo) > 0.3) issue(2, 'Turbo flange nuts loose — boost leak', 'engine');

  // --- exhaust ---
  const exm = head?.kids.exManifold;
  let loud = 1, exLeak = 0;
  if (b && head) {
    if (!exm) { loud = 3; pm *= 0.9; issue(1, 'No exhaust manifold — very loud', 'exhaust'); }
    else {
      if (!head.kids.exGasket) { exLeak += 0.6; issue(1, 'Exhaust manifold gasket missing — ticking leak', 'exhaust'); }
      exLeak += asm.looseness(exm) * 0.8;
      if (!ch.kids.downpipe) { loud = 2.6; issue(1, 'No downpipe — exhaust dumps in the engine bay', 'exhaust'); }
      else {
        exLeak += asm.looseness(ch.kids.downpipe) * 0.6;
        if (!ch.kids.midpipe) { loud = 2.2; issue(1, 'Mid pipe missing', 'exhaust'); }
        else if (!ch.kids.muffler) { loud = 1.9; issue(1, 'Muffler missing — fails inspection', 'exhaust'); }
        else loud = ch.kids.muffler.props.loud || 1;
      }
    }
  }
  S.loud = loud + exLeak * 0.5; S.exLeak = exLeak;
  pm *= 1 - exLeak * 0.05;
  // tuning: carburettor mixture & idle, ignition advance
  const mix = carb?.props.mixture ?? 0;          // -1 lean .. +1 rich
  const adv = dist?.props.advance ?? 0;            // degrees from base timing
  S.mix = mix; S.advance = adv;
  pm *= 1 - 0.08 * (mix + 0.2) * (mix + 0.2);
  pm *= 1 + 0.012 * Math.min(adv, 8) - (adv > 8 ? (adv - 8) * 0.025 : 0) + (adv < 0 ? adv * 0.006 : 0);
  S.fuelMult = 1 + 0.45 * mix;
  S.heatMult = 1 + Math.max(0, -mix - 0.3) * 0.8 + Math.max(0, adv - 6) * 0.04;
  S.knockRisk = Math.max(0, adv - 9) * 0.25 + Math.max(0, -mix - 0.5) * 0.6;
  S.idleRpm = carb?.props.idle ?? 850;
  S.powerMult = pm;

  // --- lubrication ---
  S.oil = b ? b.props.oil || 0 : 0;
  S.oilPump = !!k('oilPump');
  S.oilPan = !!k('oilPan');
  const drain = k('oilPan') ? asm.fastenerByRole(k('oilPan'), 'drain') : null;
  S.oilLeak = 0;
  if (b) {
    if (!S.oilPan) S.oilLeak = 5;
    else { if (!drain?.f?.in) S.oilLeak = 3; else if (drain.f.q < 0.5) S.oilLeak = 0.02; S.oilLeak += asm.looseness(k('oilPan')) * 0.05; }
    if (!k('oilFilter')) S.oilLeakRunning = 0.5; else S.oilLeakRunning = asm.looseness(k('oilFilter')) * 0.1;
    if (head && !head.kids.valveCover) S.oilLeakRunning += 0.05;
    if (!S.oilPump) issue(3, 'Oil pump missing — no lubrication', 'oil');
    if (!S.oilPan) issue(3, 'Oil pan missing', 'oil');
    else if (!drain?.f?.in) issue(3, 'Drain plug missing — oil pours out', 'oil');
    if (!k('oilFilter')) issue(3, 'Oil filter missing — oil sprays out when running', 'oil');
    if (S.oil < 2) issue(S.oil < 1 ? 3 : 2, `Engine oil low (${S.oil.toFixed(1)} / ${OIL_CAP} L)`, 'oil');
    if (head && !head.kids.valveCover) issue(1, 'Valve cover off — oil will fling everywhere', 'oil');
  }

  // --- cooling ---
  const rad = ch.kids.radiator;
  S.coolant = ch.props.coolant || 0;
  const hoses = ch.kids.hoseUpper && ch.kids.hoseLower;
  S.coolLeak = 0;
  if (!rad || !hoses || !k('waterPump') || !head?.kids.thermostat || !head) S.coolLeak = 5;
  else S.coolLeak = (asm.looseness(ch.kids.hoseUpper) + asm.looseness(ch.kids.hoseLower)) * 0.08 + (gasket && gasket.cond < 0.4 ? 0.004 : 0) + (rad.cond < 0.3 ? 0.01 : 0);
  S.coolingOk = !!(rad && hoses && k('waterPump') && k('fanBelt') && head?.kids.thermostat && S.coolant > 3);
  S.fanOk = !!(ch.kids.fan && S.electric && asm.looseness(ch.kids.fan) < 0.5);
  if (b) {
    if (!rad) issue(3, 'Radiator missing', 'cooling');
    if (!hoses) issue(3, 'Radiator hoses not fitted', 'cooling');
    if (!k('waterPump')) issue(3, 'Water pump missing', 'cooling');
    if (head && !head.kids.thermostat) issue(2, 'Thermostat housing missing', 'cooling');
    if (!k('fanBelt')) issue(2, 'V-belt missing — water pump & alternator not driven', 'cooling');
    if (S.coolant < 3) issue(S.coolant < 1 ? 3 : 2, `Coolant low (${S.coolant.toFixed(1)} / ${COOLANT_CAP} L)`, 'cooling');
    if (!ch.kids.fan) issue(1, 'Cooling fan missing — overheats in traffic', 'cooling');
  }
  S.charging = !!(k('alternator') && k('fanBelt') && harnessOk);
  if (b && !k('alternator')) issue(2, 'Alternator missing — battery won\'t charge', 'electrical');

  // --- starting ---
  S.starter = !!(k('starter') && asm.looseness(k('starter')) < 0.6);
  S.flywheel = !!k('flywheel');
  if (!battery) issue(3, 'No battery', 'electrical');
  else if (!S.battery.connected) issue(3, 'Battery terminals not connected', 'electrical');
  else if (S.battery.charge < 0.3) issue(2, `Battery weak (${Math.round(S.battery.charge * 100)}%)`, 'electrical');
  if (b && !k('starter')) issue(3, 'Starter motor missing', 'electrical');
  if (b && !harness) issue(3, 'Engine wiring harness not connected', 'electrical');
  else if (harness && !harnessOk) issue(3, 'Engine harness connector(s) unplugged', 'electrical');

  // --- drivetrain ---
  const gb = k('gearbox');
  const gs = gb?.kids.gearset;
  S.gearbox = gb;
  S.ratios = gs ? gs.props.ratios : null;
  S.final = gs ? gs.props.final : 3.9;
  S.rev = gs ? gs.props.rev : 3.3;
  S.gearOil = gb ? gb.props.oil || 0 : 0;
  S.clutchCap = 0;
  if (k('flywheel') && k('clutchDisc') && k('pressurePlate')) {
    S.clutchCap = 300 * (k('clutchDisc').props.cap || 1) * (0.35 + 0.65 * k('clutchDisc').cond) * (1 - asm.looseness(k('pressurePlate')) * 0.8);
    S.lightFly = !!k('flywheel').props.light;
  }
  S.clutchCable = !!(ch.kids.clutchCable);
  const prop = ch.kids.propshaft, diff = ch.kids.diff;
  S.drive = !!(gb && gs && prop && diff && ch.kids.halfshaftL && ch.kids.halfshaftR && S.clutchCap > 0);
  S.diffLock = diff?.props.lock || 0;
  S.propLoose = prop ? asm.looseness(prop) : 1;
  if (b) {
    if (!k('flywheel')) issue(3, 'Flywheel missing — starter has nothing to turn', 'drivetrain');
    if (!k('clutchDisc') || !k('pressurePlate')) issue(3, 'Clutch incomplete', 'drivetrain');
    if (!gb) issue(3, 'Gearbox not fitted', 'drivetrain');
    else {
      if (!gs) issue(3, 'Gearbox has no gears inside', 'drivetrain');
      if (!gb.kids.gbCover) issue(2, 'Gearbox cover missing — gear oil falls out', 'drivetrain');
      if (S.gearOil < 0.8) issue(2, `Gear oil low (${S.gearOil.toFixed(1)} L)`, 'drivetrain');
      if (!ch.kids.gearboxMount) issue(2, 'Gearbox mount missing', 'drivetrain');
    }
    if (!S.clutchCable) issue(2, 'Clutch cable missing — clutch can\'t be disengaged', 'drivetrain');
  }
  if (!prop) issue(3, 'Propeller shaft missing', 'drivetrain');
  if (!diff) issue(3, 'Differential missing', 'drivetrain');
  if (diff && (!ch.kids.halfshaftL || !ch.kids.halfshaftR)) issue(3, 'Half-shaft missing', 'drivetrain');
  if (prop && S.propLoose > 0.2) issue(2, 'Propshaft flange bolts loose — vibration', 'drivetrain');
  if (b && !ch.kids.engineMountL || b && !ch.kids.engineMountR) issue(2, 'Engine mount missing');

  // --- brakes, steering, suspension, wheels ---
  const mc = ch.kids.masterCyl;
  S.bias = mc?.props.bias ?? 0.64;
  S.brakeFluid = mc ? mc.props.fluid || 0 : 0;
  const hydraulic = mc && S.brakeFluid > 0.15 ? 1 : 0;
  if (!mc) issue(3, 'Brake master cylinder missing', 'brakes');
  else if (S.brakeFluid < 0.2) issue(3, 'Brake fluid empty — the pedal goes to the floor', 'brakes');
  S.steerOk = !!(ch.kids.steeringWheel && ch.kids.steeringRack && asm.looseness(ch.kids.steeringWheel) < 0.5);
  if (!ch.kids.steeringWheel) issue(3, 'Steering wheel missing', 'steering');
  else if (asm.looseness(ch.kids.steeringWheel) > 0.3) issue(2, 'Steering wheel nut loose', 'steering');
  if (!ch.kids.steeringRack) issue(3, 'Steering rack missing', 'steering');
  for (const [c, d] of Object.entries(CORNERS)) {
    const wheel = ch.kids['wheel' + c];
    const C = { wheel: !!wheel };
    C.tyre = wheel ? wheel.cond : 0;
    C.grip = wheel ? (wheel.props.grip || 1) : 0;
    C.gravel = wheel ? (wheel.props.gravel || 0.8) : 0;
    C.pressure = wheel ? wheel.props.pressure ?? 2.1 : 0;
    C.wheelLoose = wheel ? asm.looseness(wheel) : 0;
    const pads = ch.kids['pads' + c], cal = ch.kids['caliper' + c], disc = ch.kids['disc' + c];
    C.bite = pads?.props.bite || 1;
    C.brake = hydraulic && pads && cal && disc ? (0.25 + 0.75 * Math.min(pads.cond * 1.4, 1)) * (1 - asm.looseness(cal) * 0.7) : 0;
    const shock = ch.kids['shock' + c], spring = ch.kids['spring' + c];
    C.k = spring ? 32000 * (spring.props.k || 1) * (0.7 + 0.3 * spring.cond) : 9000;
    C.preload = spring ? spring.props.preload || 0 : -0.04;
    C.damp = shock ? 2600 * (shock.props.damp || 1) * (0.2 + 0.8 * shock.cond) * (1 - asm.looseness(shock) * 0.6) * ((shock.props.damp || 1) > 1 ? 0.55 + 0.1 * (shock.props.clicks ?? 5) : 1) : 300;
    C.toe = 0;
    if (d.axle === 'F') {
      const tr = ch.kids['tieRod' + c], arm = ch.kids['controlArm' + c];
      if (!tr) { C.toe = 0.15 * d.side; issue(3, `Tie rod ${c} missing — wheel flops around`, 'steering'); }
      else C.toe = (tr.props.bent || 0) * d.side + (tr.props.toe || 0) * d.side;
      if (!arm) { C.toe += 0.2; C.k *= 0.3; issue(3, `Control arm ${c} missing`, 'suspension'); }
      else C.toe += (arm.props.bent || 0) * d.side;
    }
    if (!wheel) issue(3, `Wheel ${c} missing`, 'wheels');
    else {
      if (C.wheelLoose > 0.05) issue(C.wheelLoose > 0.4 ? 3 : 2, `Wheel ${c} lug nuts not tight`, 'wheels');
      if (C.tyre < 0.25) issue(2, `Tyre ${c} is bald`, 'wheels');
      if (Math.abs(C.pressure - 2.0) > 0.6) issue(1, `Tyre ${c} pressure ${C.pressure.toFixed(1)} bar`, 'wheels');
    }
    if (!shock) issue(2, `Shock absorber ${c} missing`, 'suspension');
    else if (shock.cond < 0.35) issue(1, `Shock absorber ${c} worn — bouncy`, 'suspension');
    if (!spring) issue(3, `Coil spring ${c} missing`, 'suspension');
    if (!pads || !cal || !disc) issue(2, `Brake ${c} incomplete`, 'brakes');
    else if (pads.cond < 0.2) issue(2, `Brake pads ${c} worn to the metal`, 'brakes');
    if (Math.abs(C.toe) > 0.02 && !(Math.abs(ch.kids['tieRod' + c]?.props.bent || 0) > 0.003 || Math.abs(ch.kids['controlArm' + c]?.props.bent || 0) > 0.003)) {
      const trB = ch.kids['tieRod' + c], armB = ch.kids['controlArm' + c];
      const bentTr = Math.abs(trB?.props.bent || 0) > 0.003, bentArm = Math.abs(armB?.props.bent || 0) > 0.003;
      const why = bentTr && bentArm ? 'bent tie rod and control arm' : bentTr ? 'bent tie rod' : bentArm ? 'bent control arm' : 'toe setting';
      issue(1, `Alignment off at ${c}: ${why}${why === 'toe setting' ? ' (adjust it in the tuning screen)' : ' from a crash — bolts are fine; Esa/Ari can straighten it, or fit a new part'}`, 'suspension');
    }
    S.corners[c] = C;
  }
  S.lights = !!(ch.kids.headlightL || ch.kids.headlightR) && S.electric;
  S.firing = S.cyl.filter((c) => c.comp > 0.35 && c.spark > 0.3).length;
  S.quality = S.cyl.reduce((s, c) => s + (c.comp > 0.35 && c.spark > 0.3 ? c.comp * c.spark : 0), 0) / 4;
  // broken / crash-damaged parts — the same list the repair objective and the shop use
  for (const p of partProblems(asm, [ch])) {
    const fix = p.kind === 'bent' ? 'Replace it, or Esa/Ari can straighten it (alignment is off).' : p.kind === 'crash' ? 'Replace it, or Esa/Ari can repair it.' : 'Replace it.';
    issue(/no light/.test(p.why) ? 2 : 1, `${p.why} — ${p.where}. ${fix}`, p.kind === 'wear' ? 'wear' : 'body');
  }
  S.issues.sort((a, b2) => b2.sev - a.sev);
  return S;
}

// ---------------- runtime powertrain ----------------
export function newPowertrain() {
  return { rpm: 0, running: false, ign: 0, cranking: false, crankT: 0, temp: 15, oilP: 0, gear: 0, clutch: 0, throttle: 0, brake: 0, hand: 1,
    load: 0, misfire: 0, starterSpin: 0, stallMsg: null, events: [], autoClutchT: 0, wearAcc: 0, knock: 0 };
}

export const TQ_PEAK = 128;
export function torqueShape(rpm) {
  if (rpm < 1000) return 0.62 + (rpm / 1000) * 0.08;
  if (rpm < 3800) return lerp(0.7, 1.0, (rpm - 1000) / 2800);
  if (rpm < 6200) return lerp(1.0, 0.8, (rpm - 3800) / 2400);
  return Math.max(0, 0.8 - (rpm - 6200) / 1200);
}

// Engine + clutch + gearbox for one sub-step. Sets wheel.driveT and wheel.brakeT on wheels.
export function stepPowertrain(pt, S, h, wheels, ctl, settings, env) {
  const Ie = S.lightFly ? 0.085 : 0.13;
  let we = pt.rpm * Math.PI / 30;
  const thrIn = S.throttleOk ? ctl.throttle : 0;
  // --- engine torque ---
  let T = 0;
  const canFire = pt.running && S.fuelOk && S.quality > 0.18;
  if (pt.running && !canFire) { pt.running = false; pt.events.push(S.fuelOk ? 'died' : 'nofuel'); }
  let th = 0;
  if (pt.running) {
    const idleTarget = (S.idleRpm || 850) + S.idleRough * 250 + (pt.temp < 50 ? 250 : 0);
    const idleTh = clamp(0.07 + (idleTarget - pt.rpm) * 0.0002, 0.02, 0.3);
    th = Math.max(thrIn, idleTh);
    let comb = TQ_PEAK * torqueShape(pt.rpm) * Math.pow(th, 0.6) * S.powerMult * (S.quality / 0.82) * (1 - S.vacuumLeak * 0.4);
    if (S.boost) { // turbo: spools up with rpm and throttle
      const target = S.boost * clamp((pt.rpm - 2400) / 1600, 0, 1) * th;
      pt.boost = (pt.boost || 0) + (target - (pt.boost || 0)) * Math.min(1, h * 2.5);
      comb *= 1 + pt.boost * 1.6;
    } else pt.boost = 0;
    if (pt.rpm > 6300) comb *= clamp((6700 - pt.rpm) / 400, 0, 1); // soft rev limiter
    // misfire roughness
    const miss = 4 - S.firing;
    if (miss > 0 && Math.random() < 0.3) comb *= 0.5;
    if (S.idleRough && pt.rpm < 1500 && Math.random() < 0.15) comb *= 0.6;
    T += comb;
    pt.misfire = miss + (S.idleRough && pt.rpm < 1500 ? 0.6 : 0);
  }
  pt.throttleEff = th;
  // friction & pumping
  if (S.canRotate) {
    const avgComp = S.cyl.reduce((s, c) => s + c.comp, 0) / 4;
    let fr = 6 + pt.rpm * 0.0022 + (1 - th) * pt.rpm * 0.0026 + (pt.rpm < 400 ? avgComp * 18 : 0);
    if (pt.temp < 40) fr *= 1.15;
    if (pt.knock > 0) fr += pt.knock * 20;
    T -= Math.sign(we || 1) * fr * (we > 0.5 || T > fr ? 1 : 0);
  }
  // starter
  if (pt.cranking && S.starter && S.flywheel && S.canRotate) {
    const ch = S.battery.charge;
    T += ch > 0.25 ? 50 * clamp((420 - pt.rpm) / 200, 0, 1) * Math.min(1, ch * 1.4) : 0;
  }
  if (!S.canRotate) we = 0;
  we += (T / Ie) * h;
  if (we < 0) we = 0;

  // --- clutch & gearbox ---
  const gear = pt.gear;
  let ratio = 0;
  if (S.drive && S.ratios) ratio = gear > 0 ? S.ratios[gear - 1] * S.final : gear < 0 ? -S.rev * S.final : 0;
  let pedal = S.clutchCable ? ctl.clutch : 0;
  if (settings.autoClutch && S.clutchCable) {
    // auto clutch: slip to launch, disengage near stall and during shifts
    const target = pt.autoClutchT > 0 ? 1 : clamp(1 - (pt.rpm - 950) / 1100, 0, 1);
    pedal = Math.max(pedal, ratio === 0 ? 0 : target);
  }
  pt.clutch = pedal;
  const engage = 1 - clamp((pedal - 0.15) / 0.7, 0, 1);
  const cap = S.clutchCap * engage * engage;
  const RL = wheels[2], RR = wheels[3];
  let tc = 0;
  if (ratio !== 0 && cap > 0 && S.canRotate) {
    const win = (RL.omega + RR.omega) * 0.5 * ratio;
    const Iw = RL.inertia + RR.inertia;
    const teq = (we - win) / (h * (1 / Ie + (ratio * ratio) / Iw));
    tc = clamp(teq, -cap, cap);
    we -= (tc / Ie) * h;
    if (Math.abs(tc) >= cap * 0.98 && Math.abs(we - win) > 20) pt.clutchSlip = (pt.clutchSlip || 0) + Math.abs(we - win) * cap * h * 1e-7;
  }
  const wheelT = tc * ratio * (1 - S.propLoose * 0.1);
  // open diffs still have some internal friction (0.3), so one spinning wheel doesn't take all the drive
  const lock = Math.max(S.diffLock, 0.3) * clamp((RL.omega - RR.omega) * 40, -Math.abs(wheelT) * 0.5 - 200, Math.abs(wheelT) * 0.5 + 200);
  for (const w of wheels) w.driveT = 0;
  RL.driveT = wheelT * 0.5 - lock; RR.driveT = wheelT * 0.5 + lock;
  pt.rpm = Math.max(0, we * 30 / Math.PI);
  pt.load = clamp(Math.abs(tc) / 140 + th * 0.3, 0, 1);

  // --- stall ---
  if (pt.running && pt.rpm < 320 && !pt.cranking) { pt.running = false; pt.events.push('stall'); }
  // --- brakes ---
  const brakeIn = ctl.brake;
  wheels.forEach((w, i) => {
    const C = S.corners[w.key];
    const front = i < 2;
    w.brakeT = brakeIn * 2650 * (front ? S.bias : 1 - S.bias) * (C ? C.brake * (C.bite || 1) : 0);
    if (!front) w.brakeT += ctl.hand * 2200;
  });
}

// Per-frame (not per-substep) slow systems: start attempts, temperatures, fluids, wear, battery.
export function slowUpdate(pt, S, dt, car, rng = Math.random) {
  const msgs = [];
  // ignition & cranking
  if (pt.cranking) {
    pt.crankT += dt;
    const b = S.battery;
    if (!b.present) { if (pt.crankT < dt * 1.5) msgs.push('Nothing. Not even a click. Is there a battery?'); }
    else if (!b.connected) { if (pt.crankT < dt * 1.5) msgs.push('The dash flickers and dies. Loose battery terminal?'); }
    else if (!S.harness) { if (pt.crankT < dt * 1.5) msgs.push('Dash lights come on, but the starter does nothing. Wiring?'); }
    else if (b.charge < 0.25) { if (pt.crankT < dt * 1.5) msgs.push('Click… click… click. The battery is too flat to crank.'); pt.starterSpin = 0.2; }
    else if (!S.starter) { if (pt.crankT < dt * 1.5) msgs.push('Turning the key does nothing. No starter motor?'); }
    else if (!S.flywheel) { if (pt.crankT < dt * 1.5) msgs.push('The starter whirrs freely — it has nothing to engage. Flywheel?'); pt.starterSpin = 1; }
    else if (!S.canRotate) { if (pt.crankT < dt * 1.5) msgs.push(S.block?.props.seized ? 'CLUNK. The engine is seized solid.' : 'The starter spins… nothing inside turns.'); pt.starterSpin = 0.4; }
    else {
      pt.starterSpin = 1;
      const crankDrain = 0.011 * dt;
      car.useBattery(crankDrain);
      // does it catch?
      if (!pt.running && pt.rpm > 150 && pt.crankT > 0.5) {
        const avgComp = S.cyl.reduce((s, c) => s + c.comp, 0) / 4;
        if (S.timingOffset !== null && Math.abs(S.timingOffset) >= 3 && !pt.bentNotified) {
          pt.bentNotified = true; car.bendValves(); msgs.push('CLANK-clank-clank! That sounded like valves hitting pistons…');
        } else if (avgComp < 0.2) { if (pt.crankT > 1.5 && !pt.hintGiven) { pt.hintGiven = true; msgs.push('It spins far too easily. There\'s no compression.'); } }
        else if (!S.fuelOk) { if (pt.crankT > 2 && !pt.hintGiven) { pt.hintGiven = true; msgs.push('Cranks and cranks, but there\'s no smell of fuel.'); } }
        else if (S.quality < 0.18 || S.firing < 2) { if (pt.crankT > 2 && !pt.hintGiven) { pt.hintGiven = true; msgs.push(S.firing === 0 ? 'Cranks fine but never catches. No spark?' : 'It coughs and backfires but won\'t keep running.'); } }
        else if (S.timingOffset !== null && Math.abs(S.timingOffset) === 2 && rng() < 0.5 * dt) { msgs.push('*BANG* — backfire through the carb. Timing is off.'); }
        else if (rng() < (0.6 + S.quality) * dt * 2.2 * (pt.temp < 10 ? 0.6 : 1)) { pt.running = true; pt.events.push('start'); }
      }
    }
  } else { pt.crankT = 0; pt.hintGiven = false; pt.starterSpin = 0; }

  // --- fluids ---
  const ch = car.chassis;
  const blk = S.block;
  if (blk) {
    let leak = S.oilLeak + (pt.running ? S.oilLeakRunning * (pt.rpm / 3000) : 0);
    if (leak > 0 && blk.props.oil > 0) { const d = Math.min(blk.props.oil, leak * dt * 0.1); blk.props.oil -= d; car.leaked('oil', d); }
    if (pt.running) blk.props.oil = Math.max(0, blk.props.oil - dt * 0.000004 * pt.rpm / 1000); // burn
  }
  if (S.coolLeak > 0 && ch.props.coolant > 0) { const d = Math.min(ch.props.coolant, S.coolLeak * dt * 0.1); ch.props.coolant -= d; car.leaked('coolant', d); }
  if (S.gearbox && !S.gearbox.kids.gbCover && S.gearbox.props.oil > 0) { const d = Math.min(S.gearbox.props.oil, dt * 0.2); S.gearbox.props.oil -= d; car.leaked('oil', d); }

  // --- oil pressure & lubrication damage ---
  const oilF = S.oilPump && S.oilPan ? clamp(S.oil / 1.6, 0, 1) : 0;
  pt.oilP = (pt.running || pt.cranking) ? oilF * clamp(pt.rpm / 2200, 0.25, 1) * 4.2 * (blk && blk.kids.oilFilter ? 1 : 0.3) : 0;
  if (pt.running && blk) {
    const k = blk.kids;
    let wear = 0;
    if (pt.oilP < 0.5) wear += (0.5 - pt.oilP) * 0.04;
    if (!k.mainBearings) wear += 0.1;
    if (k.crankshaft && asm_loose(car, k.crankshaft) > 0.2) wear += 0.02;
    if (pt.temp > 118) wear += (pt.temp - 118) * 0.002;
    if (pt.rpm > 6300) wear += 0.0015;
    wear += pt.rpm / 6000 * 0.00002;
    if (wear > 0) {
      const dmg = wear * dt;
      if (k.rodBearings) k.rodBearings.cond = Math.max(0, k.rodBearings.cond - dmg);
      if (k.mainBearings) k.mainBearings.cond = Math.max(0, k.mainBearings.cond - dmg * 0.7);
      for (let i = 1; i <= 4; i++) { const p = k['piston' + i]; if (p?.kids.rings) p.kids.rings.cond = Math.max(0, p.kids.rings.cond - dmg * 0.25); }
      pt.knock = k.rodBearings ? clamp((0.4 - k.rodBearings.cond) * 2.5, 0, 1) : 1;
      if (pt.knock > 0.3 && !pt.knockMsg) { pt.knockMsg = true; msgs.push('A deep knocking noise is coming from the bottom of the engine.'); }
      if ((k.rodBearings?.cond ?? 0) <= 0.02 || (!k.mainBearings && rng() < dt * 0.2)) {
        blk.props.seized = true; pt.running = false; pt.events.push('seize');
        msgs.push('BANG — CRUNCH. The engine locks up. That was the bottom end.');
      }
    }
    // air filter
    if (blk.kids.head?.kids.intake?.kids.carb && !blk.kids.head.kids.intake.kids.carb.kids.airFilter) {
      for (let i = 1; i <= 4; i++) { const p = k['piston' + i]; if (p?.kids.rings) p.kids.rings.cond = Math.max(0, p.kids.rings.cond - dt * 0.00002); }
    }
  }
  // --- temperature ---
  const amb = car.ambient ?? 15;
  if (pt.running) pt.temp += (0.25 + 1.6 * pt.load * (pt.rpm / 6000) + pt.rpm / 6000 * 0.4) * dt * (S.heatMult || 1);
  // detonation from too much advance / lean mixture under load
  if (pt.running && S.knockRisk > 0 && pt.load > 0.6 && blk) {
    pt.detonation = (pt.detonation || 0) + S.knockRisk * pt.load * dt;
    for (let i = 1; i <= 4; i++) { const p = blk.kids['piston' + i]; if (p) p.cond = Math.max(0, p.cond - S.knockRisk * pt.load * dt * 0.002); }
    if (pt.detonation > 2 && !pt.pingMsg) { pt.pingMsg = true; msgs.push('A metallic pinging under load… the ignition is too advanced or it is running lean.'); }
  }
  let cool = (pt.temp - amb) * 0.004;
  if (S.coolingOk) {
    const thermostatOpen = pt.temp > 86;
    const air = Math.min(car.speed / 18, 1.5) + (S.fanOk && pt.temp > 95 ? 0.8 : 0);
    if (thermostatOpen) cool += (pt.temp - 86) * (0.06 + 0.12 * air) * (car.chassis.kids.radiator?.cond ?? 1);
  } else if (pt.running && pt.temp > 100 && !pt.steamMsg) { pt.steamMsg = true; msgs.push('Steam is pouring out of the engine bay!'); }
  pt.temp -= cool * dt;
  if (pt.temp < 100) pt.steamMsg = false;
  if (pt.temp > 120 && blk?.kids.headGasket) {
    blk.kids.headGasket.cond = Math.max(0, blk.kids.headGasket.cond - (pt.temp - 120) * 0.0015 * dt);
    if (!pt.hotMsg) { pt.hotMsg = true; msgs.push('The temperature needle is pinned. Something smells very hot.'); }
  }
  if (pt.temp < 105) pt.hotMsg = false;

  // --- fuel & battery ---
  const tank = ch.kids.fuelTank;
  if (pt.running && tank) tank.props.fuel = Math.max(0, tank.props.fuel - (0.00022 + 0.0062 * (pt.throttleEff || 0) * pt.rpm / 6000) * dt * (S.fuelMult || 1));
  if (pt.ign > 0) car.useBattery(0.00012 * dt);
  if (car.lightsOn) car.useBattery(0.00035 * dt);
  if (pt.running && S.charging && pt.rpm > 900) car.useBattery(-0.0016 * dt);
  // clutch wear
  if (pt.clutchSlip > 0 && blk?.kids.clutchDisc) { blk.kids.clutchDisc.cond = Math.max(0, blk.kids.clutchDisc.cond - pt.clutchSlip); pt.clutchSlip = 0; }
  return msgs;
}
function asm_loose(car, inst) { return car.asm.looseness(inst); }

export { TIGHT_OK };
