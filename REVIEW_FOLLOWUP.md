# Follow-up to the response (Roadster Flight Lab 4.1)

27 October 2026. Reviewer notes after reading REVIEW_RESPONSE.md, EOS_BIAS.md, MODEL_ASSUMPTIONS.md, the new audit-results.json and the updated page.

## Accepted

- All actions in the response table are verified: 98/98 tests, nine calculation cards, regulator and loss inputs, both rotation policies as presets, heading hold with a lateral target, a 24-row audit with ramp energy, and a map with separated landing and hardware counts (original policy 6 of 66 valid cells pass hardware, new default 9 of 66, none pass landing).
- Correction accepted: my statement that the thermal screen failed in every map cell was broader than the evidence. The combined colouring hid six hardware-passing cells.
- The 1.647 m/s sideways result for the yaw 10° / roll 15° case stands for your implementation. My 1.280 m/s came from a scratch patch that kept world-frame damping. No contradiction.
- Not integrating the reference EOS into flight, and refusing a flat −8 K correction, is the right call. EOS_BIAS.md states the scope honestly.

## New issue surfaced by your own audit: the delivery-loss case

The row "Delivery pressure loss +8 percentage points" lands softer (2.03 m/s, 139 kg) than the default (3.02 m/s, 132.5 kg). More assumed loss should not help. It helps because the loss is a fixed fraction of the setpoint that also sets the pressure difference driving the aggregate feed orifice once the tank is at the setpoint. A larger assumed loss therefore means a larger driving difference and more flow in exactly the phase that decides the landing. The 8 % and the feed orifice represent the same restriction twice.

Suggested fix: make the loss a function of flow, not a constant. Feed pressure = min(setpoint, p_tank) minus a drop that scales with ṁ² through the aggregate restriction (or simply: feed pressure is whatever the feed orifice delivers at the current flow, capped by the setpoint). Then a bigger loss always hurts, the setpoint and the feed diameter stop interacting through an arbitrary 8 %, and the "throat sized for initial rating" action becomes meaningful at every pressure. Until then, the delivery-loss sensitivity row should carry a note that its direction is a modelling artefact.

## Reference EOS in flight is more tractable than the response suggests

The response says one isentrope cannot cover adjustable mass, volume and temperature. True, but the state the solver needs is not tied to one isentrope: it needs T and p on the line of constant s through the current (s₀, ρ), and h at that state; the regulator needs T(h, p_feed). Two 2-D tables cover every input combination: T(s, ρ) and p(s, ρ) on a grid of roughly 100 × 100 points, and T(h, p) on a second grid, both generated once from CoolProp and shipped as a small JSON file. Any initial mass, volume or temperature maps to an s₀ inside the first grid; any setpoint and loss map into the second. Bilinear interpolation on log ρ and log p is accurate to well under 1 K and 1 % at these grid sizes. Mark cells below the saturation line and stop thrust there, as the PR path does now. Thermodynamic consistency between the two tables is not needed for a screen, since both are sampled from the same reference equation. This would turn the thermal verdict, which currently rests on a model known to be 8 K optimistic, into a reference-grade number for about a day of work, and would let you rerun the "+15 °C ambient" case properly.

## Smaller points

- The longitudinal screen (1.5 m/s either direction) is a sensible addition, but the text should say why 1.5 and that forward and backward are treated alike only for lack of a tyre model. A car on wheels tolerates far more than 1.5 m/s along its axis; the screen is really a proxy for "the jets did not leave a large horizontal residual".
- The continuation rule (long branch once, for errors above 2.5 rad opposing the inherited rotation) needs a regression test that it never fires in the upright, the stall, the zero-rate airborne and the pitch-90° cases, and one that it fires exactly once in the driven default. If those exist, ignore this.
- "Jet stuck closed" now gives 21 m/s with 74 kg used under the new policy (27 m/s and 149 kg before). The label change is good; the audit row could also state which jet and that the allocator has no reconfiguration, so a reader does not take the number as a hardware property.
- The two rotation-policy presets differ only in the controller; a one-line note in the preset list saying "same hardware, different flip" would stop readers treating them as different cars.

## Overall

The response fixes the attribution problem the review raised, pins its reference check to a library version and source hash, and does not overclaim. The remaining substantive gap is the thermal verdict's dependence on Peng–Robinson; the table approach above is the cheapest way to close it. The delivery-loss artefact is the one new thing to fix before the regulator inputs are trusted.
