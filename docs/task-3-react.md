# Task 3: React ownership and current state

Recovered on 2026-10-15 from retained implementation history after scratch maintenance removed the unpushed worktree. The reconstructed deliverables are `src/react.ts`, `src/__tests__/react.test.ts` (25 mounted tests), and this task record. Historical results below are explicitly separated from fresh recovery verification.

## Public interfaces

The `webmcp-sdk/react` subpath exports the existing five hooks (`useWebMCPKit`, `useWebMCPTool`, `useWebMCPTools`, `useWebMCPLog`, `useWebMCPAvailable`) and adds `WebMCPProvider`, `WebMCPProviderProps`, and `WebMCPToolLifecycleOptions`.

A provider accepts either `kit={kit}` or `config={config}`, optional `enabled`, and children. Kit/tool/log hooks consume its React context; availability remains a browser capability check. Single/multiple tool hooks preserve their existing tool/config arguments and add an optional third argument `{ enabled?: boolean }`. Provider-wide and hook-local enablement must both be true. Existing one-argument handlers remain valid; optional execution context/AbortSignal is forwarded unchanged.

The core contract consumed by React is `kit.subscribe((event, result) => { ... }): () => void`, `ready()`, `getTool`, register/unregister, and registration-lifetime execution cancellation. Tool definitions support optional `admit(input, context)` and `onExecutionRejected(context, error)` with the same context identity.

## Configuration and migration

Use explicit providers for authentication, policy, multiple roots, or server rendering. Configuration values are compared by key and `Object.is`; callback identity changes count as configuration changes. A mounted config-owned provider rejects configuration changes. Remount with a new React key to replace policy deliberately. A kit-owned provider accepts a replacement kit, revoking old hook registrations; configure that kit before supplying it rather than passing conflicting configuration to descendant hooks.

Unprovided hooks retain a shared default for compatibility. The first call initializes its configuration; later nonempty conflicting configuration throws instead of disappearing. Mounting an unprovided logger/default hook before a policy-configured hook therefore exposes the conflict. Move policy configuration to a provider. There is no production shared-kit reset escape hatch.

## Lifecycle and ownership

Callbacks are published only after commit, so abandoned renders cannot change authentication closures. The hook compares callback identities with the last committed render. Name, top-level title, description, schema, annotations, kit, enablement, handler identity, or admission identity changes revoke and re-register the component-owned tool set. Stable callbacks and unchanged metadata preserve registration.

Changed handler/admission identity revokes pending confirmation, queued work, and running execution contexts through core registration cancellation. This is the safe default without an optional session key. In multi-tool hooks, any changed callback revokes the owned set; independent lifetimes can use separate hooks. Memoize callbacks with complete account/policy dependencies when unrelated rerenders should retain authorization. Never omit authentication dependencies simply to stabilize a callback. Application handlers must observe cancellation again at the actual side-effect boundary: cancellation is cooperative and cannot undo an external operation that already occurred.

Each hook owns its own registrations. Duplicate names on a kit reject before another component's registration is replaced, including separate providers sharing the same kit. Partial multi-tool registration rolls back that hook's successful registrations. Cleanup unregisters only the exact registration identity it created; an externally replaced tool survives. Provider cleanup does not call `unregisterAll` on a caller-supplied kit or remove unrelated registrations.

Security wrappers require the same wrapper and context through admission, handler, and terminal audit. A per-registration WeakMap captures the admitted wrapper. Rejection after queued/running revocation reaches that original wrapper; failures before admission reach the current definition. An additional entry guard rejects changed admitted handler/policy identity. Memoize `withSecurity` wrappers deliberately if their limiter should survive unrelated rerenders: each newly constructed wrapper owns a new limiter.

## Logging

`useWebMCPLog` subscribes after kit creation, preserves configured `onAfterInvoke`, unsubscribes on unmount/kit changes, clears records on kit changes, and honors changed positive-integer `maxEntries`. Multiple consumers can observe completion without replacing security/configuration callbacks. It returns the existing `invocations` and `clearLog` interface.

Completion logs retain core event input/result in memory; applications must choose what to render/export. They do not replace the separately redacted security audit sink.

## UI integration

```tsx
import { createKit } from "webmcp-sdk";
import { WebMCPProvider, useWebMCPTool } from "webmcp-sdk/react";

// Application-supplied human review callback; create once per intended session.
const kit = createKit({ confirmationProvider: reviewWithHuman });

function AgentTools({ account, connected }) {
  useWebMCPTool(
    {
      name: "propose-transfer",
      description: "Create a proposal for human review",
      inputSchema: { type: "object" },
      handler: async (input, context) => {
        context?.signal.throwIfAborted();
        return createReviewedProposal(account, input, context?.signal);
      },
    },
    undefined,
    { enabled: connected },
  );
  return null;
}

function Session({ account, chainId, connected }) {
  return (
    <WebMCPProvider kit={kit} enabled={connected} key={`${account}:${chainId}`}>
      <AgentTools account={account} connected={connected} />
    </WebMCPProvider>
  );
}
```

Account/network keys create an explicit session boundary in addition to callback-change revocation. Recheck current account/network/policy at the financial operation boundary. Agent tools should create immutable proposals for separate human review and external wallet authorization. Await `kit.ready()` when native registration readiness matters. The example's application callbacks are integration placeholders, not SDK exports.

## Historical RED–GREEN evidence (before worktree loss)

These commands were actually run in the prior worktree; they are historical evidence, not recovery-run claims. No real transaction or live wallet was used.

- Initial mounted tests: 11/11 failed. Stale account closure expected `bob` but received `alice`; conflicting policy silently resolved instead of rejecting. Provider tests identified the missing public export. Further provider lifecycle cases extended RED to 14 failures before implementation became GREEN.
- Captured-callback and latest-admission tests added RED failures where unauthorized execution resolved; both became GREEN. Mounted running-unmount regression observed an un-aborted signal, then passed after core registration-lifetime cancellation.
- Security integration RED observed zero events at the current rejection sink and a queued replacement wrapper executing Bob rather than rejecting; original-wrapper/context preservation and revocation fixed both.
- Independent review found mid-confirmation stale authentication. Two mounted regressions (single/multiple hooks) awaited confirmation as Alice, rerendered Bob, approved the old provider, and observed Alice's side effect. Committed handler/admission identity changes now unregister/re-register and abort that context. GREEN asserts no Alice side effect even after flushing the approval continuation, then confirms a new invocation executes Bob. A stable-callback test preserves pending authorization and registration. At that point: focused React 23/23; whole SDK suite 252/252; typecheck passed.
- Independent release review P3 found omitted top-level title. Stable-callback mounted tests updated and removed the title; RED retained `First title`. Including title in the metadata signature produced GREEN local and native-mock definitions plus native cleanup. Final prior-worktree checks: React 25/25; full SDK suite 274/274 in 10 files; typecheck and diff checks passed.

The prior commands emitted npm proxy and Vitest CommonJS-config warnings. Mounted test setup suppresses React renderer deprecation/error output. Mounted Node/native mocks verify lifecycle logic, not actual native-browser support or live financial settlement.

## Fresh recovery verification

Freshly verified after core/security recovery and formatting on 2026-10-15:

- The first focused recovery attempt could not collect tests because shared `input.ts` had not yet landed. No tests ran; this was an integration-order block, not a claimed regression.
- With temporary Vitest aliases pointing only to scratch copies, the Git HEAD legacy React source reproduced the original stale-auth and silently ignored policy defects: two selected tests failed for the intended reasons (`alice` instead of `bob`; expected configuration rejection resolved). Production source was not reverted.
- A separate temporary copy of the reconstructed module with only callback-identity revocation and top-level-title fingerprint omitted reproduced the independent review defects: four selected tests failed (old Alice side effect for single/multiple hooks and retained `First title` after title update/removal); the stable-identity authorization test passed. No production source was mutated by this proof.
- `npm test -- src/__tests__/react.test.ts` against the actual recovered module → 25/25 passed, exit 0.
- After formatting the owned files, `npm test` → 9 files, 271/271 tests passed, exit 0. This is the current recovered SDK suite, not the older historical test count or the complete workspace release gate.
- `npm run typecheck` → exit 0.
- `git diff --check -- src/react.ts src/__tests__/react.test.ts docs/task-3-react.md` → exit 0.
- `prettier --check src/react.ts src/__tests__/react.test.ts docs/task-3-react.md` → exit 0.

The coordinator still owns the complete release gate and independent review. No dependency installs, staging, commits, financial execution, or edits outside the three assigned React deliverables were performed by this worker.
