# Task 4: truthful x402 payments

The baseline implementation returned `success: true` and a fabricated `0x_pending_implementation` hash without wallet authorization, settlement or a resource retry. It used `parseFloat` and compared token values with a USD threshold. The repair never treats readiness, a signature, a submitted transaction, or a server's settlement claim as success.

## Supported protocol and units

`webmcp-sdk/x402` provides a dependency-free HTTP transport boundary for x402 version 2, one advertised `exact` EVM ERC-20 offer, and an EIP-3009 authorization payload. It reads Base64 JSON `PAYMENT-REQUIRED`, sends Base64 JSON `PAYMENT-SIGNATURE` on exactly one GET retry, and reads `PAYMENT-RESPONSE`. Explicit application configuration supplies CAIP-2 EVM network identifiers, asset contracts, recipients, and known asset decimals. There is no default payment network or assumed token price.

Wire `amount` and normalized `maxAmountRequired`/`amountAtomic` fields mean positive integer atomic token units. Parsing rejects whitespace, partial strings, exponents, NaN, Infinity, numbers, zero, negatives, leading zeros and uint256 overflow. Comparisons use BigInt. The manual tool's optional `maxAmount` is a canonical positive human token decimal interpreted with configured asset decimals, without rounding or floating point. Fractional trailing zeros reject (`0.01` accepted; `0.010` rejected).

Only GET without a body is replayed, to canonical HTTPS URLs on an explicit origin allowlist, without URL credentials or fragments. Redirects are forbidden on initial and signed requests. Caller-supplied payment headers reject. Header data is capped at 16 KiB, URLs at 2048 characters, parsed JSON at 1000 nodes/depth 10, quote timeouts at 120 seconds, and operation timeouts at 120 seconds (default 30 seconds). Plain and null-prototype own-data snapshots are accepted; accessors, forbidden prototype keys and custom prototypes reject. Multi-offer negotiation, extensions, custom flows/transfer methods, native currency, Permit2, upto/batch/deferred settlement, V1 headers and POST retry are unsupported and fail closed.

## Application integration contract

```typescript
const config: X402Config = {
  adapter: {
    protocol: "x402-v2-exact",
    getWalletContext: async ({ signal }) => walletBridge.getContext(signal),
    authorize: async (details, { signal }) => {
      // Reviewed EIP-3009 authorization through a noncustodial external wallet.
      // Verify the token EIP-712 domain, chain, payer, recipient, exact amount,
      // deadline and fresh nonce. Do not broadcast in this callback.
      return walletBridge.authorizeExactPayment(details, signal);
    },
  },
  verificationProvider: async (request) => receiptVerifier.verify(request),
  supportedNetworks: ["eip155:84532"],
  allowedOrigins: ["https://your-payment-resource.example"],
  routes: [
    {
      network: "eip155:84532",
      asset: verifiedTokenAddress,
      payTo: reviewedMerchantAddress,
      decimals: verifiedTokenDecimals,
      maxAmountAtomic: reviewedAtomicCap,
    },
  ],
  onPaymentRequired: async (intent, { signal }) => {
    return reviewUI.requestExplicitHumanApproval(intent, signal);
  },
};
const response = await x402Fetch(resourceUrl, { signal }, config);
```

`walletBridge`, `receiptVerifier` and `reviewUI` above are required application integrations, not SDK exports. This is not a supplied wallet or RPC implementation. No x402 package dependency is required by the SDK transport. Applications may adapt the official `@x402/core`/`@x402/evm` family while preserving these policy and verification checks.

The adapter reads the live wallet account/network, obtains external-wallet authorization, verifies EIP-712 token domain/chain metadata, generates fresh unpredictable nonces, and honors AbortSignal. Raw private-key strings and the old generic string-signing API are removed. The SDK reads wallet context before review, after approval and after signing. Changes reject. Reviewed intent is frozen; returned authorization must match accepted requirements, resource, payer, recipient, atomic amount, signature shape, validity window and nonce shape. Structure checks do not establish cryptographic authenticity of an arbitrary application adapter's signature.

One operation lifetime lease is shared by the source wallet-adapter identity across all SDK configuration snapshots. Caller cancellation or timeout returns promptly while retaining that lease until the actual underlying review/signing/fetch/verification promise quiesces. If signing ignores AbortSignal and never finishes, subsequent payments reject as busy/quarantined. A new adapter identity must not be used to bypass an unfinished wallet operation. Class prototype methods retain their original receiver.

The independent verifier must establish successful chain receipt and configured finality, exact chain/token/Transfer logs/recipient/amount/payer, and consumption of this EIP-3009 authorization nonce. It must bind the evidence to this resource and immutable payment intent. It returns `status: 'verified'` with `transaction`, `network`, `asset`, `payTo`, `amountAtomic`, `resource` and `payer`, or an authoritative `status: 'pending' | 'failed'`. The SDK compares every verified field against intent, wallet and settlement header. A submitted hash or server header is insufficient. The application verifier remains a trust boundary: a malicious supplied verifier can lie.

Every payment requires `onPaymentRequired` to return exactly true, regardless of amount. Missing providers, false and true-like strings reject. `maxAutoApproveUsd` has no default and never bypasses human approval. Its legacy name means only an additional USD cap requiring an explicit `valuationProvider` returning the exact positive decimal USD value of the entire payment. String caps preserve precision. No token peg or token-to-USD conversion is fabricated.

Signed nonce replay rejects within the same adapter identity until expiry. The in-memory cache holds at most 1000 active public nonces and rejects when full. This does not replace chain-level nonce consumption, durable application replay protection, or survive process restarts. New adapter identities have separate caches.

## Public exports and migration

- `parseX402Header` returns immutable normalized details for supported Base64 v2 headers, otherwise null. Missing units, chains and resources are not inferred.
- `createX402PaymentPayload(details, authorization)` serializes a wallet-produced v2 payload. A transaction-hash string throws a migration error; a hash is not authorization.
- `x402Fetch(url, init, config)` performs an initial request and at most one signed retry. Paid responses return only after successful resource outcome, matching settlement header and independent verification. Ordinary initial non-402 responses retain fetch semantics.
- `createPaymentTool(config)` executes the transport after validating supplied quote against a fresh server quote. It never claims `ready_to_settle` as success. A verified result's `responseBody` is the unlocked Response stream for application consumption.
- `x402Middleware(config)` forwards optional `{signal}` context to its original handler. A thrown Error with status 402 must expose a supported v2 `payment-required` header through a Response, Headers/record or `paymentHeader`. It refreshes that exact GET resource before review and returns verified payment result containing the Response.
- Old `signer`/`rpcUrl` configuration and missing adapter/verifier/confirmation/allowlists reject at configuration. This is a breaking 0.6 migration.

Failures throw `X402PaymentError` with success false, a distinct status, immutable `paymentDetails` for submitted-intent reconciliation and a public transaction hash when available. All nonauthoritative errors after signed submission stay pending: network errors, timeout, HTTP errors/redirects, malformed/missing settlement headers, server-declared failure, invalid verifier evidence and unavailable external verification. After submission, failed requires an independent verifier's authoritative failed outcome. Never automatically resubmit a pending payment. Settlement may already have occurred while the resource failed; GET delivery and chain settlement are not atomic.

`onPaymentSettled` runs only after independently verified success. Observer exceptions do not turn a verified financial result into failure, and asynchronous observers do not delay the result. Signature and verifier errors are reported without exposing signer/RPC credential details.

## External limits

No funded wallet, live financial transfer, facilitator call or RPC transaction is executed during automated development. Browser wallet permissions, signing correctness, real token metadata, RPC reliability/finality, transfer logs and funded end-to-end settlement remain external application gates. The deterministic test signatures and receipts establish SDK behavior, not real-chain authenticity. No absolute security claim is made.

## Primary protocol sources

Sources checked during original implementation on 2026-10-12; protocol scope is pinned to the described supported v2 subset rather than claiming support for all future schemes:

- [Foundation v2 specification](https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md): requirements, atomic units, authorization fields, settlement and pending states.
- [Official HTTP 402 documentation](https://docs.x402.org/core-concepts/http-402): Base64 JSON headers and settlement distinction.
- [Official v1-to-v2 migration](https://docs.x402.org/guides/migration-v1-to-v2): CAIP-2 networks, current package family and header changes.

## Recovery and verification

Scratch maintenance removed the unpushed original repair. On 2026-10-15 this domain was reconstructed from retained source/tool history. Historical results before pruning were 74/74 focused payment regressions, passing typecheck and 255/255 complete SDK tests. Those are not current evidence until rerun against the recovered tree.

The historical RED rounds specifically reproduced fabricated success, malformed/partial amounts, skipped rejecting approval, ignored routes/limits, wrong USD units, unverified settlement, network submission uncertainty, signer error leakage, observer-induced false failure, class adapters, nonce replay, null-prototype registered input, signing after wrapper timeout, and forged server-controlled failure after submission. Fresh recovery verification is recorded below after dependencies become available.

Fresh recovery evidence (2026-10-15):

- Reconstructed tests against recovered unsafe baseline: 72 of 74 failed, including the fake success/placeholder hash regression. The two passing tests covered preexisting rejection paths rather than establishing payment functionality.
- After source reconstruction, `npm test -- src/__tests__/x402.test.ts`: 74/74 passed.
- `npm run typecheck`: passed against the concurrently restored SDK interfaces.
- Initial full recovery `npm test`: 265/271 passed across 9 files. Six coordinator-owned discovery regressions were in RED during restoration: private default denial, literal positive authorization, async-policy nondisclosure, HEAD metadata, ambiguous security settings, and bounded paths/headers/capabilities. Reported to the coordinator rather than changing another domain.

Payment recovery is locally verified; final complete-release tests, independent review, CI and merge gates remain coordinator-owned. Historical all-suite counts above are kept as history and not substituted for fresh release evidence.

Additional recovery self-review repair: numeric EIP-3009 validity timestamps and array-coerced address/nonce values were accepted by regular-expression coercion. Nine strict-type regressions failed before explicit string guards. The public serializer, quote parser, route/wallet contexts and settlement payer now reject these malformed values without a signed retry. `npm test -- src/__tests__/x402.test.ts`: 83/83 passed; `npm run typecheck`: passed. Complete current release verification remains coordinator-owned.

After concurrent security/core repairs settled, independent full SDK rerun passed 294/294 tests across 10 files; typecheck passed. This includes all 83 payment tests. An earlier full run overlapping freezeInput relocation had transient reference errors and was explicitly reported to the coordinator; it is superseded by the settled-tree rerun.
