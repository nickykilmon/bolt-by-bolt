// Component database: every object in the game (parts, tools, consumables) and every
// mounting slot with its prerequisites and fasteners.
//
// Coordinates:
//  - car frame: +z forward, +x = left side (driver side), y up, origin on the ground at the car's centre.
//  - block frame: crank axis along z at y=0, timing side +z, flywheel side -z, intake +x, exhaust -x.
//  - head frame: origin at the bottom (gasket face) centre of the head.
// Fastener points are in slot-local coordinates (relative to the installed part's origin).

export const CYL_Z = [0.135, 0.045, -0.045, -0.135];
export const ENGINE_POS = [0, 0.42, 1.12];
export const CORNERS = {
  FL: { x: 0.72, z: 1.2, side: 1, axle: 'F' },
  FR: { x: -0.72, z: 1.2, side: -1, axle: 'F' },
  RL: { x: 0.72, z: -1.2, side: 1, axle: 'R' },
  RR: { x: -0.72, z: -1.2, side: -1, axle: 'R' },
};

// ---------- tools & sizes ----------
export const SIZE_LABEL = (s) => typeof s === 'number' ? `${s} mm` : ({ flat: 'flat screwdriver', ph: 'Phillips screwdriver', plug: 'spark plug socket', hand: 'by hand', pliers: 'pliers' })[s] || s;

// ---------- fastener helpers ----------
function F(size, torque, thread, pts, dir = [0, 1, 0], extra = {}) {
  const kind = size === 'hand' ? 'clip' : size === 'flat' ? 'clamp' : size === 'plug' ? 'plug' : 'bolt';
  return { size, torque, thread, pts, dir, kind, ...extra };
}
const ring = (n, r, c = [0, 0, 0], axis = 'z', phase = 0) => {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = phase + (i / n) * Math.PI * 2, u = Math.cos(a) * r, v = Math.sin(a) * r;
    if (axis === 'z') out.push([c[0] + u, c[1] + v, c[2]]);
    else if (axis === 'x') out.push([c[0], c[1] + v, c[2] + u]);
    else out.push([c[0] + u, c[1], c[2] + v]);
  }
  return out;
};
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

// ---------- tube paths (car frame) shared by part meshes and slots ----------
const E = ENGINE_POS;
const HEAD_ORIGIN = add(E, [0, 0.303, 0]);
export const PATHS = {
  hose_upper: [add(HEAD_ORIGIN, [0.11, 0.08, 0.29]), add(HEAD_ORIGIN, [0.12, 0.13, 0.42]), [0.16, 0.8, 1.66], [0.18, 0.78, 1.74]],
  hose_lower: [add(E, [-0.09, 0.14, 0.29]), [-0.12, 0.5, 1.5], [-0.18, 0.44, 1.66], [-0.18, 0.44, 1.74]],
  downpipe: [add(HEAD_ORIGIN, [-0.24, 0.03, -0.02]), [-0.27, 0.55, 1.0], [-0.26, 0.24, 0.8], [-0.25, 0.18, 0.55], [-0.25, 0.18, 0.45]],
  midpipe: [[-0.25, 0.18, 0.45], [-0.27, 0.18, -0.2], [-0.3, 0.2, -1.0], [-0.33, 0.22, -1.45]],
  coil_lead: [[0.45, 0.8, 0.88], [0.3, 0.86, 0.6], add(HEAD_ORIGIN, [0.07, 0.24, -0.27])],
  engine_harness: [[0.3, 0.9, 0.78], [0.0, 0.95, 0.8], add(E, [-0.21, 0.12, 0.2]), add(E, [-0.15, 0.25, 0.0]), add(E, [0.27, 0.04, -0.21])],
  fuel_line: [add(E, [0.215, 0.13, -0.06]), add(E, [0.28, 0.3, -0.05]), add(HEAD_ORIGIN, [0.335, 0.14, 0.0])],
  throttle_cable: [[0.37, 0.65, 0.75], [0.35, 0.85, 0.85], add(HEAD_ORIGIN, [0.3, 0.2, 0.05])],
  clutch_cable: [[0.3, 0.5, 0.75], [0.22, 0.42, 0.62], add(E, [0.12, 0.02, -0.5])],
};
export const TUBE_RADIUS = { hose_upper: 0.022, hose_lower: 0.024, downpipe: 0.025, midpipe: 0.025, coil_lead: 0.005, engine_harness: 0.012, fuel_line: 0.005, throttle_cable: 0.004, clutch_cable: 0.005 };
export function pathCenter(pts) {
  const c = [0, 0, 0];
  for (const p of pts) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }
  return c.map((v) => v / pts.length);
}
const rel = (path, p) => { const c = pathCenter(PATHS[path]); return [p[0] - c[0], p[1] - c[1], p[2] - c[2]]; };
const tubeSlot = (id, accepts, name, req, fast) => ({ id, accepts, name, pos: pathCenter(PATHS[accepts]), req, fast });

// ---------- HOSTS: slot lists ----------
export const HOSTS = {};

HOSTS.block = [
  { id: 'mainBearings', accepts: 'main_bearings', name: 'Main bearings', pos: [0, 0, 0] },
  { id: 'crankshaft', accepts: 'crankshaft', name: 'Crankshaft', pos: [0, 0, 0], req: ['mainBearings'],
    fast: [F(14, 65, 'M10x1.5', [-0.2, -0.1, 0, 0.1, 0.2].flatMap((z) => [[0.055, -0.075, z], [-0.055, -0.075, z]]), [0, -1, 0], { name: 'main cap bolt' })] },
  { id: 'rodBearings', accepts: 'rod_bearings', name: 'Rod bearings', pos: [0, 0, 0], req: ['crankshaft'] },
  ...CYL_Z.map((z, i) => ({ id: 'piston' + (i + 1), accepts: 'piston', name: `Piston #${i + 1}`, pos: [0, 0.2, z], req: ['rodBearings'],
    needChildren: ['rings', 'rod'],
    fast: [F(12, 45, 'M8x1.0', [[0.034, -0.272, 0], [-0.034, -0.272, 0]], [0, -1, 0], { name: 'rod cap nut' })] })),
  { id: 'oilPump', accepts: 'oil_pump', name: 'Oil pump', pos: [0, -0.035, 0.19], req: ['crankshaft'],
    fast: [F(10, 10, 'M6x1.0', [[0.045, 0.01, 0.035], [-0.045, 0.01, 0.035], [0, -0.03, 0.035]], [0, 0, 1])] },
  { id: 'oilPan', accepts: 'oil_pan', name: 'Oil pan', pos: [0, -0.06, 0], req: ['oilPump', 'piston1', 'piston2', 'piston3', 'piston4'],
    fast: [
      F(10, 10, 'M6x1.0', [[0.17, -0.005, 0.2], [0.17, -0.005, 0.07], [0.17, -0.005, -0.07], [0.17, -0.005, -0.2], [-0.17, -0.005, 0.2], [-0.17, -0.005, 0.07], [-0.17, -0.005, -0.07], [-0.17, -0.005, -0.2]], [0, -1, 0], { name: 'oil pan bolt' }),
      F(17, 30, 'M14x1.5', [[0.08, -0.152, -0.12]], [0, -1, 0], { name: 'drain plug', role: 'drain' }),
    ] },
  { id: 'oilFilter', accepts: 'oil_filter', name: 'Oil filter', pos: [0.19, 0.03, 0.06], req: ['oilPump'],
    fast: [F('hand', 15, 'M20x1.5', [[0.07, 0, 0]], [1, 0, 0], { name: 'spin-on filter' })] },
  { id: 'fuelPump', accepts: 'fuel_pump', name: 'Mechanical fuel pump', pos: [0.185, 0.12, -0.08],
    fast: [F(12, 18, 'M8x1.25', [[0.02, 0.03, 0.03], [0.02, 0.03, -0.03]], [1, 0, 0])] },
  { id: 'headGasket', accepts: 'head_gasket', name: 'Head gasket', pos: [0, 0.3, 0], req: ['piston1', 'piston2', 'piston3', 'piston4'] },
  { id: 'head', accepts: 'cylinder_head', name: 'Cylinder head', pos: [0, 0.303, 0], req: ['headGasket'],
    fast: [F(14, 75, 'M10x1.5', [-0.2, -0.1, 0, 0.1, 0.2].flatMap((z) => [[0.135, 0.112, z], [-0.135, 0.112, z]]), [0, 1, 0], { name: 'head bolt' })] },
  { id: 'crankSprocket', accepts: 'crank_sprocket', name: 'Crank timing gear', pos: [0, 0, 0.245], req: ['crankshaft'] },
  { id: 'waterPump', accepts: 'water_pump', name: 'Water pump', pos: [-0.09, 0.14, 0.235],
    fast: [F(10, 10, 'M6x1.0', ring(4, 0.05, [0, 0, 0.02], 'z', Math.PI / 4), [0, 0, 1])] },
  { id: 'tensioner', accepts: 'tensioner', name: 'Timing belt tensioner', pos: [0.08, 0.1, 0.25],
    fast: [F(13, 40, 'M8x1.25', [[0, 0, 0.03]], [0, 0, 1])] },
  { id: 'timingBelt', accepts: 'timing_belt', name: 'Timing belt', pos: [0, 0, 0.262], req: ['crankSprocket', 'head/camSprocket', 'tensioner', 'waterPump'] },
  { id: 'timingCover', accepts: 'timing_cover', name: 'Timing cover', pos: [0, 0.2, 0.282], req: ['timingBelt'],
    fast: [F(10, 8, 'M6x1.0', [[0.1, 0.18, 0.01], [-0.1, 0.18, 0.01], [0.1, -0.12, 0.01], [-0.1, -0.12, 0.01]], [0, 0, 1])] },
  { id: 'crankPulley', accepts: 'crank_pulley', name: 'Crank pulley', pos: [0, 0, 0.3], req: ['crankSprocket', 'timingCover'],
    fast: [F(17, 110, 'M12x1.5', [[0, 0, 0.03]], [0, 0, 1], { name: 'crank bolt' })] },
  { id: 'alternator', accepts: 'alternator', name: 'Alternator', pos: [-0.215, 0.07, 0.17],
    fast: [F(13, 40, 'M8x1.25', [[-0.065, -0.04, 0.02], [-0.065, 0.04, 0.08]], [-1, 0, 0])] },
  { id: 'fanBelt', accepts: 'fan_belt', name: 'V-belt', pos: [0, 0, 0.31], req: ['crankPulley', 'alternator', 'waterPump'] },
  { id: 'starter', accepts: 'starter', name: 'Starter motor', pos: [0.215, -0.01, -0.29],
    fast: [F(13, 40, 'M10x1.5', [[0.03, 0.04, 0.005], [0.03, -0.04, 0.005]], [0, 0, -1])] },
  { id: 'flywheel', accepts: 'flywheel', name: 'Flywheel', pos: [0, 0, -0.26], req: ['crankshaft'],
    fast: [F(17, 85, 'M10x1.25', ring(6, 0.035, [0, 0, -0.015]), [0, 0, -1], { name: 'flywheel bolt' })] },
  { id: 'clutchDisc', accepts: 'clutch_disc', name: 'Clutch disc', pos: [0, 0, -0.283], req: ['flywheel'] },
  { id: 'pressurePlate', accepts: 'pressure_plate', name: 'Pressure plate', pos: [0, 0, -0.3], req: ['clutchDisc'],
    fast: [F(12, 25, 'M8x1.25', ring(6, 0.105, [0, 0, -0.012], 'z', 0.3), [0, 0, -1])] },
  { id: 'gearbox', accepts: 'gearbox', name: 'Gearbox', pos: [0, 0, -0.33], req: ['pressurePlate'],
    fast: [F(14, 45, 'M10x1.5', ring(6, 0.17, [0, -0.02, -0.01], 'z', 0.5), [0, 0, -1], { name: 'bellhousing bolt' })] },
];

HOSTS.piston = [
  { id: 'rings', accepts: 'piston_rings', name: 'Piston rings', pos: [0, 0, 0] },
  { id: 'rod', accepts: 'conrod', name: 'Connecting rod', pos: [0, 0, 0] },
];

HOSTS.head = [
  { id: 'valvesIn', accepts: 'valves_in', name: 'Intake valves', pos: [0.035, 0.05, 0] },
  { id: 'valvesEx', accepts: 'valves_ex', name: 'Exhaust valves', pos: [-0.035, 0.05, 0] },
  { id: 'valveSprings', accepts: 'valve_springs', name: 'Valve springs', pos: [0, 0.09, 0], req: ['valvesIn', 'valvesEx'] },
  { id: 'retainers', accepts: 'valve_retainers', name: 'Valve retainers', pos: [0, 0.112, 0], req: ['valveSprings'] },
  { id: 'camBearings', accepts: 'cam_bearings', name: 'Camshaft bearings', pos: [0, 0.125, 0] },
  { id: 'camshaft', accepts: 'camshaft', name: 'Camshaft', pos: [0, 0.14, 0], req: ['camBearings', 'retainers'],
    fast: [F(10, 18, 'M6x1.0', [-0.18, 0, 0.18].flatMap((z) => [[0.035, 0.022, z], [-0.035, 0.022, z]]), [0, 1, 0], { name: 'cam cap bolt' })] },
  { id: 'rockers', accepts: 'rockers', name: 'Rocker arms & shaft', pos: [0, 0.17, 0], req: ['camshaft'],
    fast: [F(12, 25, 'M8x1.25', [-0.21, -0.07, 0.07, 0.21].map((z) => [0, 0.03, z]), [0, 1, 0])] },
  { id: 'valveCover', accepts: 'valve_cover', name: 'Valve cover', pos: [0, 0.112, 0], req: ['rockers'],
    fast: [F(10, 8, 'M6x1.0', [-0.2, 0, 0.2].flatMap((z) => [[0.105, 0.02, z], [-0.105, 0.02, z]]), [0, 1, 0])] },
  { id: 'camSprocket', accepts: 'cam_sprocket', name: 'Cam timing gear', pos: [0, 0.14, 0.255], req: ['camshaft'],
    fast: [F(17, 55, 'M10x1.25', [[0, 0, 0.02]], [0, 0, 1])] },
  { id: 'distributor', accepts: 'distributor', name: 'Distributor', pos: [0.07, 0.12, -0.25], req: ['camshaft'],
    fast: [F(13, 20, 'M8x1.25', [[0.04, 0, 0.02]], [0, 0, -1])] },
  ...CYL_Z.map((z, i) => ({ id: 'plug' + (i + 1), accepts: 'spark_plug', name: `Spark plug #${i + 1}`, pos: [-0.135, 0.1, z],
    fast: [F('plug', 25, 'M14x1.25', [[0, 0.03, 0]], [0, 1, 0], { name: 'spark plug thread' })] })),
  { id: 'plugWires', accepts: 'plug_wires', name: 'Spark plug wires', pos: [0, 0, 0], req: ['distributor', 'plug1', 'plug2', 'plug3', 'plug4'],
    fast: [F('hand', 1, 'boot', [...CYL_Z.map((z) => [-0.135, 0.15, z]), [0.07, 0.2, -0.27]], [0, 1, 0], { name: 'plug boot' })] },
  { id: 'intake', accepts: 'intake_manifold', name: 'Intake manifold', pos: [0.18, 0.06, 0],
    fast: [F(12, 22, 'M8x1.25', [-0.13, 0, 0.13].flatMap((z) => [[-0.015, 0.03, z], [-0.015, -0.03, z]]), [1, 0, 0])] },
  { id: 'exGasket', accepts: 'exhaust_gasket', name: 'Exhaust manifold gasket', pos: [-0.162, 0.06, 0] },
  { id: 'exManifold', accepts: 'exhaust_manifold', name: 'Exhaust manifold', pos: [-0.166, 0.06, 0], req: ['exGasket'],
    fast: [F(13, 25, 'M8x1.25', [-0.13, 0, 0.13].flatMap((z) => [[-0.012, 0.035, z], [-0.012, -0.035, z]]), [-1, 0, 0])] },
  { id: 'turbo', accepts: 'turbo', name: 'Turbocharger', pos: [-0.25, 0.12, 0.02], req: ['exManifold'],
    fast: [F(13, 30, 'M8x1.25', [[0.0, -0.07, 0.06], [0.0, -0.07, -0.06], [0.0, 0.07, 0.06], [0.0, 0.07, -0.06]], [-1, 0, 0], { name: 'turbo flange nut' })] },
  { id: 'thermostat', accepts: 'thermostat', name: 'Thermostat & housing', pos: [0.11, 0.06, 0.24],
    fast: [F(10, 10, 'M6x1.0', [[0.03, 0.02, 0.02], [-0.03, 0.02, 0.02]], [0, 0, 1])] },
];

HOSTS.intake = [
  { id: 'carb', accepts: 'carburetor', name: 'Carburettor', pos: [0.1, 0.07, 0], req: [],
    fast: [F(10, 10, 'M6x1.0', [[0.035, -0.035, 0.035], [-0.035, -0.035, 0.035], [0.035, -0.035, -0.035], [-0.035, -0.035, -0.035]], [0, 1, 0], { name: 'carb stud nut' })] },
];
HOSTS.carb = [
  { id: 'airFilter', accepts: 'air_filter', name: 'Air filter', pos: [0, 0.075, 0], fast: [F('hand', 3, 'wing nut', [[0, 0.045, 0]], [0, 1, 0], { name: 'wing nut' })] },
];

HOSTS.gearbox = [
  { id: 'gearset', accepts: 'gearset', name: 'Gear set & shafts', pos: [0, -0.02, -0.3] },
  { id: 'gbCover', accepts: 'gearbox_cover', name: 'Gearbox bottom cover', pos: [0, -0.125, -0.3], req: ['gearset'],
    fast: [F(10, 10, 'M6x1.0', [-0.14, 0, 0.14].flatMap((z) => [[0.08, -0.008, z], [-0.08, -0.008, z]]), [0, -1, 0])] },
];

HOSTS.trunk = [
  { id: 'spoiler', accepts: 'spoiler', name: 'Rear spoiler', pos: [0, 0.015, -0.5],
    fast: [F(10, 10, 'M6x1.0', [[0.45, 0.005, 0.03], [0.45, 0.005, -0.03], [-0.45, 0.005, 0.03], [-0.45, 0.005, -0.03]], [0, 1, 0], { name: 'spoiler bolt' })] },
];
HOSTS.stand = [
  { id: 'engine', accepts: 'block', name: 'Engine stand cradle', pos: [0, 0.78, 0],
    fast: [F(14, 40, 'M10x1.5', [[0.18, 0.04, 0.1], [0.18, 0.04, -0.1], [-0.18, 0.04, 0.1], [-0.18, 0.04, -0.1]], [0, -1, 0], { name: 'stand bolt' })] },
];

// ---- the car ----
const cornerSlots = [];
for (const [c, d] of Object.entries(CORNERS)) {
  const s = d.side, front = d.axle === 'F';
  cornerSlots.push(
    { id: 'shock' + c, accepts: 'shock', name: `Shock absorber ${c}`, pos: [d.x - s * 0.06, 0.5, d.z],
      fast: [F(14, 45, 'M10x1.25', [[0, 0.22, 0], [0, -0.16, 0]], [s, 0, 0])] },
    { id: 'spring' + c, accepts: 'spring', name: `Coil spring ${c}`, pos: [d.x - s * 0.06, 0.55, d.z], req: ['shock' + c] },
    { id: 'disc' + c, accepts: 'brake_disc', name: `Brake disc ${c}`, pos: [d.x - s * 0.08, 0.3, d.z], rot: [0, s > 0 ? 0 : Math.PI, 0] },
    { id: 'pads' + c, accepts: 'brake_pads', name: `Brake pads ${c}`, pos: [d.x - s * 0.08, 0.3, d.z], req: ['disc' + c] },
    { id: 'caliper' + c, accepts: 'caliper', name: `Brake caliper ${c}`, pos: [d.x - s * 0.08, 0.3, d.z], req: ['pads' + c], rot: [0, s > 0 ? 0 : Math.PI, 0],
      fast: [F(14, 50, 'M10x1.25', [[0.04, 0.13, -0.11], [0.04, 0.03, -0.17]], [1, 0, 0])] },
    { id: 'wheel' + c, accepts: 'wheel', name: `Wheel ${c}`, pos: [d.x, 0.3, d.z], req: ['disc' + c], rot: [0, s > 0 ? 0 : Math.PI, 0], lift: d.axle,
      fast: [F(19, 100, 'M12x1.5', ring(4, 0.05, [0.05, 0, 0], 'x', Math.PI / 4), [1, 0, 0], { name: 'lug nut' })] },
  );
  if (front) cornerSlots.push(
    { id: 'controlArm' + c, accepts: 'control_arm', name: `Lower control arm ${c}`, pos: [s * 0.45, 0.22, d.z], rot: [0, s > 0 ? 0 : Math.PI, 0],
      fast: [F(17, 70, 'M12x1.25', [[-0.18, 0, 0.08], [-0.18, 0, -0.08]], [0, -1, 0])] },
    { id: 'tieRod' + c, accepts: 'tie_rod', name: `Tie rod ${c}`, pos: [s * 0.42, 0.32, d.z + 0.1], rot: [0, s > 0 ? 0 : Math.PI, 0], req: ['steeringRack'],
      fast: [F(17, 45, 'M12x1.5', [[0.2, 0.015, 0]], [0, 1, 0], { name: 'tie rod end nut' })] },
  );
}

HOSTS.car = [
  { id: 'engineMountL', accepts: 'engine_mount', name: 'Engine mount (left)', pos: [0.25, 0.37, 1.12],
    fast: [F(17, 45, 'M10x1.25', [[0.04, -0.04, 0.05], [0.04, -0.04, -0.05]], [0, 1, 0])] },
  { id: 'engineMountR', accepts: 'engine_mount', name: 'Engine mount (right)', pos: [-0.25, 0.37, 1.12], rot: [0, Math.PI, 0],
    fast: [F(17, 45, 'M10x1.25', [[0.04, -0.04, 0.05], [0.04, -0.04, -0.05]], [0, 1, 0])] },
  { id: 'engine', accepts: 'block', name: 'Engine', pos: ENGINE_POS, req: ['engineMountL', 'engineMountR'], hoist: true,
    fast: [F(17, 55, 'M12x1.25', [[0.215, -0.03, 0], [-0.215, -0.03, 0]], [0, 1, 0], { name: 'engine mount through-bolt' })] },
  { id: 'gearboxMount', accepts: 'gearbox_mount', name: 'Gearbox mount', pos: [0, 0.27, 0.32], req: ['engine/gearbox'],
    fast: [F(14, 40, 'M10x1.25', [[0.08, 0, 0], [-0.08, 0, 0]], [0, -1, 0])] },
  { id: 'diff', accepts: 'differential', name: 'Rear differential', pos: [0, 0.3, -1.2],
    fast: [F(17, 60, 'M10x1.25', [[0.12, -0.1, 0.06], [-0.12, -0.1, 0.06], [0.12, -0.1, -0.06], [-0.12, -0.1, -0.06]], [0, -1, 0])] },
  { id: 'propshaft', accepts: 'propshaft', name: 'Propeller shaft', pos: [0, 0.3, -0.45], req: ['engine/gearbox', 'diff'],
    fast: [F(12, 30, 'M8x1.25', [[0.03, -0.05, 0.7], [-0.03, -0.05, 0.7], [0.03, -0.05, -0.6], [-0.03, -0.05, -0.6]], [0, -1, 0], { name: 'flange bolt' })] },
  { id: 'halfshaftL', accepts: 'halfshaft', name: 'Rear half-shaft (left)', pos: [0.12, 0.3, -1.2], req: ['diff'],
    fast: [F(17, 50, 'M12x1.5', [[0.52, 0.06, 0]], [1, 0, 0])] },
  { id: 'halfshaftR', accepts: 'halfshaft', name: 'Rear half-shaft (right)', pos: [-0.12, 0.3, -1.2], req: ['diff'], rot: [0, Math.PI, 0],
    fast: [F(17, 50, 'M12x1.5', [[0.52, 0.06, 0]], [1, 0, 0])] },
  { id: 'radiator', accepts: 'radiator', name: 'Radiator', pos: [0, 0.6, 1.8],
    fast: [F(10, 8, 'M6x1.0', [[0.27, 0.22, 0], [-0.27, 0.22, 0]], [0, 1, 0])] },
  { id: 'fan', accepts: 'cooling_fan', name: 'Electric cooling fan', pos: [0, 0.6, 1.71], req: ['radiator'],
    fast: [F(8, 6, 'M5x0.8', [[0.16, 0.16, 0.01], [-0.16, 0.16, 0.01]], [0, 0, -1]), F('hand', 1, 'connector', [[0.17, -0.12, -0.02]], [0, 0, -1], { name: 'fan connector' })] },
  tubeSlot('hoseUpper', 'hose_upper', 'Upper radiator hose', ['radiator', 'engine/head/thermostat'],
    [F('flat', 3, 'hose clamp', [rel('hose_upper', PATHS.hose_upper[0]), rel('hose_upper', PATHS.hose_upper[3])], [0, 1, 0], { name: 'hose clamp' })]),
  tubeSlot('hoseLower', 'hose_lower', 'Lower radiator hose', ['radiator', 'engine/waterPump'],
    [F('flat', 3, 'hose clamp', [rel('hose_lower', PATHS.hose_lower[0]), rel('hose_lower', PATHS.hose_lower[3])], [0, 1, 0], { name: 'hose clamp' })]),
  tubeSlot('downpipe', 'downpipe', 'Exhaust downpipe', ['engine/head/exManifold'],
    [F(13, 25, 'M8x1.25', [add(rel('downpipe', PATHS.downpipe[0]), [0.03, 0.02, 0]), add(rel('downpipe', PATHS.downpipe[0]), [-0.03, 0.02, 0]), rel('downpipe', PATHS.downpipe[3])], [0, 1, 0])]),
  tubeSlot('midpipe', 'midpipe', 'Mid pipe & resonator', ['downpipe'],
    [F(13, 20, 'M8x1.25', [add(rel('midpipe', PATHS.midpipe[0]), [0, 0.035, -0.03])], [0, 1, 0], { name: 'exhaust clamp' }),
     F('hand', 1, 'rubber hanger', [rel('midpipe', PATHS.midpipe[2])], [0, 1, 0], { name: 'exhaust hanger' })]),
  { id: 'muffler', accepts: 'muffler', name: 'Muffler & tailpipe', pos: [-0.36, 0.22, -1.72], req: ['midpipe'],
    fast: [F(13, 20, 'M8x1.25', [[0.03, 0.035, 0.27]], [0, 1, 0], { name: 'exhaust clamp' }), F('hand', 1, 'rubber hanger', [[0, 0.07, -0.15]], [0, 1, 0], { name: 'exhaust hanger' })] },
  { id: 'battery', accepts: 'battery', name: 'Battery', pos: [0.5, 0.6, 1.55],
    fast: [F(10, 6, 'M6x1.0', [[0, 0.19, 0]], [0, 1, 0], { name: 'hold-down' }),
           F(10, 5, 'terminal', [[0.06, 0.2, 0.05]], [0, 1, 0], { name: 'positive terminal', role: 'terminal' }),
           F(10, 5, 'terminal', [[-0.06, 0.2, 0.05]], [0, 1, 0], { name: 'negative terminal', role: 'terminal' })] },
  { id: 'coil', accepts: 'ignition_coil', name: 'Ignition coil', pos: [0.45, 0.76, 0.86],
    fast: [F(10, 6, 'M6x1.0', [[0.04, 0.04, -0.02], [0.04, -0.04, -0.02]], [0, 0, 1])] },
  tubeSlot('coilLead', 'coil_lead', 'Coil lead', ['coil', 'engine/head/distributor'],
    [F('hand', 1, 'boot', [rel('coil_lead', PATHS.coil_lead[0]), rel('coil_lead', PATHS.coil_lead[2])], [0, 1, 0], { name: 'lead boot' })]),
  tubeSlot('harness', 'engine_harness', 'Engine wiring harness', ['engine', 'engine/alternator', 'engine/starter', 'battery'],
    [F('hand', 1, 'connector', [rel('engine_harness', PATHS.engine_harness[0]), rel('engine_harness', PATHS.engine_harness[2]), rel('engine_harness', PATHS.engine_harness[4])], [0, 1, 0], { name: 'connector' })]),
  { id: 'fuelTank', accepts: 'fuel_tank', name: 'Fuel tank', pos: [0, 0.36, -1.62],
    fast: [F(13, 20, 'M8x1.25', [[0.3, -0.08, 0.2], [-0.3, -0.08, 0.2], [0.3, -0.08, -0.2], [-0.3, -0.08, -0.2]], [0, -1, 0], { name: 'tank strap bolt' })] },
  tubeSlot('fuelLine', 'fuel_line', 'Fuel line', ['engine/fuelPump', 'engine/head/intake/carb', 'fuelTank'],
    [F('flat', 2, 'hose clamp', [rel('fuel_line', PATHS.fuel_line[0]), rel('fuel_line', PATHS.fuel_line[2])], [0, 1, 0], { name: 'fuel hose clamp' })]),
  tubeSlot('throttleCable', 'throttle_cable', 'Throttle cable', ['engine/head/intake/carb'],
    [F('hand', 1, 'cable end', [rel('throttle_cable', PATHS.throttle_cable[2])], [0, 1, 0], { name: 'cable end' })]),
  tubeSlot('clutchCable', 'clutch_cable', 'Clutch cable', ['engine/gearbox'],
    [F('hand', 1, 'cable end', [rel('clutch_cable', PATHS.clutch_cable[2])], [0, 1, 0], { name: 'cable end' })]),
  { id: 'masterCyl', accepts: 'master_cylinder', name: 'Brake master cylinder', pos: [0.36, 0.8, 0.84],
    fast: [F(12, 15, 'M8x1.25', [[0.04, 0, -0.04], [-0.04, 0, -0.04]], [0, 0, 1])] },
  { id: 'steeringRack', accepts: 'steering_rack', name: 'Steering rack', pos: [0, 0.32, 1.32],
    fast: [F(17, 50, 'M10x1.25', [[0.22, 0.04, 0], [-0.22, 0.04, 0]], [0, 1, 0])] },
  ...cornerSlots,
  { id: 'steeringWheel', accepts: 'steering_wheel', name: 'Steering wheel', pos: [0.37, 0.88, 0.36], rot: [-0.45, 0, 0],
    fast: [F(17, 40, 'M14x1.5', [[0, 0, 0.015]], [0, 0, -1], { name: 'steering wheel nut' })] },
  { id: 'seatL', accepts: 'seat', name: 'Driver seat', pos: [0.37, 0.27, -0.2],
    fast: [F(13, 30, 'M8x1.25', [[0.2, 0.02, 0.2], [-0.2, 0.02, 0.2], [0.2, 0.02, -0.2], [-0.2, 0.02, -0.2]], [0, 1, 0])] },
  { id: 'seatR', accepts: 'seat', name: 'Passenger seat', pos: [-0.37, 0.27, -0.2],
    fast: [F(13, 30, 'M8x1.25', [[0.2, 0.02, 0.2], [-0.2, 0.02, 0.2], [0.2, 0.02, -0.2], [-0.2, 0.02, -0.2]], [0, 1, 0])] },
  { id: 'hood', accepts: 'hood', name: 'Bonnet', pos: [0, 0.94, 0.8], openable: { axis: 'x', angle: -1.15 },
    fast: [F(10, 10, 'M6x1.0', [[0.55, 0.0, 0.06], [0.55, 0.0, 0.16], [-0.55, 0.0, 0.06], [-0.55, 0.0, 0.16]], [0, 1, 0], { name: 'hinge bolt' })] },
  { id: 'doorL', accepts: 'door_l', name: 'Left door', pos: [0.835, 0.3, 0.6], openable: { axis: 'y', angle: -1.1 },
    fast: [F(12, 25, 'M8x1.25', [[-0.03, 0.15, -0.01], [-0.03, 0.5, -0.01], [-0.03, 0.33, -0.01]], [-1, 0, 0], { name: 'hinge bolt' })] },
  { id: 'doorR', accepts: 'door_r', name: 'Right door', pos: [-0.835, 0.3, 0.6], openable: { axis: 'y', angle: 1.1 },
    fast: [F(12, 25, 'M8x1.25', [[0.03, 0.15, -0.01], [0.03, 0.5, -0.01], [0.03, 0.33, -0.01]], [1, 0, 0], { name: 'hinge bolt' })] },
  { id: 'trunk', accepts: 'trunk_lid', name: 'Boot lid', pos: [0, 0.95, -1.42], openable: { axis: 'x', angle: 1.2 },
    fast: [F(10, 10, 'M6x1.0', [[0.45, 0, 0.0], [-0.45, 0, 0.0]], [0, 1, 0], { name: 'hinge bolt' })] },
  { id: 'bumperF', accepts: 'bumper_f', name: 'Front bumper', pos: [0, 0.42, 2.06],
    fast: [F(13, 20, 'M8x1.25', [[0.5, 0, -0.04], [-0.5, 0, -0.04]], [0, 0, -1])] },
  { id: 'bumperR', accepts: 'bumper_r', name: 'Rear bumper', pos: [0, 0.42, -2.1],
    fast: [F(13, 20, 'M8x1.25', [[0.5, 0, 0.04], [-0.5, 0, 0.04]], [0, 0, 1])] },
  { id: 'splitter', accepts: 'splitter', name: 'Front splitter', pos: [0, 0.3, 2.14], req: ['bumperF'],
    fast: [F(10, 10, 'M6x1.0', [[0.55, 0.012, -0.05], [0.2, 0.012, -0.05], [-0.2, 0.012, -0.05], [-0.55, 0.012, -0.05]], [0, -1, 0], { name: 'splitter bolt' })] },
  { id: 'skirtL', accepts: 'side_skirt', name: 'Left side skirt', pos: [0.86, 0.24, 0.1],
    fast: [F(10, 10, 'M6x1.0', [[0, -0.04, 0.45], [0, -0.04, 0], [0, -0.04, -0.45]], [0, -1, 0], { name: 'skirt bolt' })] },
  { id: 'skirtR', accepts: 'side_skirt', name: 'Right side skirt', pos: [-0.86, 0.24, 0.1],
    fast: [F(10, 10, 'M6x1.0', [[0, -0.04, 0.45], [0, -0.04, 0], [0, -0.04, -0.45]], [0, -1, 0], { name: 'skirt bolt' })] },
  { id: 'lightPod', accepts: 'rally_lights', name: 'Rally light pod', pos: [0, 0.6, 2.13], req: ['bumperF'],
    fast: [F(13, 15, 'M8x1.25', [[0.3, -0.05, -0.02], [-0.3, -0.05, -0.02]], [0, 0, 1])] },
  { id: 'headlightL', accepts: 'headlight', name: 'Left headlight', pos: [0.56, 0.72, 2.0],
    fast: [F('ph', 2, 'screw', [[0.08, 0.06, 0.01], [-0.08, -0.06, 0.01]], [0, 0, 1])] },
  { id: 'headlightR', accepts: 'headlight', name: 'Right headlight', pos: [-0.56, 0.72, 2.0],
    fast: [F('ph', 2, 'screw', [[0.08, 0.06, 0.01], [-0.08, -0.06, 0.01]], [0, 0, 1])] },
  { id: 'taillightL', accepts: 'taillight', name: 'Left tail light', pos: [0.62, 0.72, -2.06],
    fast: [F('ph', 2, 'screw', [[0.07, 0, -0.01], [-0.07, 0, -0.01]], [0, 0, -1])] },
  { id: 'taillightR', accepts: 'taillight', name: 'Right tail light', pos: [-0.62, 0.72, -2.06],
    fast: [F('ph', 2, 'screw', [[0.07, 0, -0.01], [-0.07, 0, -0.01]], [0, 0, -1])] },
];

// Fluid fill points (position in the part's local frame).
export const FILL_POINTS = {
  valve_cover: { fluid: 'oil', pos: [0.05, 0.1, 0.12], name: 'oil filler cap' },
  radiator: { fluid: 'coolant', pos: [0.18, 0.24, 0], name: 'radiator cap' },
  fuel_tank: { fluid: 'fuel', pos: [0.86, 0.42, 0.15], name: 'fuel filler' },
  master_cylinder: { fluid: 'brake', pos: [0, 0.07, 0], name: 'brake fluid reservoir' },
  gearbox: { fluid: 'gearoil', pos: [0.1, 0.02, -0.25], name: 'gearbox filler plug' },
};

// ---------- PART DEFINITIONS ----------
// kind: part | tool | fluid | food | kit | box
const P = (id, type, name, mass, price, extra = {}) => ({ id, type, name, mass, price, kind: 'part', shop: true, ...extra });
export const DEFS = {};
[
  P('block_16', 'block', 'Engine block 1.6 (cast iron)', 38, 1400, { host: 'block', cat: 'Engine', desc: 'Bare 4-cylinder block. Everything else bolts to this.' }),
  P('crank_16', 'crankshaft', 'Crankshaft', 12, 650, { cat: 'Engine' }),
  P('main_bearings', 'main_bearings', 'Main bearing set (5)', 0.5, 90, { cat: 'Engine', desc: 'Shells for the crank journals. Without them the crank grinds the block.' }),
  P('rod_bearings', 'rod_bearings', 'Rod bearing set (4)', 0.3, 70, { cat: 'Engine' }),
  P('piston_16', 'piston', 'Piston 81 mm', 0.45, 120, { host: 'piston', orient: 4, cat: 'Engine', desc: 'Arrow on the crown must point to the timing side (front).' }),
  P('piston_forged', 'piston', 'Forged piston 81 mm', 0.4, 380, { host: 'piston', orient: 4, cat: 'Performance', props: { power: 1.04 }, desc: 'Lighter, stronger. Arrow to the front.' }),
  P('rings_16', 'piston_rings', 'Piston ring set (1 piston)', 0.05, 45, { cat: 'Engine' }),
  P('conrod_16', 'conrod', 'Connecting rod', 0.6, 140, { cat: 'Engine' }),
  P('oil_pump', 'oil_pump', 'Oil pump', 1.6, 210, { cat: 'Engine' }),
  P('oil_pan', 'oil_pan', 'Oil pan (sump)', 2.2, 160, { cat: 'Engine' }),
  P('oil_filter', 'oil_filter', 'Oil filter', 0.4, 45, { cat: 'Service' }),
  P('fuel_pump', 'fuel_pump', 'Mechanical fuel pump', 0.6, 140, { cat: 'Fuel' }),
  P('head_gasket_16', 'head_gasket', 'Head gasket', 0.3, 120, { cat: 'Engine', desc: 'Single use. A torn one leaks compression and coolant.' }),
  P('head_16', 'cylinder_head', 'Cylinder head 8V', 14, 1100, { host: 'head', cat: 'Engine' }),
  P('valves_in', 'valves_in', 'Intake valve set (4)', 0.4, 160, { cat: 'Engine' }),
  P('valves_ex', 'valves_ex', 'Exhaust valve set (4)', 0.4, 170, { cat: 'Engine' }),
  P('valve_springs', 'valve_springs', 'Valve spring set (8)', 0.6, 90, { cat: 'Engine' }),
  P('valve_retainers', 'valve_retainers', 'Valve retainers & collets', 0.1, 40, { cat: 'Engine' }),
  P('cam_bearings', 'cam_bearings', 'Camshaft bearing caps', 0.2, 70, { cat: 'Engine' }),
  P('camshaft_std', 'camshaft', 'Camshaft (standard)', 3, 420, { cat: 'Engine' }),
  P('camshaft_sport', 'camshaft', 'Camshaft "Kiihdytys 272"', 3, 1150, { cat: 'Performance', props: { power: 1.12, idle: 0.75 }, desc: 'More lift and duration. Lumpy idle, big top end.' }),
  P('rockers', 'rockers', 'Rocker arm assembly', 1.8, 260, { cat: 'Engine' }),
  P('valve_cover', 'valve_cover', 'Valve cover', 1.5, 140, { cat: 'Engine' }),
  P('cam_sprocket', 'cam_sprocket', 'Cam timing gear', 0.6, 90, { cat: 'Engine' }),
  P('crank_sprocket', 'crank_sprocket', 'Crank timing gear', 0.3, 70, { cat: 'Engine' }),
  P('timing_belt', 'timing_belt', 'Timing belt', 0.15, 160, { cat: 'Service', desc: 'Interference engine: if this snaps or is fitted off-mark, valves meet pistons.' }),
  P('tensioner', 'tensioner', 'Timing belt tensioner', 0.4, 110, { cat: 'Engine' }),
  P('timing_cover', 'timing_cover', 'Timing cover', 0.5, 70, { cat: 'Engine' }),
  P('crank_pulley', 'crank_pulley', 'Crank pulley', 1.2, 90, { cat: 'Engine' }),
  P('water_pump', 'water_pump', 'Water pump', 1.8, 230, { cat: 'Cooling' }),
  P('thermostat', 'thermostat', 'Thermostat 88 °C', 0.2, 55, { cat: 'Cooling' }),
  P('alternator', 'alternator', 'Alternator 55 A', 4.5, 380, { cat: 'Electrical' }),
  P('starter', 'starter', 'Starter motor', 3.5, 340, { cat: 'Electrical' }),
  P('fan_belt', 'fan_belt', 'V-belt (alternator / water pump)', 0.1, 40, { cat: 'Service' }),
  P('distributor', 'distributor', 'Distributor', 1.2, 290, { cat: 'Ignition' }),
  P('spark_plug', 'spark_plug', 'Spark plug', 0.05, 25, { cat: 'Service' }),
  P('plug_wires', 'plug_wires', 'Spark plug wire set', 0.3, 90, { cat: 'Ignition' }),
  P('intake_manifold', 'intake_manifold', 'Intake manifold', 3, 260, { host: 'intake', cat: 'Fuel' }),
  P('carb_single', 'carburetor', 'Carburettor 32 mm (single)', 1.8, 420, { host: 'carb', cat: 'Fuel' }),
  P('carb_twin', 'carburetor', 'Twin-choke carburettor 40 mm', 2.5, 1300, { host: 'carb', cat: 'Performance', props: { power: 1.14 } }),
  P('air_filter', 'air_filter', 'Air filter', 0.3, 60, { cat: 'Service' }),
  P('exhaust_gasket', 'exhaust_gasket', 'Exhaust manifold gasket', 0.1, 30, { cat: 'Exhaust' }),
  P('exhaust_manifold', 'exhaust_manifold', 'Exhaust manifold (cast)', 5, 240, { cat: 'Exhaust' }),
  P('header_42', 'exhaust_manifold', 'Tubular header 4-2-1', 4, 750, { cat: 'Performance', props: { power: 1.06 } }),
  P('flywheel', 'flywheel', 'Flywheel', 8, 380, { cat: 'Drivetrain' }),
  P('clutch_disc', 'clutch_disc', 'Clutch disc', 1, 220, { cat: 'Drivetrain' }),
  P('pressure_plate', 'pressure_plate', 'Clutch pressure plate', 4, 310, { cat: 'Drivetrain' }),
  P('gearbox_4sp', 'gearbox', '4-speed gearbox', 28, 1800, { host: 'gearbox', cat: 'Drivetrain' }),
  P('gearset_std', 'gearset', 'Gear set (road ratios)', 6, 900, { cat: 'Drivetrain', props: { ratios: [3.65, 2.14, 1.37, 1.0], rev: 3.3, final: 3.9 } }),
  P('gearset_close', 'gearset', 'Gear set (close rally ratios)', 6, 2400, { cat: 'Performance', props: { ratios: [3.2, 2.2, 1.6, 1.24], rev: 3.3, final: 4.4 } }),
  P('gearbox_cover', 'gearbox_cover', 'Gearbox bottom cover', 1, 80, { cat: 'Drivetrain' }),
  P('engine_mount', 'engine_mount', 'Engine mount', 1, 75, { cat: 'Engine' }),
  P('gearbox_mount', 'gearbox_mount', 'Gearbox mount', 0.8, 65, { cat: 'Drivetrain' }),
  P('propshaft', 'propshaft', 'Propeller shaft', 9, 420, { cat: 'Drivetrain' }),
  P('diff_open', 'differential', 'Rear axle differential 3.9 (open)', 25, 1500, { cat: 'Drivetrain', props: { lock: 0 } }),
  P('diff_lsd', 'differential', 'Rear axle differential (limited slip)', 26, 3200, { cat: 'Performance', props: { lock: 0.6 } }),
  P('halfshaft', 'halfshaft', 'Rear half-shaft', 6, 260, { cat: 'Drivetrain' }),
  P('radiator', 'radiator', 'Radiator', 4, 380, { cat: 'Cooling' }),
  P('cooling_fan', 'cooling_fan', 'Electric cooling fan', 2, 210, { cat: 'Cooling' }),
  P('hose_upper', 'hose_upper', 'Upper radiator hose', 0.3, 45, { cat: 'Cooling' }),
  P('hose_lower', 'hose_lower', 'Lower radiator hose', 0.35, 45, { cat: 'Cooling' }),
  P('downpipe', 'downpipe', 'Exhaust downpipe', 4, 260, { cat: 'Exhaust' }),
  P('midpipe', 'midpipe', 'Mid pipe with resonator', 6, 280, { cat: 'Exhaust' }),
  P('muffler', 'muffler', 'Muffler & tailpipe', 5, 240, { cat: 'Exhaust' }),
  P('muffler_sport', 'muffler', 'Sport muffler "Räksyttäjä"', 4, 520, { cat: 'Performance', props: { power: 1.03, loud: 1.6 } }),
  P('battery', 'battery', 'Battery 12 V 45 Ah', 14, 420, { cat: 'Electrical', props: { charge: 1 } }),
  P('coil', 'ignition_coil', 'Ignition coil', 0.8, 140, { cat: 'Ignition' }),
  P('coil_lead', 'coil_lead', 'Coil lead', 0.05, 20, { cat: 'Ignition' }),
  P('engine_harness', 'engine_harness', 'Engine wiring harness', 1.5, 300, { cat: 'Electrical' }),
  P('fuel_line', 'fuel_line', 'Fuel line', 0.3, 50, { cat: 'Fuel' }),
  P('fuel_tank', 'fuel_tank', 'Fuel tank 45 L', 7, 450, { cat: 'Fuel', props: { fuel: 0 } }),
  P('throttle_cable', 'throttle_cable', 'Throttle cable', 0.1, 35, { cat: 'Fuel' }),
  P('clutch_cable', 'clutch_cable', 'Clutch cable', 0.2, 50, { cat: 'Drivetrain' }),
  P('master_cylinder', 'master_cylinder', 'Brake master cylinder', 1.2, 260, { cat: 'Brakes', props: { fluid: 0 } }),
  P('steering_rack', 'steering_rack', 'Steering rack', 7, 650, { cat: 'Suspension' }),
  P('tie_rod', 'tie_rod', 'Tie rod', 1, 110, { cat: 'Suspension' }),
  P('control_arm', 'control_arm', 'Lower control arm (with ball joint & bushings)', 3, 220, { cat: 'Suspension' }),
  P('shock_std', 'shock', 'Shock absorber', 2.5, 210, { cat: 'Suspension', props: { damp: 1 } }),
  P('shock_rally', 'shock', 'Gravel shock absorber (adjustable)', 3, 780, { cat: 'Performance', props: { damp: 1.5 } }),
  P('spring_std', 'spring', 'Coil spring', 2, 120, { cat: 'Suspension', props: { k: 1 } }),
  P('spring_rally', 'spring', 'Rally coil spring (stiff)', 2, 420, { cat: 'Performance', props: { k: 1.45 } }),
  P('brake_disc', 'brake_disc', 'Brake disc', 5, 180, { cat: 'Brakes' }),
  P('brake_pads', 'brake_pads', 'Brake pad set', 0.6, 90, { cat: 'Brakes' }),
  P('caliper', 'caliper', 'Brake caliper', 3, 260, { cat: 'Brakes' }),
  P('wheel_steel', 'wheel', 'Steel wheel 13" + road tyre', 16, 380, { cat: 'Wheels', props: { grip: 1, gravel: 0.8, pressure: 2.1 } }),
  P('wheel_gravel', 'wheel', 'Rally wheel 13" + gravel tyre', 15, 820, { cat: 'Performance', props: { grip: 0.95, gravel: 1.1, pressure: 1.9 } }),
  P('sw_std', 'steering_wheel', 'Steering wheel (original)', 1.5, 120, { cat: 'Interior' }),
  P('sw_sport', 'steering_wheel', 'Leather sport steering wheel', 1, 340, { cat: 'Interior' }),
  P('seat_std', 'seat', 'Seat (original)', 14, 300, { cat: 'Interior' }),
  P('seat_bucket', 'seat', 'Bucket seat', 9, 1100, { cat: 'Interior' }),
  P('hood', 'hood', 'Bonnet', 14, 520, { cat: 'Body' }),
  P('door_l', 'door_l', 'Left door', 18, 480, { cat: 'Body' }),
  P('door_r', 'door_r', 'Right door', 18, 480, { cat: 'Body' }),
  P('trunk_lid', 'trunk_lid', 'Boot lid', 10, 380, { cat: 'Body', host: 'trunk' }),
  P('bumper_f', 'bumper_f', 'Front bumper', 6, 220, { cat: 'Body' }),
  P('bumper_r', 'bumper_r', 'Rear bumper', 6, 220, { cat: 'Body' }),
  P('headlight', 'headlight', 'Headlight unit', 1, 140, { cat: 'Electrical' }),
  P('taillight', 'taillight', 'Tail light unit', 0.5, 90, { cat: 'Electrical' }),
  P('turbo_kit', 'turbo', 'Turbo kit "Puhallus T3"', 9, 4200, { cat: 'Performance', props: { boost: 0.45 }, desc: 'Bolts to the exhaust manifold. Big push above 3000 rpm — and some lag below it.' }),
  P('flywheel_light', 'flywheel', 'Lightweight flywheel', 4.5, 950, { cat: 'Performance', props: { light: true }, desc: 'The engine revs up much faster.' }),
  P('clutch_sport', 'clutch_disc', 'Sport clutch disc (paddle)', 0.9, 680, { cat: 'Performance', props: { cap: 1.5 }, desc: 'Holds a lot more torque. Grabby.' }),
  P('pads_sport', 'brake_pads', 'Sport brake pad set', 0.6, 240, { cat: 'Performance', props: { bite: 1.3 } }),
  P('wheel_slick', 'wheel', 'Alloy wheel 13" + tarmac semi-slick', 13, 1150, { cat: 'Performance', props: { grip: 1.22, gravel: 0.65, pressure: 2.1 }, desc: 'Sticks on asphalt. Useless on gravel.' }),
  P('ducktail', 'spoiler', 'Ducktail spoiler', 2.5, 420, { cat: 'Body kits', props: { aero: 0.35 }, desc: 'Bolts onto the boot lid. A little rear downforce.' }),
  P('wing_rally', 'spoiler', 'Rally wing "Siipi"', 5, 1350, { cat: 'Body kits', props: { aero: 1.0 }, desc: 'Big rear wing on the boot lid: lots of rear downforce, a bit more drag.' }),
  P('splitter', 'splitter', 'Front splitter', 3, 520, { cat: 'Body kits', props: { aero: 0.45 }, desc: 'Bolts under the front bumper. Front downforce.' }),
  P('side_skirt', 'side_skirt', 'Side skirt', 2, 260, { cat: 'Body kits', desc: 'Looks fast. Fit one on each side.' }),
  P('rally_lights', 'rally_lights', 'Rally light pod (4 x 7")', 4, 950, { cat: 'Performance', desc: 'Four big driving lamps for night stages. Bolts to the front bumper.' }),
  // roots (never carried)
  { id: 'chassis_ruska', type: 'chassis', name: 'Ruska 1600 body shell', kind: 'root', host: 'car', mass: 520 },
  { id: 'engine_stand', type: 'stand', name: 'Engine stand', kind: 'root', host: 'stand', mass: 30 },
  // tools
  { id: 'ratchet', type: 'ratchet', name: '3/8" ratchet', kind: 'tool', mass: 0.4, price: 160, shop: true, cat: 'Tools', desc: 'Takes sockets from the socket case.' },
  { id: 'torque_wrench', type: 'torque_wrench', name: 'Torque wrench 10-120 Nm', kind: 'tool', mass: 1.1, price: 520, shop: true, cat: 'Tools', desc: 'Clicks at the exact spec. Never strips a thread.' },
  { id: 'lug_wrench', type: 'lug_wrench', name: 'Lug wrench 19 mm', kind: 'tool', mass: 1.2, price: 60, shop: true, cat: 'Tools', size: 19 },
  { id: 'wrench_10', type: 'wrench', name: 'Combination wrench 10 mm', kind: 'tool', mass: 0.15, price: 35, shop: true, cat: 'Tools', size: 10 },
  { id: 'wrench_13', type: 'wrench', name: 'Combination wrench 13 mm', kind: 'tool', mass: 0.2, price: 40, shop: true, cat: 'Tools', size: 13 },
  { id: 'wrench_17', type: 'wrench', name: 'Combination wrench 17 mm', kind: 'tool', mass: 0.3, price: 45, shop: true, cat: 'Tools', size: 17 },
  { id: 'screwdriver_flat', type: 'screwdriver', name: 'Flat screwdriver', kind: 'tool', mass: 0.12, price: 20, shop: true, cat: 'Tools', size: 'flat' },
  { id: 'screwdriver_ph', type: 'screwdriver', name: 'Phillips screwdriver', kind: 'tool', mass: 0.12, price: 20, shop: true, cat: 'Tools', size: 'ph' },
  { id: 'plug_socket', type: 'plug_socket', name: 'Spark plug socket & T-bar', kind: 'tool', mass: 0.3, price: 55, shop: true, cat: 'Tools', size: 'plug' },
  { id: 'socket_case', type: 'socket_case', name: 'Socket case', kind: 'tool', mass: 2.2, price: 0, shop: false, cat: 'Tools', props: { sockets: [8, 10, 12, 13, 14, 17] } },
  { id: 'socket_19', type: 'socket', name: '19 mm socket', kind: 'kit', mass: 0.08, price: 30, shop: true, cat: 'Tools', props: { size: 19 }, desc: 'Goes into the socket case.' },
  { id: 'socket_11', type: 'socket', name: '11 mm socket', kind: 'kit', mass: 0.07, price: 25, shop: true, cat: 'Tools', props: { size: 11 } },
  { id: 'floor_jack', type: 'floor_jack', name: 'Floor jack', kind: 'equip', mass: 28, price: 650, shop: false },
  { id: 'axle_stands', type: 'axle_stands', name: 'Axle stands (pair)', kind: 'tool', mass: 7, price: 180, shop: true, cat: 'Tools' },
  { id: 'hoist', type: 'hoist', name: 'Engine hoist', kind: 'equip', mass: 60, price: 1500, shop: false },
  // consumables
  { id: 'oil_jug', type: 'fluid', fluid: 'oil', cap: 4, name: 'Motor oil 10W-40 (4 L)', kind: 'fluid', mass: 3.8, price: 90, shop: true, cat: 'Fluids' },
  { id: 'coolant_jug', type: 'fluid', fluid: 'coolant', cap: 5, name: 'Coolant, premixed (5 L)', kind: 'fluid', mass: 5.2, price: 60, shop: true, cat: 'Fluids' },
  { id: 'brake_fluid', type: 'fluid', fluid: 'brake', cap: 0.5, name: 'Brake fluid DOT4 (0.5 L)', kind: 'fluid', mass: 0.6, price: 40, shop: true, cat: 'Fluids' },
  { id: 'gear_oil', type: 'fluid', fluid: 'gearoil', cap: 1.6, name: 'Gear oil 80W-90 (1.6 L)', kind: 'fluid', mass: 1.6, price: 55, shop: true, cat: 'Fluids' },
  { id: 'jerrycan', type: 'fluid', fluid: 'fuel', cap: 10, name: 'Jerry can of petrol (10 L)', kind: 'fluid', mass: 9, price: 120, shop: true, cat: 'Fluids' },
  { id: 'bolt_kit', type: 'kit', name: 'Assorted bolt & nut kit', kind: 'kit', mass: 0.5, price: 35, shop: true, cat: 'Tools', props: { uses: 6 }, desc: 'Replaces stripped fasteners (aim at a stripped bolt and press LMB).' },
  { id: 'sausage', type: 'food', name: 'Grill sausage', kind: 'food', mass: 0.4, price: 18, shop: true, cat: 'Groceries', props: { hunger: 40, thirst: -5 } },
  { id: 'rye_bread', type: 'food', name: 'Rye bread', kind: 'food', mass: 0.5, price: 9, shop: true, cat: 'Groceries', props: { hunger: 30, thirst: -5 } },
  { id: 'milk', type: 'food', name: 'Milk carton 1 L', kind: 'food', mass: 1, price: 7, shop: true, cat: 'Groceries', props: { thirst: 45, hunger: 8 } },
  { id: 'beer', type: 'food', name: 'Beer bottle 0.5 L "Karhu"', kind: 'food', mass: 0.6, price: 9, shop: true, cat: 'Groceries', props: { thirst: 15, beer: 1 } },
  { id: 'cigarettes', type: 'food', name: 'Cigarettes (pack of 20)', kind: 'food', mass: 0.05, price: 22, shop: true, cat: 'Groceries', props: { cig: true, left: 20 } },
  { id: 'fish', type: 'food', name: 'Fresh fish', kind: 'food', mass: 1, price: 0, shop: false, cat: 'Groceries', props: { hunger: 30, thirst: -3 } },
  { id: 'fishing_rod', type: 'fishing_rod', name: 'Fishing rod & tackle', kind: 'tool', mass: 0.9, price: 85, shop: true, cat: 'Leisure', desc: 'Cast from the lake shore or the sauna jetty.' },
  { id: 'pet_food', type: 'food', name: 'Pet food tin', kind: 'food', mass: 0.4, price: 12, shop: true, cat: 'Groceries', props: { pet: true } },
  { id: 'coffee', type: 'food', name: 'Coffee thermos', kind: 'food', mass: 0.8, price: 15, shop: true, cat: 'Groceries', props: { thirst: 20, fatigue: -25 } },
  { id: 'package', type: 'box', name: 'Delivery package', kind: 'box', mass: 3, price: 0, shop: false },
  { id: 'parcel', type: 'parcel', name: 'Parcel', kind: 'parcel', mass: 4, price: 0, shop: false },
  { id: 'scrap_small', type: 'scrap', name: 'Scrap metal (small)', kind: 'scrap', mass: 6, price: 0, shop: false },
  { id: 'scrap_med', type: 'scrap', name: 'Rusty scrap (exhaust, rims)', kind: 'scrap', mass: 15, price: 0, shop: false },
  { id: 'scrap_big', type: 'scrap', name: 'Heavy scrap (old engine parts)', kind: 'scrap', mass: 32, price: 0, shop: false },
  { id: 'fuel_nozzle', type: 'fluid', fluid: 'fuel', cap: 9999, infinite: true, name: 'Fuel pump nozzle', kind: 'fluid', mass: 1, price: 0, shop: false },
].forEach((d) => { DEFS[d.id] = d; });

export function slotById(host, id) { return HOSTS[host]?.find((s) => s.id === id); }
export function fastenerCount(slot) { return (slot.fast || []).reduce((n, g) => n + g.pts.length, 0); }
export function* fastenerList(slot) {
  let i = 0;
  for (const g of slot.fast || []) for (const p of g.pts) yield { i: i++, g, p };
}
