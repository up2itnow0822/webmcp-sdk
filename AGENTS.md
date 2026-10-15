# Purpose

Maintain a secure browser-tool SDK and non-custodial reference studio. Never claim absolute security or fabricate payment outcomes.

# Ownership

Coordinator alone owns package/lock files, dependency installs, source exports, root integration/docs, staging, commits and GitHub updates. Workers own the domains assigned by coordinator; no spawning, stages or commits.

# Contracts

- Read owning instructions before edits; update DOX after meaningful changes.
- Explicit user review and wallet authorization precede financial execution; no key/seed entry, custody, automatic agent signing or real funds in tests.
- Fail closed on absent confirmation, unsafe input, unsupported payment route, stale account/chain/policy and unverified settlement. Immutable intents; ambiguous submitted transactions stay pending.
- Bound input, admission/queue/deadlines and retain leases until underlying work actually quiesces; cancellation is cooperative. Redacted complete security audit needs a real sink.
- Modern native API uses document.modelContext/execute/async readiness/registration AbortSignals; legacy is explicit.
- Every changed behavior requires RED/GREEN regression coverage. Source repairs must survive a full release gate and independent review.
- User explicitly authorized merging the reviewed security PR into main on 2026-10-15 UTC after all report fixes and complete PR Automerge gates pass. This supersedes the prior merge-only approval gate. No registry publication, production deployment or funded transactions are authorized.

# Recovery

Scratch maintenance removed unpushed repairs. Fresh baseline restored from GitHub blobs and SHA verified; tree matches 4881c2fbe372e05a733c7117a413c4ab587c3069. Prior test counts are historical until reconstructed work is freshly verified. Push verified progress frequently to prevent loss.

# Verification

Coordinator restores verify:release: SDK/app typechecks/tests/builds, packed consumers, actual native/CSP/browser/accessibility flows, Python tests and npm audit. Workers report commands and evidence, not completion guarantees.

# Current release gates

`npm run verify:release` covers format, SDK294+Studio35+Python17 regressions at recovery checkpoint, types/builds, packed realCJS/ESM behavior/docs, seven native/browser/CSP/fixture-wallet/accessibility checks and full npm audit. Counts may grow; always rerun rather than infer success. Node22.22.2+ or24.15+ (or26+) is required by current test toolchain. Main required `build` aggregates release matrix and Python package jobs; preserve it.
