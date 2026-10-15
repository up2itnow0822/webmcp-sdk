# Active goal: security fixes and authorized PR landing

Status: active; recovery round 1, started 2026-10-15 UTC. PR Automerge bounds: eight rounds / sixty minutes for this resumed landing attempt.

## Definition of Done
- [ ] Restore and freshly verify every reviewed security repair with regressions (confirmation, prototypes/input/schema, payment truth/policy, React, budgets, audit, native API, discovery).
- [ ] Restore functional non-custodial studio and user-friendly honest UI; proposal-only agents; immutable reviewed terms and explicit wallet signing.
- [ ] SDK/app/Python/package/native browser/CSP/accessibility checks and full dependency audit pass on committed source.
- [ ] Independent review resolved; migration/threat/release docs accurately state scope and residual limits.
- [ ] Security PR pushed, all current-head CI/review/comment/protection gates completely verified, then expected-head merge confirmed by GitHub.
- [ ] Re-evaluate public-readiness goal on main; resume patching any actionable remaining issues. Funded validation/publication/deployment remain separately authorized external gates.

## Last evaluation
Remote fix/secure-release and main both still point to original reviewed 1c7a1c2. No security repair PR exists. Maintenance pruned the uncommitted checkout; previous local passes are historical and cannot authorize merge. Original source restored and blob SHA verified; domain workers reconstructing retained repairs. Do not merge unchanged baseline.

## Authority and limits
User authorized merge when all report issues are addressed on 2026-10-15 UTC. No real fund operations or deployment/npm publication. Absolute absence of hackable surfaces is unprovable; use explicit regression, policy, review and reproducibility proxies and document external trust.
