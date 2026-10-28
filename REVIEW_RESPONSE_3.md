# Response to follow-up review 2 — version 4.3

28 October 2026. The blocking finding in [REVIEW_FOLLOWUP_2.md](REVIEW_FOLLOWUP_2.md) is accepted. **The default landing verdict changes from pass in 4.2 to fail in 4.3.** The reference EOS remains in place; the change comes from enforcing feed inflow and nozzle demand at the same pressure.

My previous response framed the next feed calculation as requiring a different supply architecture and additional data. That was too broad: under the existing model's assumptions, the scalar pressure solve in Appendix A needs no new hardware inputs. The 4.2 contact pass used an optimistic bound precisely where its assumed flow and pressure could not be delivered together.

## What changed

- **Consistent feed pressure is the default.** After valve lag, the solver checks demand at the delivery-pressure ceiling. If demand exceeds the feed's capacity at that same downstream pressure, it bisects for a lower manifold pressure and caps the individual nozzle forces there. The controller gains, burn trigger, reference EOS, gas inventory, throat sizes and hardware defaults are retained.
- **The independent bound is an explicit optimistic comparison.** Selecting it reproduces the 4.2 trajectory. A passing headline in that mode is qualified as a pass under the optimistic feed bound.
- **Feed diameter is prominent.** The first sensitivity rows compare the current case, 100 mm, 120 mm and a 10% reduction, followed by the alternate feed model. The audit has 27 cases. Diameter is decisive for the downward-contact verdict with these other inputs held fixed.
- **The verdict history is stated plainly.** Version 4.1 failed at 3.02 m/s; the 4.2 feed decoupling changed PR's result to 0.739 m/s and a contact pass; reference properties then raised it to 0.990 m/s, still a contact pass. Version 4.3 restores consistent feed pressure/flow and the default fails again. The EOS did not cause the 4.2 improvement.

## Pressure/flow calculation

```text
p_ceiling = max(p_ambient, min(p_set, p_tank) × (1 − loss/100))
feed(p) = 0.8 A_feed × orificeFlux(p_tank, p, T_tank, R)
          / sqrt(max(0.3, Z_tank))
demand(p) = sum(min(lagged_force_i, nozzle_force_cap_i(p))) / v_exhaust
```

Use `p_ceiling` when its demand is within feed capacity. Otherwise solve `demand(p) = feed(p)` between ambient pressure and that ceiling. Failed and disabled jets remain zero. Gas inventory and the final partial contact step remain enforced. Diagnostics expose the solved pressure, demand, capacity, residual and binding duration rather than only a successful-looking trajectory.

This is the hydraulic closure requested in Appendix A. **Temperature and exhaust speed remain evaluated at the pre-solve delivery-pressure ceiling**, matching the review patch. They are not recomputed at the lower solved manifold pressure. That approximation remains explicit in the interface, maths, exports and audit; this is not a transient or fully coupled thermal plumbing model.

## Reproduced results

| Case | Contact down | Contact checks | Gas used | Feed binding | Minimum flowing manifold |
| --- | ---: | --- | ---: | ---: | ---: |
| Default 85 mm, consistent | 1.658775 m/s | Fail | 142.976 kg | 0.265701 s | 53.541 bar |
| 85 mm, optimistic 4.2 comparison | 0.989534 m/s | Pass | 147.462 kg | 0.000000 s | 59.203 bar |
| 100 mm, consistent | 1.136897 m/s | Pass | 146.478 kg | 0.236868 s | 56.961 bar |
| 120 mm, consistent | 0.926625 m/s | Pass | 147.885 kg | 0.000000 s | 58.708 bar |
| 85 mm, loss 16% | 1.727424 m/s | Fail | 143.305 kg | 0.233245 s | 53.121 bar |
| 85 mm, PR | 1.275056 m/s | Pass | 143.409 kg | 0.237686 s | 56.051 bar |
| 85 mm, +15°C | 1.042117 m/s | Pass | 143.170 kg | 0.211904 s | 58.046 bar |
| 85 mm, 60 bar / 45 mm throat | 1.672167 m/s | Fail | 166.943 kg | 0.296038 s | 35.271 bar |
| 120 mm, 50 mm throats | 0.595941 m/s | Pass | 150.013 kg | 0.059056 s | 56.046 bar |

The consistent default has zero positive feed-capacity deficit. The optimistic comparison retains a **53.084 kg/s peak deficit** at its assumed nozzle pressure. Its zero binding time means no pressure correction was applied, not that the assumed flow was feasible.

Default convergence at 6/3/1.5/0.75 ms is **1.653581/1.658775/1.662004/1.663707 m/s**: all fail the selected contact screen. The new implementation matches an independently reproduced Appendix A scratch run.

The 120 mm statement applies to **45 mm lift throats and this selected trajectory**. The existing 120 mm / 50 mm larger-feed preset is a different nozzle-demand case and can bind. “Pass” here means contact criteria only; these inverted-stunt cases still fail the selected −80°C gas-temperature screen and do not establish a buildable vehicle.

## Checks and retained assumptions

- `npm test`: **125/125 pass**; `npm run check`: all JavaScript syntax checks pass.
- `audit-results.json` regenerated for 4.3, including both feed modes, the diameter sweep, delivery-loss row and timestep convergence. The extra-loss row lands harder: **1.727 vs 1.659 m/s**.
- Direct CoolProp flight-path validation regenerated: **607 accepted samples** across five scenarios. Maximum sampled error is **0.00890 K** for tank temperature, **0.01841 K** for temperature at the delivery-pressure ceiling and **0.03233%** for tank pressure. Reference table data are unchanged.
- Browser checks of the editable app and rebuilt portable HTML reproduce **1.66 m/s** for the default and **0.99 m/s** for the explicitly labelled optimistic comparison. The 27-row sensitivity audit and map workers complete; mode-specific headings and map labels are verified. No browser errors or warnings were recorded.
- The actual CSV export callback was checked for consistent, optimistic, upright and stalled cases: **42 aligned columns**. The standalone embeds the tested sources and JSON data; its browser check used local HTTP, not a file-origin URL.

The new tests check mass-flow balance at the solved pressure, feasible unbound states, absent/failed jets, the 85/100/120 mm transition, preservation of the optimistic comparison, and explicit mode validation. Existing delivery-loss, phase/domain, conservation, continuation and controller regressions remain active. No thresholds or controller gains were relaxed to obtain a pass.

The reference EOS tables and their accepted interpolation validation are retained. The entropy-inversion comment now explains that its scan happens while constructing cached inventory curves, including isothermal rows, not on each flight timestep. The README quotes absolute enthalpy error rather than the misleading relative error near the arbitrary enthalpy zero.

The existing regulator setpoint and fractional derating are retained as a pressure ceiling. Regulator dynamics, manifold storage, actual line coefficients, temperature at the solved pressure, tyre/suspension contact and qualified component ratings remain unresolved. These limitations do not justify returning to the optimistic bound as the default.

The original review files and earlier responses remain unchanged as historical records. Current numbers are in [audit-results.json](audit-results.json), with interpretation in [README.md](README.md) and [MODEL_ASSUMPTIONS.md](MODEL_ASSUMPTIONS.md).
