# x402 integration contract

> Paused for security maintenance. Do not use in production.

The SDK supplies transport/policy; applications supply trustworthy wallet authorization and independent settlement verification. Supported wire format is x402 V2 `exact`, EVM CAIP-2 networks and EIP-3009 authorization. Other schemes/versions fail closed. Studio wallet transfers/swaps are separate.

## Required interfaces

`X402WalletAdapter` uses protocol `x402-v2-exact`, live `getWalletContext({signal})` and `authorize(details, {signal})`. The wallet returns the complete V2 payload with matching payer, recipient, atomic value, validity and nonce. Do not broadcast in `authorize`, cache disconnected context or ignore expiry/cancellation. No private-key string adapter is supplied.

Supply exact HTTPS `allowedOrigins`, `supportedNetworks`, and `routes` containing network, asset, payTo, verified decimals and canonical positive `maxAmountAtomic`. Supply `onPaymentRequired` for every payment, returning literal `true` only after human review of immutable terms. Route/USD caps never bypass approval.

`verificationProvider` independently checks authentic successful receipt, chosen finality, exact asset/payer/payee/amount/network and authorization/nonce/resource binding. It returns `verified` with all matching fields, `pending` if uncertain, or `failed` only for authoritative failure. A server settlement header or hash is insufficient. A dishonest application verifier can lie; it is a trust boundary.

Optional legacy-named `maxAutoApproveUsd` is an additional USD cap and needs `valuationProvider` returning the exact positive decimal value of the entire payment. Manual `maxAmount` is a canonical positive token decimal using configured decimals, never USD. Fractional trailing zeros reject. The whole-operation deadline defaults to 30 seconds and is at most 120 seconds.

## Flow and reconciliation

`x402Fetch(url, init, config)` supports replayable GET without a body. It validates `payment-required`, obtains approval, signs externally, retries the exact resource once with `payment-signature`, then checks `payment-response` through the independent verifier. Redirects and caller payment headers reject. Supported challenges have one offer; extensions/custom flows are unsupported. Bounded headers/data/URLs and exact amount checks apply.

`createPaymentTool(config)` exposes this same executing flow for `{url, paymentHeader, maxAmount?}`. The supplied challenge must match a fresh resource challenge. Register it only with actual human review; it is not part of the Studio proposal-only tools.

`x402Middleware(config)` wraps handlers whose thrown Error has `status=402` and a supported response/header with an explicit resource. It refreshes that GET resource and returns the verified payment result. It does not fabricate application output or rerun an arbitrary failed business operation.

Signed nonce reuse is rejected per adapter until expiry. An adapter-wide lease survives wrapper timeout until underlying work settles. Unknown signed-retry outcomes, timeout, missing/malformed settlement headers, HTTP failure and unavailable/mismatched verification remain pending. `X402PaymentError` carries immutable payment details and any known transaction hash for reconciliation. Absence of a hash does not prove absence of settlement. Reconcile by authorization/nonce through trusted chain evidence before permitting another payment.

Payment and resource delivery are not atomic. A resource may remain unavailable after settlement; no automatic payment retry is safe. Deterministic fixtures exercise transport/signature/verifier behavior without a funded payment or facilitator. Real token domains, wallet signing, finality and trusted verification require separate integration validation. Never use an invented-signature/success callback in production.
