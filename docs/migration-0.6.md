# Migrating to 0.6.0

This unpublished candidate intentionally rejects behavior earlier versions silently accepted. Verify your application against the reviewed commit before upgrading.

| Earlier behavior                       | Required change                                                                                                                                           |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Missing confirmation silently approved | Pass an explicit provider to `withConfirmation`. Kit `requestUserInteraction` separately requires `confirmationProvider`. Only literal `true` approves.   |
| Automatic navigator registration       | Default is `document.modelContext`. Await `kit.ready()`; select legacy mode explicitly only for tested old integrations.                                  |
| Partial schema/input checks            | Supply finite own-data JSON and valid object schemas. Additional properties, nested types, compositions and supported references are enforced.            |
| Mutable/prototype/getter input         | Plain/null-prototype JSON objects and ordinary arrays are snapshotted/frozen. Dangerous keys, cycles, symbols, array holes and unsafe descriptors reject. |
| Unbounded work                         | Configure safe-integer budgets; defaults are concurrency 10, queue 100, timeout 30000 ms, bytes 65536, nodes 1000, depth 10.                              |
| Timeout implied work stopped           | Propagate `{signal}` and retain actual signer/work leases until the underlying promise settles. Cancellation cannot undo side effects.                    |
| Audit without a sink                   | `audit: true` requires synchronous `onAudit`; inputs are omitted by default. Explicit allowlists still need data minimization.                            |
| Blocked patterns were regex            | Use at most 32 nonempty literal substrings, each at most 256 characters.                                                                                  |
| Shared React config disappeared        | Prefer `WebMCPProvider`; conflicting shared config rejects. Remount a config-owned provider to change policy.                                             |
| Changed callbacks retained authority   | Callback/admission changes revoke old registrations and contexts. Memoize with complete current-state dependencies.                                       |
| x402 placeholder/hash success          | Supply a real noncustodial adapter, per-payment human review and independent chain verifier. Legacy signer/key examples reject.                           |
| Token value compared with USD          | Atomic route caps use bigint. Human token caps use verified decimals; optional USD caps need explicit exact valuation and never bypass review.            |
| Discovery published private metadata   | Supply an authorizer or explicit public setting. Metadata does not authorize execution. Python is a separate ASGI package.                                |
| Phantom server/exports                 | No stdio server, `serve` command, `ProxyRelay` or `AuditLog` class is provided.                                                                           |

## Schema restrictions

The CSP-safe validator is `@cfworker/json-schema`. Explicit draft 4, 7, 2019-09 and 2020-12 schemas are supported; the default is 2020-12 and root inputs require `type: 'object'`. Developer-owned schemas remain trusted configuration, not an arbitrary-schema sandbox. Unsupported dynamic references and reserved validator-internal reference overrides reject.

`pattern` and `patternProperties` use a conservative grammar: at most 512 source characters and fixed width at most 256 atoms; literals, character classes, supported escapes and exact atom repetition `{n}`. A single variable `*` or `+` is allowed only on the final atom before `$` in an expression anchored at `^`. Groups, alternation, lookaround, backreferences and optional/ranged/lazy repetition reject. Examples: `^0x[a-fA-F0-9]{40}$`, `^custom_`, `^[a-z][a-z0-9_.-]*$`.

Formats `url`, `uri` and `uri-reference` reject because upstream complex regexes lie outside the bounded contract. Use a bounded string and explicit URL/origin parser in application policy. Unknown annotations/extensions do not necessarily enforce constraints.

## Registration and React

Register normally, await readiness and revoke with `unregister`/`unregisterAll`. Native `execute` receives the guarded SDK handler; registration cleanup uses AbortSignals. Top-level title and supported annotations are forwarded. Destructive/confirmation hints conservatively imply consequential metadata; metadata never substitutes for a human provider.

Hooks update committed callbacks, schema, title and annotations. Changed callback authority revokes pending invocations, including awaited confirmation. Already-running application code must cooperate with the signal at its operation boundary. Hook cleanup preserves unrelated tools/external replacements. `useWebMCPLog` is a bounded diagnostic subscription, not a persistent audit store.

## Development runtime

The complete repository verification toolchain (including jsdom) requires Node22.22.2+ on22LTS,24.15+ on24LTS, or26+. CI exercises22/24. Earlier22 releases cannot run the full current developer checks. This0.6candidate intentionally updates the engine contract. Standalone confirmation also snapshots, deeply freezes and validates input before asynchronous approval; handlers receive the reviewed snapshot. Wallet send requests explicitly bind the reviewed chain. x402 wire addresses, hashes and authorization timestamps require strings rather than coercible values.
