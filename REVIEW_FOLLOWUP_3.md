# Follow-up review 3 — version 4.3: closed

28 October 2026. Read against [REVIEW_RESPONSE_3.md](REVIEW_RESPONSE_3.md), the 4.3 modules in `dist/`, `audit-results.json` and the page served from `dist/`. No creator files were modified.

## Verdict

**The blocking finding from review 2 is resolved. I have no further blocking items.** The consistent feed solve is the default, it matches the independent scratch implementation to three decimals in all nine cases, the headline on the page reads "This scenario does not pass the selected checks" with the feed model and the 85 mm assumption stated beside it, and the README now tells the verdict history straight.

## What I verified

| Claim | Result |
| --- | --- |
| 125 tests pass, syntax checks pass | Reproduced |
| Default 1.659 m/s, fail; optimistic comparison 0.990 m/s, pass | Reproduced from the audit and a fresh run |
| Nine cases in the response table | All nine match my scratch solve from review 2: 1.659 / 1.727 / 1.672 / 1.275 / 1.042 / 1.727 / 1.137 / 0.927 / 0.596 m/s |
| Convergence 1.654 / 1.659 / 1.662 / 1.664 m/s at 6 / 3 / 1.5 / 0.75 ms | Reproduced; all above 1.5 m/s |
| Feed diameter leads the 27-row sensitivity audit | Rows 2 to 5 are 100 mm, 120 mm, −10 %, optimistic bound |
| +8 pp loss still lands harder | 1.727 vs 1.659 m/s |
| Flight-path EOS validation regenerated | 607 of 607 samples accepted in five runs |
| `solveManifold` logic | Same bisection as Appendix A: clip forces at the ceiling, bisect between ambient and ceiling when demand exceeds feed capacity, failed and disabled jets stay zero. Diagnostics record binding time, minimum manifold pressure and residual. |

The code comment stating that temperature and exhaust velocity stay at the pre-solve ceiling is the right level of honesty. That approximation is slightly optimistic, so the true consistent figure is a little above 1.66 m/s, which only strengthens the fail.

## Two notes, neither blocking

- **Delivery-loss sweep is not monotonic at 24 %.** The sweep reads 1.597 / 1.659 / 1.727 / 1.656 / 2.647 m/s at 0 / 8 / 16 / 24 / 40 %. The 24 % point lands 3 mm/s softer than 8 %. This is expected now: once the feed binds, the solved manifold pressure sits below the ceiling regardless of the loss setting, so loss only shifts burn timing. The creator already states that monotonicity is a fixed-state invariant, not a closed-loop theorem. A one-line note next to the sweep would stop a reader from flagging it again.
- **Airborne baseline moved from 1.69 to 2.45 m/s** with the consistent feed. It is not in the response table. The README airborne section should carry the new number so the two documents agree.

## Where the model stands

After three rounds the model's answer to "can the car complete the stunt" is consistent across its own components. The decisive inputs, in order, are the assumed feed diameter, the rotation policy, the regulator setpoint and the cold-component screen. None of them is a measured Tesla number, and the README says so. That is the correct state for an independent screening model, and it is where this review stops.
