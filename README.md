# JC'S CAR

A first-person car-building, life-sim and rally game for the desktop browser.
Three.js + Vite. No API keys, servers or downloads needed; all models, textures and sounds are procedural.

## Run it

```
cd jcs-car
npm install
npm run dev        # then open http://localhost:5173
```

`npm run build` makes a static build in `dist/` (serve it with any static file server, e.g. `npm run preview`).

## Controls

| Key | On foot | In the car |
|---|---|---|
| WASD / mouse | walk / look | throttle, brake, steer |
| Shift | sprint | clutch (hold) |
| Ctrl or C | crouch | |
| Z | lie on the creeper (slide under a raised car) | |
| Space | jump | handbrake (hold) |
| E | interact: pick up, remove part, open, get in | get out |
| LMB | fit part / tighten bolt / place / pour / eat / pump jack | |
| RMB | loosen bolt / hold to inspect a part / release jack | |
| R | rotate held part 90° | shift up (also mouse wheel) |
| F | flashlight / hoist hook action | shift down |
| G | put down what you hold | |
| Q / I | pocket small item / open pockets | |
| T | | tap: ignition on/off, hold: crank |
| L | | headlights |
| Enter | | start a rally stage (at a START arch) |
| (on the moped) W/S/A/D, E | ride / get off | |
| Tab (hold) | mechanic's eye: diagnostics + colour-coded fasteners | |
| M | map | map |
| P | phone: tow truck, taxi, jobs, rally status | phone |
| Esc | pause menu (save / load / settings) | |

Settings include quick fastening (one bolt does the whole group, still needs the right tool) and an automatic clutch.

## How to get the car running

1. Hold **Tab** next to the engine stand or the car to see what's missing.
2. The ratchet and socket case are in the top drawer of the red toolbox. With the ratchet in hand, press **E** on the socket case (or scroll near it) to change sockets.
3. Order missing parts and fluids on the computer in the house (delivered to the pallet outside the garage door after ~2 game hours).
4. Rebuild the engine in order (bearings → crank → pistons with rings, arrow forward → pump → pan → gasket → head → timing marks lined up → belt → covers → clutch → gearbox).
5. Unbolt it from the stand, lift it with the engine hoist (F at the hoist), roll it to the car and lower it onto the mounts.
6. Connect hoses, harness, fuel line, coil lead, exhaust, cables and the steering wheel. Fill oil, coolant, gear oil, brake fluid and petrol.
7. Get in, **T** (hold) to crank.

## Beyond the garage

- **Ruskala village** is east along Route 54 (the moped by your garage gets you there): parts store, shop, post office, Kaasu-Kalle gas station, Esa's workshop & paint shop, the inspection station and the Rally HQ with its service park.
- **Romu-Raimo's scrapyard** is west: cheap used parts of unknown condition, and he buys scrap by the kilo.
- **Jobs**: parcels (post office), mowing Pertti's lawn, scrap collecting, workshop jobs at Esa's. The notice board in the village lists them.
- **Rally**: pass inspection, build reputation from the Tier 1 Ruskala Sprint up to the five-stage SM Final. Every stage can be practised any time from its START arch.
- **Setup**: the tuning screen (at the garage, the gas station air pump, Esa's or the service park) and the paint shop.

See `DEVELOPMENT_PLAN.md` for architecture and status.
