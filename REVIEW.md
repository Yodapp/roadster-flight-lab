# Review of Roadster Flight Lab 4.0

Reviewer notes for the creator. 27 October 2026.

Scope: every module in `dist/`, the tests, `audit-results.json` and the README were read; the key equations were re-derived by hand; `npm test` and the page at http://127.0.0.1:4173/ were run; and extra experiments were run on a scratch copy of `dist/`. Nothing in this repository was modified. An independent nitrogen reference (CoolProp 8.0.0, Span and Wagner reference EOS) was used to calibrate the Peng–Robinson results. The patches for every experiment are in Appendix A so each number here can be reproduced.

## TL;DR

The code does what the README says it does. 80/80 tests pass, the README numbers reproduce, the integration is converged, the page runs without console errors, and I found no arithmetic or sign bug in the solver. The problems are in what the model silently assumes and in how the headline verdict is attributed.

1. **One hidden constant decides the landing verdict.** The regulator setpoint (100 bar, minus 8 %) is hard-coded in `hardware.js`. Only gas above that pressure is usable at full thrust, about 123 kg of the 250 kg. In the default run the supply collapses 0.2 s before touchdown. That, not the feed diameter as such, is why the ordinary-feed run lands at 3.1 m/s and the larger-feed run at 0.6 m/s. A 60 bar setpoint with throats resized brings the default run to 1.4 m/s. The setpoint is not an input, is not in the sensitivity audit and is not in the README list of things that could change the result.
2. **Peng–Robinson is about 10 % low on pressure and about 8 K warm on blowdown temperature** against the reference EOS at this density (1.33 times critical). Fill pressure is 492 bar, not 441. The coldest tank gas in the default run is about −92 °C, not −84.5 °C. The thermal screen is optimistic by about 8 K, and the one sensitivity case that cleared it (+15 °C ambient) probably does not survive a reference EOS.
3. **The controller flips the car the wrong way round and lands it driving backwards at 32 km/h.** The shortest-path attitude error reverses the 22 °/s the car inherits from the ramp. While reversing, the belly faces backwards at the 90° point and the underside jets add 11.5 kN·s to the backward motion. Continuing the loop rotation instead lands at +0.4 m/s longitudinal with the same gas and a slightly lower descent speed. Longitudinal touchdown speed is displayed but neither screened nor discussed.
4. **The sideways-speed failure in the airborne table is produced by the controller**, which yaws the car back to world heading 0 and levels a 15° roll with the underside jets. With yaw = roll = 0 the sideways speed is 0.000 m/s; holding the ramp heading roughly halves it.
5. Smaller documentation and UI issues are listed in sections 3 and 4.

The engineering conclusion ("this hardware with this controller does not pass these screens") still stands. But the README should say that the two decisive numbers, descent speed and sideways speed, are set by a hard-coded regulator assumption and by two controller choices, not by thrust, feed or gas inventory as the text presents it.

## 1. What was verified

### 1.1 Reproduction

- `npm run check` clean. `npm test`: 80 passed, 0 failed (Node 25.9).
- README and audit numbers reproduced from the modules: ramp 8.68 s, 4.00 m/s, 0.233 kWh, 136.7 kW; full run 3.119 m/s, 133.0 kg, −84.5 °C; larger-feed full run 0.601 m/s, −98.4 °C; airborne table (4.009 / 0.910 m/s, 2.796 / 2.772 m/s, 135.6 / 155.9 kg, 2.341 / 2.445 s, −86.7 / −104.7 °C, 2.58 g, 2.63 g); upright drop 0.604 m/s and 51.2 kg; fan 1.87 m³/s and 37.5 kW at 2 mm, 13.8 m³/s and 276 kW at 15 mm; ramp radius 10.978 m (roll 15°) and skirt travel 119.6 mm; tanks 1.72 × 0.70 m and 1.37 × 0.57 m; 350 kg vessels, 575 kg battery, 2,160 kg floor, 383 L pack; isothermal 14.88 MW and 5.37 kWh; control delay 0.91 → 1.85 → 8.12 m/s.
- Timestep convergence from audit-results.json: full run 3.109 / 3.119 / 3.123 / 3.126 m/s at 6 / 3 / 1.5 / 0.75 ms; ramp energy residual 0.14 → 0.003 J. Converged.
- Browser (Chrome): no console errors on load, sensitivity audit completes in 1.5 s (0 of 18 pass), envelope map in 6.5 s (0 of 121), all twelve presets render without NaN or undefined, and the verdict cards and tables match the audit JSON.

### 1.2 Equations re-derived by hand (all correct)

- Peng–Robinson: a(T), da/dT, d²a/dT²; entropy, internal energy, enthalpy and cᵥ departure functions; the isentropic Newton step (cᵥ/T); the isenthalpic regulator bracket. The implementation is right: an independent evaluation with the same constants gives 440.7 bar at the fill state, so the −10 % in 2.2 is the equation of state, not the code.
- Isothermal rigid-tank heat: Q̇ = ṁ (T/ρ)(∂p/∂T)ᵨ follows from d(mu)/dt = Q̇ − ṁh with (∂u/∂v)_T = T(∂p/∂T)_v − p. Ideal-gas limit ṁRT correct.
- Choked and subsonic orifice flux, fan compression work, rotor head and face-speed limits, isoperimetric seal bound, thin-wall vessel thickness.
- Ramp: J = m(r² + x²) + I_y, Jα = R(F − F_roll) − mg(r sin φ + x cos φ) − F_drag r₀ and N = S + mg cos φ + m(rω² + xα) both follow from the Lagrangian and the radial balance for a CG at (x, z) on the inside of a circle. Support height, surface radius R = h_surface / (1 − cos φ) and r₀ = R − 0.6 are consistent: the lowest body point is at exactly 20 m at release.
- Quaternion conventions: fromEuler (ZYX), rotate, q̇ = ½ q ⊗ ω_body, Euler's equation with the gyroscopic term, midpoint ω step, support() and contactState() with v_point = v_CG + R(ω × r), ramp release rate v / r_CG mapped into the body frame. The pitch sign (uphill = minus standard pitch) is consistent between ramp, flight and tests.
- Effective exhaust velocity: a plain converging (sonic) nitrogen nozzle fed at 92 bar and 271 K gives 521 m/s including pressure thrust. The model uses 529 m/s at that state (550 m/s × √(T / 293 K)). The 550 m/s assumption is consistent with a simple orifice and is not optimistic. A converging–diverging nozzle could reach about 630 m/s.
- Wall heat transfer bound (not in the model; supports its adiabatic choice): about 8 m² × 300 W/m²K × 60 K × 2.3 s ≈ 0.3 MJ against an ≈ 11 MJ drop in gas internal energy. Tank walls cannot rescue the cold screen.

## 2. Findings

### 2.1 The regulator setpoint is the decisive hidden assumption (`hardware.js`, `100e5`, two places)

Evidence from the default full run (85 mm feed, 45 mm throats; time measured from release):

| t_air (s) | clearance (m) | v_y (m/s) | tank (bar) | feed (bar) | feed limit (kg/s) | available lift (kN) | jets Σ (kN) |
|---|---|---|---|---|---|---|---|
| 1.51 | 6.33 | −14.06 | 263 | 92.0 | 292 | 60.0 | 51.1 (burn starts at 1.48 s) |
| 2.05 | 1.07 | −5.71 | 123 | 92.0 | 148 | 60.0 | 51.9 |
| 2.16 | 0.54 | −4.16 | 103 | 92.0 | 94 | 42.1 | 42.9 |
| 2.27 | 0.14 | −3.37 | 91 | 83.3 | 74 | 32.7 | 32.8 |
| 2.31 | 0.00 | −3.13 | 86 | 79.3 | 71 | 31.2 | 31.2, contact at 3.12 m/s |

The burn needs about 52 kN. From 2.1 s the tank is at the setpoint, the pressure difference across the feed path is only the assumed 8 %, and the deliverable lift falls from 60 to 31 kN. PR puts the tank at 100 bar with 127 kg remaining, so about 123 kg of the 250 kg is usable at full thrust (CoolProp: 119 kg). The run used 133 kg, everything above the setpoint plus a little at reduced thrust, and still arrived at 3.1 m/s.

Cross-checks:

- Starting the burn earlier does not help. Manual burn at 7, 8, 9, 10, 11 and 12 m gives 3.11, 3.06, 3.02, 3.03, 3.16 and 3.45 m/s. The landing is impulse-limited, not timing-limited.
- The larger-feed run (120 mm, 50 mm) lands at 0.60 m/s because its orifices still pass 115 kg/s at 61 bar. It ends with the tank at 66 bar and 101 kg left. The feed diameter matters only through how much flow survives once the tank is at or below the setpoint.
- The sensitivity case "+15 °C ambient" lands softer (2.19 m/s) for the same reason: warmer gas, higher pressure, more inventory above 100 bar.
- The 1,000 L preset lands at 8.9 m/s after 112 kg, which at its lower fill pressure is about all the gas above 100 bar. The packaging failure is real but is not the reason that landing fails.
- Setpoint sweep on a scratch copy, with throats resized so each underside jet still reaches its 15 kN rating at the new feed pressure and everything else default:

| setpoint (bar) | throat (mm) | descent at contact (m/s) | gas used (kg) | coldest tank gas (°C) | landing screen |
|---|---|---|---|---|---|
| 100 | 45 | 3.12 | 133 | −84.5 | fail |
| 80 | 50 | 2.30 | 140 | −90.5 | fail |
| 60 | 58 | 1.42 | 148 | −97.3 | pass |
| 50 | 64 | 1.25 | 150 | −99.6 | pass |
| 40 | 71 | 1.31 | 151 | −100.6 | pass |

The single most influential number in the model is one nobody can see or vary, and it is not a Tesla figure. The trade-off it controls (usable impulse against gas temperature) is exactly the trade-off a real designer would make.

Suggested action: make `regulatorBar` and the 8 % delivery loss explicit inputs with their own calculation card, add a setpoint case to the sensitivity audit, and state in the README that the ordinary-feed versus larger-feed difference is a feed-pressure-floor effect. A "size throats to the setpoint" helper would stop a setpoint change from silently changing thrust.

### 2.2 Peng–Robinson bias against the reference nitrogen EOS

CoolProp 8.0.0 (Span and Wagner 2000), same inputs:

| state | reference | model (PR) | PR error |
|---|---|---|---|
| 250 kg in 600 L at 20 °C | 492.5 bar (Z = 1.358) | 440.6 bar (Z = 1.215) | −10.5 % |
| same at 40 °C | 545.5 bar | 486.0 bar | −10.9 % |
| ideal air at 20 °C | 350.6 bar | 350.6 bar | none |
| isentropic blowdown, 130 kg left | −81.9 °C, 99.6 bar | −73.6 °C, 105 bar | +8.3 K, +5.7 % |
| isentropic blowdown, 117 kg left (full-run end) | −92.5 °C, 81.4 bar | −84.5 °C, 86.2 bar | +8.0 K, +5.9 % |
| isentropic blowdown, 90 kg left | −115.1 °C | −108.5 °C | +6.6 K |
| regulator outlet (isenthalpic to 79 bar) at 117 kg | −93.2 °C | −86.8 °C | +6.4 K |
| isothermal heat per kg at fill | 187.5 kJ/kg | 160.7 kJ/kg | −14 % |

At 417 kg/m³ the gas is 1.33 times the critical density, where cubic equations are known to be poor. Consequences:

- The README states 441 bar and 486 bar as model outputs. The reference values are 492 and 546 bar. The 700 bar rating screen still passes.
- The thermal verdict is optimistic by about 8 K at the point that matters. The default run's coldest tank gas is about −92 °C against the −80 °C screen (a 12 K miss, not 4.5 K). The larger-feed full run is about −106 °C rather than −98 °C. The sensitivity case that cleared the thermal screen (+15 °C ambient, −76.6 °C) would be around −85 °C with the reference EOS and would probably fail. That case was not rerun with a reference EOS; treat it as likely, not confirmed.
- The usable-gas boundary in 2.1 moves only slightly (123 → 119 kg).

Suggested action: replace PR along the isentrope and the isenthalpic step with a tabulated reference (a small JSON table of T(s₀, ρ) and p(s₀, ρ) from CoolProp covers every state the model touches), or at least quote the PR bias in the README next to the 441 bar figure. The cold screen should not rest on PR.

### 2.3 Flip direction: the controller reverses the inherited rotation and the car lands driving backwards

In `flight3d.js` the attitude error is the shortest rotation to the identity quaternion. At release the car is pitched 170° nose-up and still rotating nose-up at 22 °/s from the ramp. The shortest path (170° nose-down) kills that rotation and turns back the way it came. During the reversal the belly faces backward at the 90° point, so the underside jets, the only strong jets, push the car backward. Numbers for the default full run before the burn starts at 1.48 s:

| flip | scalar impulse spent (kN·s) | vertical impulse down / up (kN·s) | horizontal x-impulse (kN·s) | longitudinal speed at touchdown |
|---|---|---|---|---|
| as implemented (reverse) | 23.4 | 10.1 / 8.1 | −11.5 (adds to the backward motion) | −8.78 m/s, 32 km/h backwards |
| continue the loop rotation (patch in Appendix A) | 23.5 | 9.9 / 8.7 | +9.5 (brakes the backward motion) | +0.41 m/s |

With the continued flip the descent speed is 3.02 instead of 3.12 m/s and gas use is 132.5 instead of 133.0 kg (larger-feed full run: 0.594 m/s and +0.41 m/s). Attitude and rates at contact are unchanged. The default run therefore lands moving backward at 32 km/h with the nose pointing the way it drove up. The page prints "Horizontal speed: 32 km/h" in the outcome note and "−8.78 m/s" in the supply table, but the landing table does not screen it and the README does not mention it.

Two related points:

- The 10 kN·s of downward impulse during the flip (the car is inverted, so the belly jets push it at the ground) must be bought back by the landing burn. This is inherent to unilateral belly jets, but the magnitude, about a sixth of the total impulse, is worth stating.
- The rear jets (four, modeled at 20 kN each, matching the manufacturer's "over 80 kN" claim) are never given a translational task; `worldForce[0]` is always 0. Asking them to damp v_x makes things worse with the reverse flip (6.1 m/s descent, gas competition) and is unnecessary with the continued flip (+0.55 m/s). The lever is the flip direction, not the rear jets.

Suggested action: add a flip-direction switch (shortest path, continue ramp rotation, or automatic by the sign of ω · axis), display and preferably screen the longitudinal touchdown speed with its sign and meaning, and state in the README that the generic controller's flip direction costs about 20 kN·s of horizontal impulse.

### 2.4 Sideways contact speed in the airborne comparison is a controller artefact

The attitude target is q = identity: roll 0, pitch 0 and world heading 0. The airborne baseline starts with 10° yaw and 15° roll, which are test perturbations, not measurements. The controller yaws the body back to heading 0 with the side jets (bounded at 2 rad/s²) while the velocity keeps the release direction, and it levels the 15° roll with underside jets whose body-z thrust then has a lateral component.

| airborne larger-feed case | sideways speed at contact |
|---|---|
| yaw 0°, roll 0° | 0.000 m/s |
| yaw 10°, roll 0° | 0.956 m/s |
| yaw 0°, roll 15° | 1.647 m/s |
| yaw 10°, roll 15° (the README table) | 2.772 m/s |
| yaw 10°, roll 0°, controller holds the ramp heading (patch) | 0.279 m/s |
| yaw 10°, roll 15°, holds the ramp heading | 1.280 m/s |

At contact in the README case the heading is 0.3° while the velocity direction is −160°: the car slides at 20° to its own axis because the controller chose to turn it. The README's "exceeds the chosen sideways speed" reads as a hardware or physics result. It is the generic controller's reaction to an assumed perturbation. The lateral channel is only a damping term (−0.8 m v_lat with weight 0.4), and the side thrust produced by the roll correction is not compensated by the nose jets.

Suggested action: target the release heading (or the velocity heading) instead of world zero, give the lateral velocity an explicit target, and say in the README that the sideways verdict depends on this choice. Holding heading alone is not a free fix: in the ordinary-feed baseline it raises descent speed from 4.0 to 4.6 m/s because yaw, roll and lift compete for the same gas.

### 2.5 What the generic controller costs overall

Scalar impulse in the default run: 64.2 kN·s from 133 kg (mean 482 m/s). Gravity over the 2.31 s flight is about 50 kN·s. The flip spends 23.4 kN·s, of which about 10 kN·s pushes down and 11.5 kN·s pushes backward. Impulse usable above the setpoint is about 123 kg × 480 m/s ≈ 59 kN·s. The budget is short by roughly the waste of the flip, which is why 2.1 and 2.3 together take the default run from 3.1 m/s to about 1.3 m/s without touching thrust, gas or feed. The README sentence "the current generic controller may fail where another strategy succeeds" is right and should carry these numbers.

One more controller observation: "First underside jet stuck closed" gives 27 m/s descent and 18 m/s sideways. Three jets (45 kN) could still carry the car; the allocator sacrifices lift to keep the torque balance. That is a legitimate result for this controller, but it should be labelled "no fault accommodation" rather than presented as a hardware sensitivity.

## 3. Things a reader may not realise the model assumes

- Ramp geometry. "20 m" is the lowest body point at a 170° release on a circular ramp, so the ramp is a 10.9 m radius loop whose release point on the surface is 21.6 m up, about 1.8 m horizontally from the foot. The car then falls back over the foot and touches down about 16 m behind it. If the real ramp is a shorter arc with a ballistic rise, the release state (4 m/s, 22 °/s, 170°) is not comparable. The README says the trajectory is assumed; it should say what the assumption implies.
- Two sensitivity cases do nothing in driven mode. "Average seal gap doubled" and "Wheel drive force −25 %" give results identical to the base case to three decimals, because both still reach release at the same time with the same state. Label them as ramp-only effects, or show a ramp quantity (battery energy, minimum normal force) in the audit table.
- The envelope map is uniformly red for the driven default because the thermal screen fails in every cell, so the map says nothing about the landing envelope. Colour landing screens and hardware screens separately, or show both counts.
- Map mass axis: 1,000 to 2,000 kg all collapse to the 2,160 kg floor, so five of eleven columns are the same case.
- Driven-wheel load fraction 0.55 (`drivenLoad`) is not an input. The Roadster is all-wheel drive; 1.0 would be defensible and the grip screen is conservative as it stands.
- Other hard-coded constants that are neither inputs nor audited: rear throats 52 mm with a 20 kN cap, nose throats 25 mm with a 6 kN cap, discharge coefficients 0.90 (nozzle), 0.80 (feed) and 0.65 (skirt), the 4 cm² extra leak, fan motor 94 % and drive 90 %, the 45 m/s face speed, controller gains 20 and 8, rate limits ±8 and ±2 rad/s², the trigger margin 1.12 × stop distance + 0.5 m, the −0.6 m/s descent target, the allocator weights and the 100 N thrust penalty, the seat position, bay sizes, the 552 L pack bay, the 1.95 m width in the seal bound, and the 8° and 12 °/s stability limits.

## 4. Minor issues

- README "corrected baseline surface radius 10.978 m" is the roll-15° airborne baseline. The driven default (roll 0) uses 10.873 m. Since the driven run is now the default, say which is which.
- `gasState().capacity` is only used by the retained 2-D benchmark. Harmless, but confusing next to the 3-D supply limits.
- `analytic().loopRadius` uses height / (1 − cos pitch) while `hardware()` uses the surface height. The value is not displayed, so there is no visible effect.
- The outcome note's "Horizontal speed: 32 km/h" should say backward or forward relative to the nose (2.3).
- After 2.2 the thermal margin on the default run is about 12 K in the reference EOS, so the thermal verdict is not close in either EOS. Worth saying, so a reader does not assume a slightly different limit would flip it.
- Source claims (event date and timestamps, Top Gear, the Hexagon Purus 208 kg and 2.06 m figures) were not checked here.

## 5. Suggested order of work

1. Expose `regulatorBar` and the 8 % loss, add them to the sensitivity audit, and rewrite the feed-diameter story (2.1).
2. Replace the PR isentrope and isenthalpic path with a tabulated reference EOS, or state the bias (2.2).
3. Add the flip-direction switch and display or screen the longitudinal touchdown speed (2.3).
4. Target the release heading and add a lateral-velocity target (2.4).
5. README: attribute the descent and sideways verdicts to 2.1 to 2.4 explicitly, and add the ramp-geometry implication (3).

## Appendix A: scratch patches used for the experiments

All were applied to a copy of `dist/`. The copy with every flag off reproduces audit-results.json exactly (3.119 m/s, 133.0 kg and so on).

Regulator setpoint (`hardware.js`), two replacements plus the cache key:

```js
feedPressure=Math.max(ambient.p,Math.min((p.regulatorBar??100)*1e5,pressure)*.92)
state.capacity=bound((state.pressure-ambient.p)/((p.regulatorBar??100)*1e5-ambient.p),0,1)
const key=[p.gas,vol,!!p.realGas,!!p.blowdown,ambient.T,ambient.p,p.regulatorBar??100].join('/')
```

Heading hold and flip direction (`flight3d.js`, replacing the two lines that build `err` and `rotationError`; `const targetHeading=rad(p.yaw);` is computed once after the initial state is set):

```js
let err=qmul(qconj(s.q),(p.holdHeading?fromEuler(0,0,targetHeading):[1,0,0,0]));if(err[0]<0)err=err.map(x=>-x);
const errNorm=norm(err.slice(1));let errAngle=2*Math.atan2(errNorm,err[0]);const errAxis=errNorm>1e-8?err.slice(1).map(x=>x/errNorm):[0,0,0];
if(p.continueFlip&&errAngle>2.5&&errAxis.reduce((a,x,i)=>a+x*s.w[i],0)<0)errAngle-=2*Math.PI;
const rotationError=errAxis.map(x=>errAngle*x);
```

Rear-jet braking (`flight3d.js`): `worldForce=[p.brakeX?-m*p.brakeX*s.vx:0, -m*.8*s.vLateral, ...]`.

Reference EOS check (Python, CoolProp 8.0.0):

```python
import CoolProp.CoolProp as CP
rho=250/0.6; s0=CP.PropsSI('S','T',293.15,'D',rho,'Nitrogen')
CP.PropsSI('P','T',293.15,'D',rho,'Nitrogen')/1e5                      # 492.5 bar
CP.PropsSI('T','S',s0,'D',117/0.6,'Nitrogen')-273.15                   # -92.5 C
h=CP.PropsSI('H','S',s0,'D',117/0.6,'Nitrogen')
CP.PropsSI('T','H',h,'P',79.3e5,'Nitrogen')-273.15                     # -93.2 C
```
