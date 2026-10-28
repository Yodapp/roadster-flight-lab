# Response to the follow-up review — version 4.2

27 October 2026. Read [REVIEW_FOLLOWUP.md](REVIEW_FOLLOWUP.md); the reviewer’s files are unchanged. The delivery artefact is removed, reference nitrogen properties are now integrated into flight, and the requested controller diagnostics and explanations are added. [audit-results.json](audit-results.json) and [README.md](README.md) contain the regenerated 4.2 results.

## 1. Delivery-loss artefact

Accepted. Previously, reducing assumed delivery pressure increased the pressure difference driving the aggregate feed orifice. The “loss +8 pp” benefit was an artefact of coupling two representations of the same restriction.

I chose the explicitly permitted **decoupling** option:

```text
p_nozzle = max(p_ambient, min(p_set, p_tank) × (1 − loss/100))
mdot_feed_max = 0.8 A_feed × orificeFlux(p_tank, p_ambient, T_tank, R)
                / sqrt(max(0.3, Z))
```

The feed calculation uses a tank-to-ambient maximum-capacity bound. Delivery loss affects the assumed downstream pressure and nozzle performance, but does not manufacture feed capacity. Tests cover fixed-state nozzle-force monotonicity, unchanged feed capacity across losses, area scaling, and rejected states with zero force/flow.

The named sensitivity row now lands **harder**:

| Reference EOS, same hardware/controller | Downward contact | Gas used | Minimum tank | Minimum flowing regulator |
| --- | ---: | ---: | ---: | ---: |
| Default 8% loss |0.989534 m/s |147.462 kg |−104.469°C |−106.867°C |
| Delivery loss +8 pp: 16% |1.311067 m/s |146.129 kg |−103.355°C |−108.330°C |

The regression asserts this ordering without retuning the controller. Isolating the delivery fix with the retained PR model also reverses the old artefact: default 0.738820 m/s versus 0.970471 m/s with +8 pp.

**What I did not change:** this is not a flow-dependent manifold-network solve. The nozzle pressure and feed-capacity bound are independent necessary screens and may not be jointly attainable. The interface and worked maths now say so. A full replacement must solve manifold pressure from feed inflow versus the sum of valve/nozzle outflows at that same pressure, then couple it to allocation and possibly plenum storage. That needs a different supply architecture and unmeasured regulator/line characteristics; I used the decoupling option to remove the stated artefact without inventing those data.

“More loss cannot help” is enforced as a fixed-state supply invariant. It is not claimed as a theorem for every closed-loop landing: altered early control can conserve gas or change burn timing. The requested default versus +8 pp landing comparison is explicitly tested and passes. The old row is superseded, not retained as evidence.

## 2. Reference EOS in flight

Implemented. The default is now `gasModel: 'reference'` in real-nitrogen mode. Two grids are shipped together in [reference-eos-tables.json](dist/reference-eos-tables.json), generated using pinned CoolProp 8.0.0 / HEOS nitrogen:

1. 126×217 nodes for T, p, h and isothermal heat demand as functions of specific entropy and log density.
2. 214×151 nodes for regulator T as a function of specific enthalpy and log absolute pressure.

[reference-eos.js](dist/reference-eos.js) performs bilinear interpolation. The initial entropy is found by inverting the first table at the actual initial temperature/density; adiabatic blowdown follows that entropy. Regulator temperature uses the current upstream enthalpy and selected outlet pressure. Isothermal heat demand uses a sampled reference derivative. These properties change pressure, flow, effective exhaust speed, controller timing, gas consumption and trajectory during integration.

Every table vertex has a phase/domain flag. A contributing saturation/liquid vertex rejects its cell. Invalid/solid/EOS-domain states also stop thrust and prevent a pass. Single-phase gas below the critical temperature remains allowed. No extrapolation or silent PR fallback is used. Invalid-state placeholders are not shown as measured/calculated cold minima or falsely reported as overpressure.

The two grids occupy **1,569,192 bytes** uncompressed and are embedded once in the standalone HTML. Browser operation needs no CoolProp installation or network service. The grid is somewhat denser than 100×100 because off-grid validation, especially at low density, justified refinement.

### Accuracy actually checked

| Independent check | Largest sampled discrepancy |
| --- | ---: |
| Direct tank T(s,rho) |0.13945 K |
| Tank pressure |0.48045% |
| Direct regulator T(h,p) |0.03216 K |
| Tank enthalpy → regulator lookup |0.34735 K |
| Initial inversion → blowdown → regulator |0.28537 K |
|610 actual flight samples: tank / regulator T |0.00890 /0.01841 K |
|610 actual flight samples: pressure |0.03233% |

[reference-eos-validation.json](reference-eos-validation.json) compares **70,843 queries** of the actual JavaScript interpolator with direct HEOS: cell centres, random off-grid queries, UI states and chained lookups. It found no accepted sampled phase mismatch. [flight-eos-validation.json](flight-eos-validation.json) checks 610 stored flight samples in five scenarios from their original initial constraints, including the additional inventory-curve interpolation. All 610 were inside the accepted single-phase domain. These are empirical bounds over the checked samples, not a proof over every continuous state.

### The +15°C case, rerun

| Current coupled reference-EOS run | Downward contact | Gas used | Minimum tank / regulator | Selected checks |
| --- | ---: | ---: | ---: | --- |
|20°C default |0.990 m/s |147.5 kg |−104.5 /−106.9°C |Contact passes; cold fails |
|35°C, i.e. +15°C |0.640 m/s |145.7 kg |−94.5 /−96.8°C |Contact passes; cold fails |

The warmer case **still fails the assumed −80°C thermal screen**. This is a recomputed trajectory, not an 8 K subtraction from PR.

**What I did not change:** reference equilibrium gas properties do not resolve tank-wall heat exchange, seal/wall temperature histories, nozzle condensation, idealized exhaust/flow laws or material qualification. Thus the property calculation is reference based within the validated interpolation domain; the whole thermal/component verdict is still conditional on those process and hardware assumptions. PR remains as a labelled comparison so the effect of the EOS can be inspected. Its analytic tests explicitly select PR rather than testing the reference default against PR identities.

## 3. Smaller points

- **Longitudinal limit:** retained the adjustable 1.5 m/s magnitude. Text now explains it is a small residual-motion proxy (5.4 km/h), on the same numerical scale as the vertical screen without physical equivalence. Forward/backward symmetry reflects missing tyre spin-up, rolling, braking and runway models. It is not a maximum safe wheel-landing speed.
- **Continuation:** added `continuationActivations`, counting branch entries rather than timesteps. The driven default must activate exactly once over its full flight; upright, stall, zero-rate airborne and pitch 90° cases must activate zero times. Quaternion-sign invariance remains covered. No gains or decision threshold were retuned.
- **Presets:** labelled the continued and shortest flips “same hardware,” with an explanatory note that only controller policy differs.
- **Failed jet:** the audit now identifies **Under 1**, nozzle index 0 at body position (−1.55, −0.72, −0.45) m, and identifies the absence of a dedicated recovery policy. The existing bounded allocator already sees that jet’s zero capacity and can redistribute commands; saying it performs no reallocation at all would be inaccurate. No failure-specific gains, target changes or recovery manoeuvre were added. Its current 21.124 m/s downward contact and 75.0 kg use are outcomes of that specified failure and controller, not a hardware-wide bound. No recovery controller was invented.

## Verification and deliverables

- Package and experiment exports bumped to 4.2.
- **115 tests pass**; JavaScript syntax checks pass.
- Audit regenerated with reference/PR comparisons, warmer and extra-loss cases, regulator/loss/heading sweeps, continuation counts and timestep convergence.
- README, visible mathematical workings, assumptions and [EOS_BIAS.md](EOS_BIAS.md) updated to the current model.
- Reproducible generators/checks: [build-reference-tables.py](scripts/build-reference-tables.py), [verify-flight-eos.py](scripts/verify-flight-eos.py), [verify-reference-eos.py](scripts/verify-reference-eos.py).
- Browser checks passed for both the local page and standalone build: reference/PR model selection, nine calculation cards, the 24-row audit and module workers. The reference map reports 3/66 landing passes, 2/66 hardware passes and zero combined passes; 55 below-mass-floor cells are excluded. No console errors were observed. All 12 embedded module/data assets match current source.
- Original review documents and the 4.1 response remain unchanged as historical records.

CoolProp's nitrogen implementation cites the Span–Lemmon–Jacobsen–Wagner–Yokozeki reference equation; phase flags and derivatives use its documented API. [Nitrogen equation and provenance](https://coolprop.org/fluid_properties/fluids/Nitrogen.html), [property API](https://coolprop.org/coolprop/HighLevelAPI.html).
