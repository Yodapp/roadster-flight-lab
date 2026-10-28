# Exposed and fixed model assumptions

Roadster Flight Lab 4.4 is an engineering screen. These choices are not Tesla specifications unless separately identified as reported manufacturer claims. Changing controls explores a hypothesis; it does not establish actual vehicle parameters.

## Newly exposed after review

| Choice | Default / behaviour |
| --- | --- |
| Regulator setpoint | 100 bar absolute; pressure target before delivery loss |
| Delivery pressure loss | 8%; sets the delivery-pressure ceiling; the default solves lower manifold pressure when required by feed capacity |
| Feed model | Consistent same-pressure inflow/outflow by default; optional labelled optimistic independent bound |
| Underside throat sizing | User input; optional action calculates the minimum initial-state diameter, with no sustained-thrust or packaging guarantee |
| Rotation policy | Opening demo and reviewed baseline request continued rotation; shortest-path comparison remains available |
| Continuation branch | For an initial error >2.5 rad opposing inherited rotation, select the long quaternion branch once; return to normal stabilization when remaining error ≤π; otherwise use shortest path |
| Heading target | Opening demo follows outbound horizontal release velocity; reviewed baseline retains track azimuth; historical airborne cases target world zero |
| Lateral velocity target | 0 m/s normal to the selected controller heading; positive to its left |
| Longitudinal contact magnitude | ≤1.5 m/s forward or backward by default; an adjustable chosen screen, not a safety standard |
| Driven-wheel normal-load share | 0.55; adjustable through 1.0; fixed during each ramp run, without axle-load transfer |

Vehicle, gas, fan, packaging, environment, response and thermal assumptions remain available in the page’s detailed groups. JSON exports record the selected inputs. Sideways and downward speed limits are API parameters; the UI displays them. Their defaults are 1 m/s and 1.5 m/s.

## Fixed assumptions still affecting the result

| Area | Current implementation | Consequence / unresolved measurement |
| --- | --- | --- |
| Body and inertia | 4.6×1.95×1.2 m box; diagonal uniform-box inertia times an adjustable scale | No measured tensor; fixed CG offsets; no tank-specific redistribution |
| Seat | Body point (−0.2,+0.45,+0.1) m | Specific acceleration at one assumed position, not impact/restraint loads |
| Nozzles | Four underside, four rear, two opposed nose-side jets at positions in `flight3d.js` | Assumed positions/directions; forces are positive only |
| Rear and side hardware | Rear throats 52 mm, cap 20 kN each; side throats 25 mm, cap 6 kN each | No measured individual flow curves; rear jets have no dedicated forward-speed objective |
| Discharge factors | Nozzles 0.90; feed 0.80; skirt 0.65 | Effective lumped restrictions, not a resolved pipe/regulator network |
| Seal leakage | Perimeter×gap plus 0.0004 m² | Uneven surface, skirt transients and articulation unmodeled |
| Fan / drive | Fan motor 94%; drive efficiency 90%; 45 m/s face-flow limit | Generic efficiencies/head screen; no measured fan curves or thermal derating |
| Aerodynamics | Frontal CdA 0.65 m²; side/broadside Cd 1.1×projected area | Wind-relative flight drag; still-air frontal ramp drag; no CFD/plume-ground model |
| Attitude control | Error gain 20, angular-rate damping 8; angular-acceleration commands capped at ±8 rad/s² roll/pitch and ±2 rad/s² yaw | Generic controller gains; not optimized or flight-qualified |
| Lateral control | Requested force −0.8m(vlateral−target) | Competes with lift/torque; cannot guarantee the requested velocity |
| Burn trigger | Upright cosine >0.90 and clearance <1.12×estimated stopping distance +0.5 m | Feed-aware heuristic; not an optimal control solution |
| Descent target | −0.6 m/s | Generic stopping policy; controls change with actual pressure and orientation |
| Allocator | Force weights 0.7,0.4,0.65 during burn (vertical 0.08 otherwise); torque weights 3.5,2.5,2; linear force penalty 100; 14 sweeps by default | Trades competing targets under actuator saturation; no dedicated fault recovery |
| Stability limits | Tilt≤8°, angular speed≤12°/s | Chosen criteria; no occupant or suspension qualification |
| Internal bays | Front 1.75×0.82×0.80 m; rear 1.45×1.10×0.65 m; pack bay552 L | Idealized bounding boxes; no verified CAD, crush structure or complete routing |
| Gas model | CoolProp 8 reference nitrogen tables by default; optional PR nitrogen or ideal air | Validated property interpolation is coupled into flight; nozzle/feed flow, wall heat, condensation and material temperatures remain approximate or unresolved |
| Regulator/feed topology | Clamped/derated pressure ceiling followed by scalar hydraulic closure at actual nozzle demand; optimistic bound remains selectable | Temperature/exhaust remain at the ceiling; no thermodynamic iteration at solved pressure, regulator droop dynamics or line capacitance |
| Ramp | Starts from rest on one planar circular constraint; no bank | No approach transition, wheel spin, individual contact patches, ramp collision after detachment |
| Landing | Stop at first box contact | No tyres, suspension stroke/damping, continued rolling or stopping runway |

The retained two-dimensional benchmark and `idealTankState()` are separate teaching/comparison models. Their simplified capacity/geometry conventions are not used by the live 3D replay. The live gas and supply paths are in `hardware.js` and `flight3d.js`.

## Longitudinal screening rationale

The default magnitude limit of 1.5 m/s (5.4 km/h) is a deliberately small residual-motion proxy, using the same numerical scale as the vertical limit without implying physical equivalence. It is not a maximum safe longitudinal tyre speed. Forward and backward are screened equally because tyre spin-up, rolling, braking and runway length are absent; a wheeled vehicle can tolerate much greater longitudinal speed. Changing this limit changes classification, not the trajectory.

The opening demo-oriented preset targets the azimuth of the actual horizontal release velocity, placing the rear toward the ramp for the selected geometry. If horizontal release speed is below 1e−6 m/s, the target falls back to the selected track heading. No target is resolved after a stalled ramp. The reviewed baseline retains its original release-track heading; camera controls and illustrative rendering do not alter either simulation.
