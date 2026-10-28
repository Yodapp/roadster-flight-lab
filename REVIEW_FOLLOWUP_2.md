# Follow-up review 2 — version 4.2

28 October 2026. Read against [REVIEW_RESPONSE_2.md](REVIEW_RESPONSE_2.md), the 4.2 modules in `dist/`, `audit-results.json`, both validation files and the page served from `dist/`. The creator's files were not modified; experiments ran on a scratch copy.

## TL;DR

1. **Everything claimed in the response reproduces.** 115/115 tests, syntax checks, every number in the tables, the map counts (3/66 landing, 2/66 hardware, 0 combined), the validation summaries. The reference-EOS integration is well done and I accept it as reference-grade for gas properties.
2. **The headline verdict changed and the response does not say so.** v4.1 landed at 3.02 m/s and failed ground contact. v4.2 lands at 0.99 m/s and the page now says "The contact limits pass. The hardware checks do not." A reader of "What changed in 4.2" cannot tell that the main conclusion flipped.
3. **The flip comes from the feed decoupling, not from the reference EOS,** and it lives entirely inside the region the response itself calls "not jointly attainable". With the creator's own feed assumptions solved consistently, the default lands at **1.66 m/s and fails the 1.5 m/s screen again.** The headline should not say the contact limits pass until the feed is solved.

Items 2 and 3 are the only things that matter this round. Everything else is accepted.

## 1. What I verified

| Claim in the response | Result |
| --- | --- |
| 115 tests pass, syntax checks pass | Reproduced |
| Default 0.990 m/s, 147.5 kg, −104.5/−106.9 °C | Reproduced from `audit-results.json` and a fresh `simulate(PRESETS.fullRun)` |
| +8 pp loss 1.311 m/s, lands harder | Reproduced |
| PR with corrected feed 0.739 m/s | Reproduced |
| +15 °C rerun 0.640 m/s, still fails −80 °C | Reproduced |
| Shortest flip 1.039 m/s, −8.78 m/s backward | Reproduced |
| Map 66 tested, 55 excluded, 3 landing, 2 hardware, 0 both | Reproduced with `buildEnvelopeMap` |
| 70,843 lookup queries, max tank T error 0.139 K, max p error 0.48 % | Matches `reference-eos-validation.json` |
| 610 flight samples, all accepted, max T error 0.009 K | Matches `flight-eos-validation.json` (5 runs, 134+135+134+73+134) |
| Continuation counted once in driven default, zero elsewhere | Tests present in `controller-policy.test.mjs` and pass |
| Interface says the feed bound is optimistic | "optimistic" and "capacity bound" appear in `index.html`, `app.js`, `math-explainer.js` |

`reference-eos.js` is 3.5 kB, bilinear in (s, log ρ) and (h, log p), refuses to extrapolate, and rejects any cell with a non-gas vertex. That is the conservative choice and it is correct. The 1.57 MB table is acceptable for a standalone page.

## 2. The verdict flip

| Version | Feed model | Downward contact | Verdict shown |
| --- | --- | ---: | --- |
| 4.1 | PR, feed orifice driven by tank → 0.92·min(setpoint, tank) | 3.02 m/s | Fails contact |
| 4.2, PR | PR, feed bound tank → ambient | 0.739 m/s | Passes contact |
| 4.2, default | Reference EOS, feed bound tank → ambient | 0.990 m/s | Passes contact |

The reference EOS moves the result from 0.74 to 0.99 m/s, so it slightly *hurts*. The 3.02 → 0.74 m/s change is the feed decoupling alone. This belongs in the first bullet of "What changed in 4.2", in plain words: the landing verdict changed from fail to pass, and the change comes from the feed model.

## 3. The decoupled feed bound decides the verdict in its own grey zone

I took the 4.2 default trajectory and, at each burning sample, asked one question of the creator's own feed assumptions (85 mm, Cd 0.8, Z-corrected orifice): **what is the highest nozzle-inlet pressure at which this feed line can pass the mass flow the model actually consumed?**

| t (s) | Gas left (kg) | Tank (bar) | Flow (kg/s) | Model nozzle pressure (bar) | Highest attainable nozzle pressure (bar) | Feed bound tank→ambient (kg/s) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 10.34 | 188 | 224 | 113 | 92.0 | 214 | 260 |
| 10.63 | 155 | 143 | 116 | 92.0 | 129 | 189 |
| 10.77 | 138 | 112 | 117 | 92.0 | 95 | 158 |
| 10.92 | 121 | 87 | 119 | 79.7 | 62 | 130 |
| 11.06 | 104 | 66 | 107 | 60.8 | none: flow needs choked discharge to ambient | 105 |
| 11.08 | 103 | 64 | 104 | 59.0 | none | 103 |

Above roughly 110 bar tank pressure the fixed 8 % loss is conservative and the decoupling is harmless. Below it, the model assumes a nozzle pressure the feed line cannot deliver at that flow, and in the last 0.3 s it assumes 60 bar at the nozzles while taking the full choked tank-to-ambient flow through the feed, which is self-contradictory. v4.1 cut thrust off in exactly this interval; v4.2 keeps full thrust through it. The whole difference between "fails" and "passes" is produced in these 0.3 s.

### The consistent solve is small, and it fails the screen

The "manifold network" the response describes as needing a different supply architecture reduces, under the model's existing assumptions, to one scalar root per step: find the nozzle-inlet pressure p_n ≤ the model's feed pressure at which feed inflow (tank → p_n, same orifice law) equals nozzle outflow at p_n (same choked-flux law, caps scaled with p_n). Inflow falls and outflow rises with p_n, so bisection converges. No new hardware data is needed; it uses only the feed diameter, Cd and throat areas that are already inputs. Patch in Appendix A, 15 lines in `flight3d.js`.

| Case | 4.2 as shipped | Consistent feed | Lowest manifold pressure | Screen 1.5 m/s |
| --- | ---: | ---: | ---: | --- |
| Default, reference EOS, 8 % loss | 0.990 m/s | **1.659 m/s** | 53.5 bar | **fails** |
| Delivery loss 16 % | 1.311 | 1.727 | 53.1 | fails |
| Regulator 60 bar, 45 mm throat | 1.116 | 1.672 | 35.3 | fails |
| PR, corrected feed | 0.739 | 1.275 | 56.1 | passes |
| +15 °C | 0.640 | 1.042 | 58.0 | passes |
| Shortest flip | 1.039 | 1.727 | 53.1 | fails (and backward) |
| Feed 100 mm | 0.927 | 1.137 | 57.0 | passes |
| Feed 120 mm | 0.927 | 0.927 | never binds | passes |
| Feed 120 mm, 50 mm throats | 0.594 | 0.596 | 56.0 | passes |

Step-size check for the default consistent case: 1.654 / 1.659 / 1.662 m/s at dt 6 / 3 / 1.5 ms. Not a numerical artefact.

Two honest caveats about my solve. It keeps the exhaust velocity and regulator outlet temperature at the model's feed pressure rather than at p_n, which makes it slightly optimistic, so the true consistent figure is a little worse than 1.66. And Cd 0.8 and 85 mm are assumptions, as before. But it is the self-consistent version of the creator's own numbers, and the result is that **the feed diameter, not the EOS, the flip policy or the regulator, is the input that decides the landing verdict.** 85 mm fails, 100 mm passes, 120 mm never binds.

### What to do

1. Make the consistent solve the default and keep the independent bound as a labelled "optimistic bound" comparison, the same way PR is kept beside the reference EOS. If the creator prefers not to, the headline must say: "passes only under the optimistic feed bound; fails (1.66 m/s) when the feed is solved consistently".
2. Add the feed diameter to the first sensitivity rows and say in the README that it is the decisive input.
3. Write the verdict change into "What changed in 4.2".
4. The "more loss cannot help" invariant test and the +8 pp regression are fine and should stay. With the consistent solve the +8 pp row still lands harder (1.727 vs 1.659).

## 4. Reference EOS: accepted

Good implementation. Three small notes, none blocking:

- Relative enthalpy error (48 %) is meaningless near the enthalpy zero, as the file already says. Quote only the absolute figure (712 J/kg) in the README to avoid a reader stopping there.
- The isothermal "heat per kg" sampled derivative is only exercised when blowdown is off. The test covers one state (187.451 kJ/kg at 250 kg). Fine for now.
- `referenceAtTRho` scans all 126 entropy columns on every call. It is only called at initialisation, so it does not matter, but a comment saying so would save the next reader a worry.

## 5. Smaller points: all accepted

Longitudinal-screen wording, continuation activation counter and its tests, preset labelling, and the Under 1 failed-jet labelling are all as requested.

## Verdict

v4.2 is a better model than v4.1 in every component I checked, and the response is accurate about what it did. But the one sentence a reader takes away, "the contact limits pass", is produced by a bound the creator labels optimistic, in the exact 0.3 s where that bound is self-contradictory. Solving the feed consistently with the model's own inputs gives 1.66 m/s and a fail. Until that is either adopted or stated in the headline, the 4.2 landing verdict should not be quoted.

## Appendix A: scratch patch used for §3

Applied to a copy of `dist/flight3d.js`, directly after the line that computes `sum` and `flow` from the lagged forces. Activated with `consistentManifold:true` in the inputs; `orificeFlux` added to the import from `./hardware.js`.

```js
if(p.consistentManifold&&tank.exhaust>0&&sum>0){
 const amb=atmosphere(p),A=Math.PI*((p.feedDiameter??85)/1000)**2/4,exh=tank.exhaust;
 const dA=Math.PI*((p.throat??45)/1000)**2/4,rA=Math.PI*(.052)**2/4,sA=Math.PI*(.025)**2/4;
 const capsAt=pn=>{const f=.90*orificeFlux(pn,amb.p,tank.feedTemperature,tank.R);
  const d=Math.min(p.thrust*1000/4,f*dA*exh),r=Math.min(20000,f*rA*exh),si=Math.min(6000,f*sA*exh);
  return [d,d,d,d,r,r,r,r,si,si].map((c,i)=>(p.allThrustersOff||i===p.failedNozzle)?0:c);};
 const feedAt=pn=>.8*A*orificeFlux(tank.pressure,pn,tank.temperature,tank.R)/Math.sqrt(Math.max(.3,tank.Z));
 const demandAt=pn=>{const c=capsAt(pn);return forces.reduce((a,x,i)=>a+Math.min(x,c[i]),0)/exh;};
 let pn=tank.feedPressure;
 if(demandAt(pn)>feedAt(pn)){
  let lo=amb.p,hi=pn;for(let i=0;i<50;i++){const mid=(lo+hi)/2;if(demandAt(mid)>feedAt(mid))hi=mid;else lo=mid;}
  pn=lo;const c=capsAt(pn);forces=forces.map((x,i)=>Math.min(x,c[i]));sum=forces.reduce((a,b)=>a+b,0);flow=sum/exh;
 }
}
```

The table in §3 was produced by running `simulate` with and without `consistentManifold` for each row; the "highest attainable nozzle pressure" column by bisecting the same `feedAt` for the flow actually consumed between stored samples.
