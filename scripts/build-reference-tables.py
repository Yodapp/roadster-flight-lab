#!/usr/bin/env python3
"""Generate and independently validate the browser's nitrogen reference tables.

Requires CoolProp==8.0.0 (generation only), and Node for validation of the exact
shipping JavaScript interpolator. Run with the disposable reference-EOS venv.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import math
from pathlib import Path
import random
import subprocess
import time
import CoolProp
import CoolProp.CoolProp as CP

ROOT=Path(__file__).resolve().parent.parent
TABLE=ROOT/'dist/reference-eos-tables.json'
REPORT=ROOT/'reference-eos-validation.json'
FLUID='Nitrogen'
STATE=CP.AbstractState('HEOS',FLUID)
R=STATE.gas_constant()/STATE.molar_mass()
GOOD_PHASES={CP.iphase_gas,CP.iphase_supercritical,CP.iphase_supercritical_gas}

def line(a,b,n): return [a+(b-a)*i/(n-1) for i in range(n)]
def logline(a,b,n): return line(math.log(a),math.log(b),n)
def rounded(x): return float(f'{x:.9g}')

def properties(pair,a,b):
    try:
        STATE.update(pair,a,b)
        t,p,h=STATE.T(),STATE.p(),STATE.hmass()
        phase=0 if STATE.phase() in GOOD_PHASES else 1
        # EOS's documented range is bounded; a successful extrapolating flash
        # does not grant permission to use an unsupported solid/temperature state.
        if not (STATE.Tmin()<=t<=STATE.Tmax() and 0<p<=STATE.pmax()): phase=2
        heat=t/STATE.rhomass()*STATE.first_partial_deriv(CP.iP,CP.iT,CP.iDmass) if phase==0 else 0
        return {'temperature':t,'pressure':p,'enthalpy':h,'heatPerKg':heat,'phase':phase}
    except (ValueError,OverflowError):
        return {'temperature':None,'pressure':None,'enthalpy':None,'heatPerKg':None,'phase':2}

def make_grid(x,y,kind):
    fields=['temperature','pressure','enthalpy','heatPerKg'] if kind=='srho' else ['temperature']
    grid={'x':x,'y':y,'fields':{k:[] for k in fields},'phase':[]}
    for i,a in enumerate(x):
        for b in y:
            state=properties(CP.DmassSmass_INPUTS,math.exp(b),a) if kind=='srho' else properties(CP.HmassP_INPUTS,a,math.exp(b))
            for key in fields:
                value=state[key]
                grid['fields'][key].append(rounded(value) if value is not None and math.isfinite(value) else None)
            grid['phase'].append(state['phase'])
    return grid

def generate():
    assert CoolProp.__version__=='8.0.0',f'Pinned generation needs CoolProp 8.0.0; got {CoolProp.__version__}'
    # Fine log-density intervals at the dense fill states; low-density cold
    # blowdown is mostly phase-limited, but still explicitly represented.
    entropy=line(3800,6300,126)
    logrho=logline(.1,10,49)[:-1]+logline(10,100,33)[:-1]+logline(100,1000,137)
    enthalpy=line(-150000,700000,214)
    logpressure=logline(20000,100000000,151)
    table={'metadata':{
        'schema':1,'fluid':'Nitrogen','backend':'HEOS','CoolPropVersion':CoolProp.__version__,
        'CoolPropGitRevision':CP.get_global_param_string('gitrevision'),'gasConstant':R,
        'referenceEquation':'Span, Lemmon, Jacobsen, Wagner and Yokozeki (2000)',
        'referenceDOI':'https://doi.org/10.1063/1.1349047',
        'documentation':'https://coolprop.org/fluid_properties/fluids/Nitrogen.html',
        'interpolation':'Bilinear in (specific entropy, log density) and (specific enthalpy, log absolute pressure). No extrapolation.',
        'units':{'entropy':'J/(kg K)','density':'kg/m³','temperature':'K','pressure':'Pa','enthalpy':'J/kg','heatPerKg':'J/kg'},
        'domain':{'entropy_J_kgK':[entropy[0],entropy[-1]],'density_kg_m3':[.1,1000],
                  'enthalpy_J_kg':[enthalpy[0],enthalpy[-1]],'pressure_Pa':[20000,100000000]},
        'phaseFlags':{'0':'gas or supercritical single phase','1':'saturation/two-phase/liquid; stop gas thrust','2':'invalid, solid-region or EOS/domain failure; stop gas thrust'},
        'cellPolicy':'Reject a cell if any contributing vertex has nonzero phase flag. Liquid and ambiguous boundary cells are conservatively excluded.',
        'generationScript':'scripts/build-reference-tables.py',
        'validity':'Lookup accuracy is measured against direct HEOS in reference-eos-validation.json. This is not a certified thermal/component model.'},
        'srho':make_grid(entropy,logrho,'srho'),'hp':make_grid(enthalpy,logpressure,'hp')}
    TABLE.write_text(json.dumps(table,separators=(',',':'),allow_nan=False)+'\n')
    print(f'Wrote {TABLE.stat().st_size:,} bytes; s/rho {len(entropy)}×{len(logrho)}; h/p {len(enthalpy)}×{len(logpressure)}',flush=True)
    return table

def validate(table):
    rng=random.Random(4202026)
    cases=[]
    # Every cell midpoint checks the exact JS runtime implementation throughout
    # the accepted grid, not only a default isentrope. Random offsets check edges.
    for name,kind in [('srho','srho'),('hp','hp')]:
        grid=table[name]
        for i in range(len(grid['x'])-1):
            for j in range(len(grid['y'])-1):
                x=(grid['x'][i]+grid['x'][i+1])/2
                y=(grid['y'][j]+grid['y'][j+1])/2
                cases.append({'kind':kind,'a':x,'b':math.exp(y),'set':'cell-centres'})
        for _ in range(5000):
            cases.append({'kind':kind,'a':rng.uniform(grid['x'][0],grid['x'][-1]),'b':math.exp(rng.uniform(grid['y'][0],grid['y'][-1])),'set':'random-off-grid'})
    # UI initial states, actual independent entropy paths, and regulator states.
    for c in [-20,0,20,35,50]:
        for rho in [20,50,100,200,250/.6,600,875]:
            cases.append({'kind':'trho','a':c+273.15,'b':rho,'set':'initial-states'})
            STATE.update(CP.DmassT_INPUTS,rho,c+273.15)
            entropy=STATE.smass()
            for f in [.99,.8,.6,.5,.468,.4,.3,.2,.1,.03,.01]:
                state=properties(CP.DmassSmass_INPUTS,rho*f,entropy)
                cases.append({'kind':'srho','a':entropy,'b':rho*f,'set':'blowdown-paths'})
                if state['phase']==0:
                    for pressure in [20e5,40e5,60e5,92e5,184e5]:
                        if pressure<state['pressure']:
                            cases.append({'kind':'hp','a':state['enthalpy'],'b':pressure,'set':'regulator-paths'})
                            cases.append({'kind':'chain','a':entropy,'b':rho*f,'pressure':pressure,'set':'blowdown-plus-regulator'})
                            cases.append({'kind':'thermalpath','a':c+273.15,'b':rho,'fraction':f,'pressure':pressure,'set':'initial-inversion-plus-blowdown-plus-regulator'})
    node="""import {referenceAtSRho,referenceAtHP,referenceAtTRho} from './dist/reference-eos.js';
let input='';for await(const c of process.stdin)input+=c;
const calls={srho:referenceAtSRho,hp:referenceAtHP,trho:referenceAtTRho};
console.log(JSON.stringify(JSON.parse(input).map(c=>{if(c.kind==='thermalpath'){const start=referenceAtTRho(c.a,c.b);if(start.invalidState||start.phaseLimited)return start;const tank=referenceAtSRho(start.entropy,c.b*c.fraction);return tank.invalidState||tank.phaseLimited?tank:referenceAtHP(tank.enthalpy,c.pressure);}if(c.kind!=='chain')return calls[c.kind](c.a,c.b);const tank=referenceAtSRho(c.a,c.b);return tank.invalidState||tank.phaseLimited?tank:referenceAtHP(tank.enthalpy,c.pressure);})));"""
    actual=json.loads(subprocess.run(['node','--input-type=module','-e',node],input=json.dumps(cases),text=True,capture_output=True,check=True,cwd=ROOT).stdout)
    summary={}
    bad_accepted=[]
    for case,out in zip(cases,actual):
        key=case['kind']+'/'+case['set']
        stats=summary.setdefault(key,{'queries':0,'accepted':0,'phaseRejected':0,'domainRejected':0,'maxTemperatureErrorK':0,'maxPressureErrorPercent':0,'maxEnthalpyErrorPercent':0,'maxEnthalpyErrorJkg':0})
        stats['queries']+=1
        if out['invalidState']:
            stats['domainRejected']+=1;continue
        if out['phaseLimited']:
            stats['phaseRejected']+=1;continue
        if case['kind']=='srho': ref=properties(CP.DmassSmass_INPUTS,case['b'],case['a'])
        elif case['kind']=='hp': ref=properties(CP.HmassP_INPUTS,case['a'],case['b'])
        elif case['kind']=='chain':
            tank=properties(CP.DmassSmass_INPUTS,case['b'],case['a'])
            ref=properties(CP.HmassP_INPUTS,tank['enthalpy'],case['pressure'])
        elif case['kind']=='thermalpath':
            STATE.update(CP.DmassT_INPUTS,case['b'],case['a'])
            entropy=STATE.smass()
            tank=properties(CP.DmassSmass_INPUTS,case['b']*case['fraction'],entropy)
            ref=properties(CP.HmassP_INPUTS,tank['enthalpy'],case['pressure'])
        else: ref=properties(CP.DmassT_INPUTS,case['b'],case['a'])
        if ref['phase']!=0:
            bad_accepted.append(case);continue
        stats['accepted']+=1
        t_error=abs(out['temperature']-ref['temperature'])
        if t_error>stats['maxTemperatureErrorK']:
            stats['maxTemperatureErrorK']=t_error;stats['worstTemperatureState']=case
        if case['kind'] not in ['hp','chain','thermalpath']:
            p_error=abs(out['pressure']/ref['pressure']-1)*100
            h_error=abs(out['enthalpy']/ref['enthalpy']-1)*100
            stats['maxPressureErrorPercent']=max(stats['maxPressureErrorPercent'],p_error)
            stats['maxEnthalpyErrorPercent']=max(stats['maxEnthalpyErrorPercent'],h_error)
            stats['maxEnthalpyErrorJkg']=max(stats['maxEnthalpyErrorJkg'],abs(out['enthalpy']-ref['enthalpy']))
    fixed=[]
    for c in [20,35,40]:
        STATE.update(CP.DmassT_INPUTS,250/.6,c+273.15)
        entropy=STATE.smass()
        fill={'label':f'fill {c} C','kind':'trho','a':c+273.15,'b':250/.6}
        fixed.append(fill)
        for gas in [130,117,90]:fixed.append({'label':f'{c} C initial / {gas} kg left','kind':'srho','a':entropy,'b':gas/.6})
    values=json.loads(subprocess.run(['node','--input-type=module','-e',node],input=json.dumps(fixed),text=True,capture_output=True,check=True,cwd=ROOT).stdout)
    for row,value in zip(fixed,values):row['lookup']=value
    report={'kind':'Direct CoolProp validation of the shipped JavaScript lookup at every cell midpoint, seeded random off-grid points and UI/trajectory states',
            'provenance':table['metadata'],'tableSha256':hashlib.sha256(TABLE.read_bytes()).hexdigest(),
            'seed':4202026,'summary':summary,'acceptedPhaseMismatches':bad_accepted,'fixedStates':fixed,
            'limitations':['Sampled error bounds are empirical, not a mathematical proof for every continuum state.',
                           'Relative enthalpy error becomes ill-conditioned near the arbitrary zero of enthalpy; absolute enthalpy error and chained regulator-temperature error are also reported.',
                           'Phase-boundary cells are conservatively rejected; the lookup does not solve two-phase nozzle flow.',
                           'The remaining-gas path is isentropic and regulator expansion is isenthalpic. Tank heat-transfer and component ratings remain assumptions.']}
    REPORT.write_text(json.dumps(report,indent=2,allow_nan=False)+'\n')
    print(json.dumps(summary,indent=2),flush=True)
    assert not bad_accepted,f'Accepted {len(bad_accepted)} phase mismatches'
    errors=[(key,v) for key,v in summary.items() if v['maxTemperatureErrorK']>=1 or v['maxPressureErrorPercent']>=1]
    assert not errors,f'Grid must be refined: {errors}'
    print(f'Validated {len(cases):,} points; all accepted sampled T errors <1 K and p errors <1%.',flush=True)

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--validate-only',action='store_true');args=parser.parse_args()
    table=json.loads(TABLE.read_text()) if args.validate_only else generate()
    validate(table)
