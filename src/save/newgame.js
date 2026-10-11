// The starting situation: an old Ruska 1600 with no engine in it, the engine half
// apart on the stand, the head on the workbench, and a few parts missing or worn out.
import { CORNERS } from '../mechanics/partsdb.js';

export function setupNewGame(game) {
  const { asm, car, stand } = game;
  const C = car.chassis;
  const mk = (id, o = {}) => asm.create(id, o);
  const put = (host, slot, id, o = {}) => { const p = mk(id, o); asm.install(p, host, slot, { fastened: o.fastened ?? true, q: o.q ?? 1 }); return p; };
  const place = (id, x, y, z, yaw = 0, o = {}, cont = null) => { const p = mk(id, o); asm.placeWorld(p, [x, y - (cont ? 0 : 0), z], yaw, cont); return p; };
  const onSurface = (id, x, y, z, yaw = 0, o = {}, cont = null) => { const p = mk(id, o); const b = p.bounds; asm.placeWorld(p, [x, y - b.min.y + 0.002, z], yaw, cont); return p; };
  const DTOP = [-0.06, -0.06, -0.06, -0.125];
  const inDrawer = (id, n, x, z, yaw = 0) => onSurface(id, x, DTOP[n - 1], z, yaw, {}, 'drawer' + n);
  const inFridge = (id, x, y, z) => onSurface(id, x, y + 0.011, z, 0, {}, 'fridge');

  // ---------------- the car (no engine) ----------------
  put(C, 'engineMountL', 'engine_mount', { cond: 0.6 });
  put(C, 'engineMountR', 'engine_mount', { cond: 0.55 });
  put(C, 'diff', 'diff_open', { cond: 0.7 });
  put(C, 'halfshaftL', 'halfshaft', { cond: 0.75 });
  put(C, 'halfshaftR', 'halfshaft', { cond: 0.72 });
  onSurface('propshaft', -4.6, 0, -0.6, 0, { cond: 0.7 });
  put(C, 'radiator', 'radiator', { cond: 0.62 });
  put(C, 'fan', 'cooling_fan', { cond: 0.7 });
  put(C, 'battery', 'battery', { cond: 0.6, props: { charge: 0.55 } });
  put(C, 'coil', 'coil', { cond: 0.7 });
  put(C, 'fuelTank', 'fuel_tank', { cond: 0.65, props: { fuel: 4 } });
  put(C, 'masterCyl', 'master_cylinder', { cond: 0.7, props: { fluid: 0.38 } });
  put(C, 'steeringRack', 'steering_rack', { cond: 0.7 });
  for (const [c, d] of Object.entries(CORNERS)) {
    put(C, 'shock' + c, 'shock_std', { cond: d.axle === 'F' ? 0.45 : 0.55 });
    put(C, 'spring' + c, 'spring_std', { cond: 0.75 });
    put(C, 'disc' + c, 'brake_disc', { cond: 0.6 });
    put(C, 'pads' + c, 'brake_pads', { cond: c === 'FR' ? 0.22 : 0.55 });
    put(C, 'caliper' + c, 'caliper', { cond: 0.65 });
    put(C, 'wheel' + c, 'wheel_steel', { cond: 0.55, props: { grip: 1, gravel: 0.8, pressure: c === 'RL' ? 1.3 : 2.0 } });
    if (d.axle === 'F') { put(C, 'controlArm' + c, 'control_arm', { cond: 0.6 }); put(C, 'tieRod' + c, 'tie_rod', { cond: 0.65 }); }
  }
  put(C, 'seatL', 'seat_std', { cond: 0.5 });
  put(C, 'seatR', 'seat_std', { cond: 0.6 });
  put(C, 'hood', 'hood', { cond: 0.55, props: { open: true, openT: 1 } });
  put(C, 'doorL', 'door_l', { cond: 0.6 });
  put(C, 'doorR', 'door_r', { cond: 0.6 });
  put(C, 'trunk', 'trunk_lid', { cond: 0.6 });
  put(C, 'bumperF', 'bumper_f', { cond: 0.5 });
  put(C, 'bumperR', 'bumper_r', { cond: 0.55 });
  put(C, 'headlightL', 'headlight', { cond: 0.7 });
  put(C, 'headlightR', 'headlight', { cond: 0.35 });
  put(C, 'taillightL', 'taillight', { cond: 0.7 });
  put(C, 'taillightR', 'taillight', { cond: 0.7 });
  onSurface('midpipe', -4.9, 0, 2.0, 0, { cond: 0.4 });
  car.chassis.props.coolant = 0;

  // ---------------- engine on the stand (half apart) ----------------
  const B = mk('block_16', { cond: 0.8, props: { oil: 0 } });
  asm.install(B, stand, 'engine', { fastened: true });
  put(B, 'mainBearings', 'main_bearings', { cond: 0.7 });
  put(B, 'crankshaft', 'crank_16', { cond: 0.8 });
  put(B, 'rodBearings', 'rod_bearings', { cond: 0.65 });
  for (let i = 1; i <= 3; i++) {
    const p = mk('piston_16', { cond: 0.75 });
    asm.install(mk('rings_16', { cond: 0.6 }), p, 'rings', { fastened: true });
    asm.install(mk('conrod_16', { cond: 0.8 }), p, 'rod', { fastened: true });
    asm.install(p, B, 'piston' + i, { fastened: true });
  }
  put(B, 'oilPump', 'oil_pump', { cond: 0.7 });
  put(B, 'fuelPump', 'fuel_pump', { cond: 0.6 });
  put(B, 'waterPump', 'water_pump', { cond: 0.55 });
  put(B, 'tensioner', 'tensioner', { cond: 0.6 });
  put(B, 'crankSprocket', 'crank_sprocket', { cond: 0.75, props: { tooth: 3 } });
  put(B, 'alternator', 'alternator', { cond: 0.6 });
  put(B, 'starter', 'starter', { cond: 0.65 });
  put(B, 'flywheel', 'flywheel', { cond: 0.75 });

  // ---------------- workbench: the cylinder head + piston #4 ----------------
  const wbY = 0.93;
  const head = onSurface('head_16', 2.3, wbY, -4.6, 0, { cond: 0.75 });
  put(head, 'valvesIn', 'valves_in', { cond: 0.7 });
  put(head, 'valvesEx', 'valves_ex', { cond: 0.65 });
  put(head, 'valveSprings', 'valve_springs', { cond: 0.7 });
  put(head, 'retainers', 'valve_retainers', { cond: 0.8 });
  put(head, 'camBearings', 'cam_bearings', { cond: 0.7 });
  put(head, 'camshaft', 'camshaft_std', { cond: 0.7 });
  put(head, 'rockers', 'rockers', { cond: 0.65 });
  put(head, 'thermostat', 'thermostat', { cond: 0.5 });
  put(head, 'camSprocket', 'cam_sprocket', { cond: 0.7, props: { tooth: -5 } });
  put(head, 'distributor', 'distributor', { cond: 0.6 });
  put(head, 'exGasket', 'exhaust_gasket', { cond: 0.5 });
  put(head, 'exManifold', 'exhaust_manifold', { cond: 0.5 });
  put(head, 'plug1', 'spark_plug', { cond: 0.35 });
  put(head, 'plug2', 'spark_plug', { cond: 0.4 });
  const intake = mk('intake_manifold', { cond: 0.65 });
  const carb = mk('carb_single', { cond: 0.55 });
  asm.install(carb, intake, 'carb', { fastened: true });
  asm.install(mk('air_filter', { cond: 0.3 }), carb, 'airFilter', { fastened: true });
  asm.install(intake, head, 'intake', { fastened: true });
  // piston #4 with its rod but no rings (the old rings broke)
  const p4 = onSurface('piston_16', 3.6, wbY, -4.5, 0, { cond: 0.75 });
  asm.install(mk('conrod_16', { cond: 0.8 }), p4, 'rod', { fastened: true });
  onSurface('rings_16', 3.85, wbY, -4.4, 0, { cond: 0.05 });  // broken ring set
  onSurface('head_gasket_16', 1.75, wbY, -4.45, 0.2, { cond: 0.04 }); // torn
  onSurface('timing_belt', 4.15, wbY, -4.45, 0, { cond: 0.18 }); // cracked
  onSurface('valve_cover', 2.9, 0.27, -4.6, 0, { cond: 0.6 });
  onSurface('timing_cover', 3.6, 0.27, -4.55, 0, { cond: 0.7 });
  onSurface('crank_pulley', 4.1, 0.27, -4.7, 0, { cond: 0.7 });
  onSurface('plug_wires', 4.4, wbY, -4.75, 0, { cond: 0.6 });

  // ---------------- floor / shelves ----------------
  onSurface('oil_pan', 2.4, 0, -0.6, 0.4, { cond: 0.6 });
  onSurface('fan_belt', 5.68, 0.9 + 0.017, 0.8, 0, { cond: 0.5 });
  onSurface('pressure_plate', 5.68, 0.35 + 0.017, 0.6, 0, { cond: 0.65 });
  onSurface('clutch_disc', 5.68, 0.35 + 0.017, 1.1, 0, { cond: 0.35 });
  onSurface('hose_upper', 5.68, 1.45 + 0.017, 1.0, 0, { cond: 0.6 });
  onSurface('hose_lower', 5.68, 1.45 + 0.017, 2.0, 0, { cond: 0.55 });
  onSurface('coil_lead', 5.68, 1.45 + 0.017, 2.5, 0, { cond: 0.6 });
  onSurface('fuel_line', 5.68, 0.9 + 0.017, 1.6, 0, { cond: 0.6 });
  onSurface('throttle_cable', 5.68, 0.9 + 0.017, 2.2, 0, { cond: 0.7 });
  onSurface('clutch_cable', 5.68, 2.0 + 0.017, 1.2, 0, { cond: 0.7 });
  onSurface('engine_harness', 5.68, 2.0 + 0.017, 2.2, 0, { cond: 0.65 });
  onSurface('gearbox_mount', 5.68, 0.35 + 0.017, 2.2, 0, { cond: 0.6 });
  onSurface('sw_std', 5.68, 2.0 + 0.017, 0.6, 0, { cond: 0.7 });
  onSurface('muffler', -4.6, 0, 3.0, 0, { cond: 0.5 });
  onSurface('downpipe', -4.1, 0, -2.4, Math.PI / 2, { cond: 0.6 });
  // gearbox on the floor in front of the car
  const gb = onSurface('gearbox_4sp', 1.0, 0, -3.3, Math.PI / 2, { cond: 0.7, props: { oil: 0.4 } });
  put(gb, 'gearset', 'gearset_std', { cond: 0.7 });
  put(gb, 'gbCover', 'gearbox_cover', { cond: 0.7 });

  // ---------------- tools ----------------
  inDrawer('ratchet', 1, 0.25, -0.2, Math.PI / 2);
  inDrawer('socket_case', 1, 0.25, 0.18, Math.PI / 2);
  inDrawer('plug_socket', 2, 0.25, -0.2);
  inDrawer('screwdriver_flat', 2, 0.2, 0.12, Math.PI / 2);
  inDrawer('screwdriver_ph', 2, 0.32, 0.22, Math.PI / 2);
  inDrawer('bolt_kit', 3, 0.25, 0);
  inDrawer('wrench_17', 4, 0.25, 0.1, Math.PI / 2);
  onSurface('wrench_10', 2.0, wbY, -4.3, 0.3);
  onSurface('wrench_13', 4.4, wbY, -4.4, -0.2);
  onSurface('lug_wrench', 0.3, 0, 2.6, 0.8);
  onSurface('axle_stands', -5.0, 0, 4.2, 0);
  // ---------------- fluids ----------------
  onSurface('oil_jug', -5.72, 0.45 + 0.017, -3.9, 0, { amount: 2.5 });
  onSurface('brake_fluid', -5.72, 0.45 + 0.017, -3.3, 0, { amount: 0.3 });
  onSurface('jerrycan', -5.72, 0, -2.4, Math.PI / 2, { amount: 6 });
  onSurface('gear_oil', -5.72, 1.05 + 0.017, -3.6, 0, { amount: 1.6 });
  // ---------------- food in the fridge ----------------
  inFridge('sausage', 0, 0.45, 0);
  inFridge('milk', -0.15, 0.95, 0);
  inFridge('rye_bread', 0.1, 0.95, 0);
  inFridge('coffee', 0.0, 1.35, 0);
  car.park.pos.set(-1.2, 0, 0.3); car.park.yaw = 0;
  game.money = 1400;
  game.ledger = [{ when: 'Day 1', text: 'Opening balance', amount: 1400 }];
}
