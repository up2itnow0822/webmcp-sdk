# 0.6.0 repair and verification record

Candidate branch: `fix/secure-release`. Recovery date: 2026-10-15 UTC. Recovered baseline: `4881c2fbe372e05a733c7117a413c4ab587c3069`. Scratch maintenance deleted prior unpushed repairs; this document distinguishes earlier session evidence from freshly reconstructed checks. The candidate is unpublished.

| Defect family                            | Required repair and verification                                                                                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Implicit confirmation                    | Missing provider denies; literal true only; security/core and packed safety regressions.                                                               |
| Unsafe/prototype/mutable input           | Bounded finite own-data snapshots, forbidden-key rejection, schema checks and freezing before awaits.                                                  |
| Unbounded queue/timeouts                 | Total unresolved admission budget, cancellation/revocation and leases held until actual work settles.                                                  |
| Incomplete/sensitive audit               | Explicit sink, prequeue rate admission and redacted terminal lifecycle on all rejection/outcome paths.                                                 |
| React config/stale authority             | Scoped providers, current committed callbacks/metadata, pending-confirmation revocation and ownership cleanup.                                         |
| Fake x402 success/units/routes           | Exact atomic caps and immutable route/origin/context, explicit approval, external signer and independent verifier; unknown submissions remain pending. |
| Native API drift                         | document adapter, execute, async readiness, registration AbortSignals and real native/CSP verification.                                                |
| Discovery/private catalogs               | Literal-true authorizer or explicit public metadata, no-store, validated metadata; separate installable pure-ASGI Python package.                      |
| Phantom exports/server claims            | Tested actual CJS/ESM subpaths, canonical example and truthful transport/install documentation.                                                        |
| Wallet outcomes and overlap              | Immutable reviewed proposals, exact approvals, fresh account/policy checks, provider leases, exact receipts and no replay.                             |
| Policy display/prepare/title regressions | Preserve saved policy across modes, lookup before busy, include title in React metadata comparison; focused mounted/domain/browser coverage.           |
| Release quality                          | Lockfile-based install, compatible dependencies, full audit, packed docs, native browser/accessibility/mobile checks and final CI.                     |

## Historical evidence

On 2026-10-12, an earlier now-lost worktree independently passed SDK 272 tests and Studio 30 tests before four additional review findings were repaired. Later focused re-review passed React 25, Studio 33, Python 17 and seven browser checks, including native Chromium 153.0.8010.0, strict CSP, canonical example, production fixture exclusion, zero checked axe violations, 390px layout, policy persistence, fake transfer/approval/swap and agent/account revocation. Those results are historical; they cannot certify the reconstructed candidate.

The earlier independent review found policy inputs diverging from enforced limits after mode change, a missing prepare ID locking busy, a stale browser selector and stale React titles. Resolution history is retained in [independent review](release-independent-review.md).

## Fresh recovery evidence and final gate

Coordinator `npm run verify:release` completed with exit 0 on the reconstructed candidate: formatting; SDK typecheck, **294/294 tests across 10 files**, CJS/ESM/declaration build; Studio **35/35 tests across 4 files** and production build; packed consumer imports and real CJS/ESM behavior for all six public entrypoints; included migration/security/release documents; **7/7 actual Chromium 153.0.8010.0 browser checks**; **17/17 Python tests**; full npm audit **0 advisories**. Total unit/integration tests: **346**. Browser evidence includes native execute/abort cleanup, blocked inline/eval under CSP, canonical example, production fixture absence, zero checked Axe violations, 390px layout, policy persistence, transfer, separate exact approval/swap, agent proposal/rejection/account revocation. No funds were used.

An isolated Python wheel built and installed using pinned setuptools84/wheel0.48; import outside the checkout reported version0.6.0 and WebMCPAutoSetupMiddleware. Fresh source review in [recovery-independent-review.md](recovery-independent-review.md) found and closed direct confirmation snapshot TOCTOU, coercible payment wire fields and explicit wallet send chain binding; all have RED/GREEN regressions. Clean committed-checkout reproduction and GitHub current-head CI/merge confirmation remain final gates. The PR head identifies the exact review commit; local GitHub-uploaded trees are SHA matched to the verified local commit.

The prior broad requirement to be immune to all attacks is not verifiable. Funded-wallet/facilitator/finality and production-origin checks remain explicit external verification limits, not passing local checks.

## Limits

No real wallet, funds, chain transaction, facilitator, independent finality oracle, deployment or registry publication was used in these automated checks. Signatures/receipts are deterministic fixtures. Experimental native behavior does not imply universal client compatibility. Dependency audit covers known advisories at check time. See the [threat model](threat-model.md) and [runbook](release-runbook.md).
