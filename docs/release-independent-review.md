# Independent review history and recovery status

This report reconstructs the independent correctness review performed on 2026-10-12. Scratch maintenance later deleted the unpushed repaired checkout. Historical findings/results below do not independently certify the recovered 2026-10-15 implementation. This worker now authors recovery documentation, so its documentation self-check is not a new independent product review.

## Original findings and repair history

| Priority | Finding and ordinary local reproduction                                                                                                                                   | Earlier repair                                                                                                                                                                         |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P2       | Mode policy mismatch: save USDC limit 20 in practice, switch live with the fake provider; UI still showed 20 while a proposal for 25 was accepted. No signing was needed. | Preserve saved policy, synchronize inputs, discard unsaved edits explicitly, make selected-mode click a no-op. Mounted/browser regressions verified visible/enforced policy agreement. |
| P2       | Missing prepare ID locks busy: connect a fake Gateway Studio; `prepare('missing')` rejects, then preparing a valid proposal reports an operation already running.         | Lookup before acquiring busy; regression verifies a valid preparation after failed lookup.                                                                                             |
| P2       | Browser verifier selected exact `Trade tokens`, while the app rendered `Swap assets`, preventing later swap/revocation checks.                                            | Match the actual accessible label and run the entire browser flow.                                                                                                                     |
| P3       | Stable-callback React rerender changed only top-level title; local/native registration retained the previous title.                                                       | Include title in metadata identity; mounted tests verify update and removal in local/native definitions.                                                                               |

A subsequent consistency pass found floating actions/install fallback in a redundant generic CI workflow and consumer README links to files omitted from npm packaging. The earlier candidate deleted the generic workflow, retained pinned release/CodeQL actions with immutable install, shipped docs/SECURITY/CHANGELOG/canonical example and tested their packed presence. Final recovery must recheck those actual files and workflows rather than infer closure from this history.

## Historical evidence

Earlier independent runs passed SDK 272 tests across 10 files and Studio 30 tests across 3 files. After the original findings were repaired, focused re-review passed React 25, Studio 33 across 4 files, Python 17 and seven browser checks. The earlier Chromium 153.0.8010.0 run covered native registration/invocation/cleanup under strict CSP, canonical example, production fixture exclusion, zero checked axe violations, mobile width 390, policy persistence, fake transfer, separate approval/swap and proposal-only agent/account revocation. Twenty principal documentation links resolved in the prior checkout. All of these results are historical.

Wallet evidence used deterministic providers only. No real wallet, funded transaction, facilitator or independent chain-finality verification occurred. No absolute-security or formal-audit claim follows from these checks.

## Reconstructed candidate

On 2026-10-15 this worker restored public docs and the canonical example against current source contracts. The example exports its kit, uses document-native awaited readiness, fully prefixed direct invocation, external CSS/module assets, safe text rendering and pagehide cleanup. Final current unit/build/package/browser/CI evidence and exact reviewed commit are pending the coordinator's fresh gate and review. The [verification record](release-verification.md) is the owning release evidence source.
