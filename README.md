# Grok fork: "Real demo, real stunt, not real flight"

**Live site:** https://yodapp.github.io/roadster-flight-lab/ (Swedish first, English toggle)  
**Anders' full simulator, Grok-tuned:** https://yodapp.github.io/roadster-flight-lab/dist/  
**Game – "Sätt dig vid ratten":** https://yodapp.github.io/roadster-flight-lab/game/

## Credits and permission

The original **Roadster Flight Lab** was created by **Anders Bjarby**:

- Repository: https://github.com/fltman/roadster-flight-lab
- Live site: https://bjarby.com/roadster/

This fork is modified and published **with Anders' permission**. He confirmed this in writing ("helt ok"). The original repository has no license file, and this fork **does not add one on his behalf**. All rights to the original work remain with Anders Bjarby.

## The game: "Sätt dig vid ratten" (`game/`)

A mobile-first three.js game (no build step, three@0.170.0 from jsDelivr) where you drive the four demo stunts yourself:
0–60 mph with jet timing, the loop ramp (suction, release inverted, roll upright, land), the kickflip over a row of
stylized Cybercab/Cybertruck/Semi/Model Y/Model 3 shapes (no logos), and a vertical hop with a corkscrew. Plus free drive.

* `game/sim.js` – pure, node-testable physics: 250 kg tank / ≈ 90 kN·s usable impulse (same `grok/physics.js`
  blowdown tables as the analysis), 80 kN rear jets, 60 kN lift jets, attitude thrusters, fan suction ≈ 2 g,
  loop-ramp normal force with detachment, landing judged on vertical speed, tilt and side speed.
* `game/levels.js` – level rules, star ratings and best scores (localStorage).
* `game/main.js`, `car.js`, `world.js`, `fx.js`, `audio.js`, `strings.js` – rendering (PBR, environment map, bloom,
  adaptive quality), cockpit/chase cameras, touch + keyboard controls, synthesized WebAudio, haptics, SV/EN.
* `tests/game-physics.test.mjs` – the levels are beatable, fans matter, air runs out, scores persist.

The game uses our physics estimates, not Tesla data. Built on Anders Bjarby's Roadster Flight Lab with his permission.

## What this fork adds

1. **A verdict-first landing page** (`index.html`, `grok/`):
   - The answer up front: real demo, real stunt, not real flight.
   - The key numbers:
     - 250 kg of air in 600 L ≈ 437 bar.
     - One charge gives ≈ 90 kN·s, or ≈ 1.1 s at 80 kN.
     - 80 kN × 5.5 s would need ≈ 810–990 kg of air.
2. **All four stunts in a three.js 3D view.** three.js loads from a CDN and lazily, so the numbers render first. The stunts are:
   - the ramp flip
   - the no-ramp kickflip over five vehicles
   - the vertical hop
   - 0–60 mph in 0.81 s

   Each stunt shows its gas cost against the 250 kg budget and has adjustable assumptions.
3. **An interactive impulse-budget gauge.** Thrust × seconds sliders show why "80 kN for 5–6 s" does not fit in one charge.
4. **Real air instead of nitrogen.** This follows Musk ("ultra high-pressure air") and Car and Driver ("250 kilos of compressed air"). The details:
   - New CoolProp 8 tables for air: `dist/reference-eos-tables-air.json`, built with `scripts/build-reference-tables.py --fluid Air`, plus the validation file `reference-eos-validation-air.json`.
   - A 19 kB blowdown table for the landing page: `grok/air-tables.js`, built by `scripts/build-grok-air-tables.py`.
   - Nitrogen (the original choice) is still selectable in the simulator.
5. **Sensible, transparent and adjustable landing limits in Anders' simulator.**
   - A new "Landing limits" group and a *Realistic (Grok default) / Strict (original)* switch.
   - The original 1.5 m/s touchdown screen is stricter than stepping off a kerb.
   - With realistic limits (3 m/s vertical, 2 m/s sideways, 6 m/s longitudinal), his own model lands the ramp stunt using ≈ 133–143 kg of air.
   - The physics `DEFAULTS` are unchanged, so every original regression test still runs against the original configuration.
6. **Tests.** `tests/grok-physics.test.mjs` covers:
   - the air EOS (≈ 437 bar)
   - the impulse budget and the 80 kN × 5.5 s check
   - each stunt model
   - the animation timelines
   - a cross-check against Anders' simulator

   `npm test` runs 149 tests: 134 original and 15 new.

Tesla figures are **claims** from the presentation and press. Grok's assumptions (mass 2,200 kg, nozzle models, heights and distances) are labelled on the page and can be adjusted.

```sh
npm test            # original + Grok tests
npm run check       # syntax of dist/ and grok/
npm run dev:grok    # serve the repo root → http://127.0.0.1:4173/ (landing page) and /dist/ (simulator)
```

---

*Everything below is Anders Bjarby's original README.*

# Roadster Flight Lab 4.4 — driven ramp and 3D flight

Updated 28 October 2026. This independent model investigates the Roadster ramp stunt using assumed hardware and generic controls. It does not authenticate footage, reconstruct measured Tesla telemetry, or qualify a buildable vehicle.

## Open and reproduce

Public repository: [fltman/roadster-flight-lab](https://github.com/fltman/roadster-flight-lab). Clone it with `git clone https://github.com/fltman/roadster-flight-lab.git`, then `cd roadster-flight-lab`.

Open **[roadster-flight-lab.html](roadster-flight-lab.html)** in a modern browser. It embeds the physics, controls, workers and reference JSON tables in one portable file. Use a modern browser with JSON-module support. Google Fonts are optional; system fonts work offline.

```sh
npm run dev          # editable app at http://127.0.0.1:4173
npm test             # regression, analytic and conservation checks
npm run check        # JavaScript syntax
npm run audit-model  # regenerate audit-results.json, including convergence
npm run standalone   # rebuild the portable HTML
```

`dist/` contains editable source, not generated build output. The old `simulate2D` remains only for explicitly separate analytical benchmarks; the application uses `simulateStunt` for a driven ramp followed by `simulate3D`, or `simulate3D` alone for isolated flight experiments.

## What changed in 4.4

The page now opens with the interactive simulation, followed by its controls, the worked mathematics and the results. Review history is in a collapsed section near the model notes.

The larger replay has a perspective camera, shaded vehicle and ramp geometry, cold-gas plumes, a telemetry HUD, attitude indicator and ten individual thruster bars. Follow, overview, side and top views support orbit/zoom, keyboard controls and a theater view. Phase buttons jump to ramp start, release, burn command and contact. During the climb the HUD shows suction force, fan electrical input, leakage airflow and wheel-drive/total power; flight switches to gas, nozzle pressure and thrust. The **Thrust + forces** overlay shows gold thrust arrows at each active nozzle and a prominent cyan **NET THRUST** arrow, all with calculated kN labels. Individual arrows point along the reaction force, opposite the gas plume, and follow the vehicle attitude. Arrow lengths are scaled and capped for readability; labels retain the actual force. Gravity and the selected ramp forces are also shown. At first contact the live jet bars and plumes switch off, while plots and exports preserve the pre-impact force sample; this does not simulate a post-impact shutdown transient. The visual car is illustrative geometry inside the contact envelope, not measured Tesla CAD; plume appearance does not model expansion or ground interaction. Camera changes do not affect the calculation.

**The opening scenario now targets a rear-toward-ramp landing**, following the user's observation of the demo. `demoOrientation` points the nose along the actual horizontal release velocity (about 180° for this ramp). Its calculated contact is **0.791 m/s down, 1.531 m/s sideways and 4.554 m/s longitudinally**: it still fails the selected landing limits. It uses **133.9 kg** of gas, with minimum tank/regulator-ceiling gas temperatures **−93.2/−95.6°C**. This is an explicit controller-target experiment, not a measured reconstruction of Tesla's control law.

The accepted `fullRun` case remains selectable as **Reviewed baseline**, with its **1.659 m/s** result unchanged. Unless identified as the opening demo-oriented scenario, the baseline numbers and sweeps below refer to that reviewed case. Controller gains and hardware inputs are unchanged. The audit includes both scenarios and their timestep checks.

## What changed in 4.3.1

[The review is closed](REVIEW_FOLLOWUP_3.md), with no remaining blocking findings. This patch adds the delivery-loss sweep explanation and makes the **2.45 m/s airborne baseline** explicit below. The solver and all numerical results are unchanged from 4.3.

## What changed in 4.3

**The default landing verdict changed from pass to fail: 0.990 m/s in 4.2 becomes 1.659 m/s in 4.3, above the selected 1.5 m/s limit.** The change comes from solving feed inflow and nozzle demand at the same pressure. Version 4.2 paired an optimistic tank-to-ambient flow bound with a nozzle pressure that could not be sustained during the final burn. The reference EOS, controller and hardware inputs are unchanged.

[REVIEW_RESPONSE_3.md](REVIEW_RESPONSE_3.md) responds to [REVIEW_FOLLOWUP_2.md](REVIEW_FOLLOWUP_2.md). The earlier responses remain historical records.

- **Consistent feed is the default.** At each applied valve-force state, use the delivery-pressure ceiling only if the feed can supply the demand there; otherwise solve a scalar pressure balance and reduce nozzle forces. The default binds for 0.266 s and reaches 53.54 bar manifold pressure. Actual demand never exceeds the modeled feed capacity at the solved pressure.
- **The optimistic bound is a labelled comparison.** It exactly reproduces the 4.2 contact pass, while revealing a peak 53.08 kg/s deficit between its actual flow and feed capacity at its assumed nozzle pressure. A pass in this mode is explicitly qualified.
- **Feed diameter decides this contact verdict.** With the same 45 mm lift throats, 85 mm fails, 100 mm passes and 120 mm never binds. These comparisons lead the 27-row sensitivity audit. They are assumed equivalent flow diameters, not measured Tesla pipes.
- **The thermal approximation remains explicit.** As in Appendix A, temperature and exhaust speed stay evaluated at the pre-solve delivery-pressure ceiling. They are not recalculated at the lower solved manifold pressure. This is a consistent hydraulic solve under that approximation, not a full thermal or transient manifold model.

### What changed in 4.2 — corrected verdict history

The 4.2 feed decoupling changed the default contact verdict from the 4.1 failure at 3.02 m/s to a pass: PR with the new optimistic bound gave 0.739 m/s. Replacing PR with reference nitrogen properties raised that to 0.990 m/s, still a contact pass. **The feed bound caused the apparent improvement; the reference EOS slightly worsened it.** That improvement was conditional on a pressure/flow pairing that the 85 mm feed could not deliver. Version 4.3 uses the consistent solve instead.

The reference tables, phase/domain checks, explicit controller choices, longitudinal screen and separated hardware/landing results introduced earlier remain. No controller gains, landing thresholds or thermal limits were retuned.

The following are reviewed-baseline results retained unchanged in 4.4. Unless stated otherwise: reference nitrogen, consistent feed, 2,200 kg wet mass, 250 kg gas in 600 L, 60 kN underside rating, 100 bar setpoint, 45 mm lift throats and continued rotation.

| Driven case | Contact down | Contact checks | Gas used | Minimum tank / delivery-ceiling gas |
| --- | ---: | --- | ---: | ---: |
| Reviewed baseline, 85 mm feed | 1.659 m/s | Fail | 143.0 kg | -100.7 / -103.1°C |
| 100 mm feed, same throats | 1.137 m/s | Pass | 146.5 kg | -103.6 / -106.0°C |
| 120 mm feed, same throats | 0.927 m/s | Pass | 147.9 kg | -104.8 / -107.2°C |
| 85 mm optimistic bound (4.2) | 0.990 m/s | Pass | 147.5 kg | -104.5 / -106.9°C |
| 85 mm, delivery loss 16% | 1.727 m/s | Fail | 143.3 kg | -101.0 / -106.0°C |
| 85 mm, initial/ambient 35°C | 1.042 m/s | Pass | 143.2 kg | -92.2 / -94.5°C |
| 85 mm, shortest flip | 1.727 m/s | Fail | 143.7 kg | -101.3 / -103.7°C |
| 60 bar / 58 mm throats | 1.276 m/s | Pass | 149.5 kg | -106.2 / -109.5°C |
| 120 mm feed / 50 mm throats | 0.596 m/s | Pass | 150.0 kg | -106.6 / -109.0°C |
| PR / 85 mm consistent feed | 1.275 m/s | Pass | 143.4 kg | -93.6 / -95.9°C |

**All these inverted-stunt cases still fail the selected −80°C gas-temperature screen.** A contact pass is not an overall hardware pass. The 120 mm / 50 mm preset can bind; “120 mm never binds” refers specifically to the 45 mm-throat comparison. Results depend on these chosen hardware and control assumptions and do not prove universal impossibility.

At 100 bar, the reference discharge path has **130.25 kg remaining** and **119.75 kg expelled**. This pressure boundary is not guaranteed rated-thrust inventory. The audit records full signed impulse budgets and counts landing/hardware separately. Cells below the mass floor are excluded rather than repeatedly simulated at the same enforced mass.

The larger-feed airborne comparison (120 mm feed / 50 mm throats, 15° roll / 10° yaw) still exposes controller dependence: world-zero heading gives **2.771 m/s** sideways, while release-heading control gives **1.646 m/s**. Neither is an optimized lateral-control solution.

## Read the result and the mathematics

First-time visitors see a short invitation and the full-width replay. Main assumptions sit beneath it; the worked mathematics comes next, then the result, sensitivity and hardware sections. The three-part verdict remains available under “All three model checks” in Results. Release history is collapsed near Model & limitations. Detailed hardware inputs remain grouped in closed disclosures.

The **Calculations** section follows the simulator. Nine live explanations show mass, fan airflow/power, ramp drive, gas storage, regulator pressure, thrust/impulse, three-axis motion, first contact, and cooling. Each shows a key formula and answer, with expandable substitutions, symbol definitions, units and limitations. All values are generated from the current simulation result. The ideal reference examples remain separate from the full model. The mathematics presentation does not change the solver.

The landing threshold table compares actual values against the selected limits. The prominent metrics now include sideways contact speed and minimum gas temperature, alongside downward contact speed and gas use. “Play replay” and “Jump to release” describe what those controls do; input changes recalculate automatically.

## The demo starts by driving up the ramp

The default replay now starts **at rest at the foot of a planar circular ramp**. It integrates the climb before release, rather than placing the car upside down in mid-air. At the default 170° release, the circular surface ends about **21.6 m above** and **1.9 m horizontally from** its foot. The body’s lowest point is 20 m above ground. This near-loop geometry is not a generic short ramp followed by a ballistic rise. This is an assumed trajectory, not a measured reconstruction of the video; there is no straight approach or ramp-entry curvature transition.

Wheel drive force is bounded by its selected low-speed limit, available tyre grip and electrical motor power. Fan suction builds over time. Motor and fans share the battery power budget. Gravity, pitch inertia, CG offsets, rolling resistance and frontal still-air drag enter the ramp calculation. The model stops the attempt on a stall, loss of adhesion, insufficient seal travel, energy exhaustion or unsupported geometry. It does not invent a flight or landing after a failed climb.

A successful climb passes its actual position, velocity, quaternion and angular velocity continuously into the ten-jet flight solver. Gas inventory is unchanged during the climb because the ramp uses wheel drive and fans. Achieved speed can be below the target. Actual driven-ramp results supersede the older constant-speed grip/normal/power screens.

With the current **assumed 30 kN wheel-force limit**, 200 kW motor electrical budget and 2× weight suction, the default takes about **8.68 s** to reach release at **4.00 m/s**, consuming **0.233 kWh** on the ramp, with roughly **137 kW** peak combined motor/fan draw. The 8 kN wheel-force preset stalls. These are model outputs, not measured Tesla performance.

The larger-feed full run reaches **0.596 m/s** downward with minimum tank gas **-106.6°C**. The reviewed baseline reaches **1.659 m/s** and fails contact, with tank gas **-100.7°C**. Both fail the cold screen. Planar presets have zero bank/heading offset, unlike the rolled airborne comparisons below.

Ramp equations use surface radius R, geometric-center radius r₀=R−h/2, CG radius r=r₀−zCG, forward CG offset xCG and angular speed ω. With a planar circular constraint:

    J = m(r² + xCG²) + Iy
    J α = R(Fwheel − Frolling) − mg(r sinφ + xCG cosφ) − Fdrag r₀
    N = Sfan + mg cosφ + m(rω² + xCG α)
    Pwheel = Fwheel Rω;  Pmotor = Pwheel / 0.90

The tests compare integrated mechanical work with kinetic plus gravitational potential energy, including offset CGs. Tyre spin, individual axle loads, wheel rotational inertia, suspension articulation, banked-road dynamics and wind on the ramp remain unresolved. A zero-angle ramp cannot reach a positive release height and is explicitly rejected; use airborne-only mode for an elevated upright drop.

## Airborne comparison, with reference EOS and consistent feed

These comparisons retain 15° roll, 10° yaw, world-zero heading, 170° uphill pitch and inherited ramp angular rate. Both fail lateral, longitudinal and thermal screens.

The 85 mm-feed / 45 mm-throat airborne baseline now reaches **2.45 m/s downward** (2.449 m/s below), replacing the earlier 1.69 m/s result after the consistent-feed correction. This is the airborne comparison, separate from the reviewed driven baseline at 1.659 m/s.

| Output | Baseline | Larger feed |
| --- | ---: | ---: |
| Shared feed / lift throat | 85 / 45 mm | 120 / 50 mm |
| Downward contact | 2.449 m/s | 0.858 m/s |
| Sideways contact | 2.780 m/s | 2.771 m/s |
| Longitudinal contact | -7.727 m/s | -7.701 m/s |
| Gas used | 147.7 kg | 158.7 kg |
| Flight duration | 2.389 s | 2.447 s |
| Minimum tank | -104.7 °C | -114.0 °C |
| Minimum delivery-ceiling gas | -107.1 °C | -116.4 °C |

The upright 5 m control drop passes the selected checks at **0.604 m/s**, using **51.5 kg** gas. It is a simpler control experiment, not a reconstruction of the inverted stunt.

## Errors corrected

- **Release pitch sign:** standard quaternion pitch pointed the nose opposite the vertical component of release velocity. User pitch is now consistently interpreted as uphill ramp angle; exported Euler ZYX pitch uses the standard right-handed convention.
- **Missing release rotation:** speed along a curved ramp produces angular rate v/R. The default includes it, with separate roll/pitch/yaw-rate perturbations and an explicit comparison switch.
- **Contact criterion:** previously only CG descent determined soft contact. The model now finds first contact of the rotating box, calculates v_point = v_CG + R(omega × r), and checks both downward and sideways contact velocity.
- **Load metric:** opposed jets consume gas but do not add their magnitudes to the vehicle's net acceleration. Scalar jet sum, resultant thrust load and seat specific acceleration are separate quantities.
- **Fan hold:** the old screen used unused maximum installed capacity instead of commanded suction. Static hold now uses actual selected force. Flight qualification uses minimum normal force over the actual selected ramp arc; upright experiments do not require an imaginary inverted section.
- **Ramp geometry:** surface height includes body depth. Curvature, CG travel radius and the finite arc are treated consistently in the separate ramp screens.
- **Feed-aware braking:** the trigger now includes aggregate feed flow capacity, rather than using only the sum of nozzle ratings.
- **Numerics:** midpoint angular integration substantially reduces torque-free energy/momentum drift. Ground-contact time is root solved; a simulation timeout no longer reports fictitious ground contact.
- **Invalid gas states:** empty or overfilled EOS states no longer propagate NaN thrust. Nitrogen-specific phase flags do not incorrectly apply to ideal air.
- **Interface/export errors:** explicit all-jets-off switch, contact-vector CSV columns, correct heat-output fields, quaternion-derived replay attitude, Euler-wrap plot breaks, stale-worker cancellation and worker-construction error handling.

## Additional effects now available

The hardware controls include pure control-command delay (separate from valve response), driven-ramp parameters, steady wind, ambient pressure/temperature, initial angular rates, fixed CG offsets in three directions, inertia scale, valve response, a selected stuck-closed nozzle, component temperature limit, isothermal heating capacity, tank installation clearance, ancillary mass and peak battery power.

Drag is calculated from relative wind and an orientation-dependent effective CdA: 0.65 m² frontal, and assumed Cd=1.1 times side/broadside projected area. Its force acts at the assumed geometric center, so an offset CG also introduces an aerodynamic moment. This is a sensitivity approximation, not measured CFD or wind-tunnel data.

The seat calculation uses a point at (-0.2, +0.45, +0.1) m in body coordinates and includes alpha × r and omega × (omega × r), plus translational specific acceleration. It covers the modeled ramp and flight phases, **not impact**, restraint loads, occupant tolerance or post-contact suspension motion.

The **Sensitivity audit** runs 27 deterministic scenarios, including the selected case. Its leading comparisons cover 100 mm and 120 mm feeds, a 10% feed reduction and the alternate feed model. It also varies mass, thrust, remaining gas, height, valve lag, three command-delay increments, wind, release rotation (or wheel force in driven mode), CG, inertia, failed jet without a recovery strategy, seal gap, temperature, regulator setpoint, delivery loss, rotation direction, heading target and driven-wheel load fraction, then combines several adverse changes. These are scenario comparisons, not confidence intervals or probabilities. The mass/thrust map uses the same 3 ms integration and allocator settings as the replay.

## Fan, ramp and electrical demand

For the baseline, twice vehicle weight over a sealed 4 m² needs 10.79 kPa pressure difference. A 10 m seal perimeter with a 2 mm average gap and 4 cm² extra leakage gives **1.87 m³/s inlet flow and 37.5 kW electrical fan input**, assuming Cd=0.65, fan efficiency 55%, motor efficiency 94%. A 15 mm gap raises the target to about 13.8 m³/s and 276 kW.

Compressible orifice inflow includes choking. Compression work uses ambient-temperature, well-mixed plenum gas. Available suction is bounded by electrical power, an assumed 45 m/s face-flow limit, and approximate rotor head. Actual duct losses, fan curves and skirt transients remain unknown.

The retained airborne baseline (15° roll) has surface radius **10.978 m** and CG radius approximately **10.378 m**. The driven default (0° roll) uses **10.873 m** surface radius and **10.273 m** body-center radius. Flat sealed length 2.8 m needs about **120 mm** total following travel, including 30 mm ride clearance; the old 127.7 mm estimate used clearance as surface height. Default available travel 150 mm is still an assumption.

Airborne-only mode retains a separate constant-speed ramp screen: N=S+mg cos(phi)+mv²/R_CG, with driven-wheel grip mu × driven-normal-load-fraction × N. Its combined fan plus gravity-climb electrical estimate is approximately **133 kW**, compared with the adjustable 500 kW battery budget. Driven mode instead evaluates forces and electrical power throughout the actual climb. Both use an assumed fixed driven-wheel normal-load fraction; individual tyre contacts, axle load transfer and thermal derating remain unresolved.

Seal area must also fit its selected length and assumed vehicle width, and satisfy the isoperimetric bound A≤L²/(4π). This rejects impossible area/perimeter combinations. Passing these necessary bounds does not prove that the actual seal shape fits.

## Pressure, cooling and the heat budget

The default reference model gives about **492.6 bar absolute** for 250 kg in 600 L at 20°C (direct HEOS 492.475 bar; the small difference is interpolation). The optional PR comparison gives 440.6 bar; ideal air gives 351 bar. These are computed properties, not measured Tesla pressures.

Remaining well-mixed gas follows constant entropy in adiabatic mode. The reference EOS evaluates the regulator at constant enthalpy and the delivery-pressure ceiling:

    p_ceiling = max(p_ambient, min(p_set, p_tank) × (1 − loss/100))
    feed(p) = 0.8 A_feed × orificeFlux(p_tank, p, T_tank, R) / sqrt(max(0.3, Z))
    demand(p) = sum(min(lagged_force_i, nozzle_cap_i(p))) / v_exhaust

If demand(p_ceiling)≤feed(p_ceiling), the pressure ceiling is attainable under the model. Otherwise bisection finds the feasible root demand(p)=feed(p), with p between ambient and that ceiling. Each nozzle's force is capped at that common pressure. The 45 mm-throat, 85 mm-feed reviewed baseline is constrained for 0.266 s, giving 1.659 m/s downward contact. The 85/100/120 mm comparisons change only feed diameter.

**Temperature and exhaust speed remain fixed at the pre-solve ceiling during this hydraulic root**, following Appendix A. Evaluating gas properties again at the lower solved pressure and modeling transient manifold storage are still future work; no claim of complete thermodynamic closure is made. Throat sizing now checks feed capacity at the initial target pressure for consistent mode, but remains an initial-state calculation without a sustained-thrust or packaging guarantee.

The selectable optimistic comparison retains the tank-to-ambient capacity bound and independently capped nozzle pressure. It can pair unattainable pressure and flow; a contact pass in that comparison must not be quoted as the default result. The audit exports binding time, minimum flowing manifold pressure and maximum demand-minus-capacity deficit.

The reviewed driven-baseline delivery-loss sweep in [audit-results.json](audit-results.json) gives:

| Delivery loss | Downward contact |
| ---: | ---: |
| 0% | 1.597 m/s |
| 8% | 1.659 m/s |
| 16% | 1.727 m/s |
| 24% | 1.656 m/s |
| 40% | 2.647 m/s |

The 24% point is about 0.003 m/s softer than 8%: a closed-loop burn-timing and gas-state-history effect. The 8% and 16% runs are feed-limited below the delivery-pressure ceiling; the 24% run is not. Fixed-state capacity monotonicity does not imply monotonic touchdown speed in a controlled trajectory.

The reference tables cover entropy 3800–6300 J/(kg K), density 0.1–1000 kg/m³, enthalpy −150–700 kJ/kg and pressure 0.2–1000 bar. Bilinear interpolation uses log density/log pressure, with denser sampling where needed. Contributing liquid/saturation vertices reject a cell. Invalid/solid/EOS-domain vertices also stop thrust. Single-phase gas below the critical temperature remains allowed. No extrapolation or silent PR fallback is used.

[reference-eos-validation.json](reference-eos-validation.json) checks 70,843 queries against direct HEOS, including every cell midpoint, random off-grid states, initial inversion and chained tank-to-regulator paths. Maximum sampled errors are 0.4805% pressure, 0.1395 K direct tank temperature and 0.3474 K for chained tank-enthalpy-to-regulator temperature. Maximum sampled absolute enthalpy error is 712 J/kg; relative error near an arbitrary enthalpy zero is not informative. These are measured sample bounds, not a proof over every point.

[flight-eos-validation.json](flight-eos-validation.json) separately checks 751 actual flight samples across six scenarios, including the warmer case. Maximum errors are 0.00890 K tank, 0.01841 K regulator and 0.03260% pressure. Regulator-temperature checks refer to the delivery-pressure ceiling, not the lower solved manifold pressure. No sample in those six paths needed phase/domain rejection. [EOS_BIAS.md](EOS_BIAS.md) documents provenance and the retained PR comparison.

Isothermal operation requires heat:

    Qdot = mdot × (T/rho) × (partial p / partial T at fixed rho)

The derivative is sampled from the reference EOS. The larger-feed airborne isothermal case requires **16.44 MW peak heat transfer** and **5.897 kWh total heat** during 2.454 s of flight. Default heat-transfer capacity is 0 kW. Raising that control assumes external capability; heater/exchanger area, mass and packaging are not engineered.

The −80°C screen compares gas temperature with an assumed wetted-component operating limit. It does not calculate wall/seal transient temperature or prove material failure. Effective exhaust velocity, idealized nozzle flow, phase-change nozzle physics and actual materials remain separate limitations. Reference-quality state properties do not make the complete vehicle model reference-grade.

## Does it all fit?

The custom 400/200 L tank concepts are approximately 1.72 m × 0.70 m and 1.37 m × 0.57 m outside. Assumed bays are 1.75×0.82×0.80 m and 1.45×1.10×0.65 m. They pass the idealized geometry check with **zero extra installation clearance**, but **fail when 25 mm clearance is reserved on each side/end**. End fittings already have an allowance; extra clearance tests assembly, insulation and routing space.

Tank mass is estimated from pressure×volume divided by an adjustable PV/mass index, default 120 kJ/kg, giving 350 kg at 700 bar. A published Hexagon Purus 700 bar 360 L hydrogen vessel is 208 kg and 2.06 m long; it does not fit the assumed 1.75 m passenger bay. The shorter/wider vessels here need custom design. Hydrogen certification does not qualify nitrogen service.

Baseline minimum wet mass is 2,160 kg: 875 kg vehicle/driver excluding pack and flight kit, 575 kg 115 kWh battery, 350 kg vessels, 40 kg fans, 70 kg ancillary allowance and 250 kg gas. Battery volume 383 L fits an assumed 552 L floor bay. One driver remains; passenger and luggage spaces are consumed. Requested mass below the component floor is flagged and increased for flight integration.

**Actual whole-car installation remains unverified.** Bounding boxes and a mass allowance do not place all pipes, regulators, structural mounts, crush zones, insulation, cable paths or suspension travel. Plumbing/mount mass is now adjustable instead of silently fixed. Heat-transfer hardware is particularly unresolved. No CAD or qualified bill of materials is available.

## What still could change the result

- Gas-distribution-dependent CG and full inertia tensor as each tank empties; current CG is fixed and inertia a scaled uniform box.
- Measured nozzle locations/directions/flow curves, real valve hysteresis and regulator dynamics; pressure losses and plume interactions near the ground.
- Dynamic fan sealing, surface roughness, suspension articulation and ramp collision.
- Contact patches, tyre spin-up, suspension stroke/damping, landing impact forces and available runway.
- Regulator dynamics beyond the exposed setpoint/loss model, sensor noise, estimation error, stuck-open faults and fault-detection strategy; current failure is known stuck-closed from release. Pure command delay is now modeled, but does not substitute for a complete sensor/estimator simulation.
- Transient tank-wall heat transfer, nozzle phase changes and actual component temperature qualification.
- Optimized, robust controls and reconstruction from synchronized video/telemetry. The current generic controller may fail where another strategy succeeds.

Those remain explicit unresolved requirements. The model must not imply that a green cell validates a real vehicle.

## Further corrections in version 4

- A causal command-delay queue splits integration at exact arrival times; fractional delays are not rounded to the physics step. Existing valve lag remains separate. In the current larger-feed airborne experiment, 50 ms command delay increases downward contact speed from 0.858 to about 1.696 m/s; 100 ms gives about 8.113 m/s. This is sensitivity to the chosen controller, not a universal minimum latency requirement.
- Initial ground contact and exact requested time limits no longer allow extra integration or gas consumption.
- An inactive regulator no longer creates a fictitious low-temperature failure when no gas flows.
- Failed ramp attempts have no touchdown values. Playback and CSV explicitly distinguish ramp and flight.

## Verification

134 tests cover analytic free fall, constant-exhaust impulse conservation, independent NASA sonic-flow formula, reference EOS domain/phase and coupled-flight checks, explicit PR entropy/enthalpy and isothermal first-law checks, contact-point kinematics, failed-nozzle forces, wind-relative drag, CG moments, torque-free angular conservation, thermal and power screens, worked-calculation consistency, seal geometry, driven-ramp work/energy and electrical limits, exact ramp-to-flight state continuity, stalls, pure control delay, packaging margin, timestep convergence and both failing-stunt and passing-upright regressions, outbound-heading covariance, zero-speed heading fallback, shortest-arc replay interpolation and live thruster shutdown at contact without changing recorded forces. See [MODEL_ASSUMPTIONS.md](MODEL_ASSUMPTIONS.md) for exposed and fixed assumptions, and `audit-results.json` for repeatable numerical comparisons at 6, 3, 1.5 and 0.75 ms.

Browser QA checks the replay-first flow, four camera views, keyboard orbit/zoom, theater entry/exit, mobile layout, phase jumps, presets, sensitivity and map workers. Playback is user-started and pauses when the stage leaves view or the tab is hidden. CSV has 42 columns, including phase, ten jets and the contact-velocity vector and seven feed-pressure/flow diagnostics. Flowing-regulator temperature is blank when no gas flows. The portable file embeds the tested modules; file-origin browser automation is unavailable here.

## Sources

- [Tesla: The Ramp](https://www.youtube.com/watch?v=7p5LxFdc-Qg): original verified-channel clip; expanded description explains fan adhesion and cold-gas attitude control.
- [Tesla: Roadster Event](https://www.youtube.com/watch?v=qt5p-_tE8d0): gas capacity/nozzles at 12:03–12:21; four rear thrusters at 17:54–18:07. >80 kN rear thrust is not a vertical-thrust measurement.
- [ElonsFAQ transcript](https://elonsfaq.org/i/qt5p-_tE8d0): explicitly third-party reproduction, not independent measurement.
- [Top Gear: firsthand Roadster presentation](https://www.topgear.com/car-news/electric/tesla-roadster-has-finally-landed-thrusters-0-60mph-059s-and-flight): 200 L rear tank and added 400 L replacing the passenger seat.
- [NASA Glenn: Specific impulse](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/specific-impulse/): force, effective exhaust velocity, impulse and gas flow.
- [NASA Glenn: Mass flow choking](https://www.grc.nasa.gov/www/BGH/mflchk.html): compressible nozzle flow limits.
- [NASA Glenn: Isentropic flow](https://www.grc.nasa.gov/www/k-12/airplane/isentrop.html): pressure, temperature and nozzle-expansion relations.
- [NIST: Peng–Robinson](https://trc.nist.gov/TDE/Help/TDE103b/Model_Fitting_Control_Center/Activity_Coefficient_Model_Fitting/BinaryEOS-Peng-Robinson.htm): EOS and coefficients.
- [CoolProp: Nitrogen](https://coolprop.org/fluid_properties/fluids/Nitrogen.html): nitrogen constants and the higher-accuracy reference Span EOS. This app interpolates shipped tables generated with CoolProp 8.0.0; PR remains an optional comparison.
- [Hexagon Purus: Type 4 mobility cylinders](https://s3.eu-central-1.amazonaws.com/hexagonpurus-website/Type-4-Mobility-Hexagon-Purus-Datasheet.pdf): actual vessel mass and external dimension scale, not Tesla hardware.
- [Swagelok: Regulator freezing](https://www.chicago.swagelok.com/resources/how-tos/first-aid-for-your-regulator): effects of pressure reduction/cooling on regulators.
- [McMurtry: Upside-down driving](https://mcmurtry.com/upside-down-driving/): earlier manufacturer fan-car demonstration; not validation of Tesla's system.
- [Rhett Allain: WIRED physics analysis](https://www.wired.com/story/physics-behind-tesla-flying-roadster/): original commentary on endurance and acceleration. Its video-derived acceleration concerns the separate fleet jump, not this ramp calculation.

- [NASA: drag equation](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/drag-equation/): relative airflow, reference area and orientation matter; coefficients need measurement.
- [MIT: rigid-body velocity and acceleration](https://ocw.mit.edu/courses/16-07-dynamics-fall-2009/befffaf20475c1a379c3ac52e91a78cb_MIT16_07F09_Lec21.pdf): contact/seat rotational kinematics.
- [Swagelok: regulator selection](https://www.swagelok.com/en/blog/five-steps-choose-regulator): operating temperature and media compatibility require component selection.
