## Why

Every prior milestone built and verified one piece of the system in isolation. MILESTONE-15 is the final milestone: prove the *whole* system together — a real scripted event, 10 real clients, real scoring — and hand the owner what they need to decide whether the commercial phase happens (G-6).

## What Changes

- A new Node `partysocket` harness (`tools/harness/`) that spawns a real `wrangler dev` instance, drives 10 real clients (anonymous + account, teamed + solo, one late joiner) through a real 3-step scripted event over real WebSocket connections, and asserts the final individual and team scores against independently hand-calculated expected values (FR-087). Wired into CI as a new step.
- A Playwright spec covering a meaningful slice of the human happy path, run locally as part of this milestone's own verification (not wired into CI — see design.md D1 for why).
- A written PoC validation report (`POC_VALIDATION_REPORT.md`) recording evidence for G-1 through G-5, setting the owner up to make the G-6 go/no-go call. G-5 (zero infrastructure spend) explicitly needs the owner's own confirmation from their billing dashboards — this proposal does not assert it.

This is a pure tooling/validation milestone: it changes no product-observable behavior, so no capability spec changes (`skip_specs: true`).

## Capabilities

### New Capabilities
(none — `skip_specs: true`, see Why above)

### Modified Capabilities
(none)

## Impact

- New `tools/harness/` package (its own `package.json`, added to the existing `tools/*` pnpm-workspace glob automatically).
- `.github/workflows/ci.yml`: one new step running the harness after the existing `Test` step.
- `apps/web`: new `@playwright/test` devDependency, `playwright.config.ts`, and an `e2e/` spec directory.
- New `POC_VALIDATION_REPORT.md` at the repo root.
