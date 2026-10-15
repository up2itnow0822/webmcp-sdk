# Task 2: security and Python discovery recovery

This record describes the implementation reconstructed on 2026-10-15 after scratch
maintenance removed the earlier unpushed repair. Earlier 2026-10-12 test counts are
historical; the verification below was rerun against the restored source tree.
Workers did not install dependencies, stage, commit, publish, or use live funds.

## Security implementation

`src/security.ts` supplies bounded sanitation, explicit confirmation, admission rate
limits and redacted terminal audit events. `src/__tests__/security.test.ts` restores
50 behavioral regressions.

- `sanitizeInput` takes a bounded own-data JSON snapshot before transformations or
  serialization. It rejects forbidden prototype keys recursively, accessors rather
  than executing them, arbitrary prototypes, cycles, nonfinite numbers and non-JSON
  values. Core owns the shared snapshot helper. Nonenumerable non-dangerous fields
  are omitted like JSON fields; forbidden own keys are rejected even if hidden.
- Oversized strings and arrays, excessive depth, byte and node budgets reject;
  data is not truncated or silently replaced with undefined. Defaults: 65,536 JSON
  bytes, 1,000 nodes, sanitizer depth 5, string length 10,000 UTF-16 code units,
  array length 100. All numeric limits must be positive safe integers.
- HTML stripping scans each character at most once, including unmatched angle
  brackets. Control stripping preserves tab/newline/carriage return. Object writes
  use own data properties. This is not a complete XSS defense or HTML renderer;
  apply the destination's appropriate escaping when displaying tool text.
- `withConfirmation(tool, reason, provider?)` requires an explicit provider returning
  literal true, passes its reason, forwards execution context, and checks cancellation
  before and after asynchronous approval. Browser presence never supplies approval.
- `withSecurity` validates the original input, sanitized input and final admitted
  snapshot against the captured original schema. Direct handler calls get the same
  input and rate guard as kit invocation.
- `admit(input, context)` performs rate admission before core queueing. Private
  WeakMap identities prevent charging the subsequent handler twice; caller-supplied
  booleans cannot bypass the check. Core passes the exact execution context through
  admission, handler and rejection.
- Terminal audit events identify rejected, succeeded or failed outcomes, sanitation
  and blocked flags, duration, and stable error codes. Raw outputs and handler error
  text are never logged. The shared `onExecutionRejected(context, error)` hook covers
  failures before admission; abort listeners cover queue rejection, queued cancellation
  and timeouts. Completed-context WeakSets deduplicate events and suppress late success.
- `audit: true` requires an explicit `onAudit` sink. Logged input is empty by default.
  Optional `auditInputFields` allow-list top-level fields with recursive redaction of
  credential/password/key/token/signature/seed/cookie/authorization field names.

## Breaking 0.6 policy migration

`blockedPatterns` now contains case-insensitive **literal substrings**, not regex
source. Matching uses bounded serialized JSON input, with at most 32 nonempty
rules of at most 256 UTF-16 code units each. Invalid entries and sparse rule arrays
reject. For example, `javascript:` remains a literal rule; `(a+)+$` and `.*` match
only those literal characters. Built-in policy matching never constructs a RegExp
from rules, eliminating catastrophic attacker-input regex matching in that path.
Rewrite prior regex policies as explicit literal rules. Custom application admission
policies are outside this built-in bounded matching guarantee.

## Security RED/GREEN evidence

Freshly restored baseline, before replacing `security.ts`:

`npm test -- src/__tests__/security.test.ts -t 'bounded safe sanitization|explicit confirmation|literal|invalid rate|audit without|audits direct|audits handler|optionally logs|audits dangerous|revalidates'`

Result: **42 failed, 2 passed, 6 skipped** of 50. Failures showed unsafe acceptance,
missing/false confirmation executing handlers, unbounded truncation, regex semantics,
missing sinks/outcomes and sensitive data in logs. The subset avoided waiting for
baseline queue behavior. The full restored implementation subsequently passed
**50/50** with `npm test -- src/__tests__/security.test.ts`.

| Area           | Regressions                                                                                                                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Sanitation     | Three dangerous keys, arbitrary prototypes/Date, NaN/Infinity/undefined, cycles, getters without execution, string/array/depth/node/byte limits, invalid limits, HTML/control stripping, unmatched angle brackets        |
| Confirmation   | Missing provider, false/undefined/string/numeric answers, true approval with reason/context, cancellation during approval                                                                                                |
| Literal policy | Metacharacters treated literally, case-insensitive denial, catastrophic-style rule never compiled, 9,001-character input, empty/nonstring/oversized/excessive/sparse rules                                               |
| Rate           | Invalid quota/window, expiry/reset, direct denial, admission before core queue, no double charge                                                                                                                         |
| Audit          | Missing sink, default input omission, recursive redaction, handler success/failure, unsafe input and policy rejection, pre-admission core failures, queue-full/queued cancellation, timeout and late success suppression |
| Schema         | Final sanitized value must satisfy the original schema                                                                                                                                                                   |

## Separately installable Python package

`python/pyproject.toml` supplies **webmcp-sdk-discovery 0.6.0**, distinct from the
npm webmcp-sdk package. npm installation does not provide Python imports. No PyPI
publication is claimed. Install the checkout using `python -m pip install ./python`.
The actual API is `from webmcp_sdk.middleware import WebMCPAutoSetupMiddleware,
WebMCPDiscoveryMiddleware`. Python 3.10+ is supported. Runtime dependencies are
empty; the build backend is pinned to setuptools 84.0.0. Coordinator owns isolated
installation and out-of-checkout import smoke verification.

The single implementation lives in `python/webmcp_sdk/middleware.py`.
`src/middleware/fastapi.py` is a migration pointer, with no duplicate implementation.
The classes implement the pure ASGI middleware contract and can be passed to
FastAPI/Starlette `app.add_middleware` without importing those frameworks.
See `python/README.md` and `python/AGENTS.md` for usage and boundaries.

- Catalogs default to private. Missing authorization returns 401 unless explicitly
  configured with `public_manifest=True`.
- `authorize(scope)` receives the ASGI HTTP scope, supports sync/async results and
  grants access only for literal True. Supplied providers always run even in public
  mode; exceptions deny with generic 403 without credential/error disclosure.
- Identity must come from existing application authentication/session middleware
  running before discovery. Discovery metadata is not authentication or an MCP tool
  execution transport.
- All manifest/tool/resource responses, denials and unsupported methods use
  `Cache-Control: private, no-store`. GET and authorized HEAD are supported; other
  methods return 405 rather than executing tools.
- Construction validates canonical local paths, bounded printable ASCII header
  values, known unique capabilities, boolean options and callable authorization.
  Catalog bytes are copied at construction. Existing Link headers are preserved.
  Non-HTTP traffic passes through unchanged.

Fresh baseline RED: three original-source tests produced **14 failing subcases**:
three catalog paths returned 200 instead of private 401, six unsafe header values
and five invalid capability configurations were accepted. The old dispatch source
was exercised using a small standard-library Starlette-shape adapter, without
installing Starlette or contacting a live server. Permanent GREEN tests execute
actual ASGI response-start/body messages directly.

`PYTHONPATH=python python -m unittest discover -s python/tests -v`: **17 passed**.
Cases cover private defaults on all routes, public opt-in, sync/async true-only
authorization, exceptions/public-mode denial, authorized HEAD, transport refusal,
configuration copying, path/header/capability/public-option validation, existing
Link preservation, success-only headers, and non-HTTP pass-through.

## Fresh combined verification and residual limits

- `npm test -- --reporter=json --outputFile=/tmp/security-recovery-full.json`:
  **271 passed, 0 failed** at this recovery checkpoint.
- `npm run typecheck`: **exit 0**.
- Scoped `git diff --check`: **clean**.
- The focused security and Python suites passed **50/50** and **17/17** respectively.

These are fresh recovery results, not a guarantee about later parallel edits.
The coordinator must run complete release, package-install, browser and PR gates
against the final integrated commit. npm proxy and Vite config-loader warnings
remain in tool output; no failing checks were suppressed.

Audit sinks are synchronous application callbacks. The SDK cannot guarantee external
persistence or reverse already completed handler effects if a sink fails. Field-name
redaction does not remove sensitive free text from deliberately allow-listed fields.
Core supplies deadlines and prompt caller cancellation; arbitrary handlers must
cooperate with AbortSignal to stop work. Direct wrapped handlers have no independent
queue/deadline scheduler. A registered confirmation wrapper and the kit's configured
confirmation provider are independent guards. React must retain the same admitted
wrapper/context through terminal handling and revoke changed authority. Tests use
harmless deterministic handlers; no real destructive or financial actions occurred.

## Standalone confirmation mutation follow-up (2026-10-15)

Independent recovery review reproduced a direct-wrapper authorization race: a
caller supplied amount 1, changed its object to amount 100 while the confirmation
promise was pending, and the handler received 100 after approval. Registered kit
invocation already used a snapshot; the separately exported helper needed the same
boundary before requesting approval.

Eight new regressions failed before this repair: top-level/nested/array mutation
during pending approval, wrong schema type, missing required fields, recursively
forbidden prototype keys, arbitrary prototypes, nonfinite values, excessive bytes,
and a getter-bearing input. The mutation case returned amount 100 instead of 1;
the seven invalid-input cases executed handlers instead of rejecting. The getter
regression also verifies rejection without invoking the accessor. All handlers
remain harmless test functions; no destructive action or financial operation ran.

`withConfirmation` now captures its schema validator when created. Each call takes
a bounded own-data snapshot, recursively freezes it using core's shared exported
`freezeInput`, and validates it before invoking the provider. It passes that exact
immutable snapshot to the handler after literal-true approval and the existing
post-await abort check. Provider reason/context behavior and annotations remain
compatible. Two explicit integration cases preserve the original admit hook,
annotations, one rate charge and terminal audits with security either inside or
outside confirmation.

Fresh commands after the patch:

- Selected new defect tests: **8 failed before repair**, then passed in the full
  focused security run.
- `npm test -- src/__tests__/security.test.ts`: **60 passed, 0 failed**.
- `npm test -- --reporter=json --outputFile=/tmp/security-confirmation-full.json`:
  **294 passed, 0 failed**.
- `npm run typecheck`: **exit 0**.
- Scoped `git diff --check`: **clean**.

The core owner moved the already-existing recursive freeze helper into input.ts;
this worker edited security.ts, security tests and this report only. The provider
still receives the configured reason under the existing API; applications remain
responsible for presenting an accurate review. The SDK guarantees the handler
receives its validated immutable pre-approval snapshot rather than later mutations
of the caller's object.
