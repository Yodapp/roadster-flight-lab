#!/usr/bin/env python3
"""Compare selected nitrogen states, not a trajectory, with CoolProp's HEOS.

Reproduce in a disposable environment:
  python3 -m venv /private/tmp/roadster-reference-eos-venv
  /private/tmp/roadster-reference-eos-venv/bin/python -m pip install CoolProp==8.0.0
  /private/tmp/roadster-reference-eos-venv/bin/python scripts/verify-reference-eos.py

This script explicitly selects the retained Peng–Robinson comparison. The default
browser now uses separate reference tables; these samples still compare fixed states.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys

try:
    import CoolProp
    import CoolProp.CoolProp as CP
except ImportError:
    sys.exit("CoolProp is required for this optional check; see the commands in this script's docstring.")

ROOT = Path(__file__).resolve().parent.parent
FLUID = "HEOS::Nitrogen"
MASS = 250.0
VOLUME = 0.6
T0 = 293.15
RHO0 = MASS / VOLUME
OUTLET_PA = 79.3e5

# Explicit original settings make this independent of later UI preset choices.
NODE_CODE = r"""
import {HW_DEFAULTS,gasState,nitrogenPR,N2} from './dist/hardware.js';
const p={...HW_DEFAULTS,gas:250,exhaust:550,tankVolume:600,realGas:true,gasModel:'pr',blowdown:true,ambientTemperature:20,regulatorBar:100,deliveryLossPercent:8};
const pack=s=>({temperature_K:s.temperature,pressure_Pa:s.pressure,Z:s.Z,feedTemperature_K:s.feedTemperature,feedPressure_Pa:s.feedPressure});
const fills=[20,40].map(c=>({temperature_K:c+273.15,...pack(gasState({...p,ambientTemperature:c},250))}));
const blowdown=[130,117,90].map(gas=>({gas_kg:gas,...pack(gasState(p,gas))}));
const current=gasState(p,117),h=nitrogenPR(current.temperature,117/.6).enthalpy;
const covolume=.07780*N2.Ru*N2.Tc/N2.Pc;
function atPT(P,T){let lo=1e-9,hi=N2.M/covolume*.999999;for(let i=0;i<80;i++){const rho=(lo+hi)/2;if(nitrogenPR(T,rho).pressure>P)hi=rho;else lo=rho;}return nitrogenPR(T,(lo+hi)/2);}
let lo=126.3,hi=400;for(let i=0;i<80;i++){const T=(lo+hi)/2;if(atPT(79.3e5,T).enthalpy>h)hi=T;else lo=T;}
let gasLo=2.5,gasHi=250;for(let i=0;i<60;i++){const gas=(gasLo+gasHi)/2;if(gasState(p,gas).pressure>100e5)gasHi=gas;else gasLo=gas;}
console.log(JSON.stringify({fills,blowdown,regulator:{outletPressure_Pa:79.3e5,temperature_K:(lo+hi)/2},isothermalHeatPerKg_J_kg:gasState({...p,blowdown:false},250).heatPerKg,gasAt100Bar_kg:(gasLo+gasHi)/2,idealAirFillPressure_Pa:gasState({...p,realGas:false},250).pressure}));
"""


def prop(output, key1, value1, key2, value2):
    return float(CP.PropsSI(output, key1, value1, key2, value2, FLUID))


def percent_error(model, reference):
    return (model / reference - 1) * 100


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "reference-eos-check.json")
    args = parser.parse_args()
    model = json.loads(subprocess.run(["node", "--input-type=module", "-e", NODE_CODE], cwd=ROOT, check=True, capture_output=True, text=True).stdout)
    s0 = prop("Smass", "T", T0, "Dmass", RHO0)
    fills = []
    for m in model["fills"]:
        temperature = m["temperature_K"]
        pressure = prop("P", "T", temperature, "Dmass", RHO0)
        z = prop("Z", "T", temperature, "Dmass", RHO0)
        fills.append({
            "temperature_C": temperature - 273.15,
            "reference_pressure_bar": pressure / 1e5,
            "pr_pressure_bar": m["pressure_Pa"] / 1e5,
            "pressure_error_percent": percent_error(m["pressure_Pa"], pressure),
            "reference_Z": z, "pr_Z": m["Z"],
        })
    blowdown = []
    for m in model["blowdown"]:
        rho = m["gas_kg"] / VOLUME
        temperature = prop("T", "Smass", s0, "Dmass", rho)
        pressure = prop("P", "Smass", s0, "Dmass", rho)
        blowdown.append({
            "gas_remaining_kg": m["gas_kg"], "density_kg_m3": rho,
            "reference_temperature_C": temperature - 273.15,
            "pr_temperature_C": m["temperature_K"] - 273.15,
            "temperature_error_K": m["temperature_K"] - temperature,
            "reference_pressure_bar": pressure / 1e5,
            "pr_pressure_bar": m["pressure_Pa"] / 1e5,
            "pressure_error_percent": percent_error(m["pressure_Pa"], pressure),
            "reference_phase": CP.PhaseSI("T", temperature, "Dmass", rho, FLUID),
        })
    enthalpy = prop("Hmass", "Smass", s0, "Dmass", 117 / VOLUME)
    outlet_temperature = prop("T", "Hmass", enthalpy, "P", OUTLET_PA)
    heat_per_kg = T0 / RHO0 * prop("d(P)/d(T)|Dmass", "T", T0, "Dmass", RHO0)
    boundary_mass = prop("Dmass", "Smass", s0, "P", 100e5) * VOLUME
    critical_density = float(CP.PropsSI("rhomass_critical", FLUID))
    report = {
        "kind": "Fixed-state reference EOS comparison; not a reference-EOS flight",
        "provenance": {
            "CoolProp_version": CoolProp.__version__,
            "CoolProp_git_revision": CP.get_global_param_string("gitrevision"),
            "backend": FLUID,
            "reference_equation": "Span, Lemmon, Jacobsen, Wagner and Yokozeki (2000)",
            "reference_doi": "https://doi.org/10.1063/1.1349047",
            "nitrogen_documentation": "https://coolprop.org/fluid_properties/fluids/Nitrogen.html",
            "API_documentation": "https://coolprop.org/coolprop/HighLevelAPI.html",
            "hardware_source_sha256": hashlib.sha256((ROOT / "dist/hardware.js").read_bytes()).hexdigest(),
            "pr_values": "Current gasState output, with an additional fixed-pressure isenthalpic solve using exported nitrogenPR for the regulator comparison.",
        },
        "fixed_inputs": {"initial_gas_kg": MASS, "tank_volume_m3": VOLUME, "initial_temperature_K": T0,
                         "initial_density_kg_m3": RHO0, "critical_density_kg_m3": critical_density,
                         "density_over_critical": RHO0 / critical_density, "reference_initial_entropy_J_kgK": s0},
        "fill_states": fills,
        "isentropic_states": blowdown,
        "regulator_at_117kg": {"outlet_pressure_bar": OUTLET_PA / 1e5,
            "reference_temperature_C": outlet_temperature - 273.15,
            "pr_temperature_C": model["regulator"]["temperature_K"] - 273.15,
            "temperature_error_K": model["regulator"]["temperature_K"] - outlet_temperature},
        "isothermal_fill_heat_per_kg": {"reference_kJ_kg": heat_per_kg / 1000,
            "pr_kJ_kg": model["isothermalHeatPerKg_J_kg"] / 1000,
            "error_percent": percent_error(model["isothermalHeatPerKg_J_kg"], heat_per_kg)},
        "nominal_100bar_boundary": {"reference_remaining_kg": boundary_mass,
            "pr_remaining_kg": model["gasAt100Bar_kg"],
            "reference_inventory_above_boundary_kg": MASS-boundary_mass,
            "pr_inventory_above_boundary_kg": MASS-model["gasAt100Bar_kg"],
            "qualification": "Inventory above this pressure is not a guarantee of full thrust; nozzle, shared feed, loss and temperature constraints also apply."},
        "ideal_air_fill_pressure_bar": model["idealAirFillPressure_Pa"] / 1e5,
        "limitations": [
            "This compares matched state constraints. It does not integrate a flight with reference nitrogen properties, so it cannot establish reference-EOS touchdown speed, gas used, or minimum temperature along a changed trajectory.",
            "No blanket temperature or pressure correction is applied. Error varies with initial temperature, density, remaining mass and thermodynamic path.",
            "The sampled 250 kg / 600 L isentrope is not sufficient for the full UI range of initial gas mass, tank volume, temperature, regulator pressure and loss.",
            "A reference table must cover and validate the multidimensional state domain, phase handling and interpolation before it replaces the browser EOS.",
        ],
    }
    args.output.write_text(json.dumps(report, indent=2, allow_nan=False) + "\n")
    print(f"CoolProp {CoolProp.__version__}: {FLUID}")
    for row in fills:
        print(f"Fill {row['temperature_C']:.0f} C: reference {row['reference_pressure_bar']:.3f} bar, PR {row['pr_pressure_bar']:.3f} bar ({row['pressure_error_percent']:+.2f}%)")
    for row in blowdown:
        print(f"At {row['gas_remaining_kg']:.0f} kg: reference {row['reference_temperature_C']:.3f} C, PR {row['pr_temperature_C']:.3f} C ({row['temperature_error_K']:+.3f} K)")
    print(f"Regulator at 117 kg to 79.3 bar: reference {outlet_temperature-273.15:.3f} C, PR {model['regulator']['temperature_K']-273.15:.3f} C")
    print(f"Isothermal fill heat per kg: reference {heat_per_kg/1000:.3f}, PR {model['isothermalHeatPerKg_J_kg']/1000:.3f} kJ/kg")
    print(f"Wrote {args.output}")


if __name__ == "__main__":
    main()
