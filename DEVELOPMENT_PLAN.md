# Bolt by Bolt — development plan & status

Last updated: 2026-10-11 (second pass: world, life, jobs, rally)

## Architecture

```
index.html, styles/main.css     page, HUD, menus (DOM)
src/main.js                     Game: boot, main loop, jack/hoist/stand rules, gas pump, tow/taxi, inspection, economy glue, menus
src/core/                       input, util (noise, rng), procedural textures, shared materials
src/world/terrain.js            1.6 km heightfield with hills, flattened building zones, 11 roads (Catmull-Rom),
                                gradient limiter (cuttings/embankments), jump kickers on straights, road roughness map (bumps felt by the wheels)
src/world/colliders.js          static AABBs, tree trunks, dynamic obstacles (moose); ENV for the physics (bumpy groundY)
src/world/sky.js                renderer, sky, sun, day-night, fog, rain
src/world/buildings.js          JC's garage & house, floor jack, engine hoist
src/world/town.js               Ruskala village (gas station, parts store, post office, grocery, Esa's workshop & paint shop,
                                inspection station, Rally HQ, service park, notice board, houses with mailboxes, church),
                                Romu-Raimo's scrapyard (junk cars, scale, used-part racks), Pertti's and Mäkelä's farms
src/world/npc.js                14 NPCs with schedules, walking, dialogue, services, comments on your car; moose crossings
src/mechanics/                  parts database, procedural part models, assembly graph (unchanged design)
src/vehicles/physics.js         raycast-wheel rigid body
src/vehicles/systems.js         capability analysis + powertrain; now also tuning (mixture, idle, advance/detonation, brake bias, damper clicks, preload)
src/vehicles/car.js             the car, support (jack/stands), damage, leaks, paint & livery decals, rally light pod
src/vehicles/moped.js           "Pärinä 50" moped (arcade ride) for getting around early
src/player/                     first-person controller (+ creeper), interaction (+ buying scrapyard parts, fuel nozzle)
src/economy/life.js             clock, needs, sleep, bills
src/economy/jobs.js             parcel deliveries, lawn mowing, scrap collection, Esa's workshop jobs, daily scrapyard stock
src/racing/rally.js             9 stage variants, 5 event tiers (1–5 stages), liaison deadlines, service, AI field, championship
src/ui/ui.js, ui/screens.js     HUD, computer, inventory, map; dialogue, stores, tuning, paint shop, service, jobs, phone, rally centre
src/save/                       versioned save (+ .bak); new-game setup
```

## Milestones

- **M1 Foundation ✅, M2 Real assembly ✅, M3 Functional vehicle ✅, M4 Garage gameplay ✅** — see git history / previous plan; all still working.
- **M5 World & life ✅**
  - Hilly countryside (5 hill masses incl. the Hirvimäki mountain), lake, fields, forests; roads with bends, max ~14–16% grade.
  - Ruskala village with 8 working businesses, houses, street lamps, church; gas station with pay-per-litre pumps and an air pump; scrapyard; two farms.
  - 14 NPCs with opening hours and simple routines; talk (E) for dialogue and services; they comment on your car's state.
  - Jobs: post office parcels (timed, to 7 mailboxes around the map), Pertti's lawn (push mower cuts grass tufts), scrap metal (26 pieces scattered, sold by the kilo on the scale), Esa's workshop jobs (rebuild a customer's head / gearbox with the real fastener system).
  - Moped for early transport; phone (P): tow truck, taxi, jobs, rally status, parts ordering.
  - Inspection station (17 checks) gates Tier 2+ rallies.
  - Moose crossings on country roads.
- **M6 Rally ✅**
  - Stages: Harju (dirt, jumps), Hirvimäki (gravel switchbacks up a mountain, jumps), Kalliojärvi (rough lake gravel, 5 jumps), Metsätie (gravel), Ruskala Super Special (asphalt); all but the Super Special also run in reverse.
  - Bumps are real: a roughness map adds washboard/ruts to the wheel contact height (asphalt 8 mm … rough gravel 9 cm).
  - Jumps: kickers placed on straights; measured 0.5–0.9 s airtime at 80–100 km/h, landings can damage the car.
  - Pace notes generated from curvature (hairpins, 2–6, "don't cut", long), crests/jumps and rough sections; spoken + subtitled.
  - Events T1–T5 (1, 2, 3, 4, 5 stages) with entry fees, eligibility (equipment, inspection, reputation), liaison deadlines (10 s/min late), maximum time on abandoned stages, service park repairs that cost money and time, AI field per stage, prizes, reputation, championship standings with rival points, champion ending.
- **M7 Polish 🟡**
  - ✅ Tuning screen: tyre pressures, toe, ride height, damper clicks (rally shocks), brake bias, LSD lock, carb mixture & idle, ignition advance (with detonation damage) — all affect the simulation.
  - ✅ Paint shop: colour (12 + custom), stripe colour, liveries (stripes / side / full rally with sponsors / checkered roof), race number, mud flaps.
  - ✅ Rally light pod part; scrapyard used parts with unknown condition (inspect to reveal).
  - ❌ Other vehicles to drive, LOD system, tyre marks/dust particles.

## Verified in the running game (Chrome, scripted through the real input pipeline)
Everything from the first pass, plus:
- Roads render (they were back-face culled before — fixed), town and scrapyard build without errors, 14 NPCs present.
- Talk to Teppo → buy over the counter → item appears on the counter; Helena → parcels → wrong mailbox refused → right mailbox pays.
- Scrapyard: buy an unknown part (a battery that turned out to be 11%), scrap on the scale paid by the kilo; Esa's workshop job spawns its parts.
- Gas pump: nozzle → filler → 10 L for 79 mk, hose snaps back if you walk away.
- Inspection pass/fail; tuning slider changes engine output; paint shop applies colour, livery, number and mud flaps.
- Jumps launch the car (0.5–0.9 s) and it lands upright; road gradients capped at ~16%.
- Multi-stage event: SS1 → liaison → late start penalty → SS2 → results table, prizes, championship standings.
- Moped rides onto the main road at ~33 km/h; tow truck brings the car home; moose spawns and can be hit.
- Save → reload restores rally progress, inspection, jobs, moped, money.

## Known limitations
- AI rivals are times, not cars on the stage. AI pace is tuned for a careful driver; a good human in an upgraded car can win from Tier 1.
- The test autopilot is slower than a human, so stage times weren't balanced with real play.
- NPCs teleport home when off shift and walk in straight lines (they don't path-find around buildings).
- Some suspension bolts are still awkward to reach; the engine stand doesn't rotate.
- Graphics quality changes apply after a reload.
