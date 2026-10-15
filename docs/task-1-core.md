# Core validation, execution and browser recovery

Recovered on 2026-10-15 after scratch maintenance deleted unpushed work. Files were reconstructed from this worker's retained implementation/test history. Earlier counts from 2026-10-12 are historical, not fresh release evidence. Coordinator alone installs dependencies, stages, commits and updates GitHub.

## Current behavior

- `@cfworker/json-schema` evaluates schemas without eval or Function construction. Registration validates supported assertion/applicator shapes, regex grammar and explicit draft selection (4, 7, 2019-09, 2020-12; default 2020-12). Nested objects/arrays, integer/null, required/additional fields, references, unions/composition, conditionals, constants, enums and constraints work. Unsupported dynamic-reference features and validator-internal reference overrides reject. Unknown extension/annotation keywords remain permitted.
- `snapshotInput` clones enumerable own data fields into null-prototype records; it rejects nonfinite/non-JSON values, arbitrary prototypes, cycles, enumerable accessors without evaluating them, dangerous own keys including hidden keys, symbol fields, array holes and non-index array fields. Incremental UTF-8 JSON byte accounting includes escapes and surrogate behavior. Inputs are recursively frozen before hooks, admission, queueing and handlers.
- Defaults are maxConcurrent 10, maxQueued 100, timeoutMs 30000, maxInputBytes 65536, maxInputNodes 1000, maxInputDepth 10. Limits are safe positive integers except maxQueued may be zero. Total admission capacity must also be a safe integer; oversized timers reject.
- Total invocation leases are acquired before input cloning or asynchronous policy work. Capacity is maxConcurrent + maxQueued. Unresolved before-hooks/admission promises cannot bypass the bound. Caller cancellation/timeout does not release a lease until the actual operation promise quiesces.
- Handler concurrency slots remain occupied until the actual handler promise finishes, even after caller timeout. Cancelled/timed-out queued calls never execute. Caller failure is prompt, signals abort cooperatively, and late output does not emit core success.
- `ToolExecutionContext.signal` is the optional second handler argument; single-argument handlers remain compatible. The exact same frozen context identity passes through `admit(input, context)` and handler. `onExecutionRejected(context, error)` receives every caller failure, including rejection before admission. This integrates with security's private admission records and complete redacted audits without double charging.
- `subscribe(listener(event, result))` provides observable completions without replacing configured callbacks. Observer exceptions cannot change operation results. `invoke(name, input, {signal})` propagates external cancellation.
- Modern native registration uses `document.modelContext`, `execute(input, {signal})`, asynchronous `ready()` and registration AbortSignals. Registration failures remain observable through ready and onError. Unregister/replacement revokes local and native authority, aborts running/queued invocations, and rejects captured stale callbacks. Legacy navigator behavior requires explicit browserAdapter:'legacy'.
- Current native title/consequentialHint/untrustedContentHint/debugging are supported. Modern native annotations contain only current fields; legacy destructive/confirmation true conservatively maps to consequentialHint true. Top-level title wins over annotation-title fallback. Hints never imply approval.
- Prefix lookup and unregister accept full names without double prefixing. `requestUserInteraction` requires an explicit confirmationProvider and accepts only literal true.
- Current document fixtures and explicit legacy fixtures preserve existing helper use. `validateToolDefinition` shares schema validation, allowing composed properties without a redundant type field.

## Regex restriction

Patterns and patternProperties use a deliberately conservative grammar, checked before runtime matching. Source length is at most 512 characters; total fixed atom width at most 256. Allowed atoms include literals, character classes, common class/control escapes, escaped regex punctuation, fixed hex/Unicode escapes and exact atom repetition `{n}`. One variable `*` or `+` can occur only on the final single atom immediately before `$`, with the expression starting `^`. Groups, alternation, backreferences, lookaround, optional/ranged/lazy repetition and consuming suffixes after variable repetition reject. Fixed patterns have bounded comparison width; variable patterns have one anchored scan. This is an accepted grammar, not a heuristic safety claim for arbitrary JavaScript regex.

Examples supported: `^0x[a-fA-F0-9]{40}$`, `^custom_`, `^[a-z][a-z0-9_.-]*$`. Nested-repeat patterns such as `^(a+)+$` reject at registration. Upstream url/uri/uri-reference format regexes are complex legacy implementations, so those formats also reject. Applications can use explicit URL parsing in policy/handlers. Document this restriction in migration guidance.

## Fresh verification

Tests were restored before production sources. With the fresh baseline core, the core/browser command produced **38 failed / 0 passed**: accepted invalid data/schemas/limits, missing bounded queues/context/readiness, default confirmation approval, double prefixing, absent admission/lifecycle support and wrong native API. The absent queue caused the capacity regression to time out; missing handler context and early failed admission assertions caused expected RED-only pending-assertion/unhandled-rejection warnings.

After reconstructing sources and testing helpers:

```sh
npm test -- src/__tests__/core-hardening.test.ts src/__tests__/browser.test.ts src/__tests__/validation.test.ts src/__tests__/core.test.ts
npm run typecheck
```

Result: **4 files / 86 focused tests passed; typecheck passed.** All 66 added test bodies from the final prior core domain were reconstructed alongside the existing 20 core tests.

Fresh whole-suite run while coordinator middleware reconstruction was still in progress: **265 passed / 6 failed (271 total)**. All six failures were in coordinator-owned discovery-security tests: default-deny private catalogs; literal positive authorization; async policy disclosure; HEAD metadata; ambiguous security settings; bounded paths/header values/capabilities. Root was notified. Typecheck passed in the same run. These transient failures do not constitute a full release pass; coordinator must rerun the complete gate after integration.

Nonfatal warnings: npm unknown http-proxy environment configuration and Vite's planned native config-loader/CommonJS warning. Historical final pre-deletion SDK suite was 272/272 and is recorded only as historical context.

## Verification limits

No live native WebMCP browser was exercised by this worker. Fixtures verify API shape/readiness/abort behavior; the CSP test blocks Function construction, not a full browser CSP policy. Current native source inspected in the original implementation: https://webmachinelearning.github.io/webmcp/ (October 2026 draft). Coordinator owns actual native/CSP/browser/package gates.

Schemas, hooks, handlers and middleware are developer-controlled code. Deadlines cannot preempt synchronous JavaScript or force an uncooperative promise to stop. Stuck operations intentionally retain capacity. Wrappers must preserve their own underlying-operation quarantine rather than claim quiescence when a timeout race settles. Input budgets bound ordinary accepted snapshots, not arbitrary Proxy traps or allocations already made by callers. Hidden non-dangerous non-enumerable fields are omitted like JSON; hidden forbidden keys reject. Structural schema checks are not a claim that every official metaschema/test suite was executed. No absolute-security or live-funded-wallet claim is made.

Fresh follow-up after coordinator middleware restoration: `npm test` passed **271/271 in 9 files** and `npm run typecheck` passed. This supersedes the transient six discovery failures above; it remains a point-in-time SDK check while coordinator continues restoring additional integration/release checks.

## Shared confirmation snapshot helper

The existing bounded-JSON freeze helper was moved from core.ts into input.ts as exported freezeInput, with core reusing it. This lets security freeze direct confirmation snapshots without importing the core runtime. Fresh SDK tests294/294 and typecheck passed after the move; coordinator owns the final full release gate.
