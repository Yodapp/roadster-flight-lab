# Nitrogen properties: reference tables in version 4.4

The flight model uses CoolProp 8.0.0's HEOS nitrogen reference equation through two shipped tables. Peng–Robinson remains an explicit comparison, selected with `gasModel: 'pr'`. The original fixed-state bias check is retained; it no longer describes the default flight model.

## Runtime properties and validation

[reference-eos.js](dist/reference-eos.js) imports [reference-eos-tables.json](dist/reference-eos-tables.json). The 1,569,192-byte JSON contains both grids and provenance:

- **126×217 entropy/density grid:** temperature, pressure, enthalpy and `(T/rho)(dp/dT)|rho` for isothermal heat demand. Interpolation is bilinear in entropy and log density.
- **214×151 enthalpy/pressure grid:** regulator temperature, bilinear in enthalpy and log absolute pressure.
- **Initial state:** invert temperature along the first grid's entropy axis at the selected density. Each initial mass, volume and temperature therefore defines its own entropy; no fixed-isentrope correction is applied.
- **Phase handling:** contributing saturation/liquid vertices reject a cell; invalid, solid-region and out-of-domain states are also rejected. No extrapolation or fallback to PR occurs. Single-phase gas below the critical temperature is allowed. Flight stops gas thrust and cannot pass if its EOS state is invalid or phase limited.

Domain: entropy 3800–6300 J/(kg K), density 0.1–1000 kg/m³, enthalpy −150–700 kJ/kg and pressure 0.2–1000 bar. These are rectangular table bounds, not a claim that every cell is a usable gas state. The current UI's initial-state corner and representative cases are included in validation.

[reference-eos-validation.json](reference-eos-validation.json) compares the actual JavaScript lookup with direct CoolProp at **70,843 queries**, including all cell centres, random off-grid states, UI paths and chained lookups. Maximum sampled pressure error is **0.48045%**; direct tank temperature error **0.13945 K**; direct regulator-table temperature error **0.03216 K**; tank enthalpy followed by regulator lookup **0.34735 K**; and initial inversion followed by blowdown/regulation **0.28537 K**. No accepted sampled phase mismatch was found. Enthalpy relative error near its arbitrary zero is not a useful metric, so absolute and downstream temperature errors are included.

[flight-eos-validation.json](flight-eos-validation.json) separately checks **751 actual stored flight samples** against direct HEOS from the original initial-state constraints. Its six cases are the reviewed baseline, demo orientation, +15°C, +8 pp loss, isothermal upright control and 60 bar preset. Maximum tank-temperature error is **0.00890 K**, regulator-temperature error **0.01841 K**, pressure error **0.03260%**, and isothermal heat-demand error **0.00666%**. These six paths have no phase/domain rejection. The check includes the simulator's additional inventory-curve interpolation.

These are empirical interpolation checks, not guaranteed error bounds over every continuous point. Reference-quality equilibrium properties do not validate the assumed adiabatic tank, constant-enthalpy regulator, approximate feed/nozzle flow, transient component temperatures, materials or real vehicle.

## Coupled flight results

With the consistent hydraulic feed solve, the 20°C reviewed baseline reaches **1.659 m/s** downward and fails the1.5 m/s contact screen. Minimum tank gas is **-100.7°C**, and the gas temperature evaluated at the delivery-pressure ceiling is **-103.1°C**. At 35°C, contact is **1.042 m/s** and passes contact; tank/ceiling-gas minima are **-92.2/-94.5°C**. Both fail the −80°C thermal screen. See [audit-results.json](audit-results.json).

The hydraulic solve retains temperature and exhaust speed at the pre-solve delivery-pressure ceiling, exactly as in the review's Appendix A. The property-validation report checks that stated approximation; it does not validate a temperature recomputed at the lower solved manifold pressure.

## Historical fixed-state PR bias

The direct reference comparisons still reproduce:

| Matched state | Direct HEOS | PR | PR minus reference |
| --- | ---: | ---: | ---: |
| 250 kg / 600 L at 20°C, pressure |492.475 bar |440.595 bar |−10.53% |
| Same inventory/volume at 40°C |545.524 bar |486.050 bar |−10.90% |
| 117 kg remaining on default isentrope |−92.496°C |−84.526°C |+7.970 K |
| Same 117 kg enthalpy constraint, outlet 79.3 bar |−93.238°C |−86.810°C |+6.428 K |
| Initial isothermal heat per kg discharged |187.451 kJ/kg |160.669 kJ/kg |−14.29% |

[reference-eos-check.json](reference-eos-check.json) records this fixed-state comparison. It is distinct from the new flight-validation report; its script explicitly selects PR. No uniform −8 K adjustment is used.

## Reproduce

The app needs no Python, CoolProp installation or runtime property server. To regenerate the data and independent checks:

```sh
python3 -m venv /private/tmp/roadster-reference-eos-venv
/private/tmp/roadster-reference-eos-venv/bin/python -m pip install CoolProp==8.0.0
/private/tmp/roadster-reference-eos-venv/bin/python scripts/build-reference-tables.py
/private/tmp/roadster-reference-eos-venv/bin/python scripts/verify-flight-eos.py
/private/tmp/roadster-reference-eos-venv/bin/python scripts/verify-reference-eos.py
npm run audit-model
npm run standalone
```

CoolProp revision: `ae81610e7d23efc57f9d051c8e70a4d66e87537f`. Table SHA256: `f92433e7d40e7c66fdad32a5cc65d609623c2a400fe38e030f4d06dd70cfea55`. Reports also record source/data hashes.

CoolProp identifies the nitrogen equation as Span, Lemmon, Jacobsen, Wagner and Yokozeki (2000). Its phase API and single-phase derivative definitions underpin table generation. [Nitrogen reference information](https://coolprop.org/fluid_properties/fluids/Nitrogen.html), [property API and phase handling](https://coolprop.org/coolprop/HighLevelAPI.html), [reference paper](https://doi.org/10.1063/1.1349047).
