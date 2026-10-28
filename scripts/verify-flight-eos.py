#!/usr/bin/env python3
"""Validate the complete runtime gasState chain along actual simulated flights.

Run with the same pinned CoolProp installation used to build the property tables:
  /private/tmp/roadster-reference-eos-venv/bin/python scripts/verify-flight-eos.py

This samples the trajectories produced by the JavaScript simulator. Direct HEOS
reconstructs the thermodynamic path from each run's original fill constraints,
then its regulator state from reference enthalpy and reference feed pressure. It
therefore includes initial-state inversion, two-table interpolation and the
runtime 257-row gas curve in the error measurement. It is not a second complete
flight integrator and does not validate nozzle or controller physics. Version 4.3
retains temperature/exhaust at the pre-solve delivery-pressure ceiling, as in the
review patch; this check does not claim temperature at the lower solved manifold
pressure has been recomputed.
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
    sys.exit('Install CoolProp==8.0.0 in the disposable validation environment first.')

ROOT = Path(__file__).resolve().parent.parent
FLUID = 'HEOS::Nitrogen'
NODE_CODE = r"""
import {PRESETS,simulate} from './dist/physics.js';
import {gasState} from './dist/hardware.js';
const cases={
 reviewedBaseline:PRESETS.fullRun,
 demoOrientation:PRESETS.demoOrientation,
 ambientPlus15:{...PRESETS.fullRun,ambientTemperature:PRESETS.fullRun.ambientTemperature+15},
 deliveryLossPlus8:{...PRESETS.fullRun,deliveryLossPercent:PRESETS.fullRun.deliveryLossPercent+8},
 isothermalControl:{...PRESETS.upright,blowdown:false,heatTransferPower:1e6},
 regulator60:PRESETS.regulator60
};
console.log(JSON.stringify(Object.entries(cases).map(([name,input])=>{
 const run=simulate(input),flight=run.samples.filter(s=>s.phase!=='ramp');
 // Include every stored flight sample (roughly 60 Hz) and the exact final point.
 const samples=flight.map(s=>({time_s:s.t,gas_kg:s.gas,flowing:s.thrust>0,gasState:gasState(run.p,s.gas)}));
 return {name,inputs:run.p,samples,result:{contactVerticalSpeed_m_s:run.contactVerticalSpeed,gasUsed_kg:run.gasUsed,
  minimumTankTemperature_K:run.minimumTemperature,minimumFeedTemperature_K:run.minimumFeedTemperature,
  thermalFits:run.thermalFits,soft:run.soft,candidate:run.candidate,phaseLimited:run.phaseLimited,eosInvalidState:run.eosInvalidState??false}};
})));
"""


def prop(output, key1, value1, key2, value2):
    return float(CP.PropsSI(output, key1, value1, key2, value2, FLUID))


def digest(path):
    return hashlib.sha256((ROOT / path).read_bytes()).hexdigest()


def error_record(model, reference, sample, percent=False):
    signed = (model / reference - 1) * 100 if percent else model - reference
    return {'absolute_error': abs(signed), 'signed_error': signed,
            'gas_remaining_kg': sample['gas_kg'], 'time_s': sample['time_s'],
            'model': model, 'reference': reference}


def maximum(records):
    return max(records, key=lambda value: value['absolute_error']) if records else None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'flight-eos-validation.json')
    args = parser.parse_args()
    if CoolProp.__version__ != '8.0.0':
        sys.exit(f'Expected pinned CoolProp 8.0.0; found {CoolProp.__version__}')
    runs = json.loads(subprocess.run(['node', '--input-type=module', '-e', NODE_CODE], cwd=ROOT,
                                    check=True, capture_output=True, text=True).stdout)
    reports, failures = [], []
    for run in runs:
        p = run['inputs']
        volume = p['tankVolume'] / 1000
        initial_temperature = p['ambientTemperature'] + 273.15
        initial_density = p['gas'] / volume
        s0 = prop('Smass', 'T', initial_temperature, 'Dmass', initial_density)
        errors = {name: [] for name in ['tank_temperature_K', 'pressure_percent', 'regulator_temperature_K',
                                        'feed_pressure_percent', 'isothermal_heat_percent']}
        rejected = {'runtime_phase': 0, 'runtime_domain': 0, 'reference_phase': 0, 'reference_error': 0}
        accepted, flowing = 0, 0
        reference_phases = {}
        for sample in run['samples']:
            model = sample['gasState']
            runtime_phase = bool(model.get('phaseLimited'))
            runtime_domain = bool(model.get('invalidState'))
            rejected['runtime_phase'] += int(runtime_phase)
            rejected['runtime_domain'] += int(runtime_domain)
            if runtime_phase or runtime_domain:
                # Placeholders after rejection are intentionally not compared as states.
                if model['exhaust'] != 0:
                    failures.append(f"{run['name']}: rejected state supplied nonzero exhaust")
                continue
            rho = sample['gas_kg'] / volume
            constraints = ('Smass', s0, 'Dmass', rho) if p['blowdown'] else ('T', initial_temperature, 'Dmass', rho)
            try:
                tank_temperature = prop('T', *constraints)
                tank_pressure = prop('P', *constraints)
                enthalpy = prop('Hmass', *constraints)
                tank_phase = CP.PhaseSI(*constraints, FLUID)
                feed_pressure = max(p['ambientPressure'] * 1000,
                                    min(p['regulatorBar'] * 1e5, tank_pressure) * (1 - p['deliveryLossPercent'] / 100))
                feed_temperature = prop('T', 'Hmass', enthalpy, 'P', feed_pressure)
                feed_phase = CP.PhaseSI('Hmass', enthalpy, 'P', feed_pressure, FLUID)
            except ValueError as error:
                rejected['reference_error'] += 1
                failures.append(f"{run['name']}: direct HEOS failed at {rho} kg/m3: {error}")
                continue
            for phase in [tank_phase, feed_phase]:
                reference_phases[phase] = reference_phases.get(phase, 0) + 1
            if any(phase in ('twophase', 'liquid', 'unknown') for phase in [tank_phase, feed_phase]):
                rejected['reference_phase'] += 1
                failures.append(f"{run['name']}: runtime accepted direct-HEOS {tank_phase}/{feed_phase} state")
                continue
            accepted += 1
            flowing += int(sample['flowing'])
            errors['tank_temperature_K'].append(error_record(model['temperature'], tank_temperature, sample))
            errors['pressure_percent'].append(error_record(model['pressure'], tank_pressure, sample, percent=True))
            errors['regulator_temperature_K'].append(error_record(model['feedTemperature'], feed_temperature, sample))
            errors['feed_pressure_percent'].append(error_record(model['feedPressure'], feed_pressure, sample, percent=True))
            if not p['blowdown']:
                heat = tank_temperature / rho * prop('d(P)/d(T)|Dmass', 'T', tank_temperature, 'Dmass', rho)
                errors['isothermal_heat_percent'].append(error_record(model['heatPerKg'], heat, sample, percent=True))
        maxima = {name: maximum(values) for name, values in errors.items()}
        for name in ['tank_temperature_K', 'pressure_percent', 'regulator_temperature_K']:
            if maxima[name] is None or maxima[name]['absolute_error'] >= 1:
                failures.append(f"{run['name']}: {name} exceeds the <1 acceptance bound")
        # Heat interpolation is also checked quantitatively, not merely reported.
        if maxima['isothermal_heat_percent'] and maxima['isothermal_heat_percent']['absolute_error'] >= 1:
            failures.append(f"{run['name']}: isothermal heat error exceeds 1%")
        reports.append({'name': run['name'], 'inputs': {key: p[key] for key in [
            'gasModel', 'feedModel', 'headingMode', 'gas', 'tankVolume', 'ambientTemperature', 'regulatorBar', 'deliveryLossPercent', 'blowdown']},
            'reference_initial_entropy_J_kgK': s0, 'sample_count': len(run['samples']),
            'accepted_samples': accepted, 'flowing_samples': flowing,
            'rejection_counts': rejected, 'reference_phase_counts': reference_phases,
            'maximum_absolute_errors': maxima, 'flight_result': run['result']})
        def summary_error(name):
            return f"{maxima[name]['absolute_error']:.6f}" if maxima[name] else 'no valid comparison'
        print(f"{run['name']}: {accepted}/{len(run['samples'])} accepted; "
              f"max tank {summary_error('tank_temperature_K')} K, "
              f"p {summary_error('pressure_percent')}%, "
              f"feed {summary_error('regulator_temperature_K')} K")
    by_name = {row['name']: row['flight_result'] for row in reports}
    baseline, loss = by_name['reviewedBaseline'], by_name['deliveryLossPlus8']
    loss_harder = loss['contactVerticalSpeed_m_s'] > baseline['contactVerticalSpeed_m_s']
    if not loss_harder:
        failures.append('The named +8 pp delivery-loss scenario did not land harder than the reviewed baseline.')
    report = {
        'kind': 'Actual flight gasState path checked against direct CoolProp HEOS',
        'provenance': {'CoolProp_version': CoolProp.__version__, 'CoolProp_git_revision': CP.get_global_param_string('gitrevision'),
                       'backend': FLUID, 'source_sha256': {name: digest(name) for name in [
                           'dist/hardware.js', 'dist/reference-eos.js', 'dist/reference-eos-tables.json',
                           'dist/flight3d.js', 'dist/physics.js', 'scripts/verify-flight-eos.py']}},
        'criteria': {'tank_temperature_absolute_error_K': '<1', 'regulator_temperature_absolute_error_K': '<1',
                     'pressure_absolute_relative_error_percent': '<1', 'isothermal_heat_absolute_relative_error_percent': '<1',
                     'accepted_reference_liquid_or_two_phase_states': 0},
        'runs': reports,
        'delivery_loss_regression': {'baseline_case': 'reviewedBaseline', 'baseline_downward_speed_m_s': baseline['contactVerticalSpeed_m_s'],
                                     'plus8pp_downward_speed_m_s': loss['contactVerticalSpeed_m_s'], 'lands_harder': loss_harder},
        'passed': not failures, 'failures': failures,
        'limitations': [
            'These are stored flight samples plus the exact final point, not every integration substep.',
            'This validates gas properties along the computed paths, not a second independently integrated trajectory.',
            'No claim about real nozzle, valve, manifold, wall heat transfer, component temperature ratings or vehicle qualification follows from EOS interpolation accuracy.',
            'In version4.3, the hydraulic pressure solve retains temperature/exhaust at the delivery-pressure ceiling; these checks validate that stated property approximation, not temperature at the lower solved manifold pressure.',
        ],
    }
    args.output.write_text(json.dumps(report, indent=2, allow_nan=False) + '\n')
    print(f"Delivery +8 pp: {baseline['contactVerticalSpeed_m_s']:.6f} → {loss['contactVerticalSpeed_m_s']:.6f} m/s")
    print(f'Wrote {args.output}; passed={not failures}')
    if failures:
        for failure in failures:
            print(f'FAIL: {failure}', file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
