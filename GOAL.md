# Active goal: security fixes and authorized PR landing

Status: active; recovery round 2, started 2026-10-15 UTC. PR Automerge bounds: eight rounds / sixty minutes for this resumed landing attempt.

## Definition of Done

- [x] Restore and freshly verify every reviewed security repair with regressions (confirmation, prototypes/input/schema, payment truth/policy, React, budgets, audit, native API, discovery).
- [x] Restore functional non-custodial studio and user-friendly honest UI; proposal-only agents; immutable reviewed terms and explicit wallet signing.
- [x] SDK/app/Python/package/native browser/CSP/accessibility checks and full dependency audit pass on committed source.
- [x] Independent review resolved; migration/threat/release docs accurately state scope and residual limits.
- [ ] Security PR pushed, all current-head CI/review/comment/protection gates completely verified, then expected-head merge confirmed by GitHub.
- [ ] Re-evaluate public-readiness goal on main; resume patching any actionable remaining issues. Funded validation/publication/deployment remain separately authorized external gates.

## Last evaluation

Recovered candidate full verify:release passes: SDK294,Studio35,Python17 tests (346 total),7actualbrowser/native/CSP/accessibility flows, packed CJS/ESM consumers/docs, type/build/format, npm audit0. Python wheel install/import isolated outside checkout passed. Independent recovery findings (direct confirmation immutable snapshot, strict payment strings, wallet send chainId) are closed with regressions. No live funds or production operation occurred. SDK checkpoint845360a141d798b33f237ca9df423539f39b426f is durable on GitHub. Complete candidate commit/push, clean-checkout reproduction, current-head CI/review/settle gates and merge confirmation remain. This is not a claim of universal security or funded financial readiness.

## PR maintenance checkpoint

Mode merge. Recovery/repair batch2 of8; started approximately2026-10-15T01:05UTC, cap02:05UTC. No repair PR existed at resume; latest remote repair branch checkpoint is845360a141d798b33f237ca9df423539f39b426f. Base main remains1c7a1c22b97a4259fc3c9240160ba884a0c90acb. Never merge the old checkpoint without complete candidate gates.

## Authority and limits

User authorized merge when all report issues are addressed on 2026-10-15 UTC. No real fund operations or deployment/npm publication. Absolute absence of hackable surfaces is unprovable; use explicit regression, policy, review and reproducibility proxies and document external trust.

## Merge policy evidence

Active repository ruleset24042059 requires PR, zero mandatory approving reviews, resolved threads, and exact GitHub Actions check build. Preserve via failing-on-any-gate aggregate job; do not alter protection. Legacy protection admin endpoint403; public ruleset details and PR server mergeability provide current gate evidence. User merge authorization applies to this repair PR only.

This file is the candidate-build checkpoint. The PR timeline carries the later authoritative CI/merge state; always fetch it before resuming landing. Full public financial deployment validation is an external terminal verification limit, not an assertion from local fixtures.

## CI repair round 2

PR76 open at9a7379a66db89cbb4d1819b49539acbe5551eb6c; Node22/24 source/tests/builds/packed consumers pass, Python package and CodeQL pass, but colored Vite output prevents browser readiness detection. Captured ANSI regression and strict normalization patch are under verification. Required build failure is respected; no merge attempted. Deadline remains02:05UTC.
