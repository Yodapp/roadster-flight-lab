# Response to the independent review

27 October 2026 · Roadster Flight Lab 4.1

The central criticism is accepted: a converged solver can still give misleading conclusions when consequential supply and controller assumptions are hidden. The numerical comparisons below reproduce from `npm run audit-model`. The reviewer’s original file is unchanged.

| Finding | Assessment and action |
| --- | --- |
| Hidden regulator setpoint and loss | Confirmed. Both are inputs, included in gas-curve cache keys, the worked mathematics, exports and sensitivity audit. Added an explicit initial-state throat sizing action and a pressure-boundary inventory diagnostic. That inventory is not labelled as gas guaranteed available at rated thrust. |
| PR pressure and temperature bias | Independently reproduced using pinned CoolProp 8.0.0. Reference pressure is 492.475 bar versus PR 440.595 bar at the default fill. At 117 kg remaining on the matched isentrope, reference temperature is −92.496°C versus PR −84.526°C. These differences are displayed beside the model’s gas results and documented in EOS_BIAS.md. The browser still uses PR. |
| Reversed flip / backward contact | Confirmed. Original policy gives −8.783 m/s longitudinal contact; continuing inherited rotation gives +0.414 m/s, with about 0.5 kg less gas. Added both policies and an adjustable absolute longitudinal contact limit, default 1.5 m/s. The driven default continues rotation; the original remains an explicit comparison preset. |
| World-zero yaw and lateral failure | Confirmed as a controller-dependent physical outcome. Added release-track heading hold and an explicit lateral target. The new target/damping are both expressed in the selected heading frame. This differs from the review’s scratch patch, which held heading but retained world-frame damping. The new yaw-only case is rotationally invariant; roll correction still causes sideways motion. |
| Failure attribution | README, page, math and exports now identify the supply/controller choices. A failed case does not establish that all flight strategies or hardware designs fail. A disabled jet is labelled as having no dedicated recovery strategy. |
| Ramp-only audit effects invisible | Added ramp energy and peak power to each sensitivity row. The same release state can legitimately produce the same flight while requiring more power on the ramp. |
| All-red map hides causes | Separated landing and hardware colours/counts. Below-floor mass cells are excluded, not integrated repeatedly at enforced mass. |
| Fixed driven-wheel fraction | Exposed the existing 0.55 assumption as a control and added a 1.0 sensitivity case. Neither is asserted to be measured axle-load distribution. |
| Radius labels and geometry | Distinguished the 10.873 m driven surface radius from the 10.978 m rolled airborne comparison. Corrected the unused analytic loop-radius diagnostic to use the hardware geometry. README describes the near-loop geometry implied by the assumed release state. |
| Export vector inconsistency | Also fixed top-level `contactVelocity` to contain the three-component vector rather than a scalar descent speed. |

## What the new comparisons establish

With the original controller, 60 bar and 58 mm throats reproduce **1.424 m/s** downward contact, **147.6 kg** gas consumed and **−97.3°C** PR tank temperature. That case passes the old downward/sideways/attitude checks, but its **−8.779 m/s** backward speed fails the new longitudinal check.

Combining those supply assumptions with continued rotation gives **1.342 m/s downward** and **+0.411 m/s longitudinal**, using **147.0 kg** gas. It passes the selected contact checks but still fails the **−80°C** cold-component screen: PR predicts **−96.7°C**. A successful trajectory therefore does not establish that the current assumed hardware package works.

The retained 15° roll / 10° yaw airborne comparison yields 2.772 m/s sideways under world-zero control. Release-track heading with damping in the same frame gives **1.647 m/s**, and still fails the lateral limit. The reviewer’s 1.280 m/s value belongs to its different world-frame damping policy; it is not a contradiction or a result claimed for this implementation.

One review statement was broader than the reproduced evidence: the original-policy map is not failing the thermal screen in every physically valid cell. For example, 2,250 kg / 20 kN passes its hardware and thermal screens but fails attitude. In the current explicit longitudinal-screen map, 6 of 66 valid original-policy cells pass hardware. The all-red combined map hid different failure causes; separating them is still the appropriate correction.

## Remaining work and limits

The reference EOS is **not yet integrated into flight**. A single initial-isentrope table does not cover adjustable gas mass, volume, temperature and regulator state. A proper replacement needs validated interpolation over the state domain, regulator enthalpy inversion and phase-boundary handling. A blanket −8 K correction would not be valid. Reference-state checks quantify the bias without pretending to recompute the coupled trajectory. The warmer sensitivity case’s reference-EOS landing/thermal result is still unverified.

The control options are comparisons, not a globally optimized policy. Actuator saturation, fault accommodation, measured nozzle data, full tank mass redistribution, real suspension/landing loads and whole-car CAD remain unresolved. Other fixed assumptions are catalogued in [MODEL_ASSUMPTIONS.md](MODEL_ASSUMPTIONS.md).

## Verification and artifacts

- 98 analytic, conservation, regression and presentation checks pass.
- `npm run check` validates all JavaScript modules.
- Browser checks pass for the main site and rebuilt standalone page: nine calculation cards, the regulator/controller presets, a 24-row sensitivity audit and the separated map counts. No browser console errors were observed; all ten embedded modules match the current source.
- [audit-results.json](audit-results.json) includes the original/current presets, regulator sweep, heading sweep, timestep convergence, signed longitudinal contact and vector impulse budgets.
- [reference-eos-check.json](reference-eos-check.json) records fixed-state reference results, CoolProp version/revision and the model-source hash; [script](scripts/verify-reference-eos.py) reproduces them.
- [EOS_BIAS.md](EOS_BIAS.md) identifies the primary reference equation and the scope of those comparisons.
