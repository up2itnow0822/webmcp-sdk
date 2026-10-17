# webmcp-sdk

TypeScript tools for browser agents, with explicit authorization, bounded execution, React lifecycle support and a non-custodial transaction reference app.

**0.6.0 is a breaking security release candidate.** Existing registry releases do not contain these repairs. Read the [migration guide](docs/migration-0.6.md). The candidate is unpublished; this project provides neither custody nor a guarantee against attacks.

## Try the transaction studio

From a repository checkout, with Node 22.22.2+ (22 LTS) or 24.15+ (24 LTS) and npm:

```sh
npm ci --ignore-scripts
npm run build
npm run studio:dev
```

Open Vite's localhost URL. Practice mode uses invented balances, prices and receipts; it never signs or broadcasts. Live wallet mode uses an injected EIP-1193 wallet on Base chain 8453. The candidate supports ETH, native Base USDC and WETH transfers, and USDC/WETH exact-input swaps through the configured Uniswap V3 router and fee tier 500. Agents read state and propose actions; humans separately review each exact approval or transaction and authorize it in their external wallet.

Proposals bind account, chain, saved policy version, exact amount, minimum output and a 120-second expiry. Slippage is capped at 1%. Per-proposal limits do not cap aggregate spending. No key/seed input, arbitrary agent calldata, unlimited approval or agent signing tool is provided. Saved policy survives mode changes; memory-only activity clears on reload or mode change.

A submitted hash is pending. Matching transaction fields, receipt and token events must be checked before confirmation. Ambiguous submissions and RPC failures remain pending. Mined inclusion is not irreversible finality; inspect pending wallet activity before retrying. See the [threat model](docs/threat-model.md) and [release runbook](docs/release-runbook.md).

## SDK quickstart

Install the reviewed package after publication, or build this branch locally. Public subpaths provide CommonJS, ES modules and TypeScript declarations.

```ts
import { createKit, defineTool } from "webmcp-sdk";

const kit = createKit({ prefix: "demo" });
kit.register(
  defineTool(
    "hello",
    "Return a greeting for the supplied name.",
    {
      type: "object",
      properties: { name: { type: "string", maxLength: 100 } },
      required: ["name"],
      additionalProperties: false,
    },
    ({ name }) => ({ message: `Hello, ${name}!` }),
  ),
);
console.log(await kit.invoke("demo.hello", { name: "Bill" }));
// { message: 'Hello, Bill!' }
await kit.ready();
// Later: kit.unregisterAll();
```

Direct invocation works without a native browser API. The default adapter uses **document.modelContext**, `execute`, asynchronous registration and registration AbortSignals. Await `ready()` to observe registration errors. Native WebMCP is experimental and browser/origin dependent. Use the [canonical browser example](examples/browser-hello/) to distinguish local execution from native readiness. A legacy navigator adapter requires explicit `browserAdapter: 'legacy'` and separate compatibility testing. Annotations are advisory metadata, not authorization.

## Execution and authorization

Inputs are finite own-data JSON snapshots, recursively frozen before asynchronous hooks. Dangerous keys, cycles, arbitrary prototypes, accessors and invalid schemas reject. Validation works without `unsafe-eval`; [supported schema restrictions](docs/migration-0.6.md) are intentional compatibility limits.

Defaults: 10 concurrent executions, 100 queued/admitted waits, 30-second deadlines, 65,536 input bytes, 1,000 nodes and depth 10. Handlers receive an optional second `{ signal }` argument. Propagate cancellation and check current authority at the operation boundary. A deadline cannot preempt synchronous JavaScript or force an uncooperative promise to stop; unresolved work retains its capacity/lease until it settles.

```ts
import { withConfirmation, withSecurity } from "webmcp-sdk/security";

// reviewedTool, showReviewDialog and writeAuditEvent are application-owned.
const secured = withSecurity(
  withConfirmation(
    reviewedTool,
    "Approve these reviewed terms?",
    showReviewDialog,
  ),
  {
    rateLimit: { maxInvocations: 10, windowMs: 60_000 },
    audit: true,
    onAudit: writeAuditEvent,
  },
);
kit.register(secured);
```

`withConfirmation` requires its explicit provider to return literal `true`. `kit.requestUserInteraction` independently requires kit configuration `confirmationProvider`. Financial review must bind immutable terms; a generic boolean dialog is insufficient by itself. `audit: true` needs a reliable synchronous sink. Security audit omits input by default and never logs raw handler results/errors; explicitly allowed fields receive credential-key redaction. General kit callbacks/logs can contain input and are not a redacted audit store. `blockedPatterns` are bounded literal substrings, not a comprehensive prompt-injection filter.

## React and declarative forms

Use `WebMCPProvider` from `webmcp-sdk/react` to scope session policy. Tool hooks publish committed handlers/metadata, revoke old registrations when callback authority changes, and remove only their owned registrations. Config-owned providers reject changed configuration; remount to replace policy. Supplied kits may be replaced. Stable callbacks avoid unnecessary revocation but must retain all account/policy dependencies.

`registerDeclarativeTools(kit, root, { handlers })` registers annotated forms through an explicit trusted handler map and returns cleanup. HTML cannot define executable handlers. See [declarative tools](docs/declarative-tools.md) for supported fields and authorization responsibilities.

## x402 and discovery

> **x402 payments:** Paused for security maintenance. Do not use in production.

`webmcp-sdk/middleware/express` serves discovery metadata, not an execution transport or authentication system. Catalogs deny by default: supply an authorizer returning literal `true`, or deliberately choose `publicManifest: true`. Catalog responses use `private, no-store`. Actual operations need separate authentication and authorization.

Python discovery is a separate [source distribution](https://github.com/up2itnow0822/webmcp-sdk/tree/main/python); npm does not install Python imports. No stdio server, `webmcp-sdk serve`, `ProxyRelay` or `AuditLog` class is supplied.

## Verification

```sh
npm run verify:release
```

The [release record](docs/release-verification.md) distinguishes historical evidence from freshly reconstructed checks. The complete gate covers formatting, types, SDK/Studio tests and builds, packed consumers, native browser/CSP, deterministic wallet flows, accessibility/mobile checks, Python tests and dependency audit. Python installation has a separate wheel-import check. No automated check publishes, deploys or sends real funds. See [SECURITY.md](SECURITY.md) for reporting. MIT license.
