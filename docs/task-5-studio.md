# Task 5 — non-custodial Studio

## Recovery and verification status

Scratch maintenance removed the original unpushed implementation. On 2026-10-15 this folder was reconstructed from retained implementation and verification history, including the final independent-review repairs. Historical browser/Axe results are not presented as fresh evidence for the recovered files. The coordinator owns final clean-install, full native-browser/CSP/keyboard/Axe verification and release gates.

Fresh recovery verification after coordinator dependency alignment: `npm run test --workspace @webmcp/studio` passes all 33 tests in 4 files. `npm run build --workspace @webmcp/studio` passes TypeScript and Vite 8.3.4 (442 modules; JavaScript 341.51 kB / 104.25 kB gzip). `git diff --check` passes. Initial mounted test failures exposed duplicate React copies; the coordinator aligned root/app/react-dom/renderer to 19.3.0, and the unmodified tests now pass. No test was suppressed.

## Delivered behavior

React/Vite/TypeScript application consuming the root SDK through `webmcp-sdk:file:../..`. Start with `npm run dev --workspace @webmcp/studio` after the SDK build. Practice is the startup mode, with visibly invented balances, a 2,500 USDC/WETH illustrative rate, and simulated receipts. Live mode uses an injected EIP-1193 external wallet; no keys, seeds, custody, automatic network switching or RPC API keys.

The responsive desktop/mobile workspace contains mode/wallet/network state, ETH/USDC/WETH balances, transfer/swap composer, proposal inbox, explicit review, per-proposal limits/pause controls, current-session activity and a plain-language guide. Native labels, keyboard controls, skip link, focus indicators and status/alert announcements are retained. Original contrast fixes are retained: affected asset/help text is approximately 5.94–5.99:1 on its background, with no audit suppression. Fresh Axe verification remains a release gate.

Initial live support is Base 8453 only: native ETH and allowlisted native USDC/WETH transfers; USDC/WETH exact-input Uniswap V3 swaps in the 0.05% pool. Missing pool/liquidity fails closed. No Sepolia, bridge, native ETH swap, multi-hop or arbitrary contract execution is advertised.

## Services and human authority

- `domain.ts`: exact decimal bigint parsing, frozen intent/review, 120-second expiry, maximum 100 bps slippage, bounded 100-proposal session, policy revision/account/chain binding, cancellation/expiry/replay rejection, receipt reconciliation.
- `wallet.ts`: fixed ABI/address allowlist, quoting, exact separate approval, simulation (including false-return rejection), fee estimation, final context/policy guard and external wallet submission, matched transaction/receipt/event verification.
- `practice.ts`: isolated simulated balances/rate/receipts, never used for live execution.
- `sdk.ts`: only `studio.studio_state` and `studio.studio_propose` are registered. No execution, policy mutation, signing, arbitrary calldata or contract-target tool exists. Proposal cancellation receives the SDK execution signal.
- `App.tsx`: explicit human review and a separate authorization button for each approval/transaction. Every fresh simulation creates a new review generation, so earlier acknowledgement cannot authorize it. Provider account/chain/disconnect events invalidate unsubmitted proposals.
- `fixture.ts`: deterministic EIP-1193 provider imported only in Vite `test` mode; no remote RPC or real signing.

Approval authorizes the fixed router for exactly the proposal amount. A sufficient existing allowance is reused. Confirmed approval returns the proposal to a separate trade simulation/review/signing step; it never automatically trades. Router02 exactInputSingle is wrapped in `multicall(uint256 deadline, bytes[])`, enforcing expiry onchain despite its tuple lacking a deadline.

Signer leases outlive UI timeout wrappers and span gateway instances per provider. Late hashes attach to pending activity without falsely confirming. A submitted hash is not settlement. Receipt outcomes are explicitly confirmed/reverted/unknown; only a matched transaction and authoritative reverted receipt produce failed settlement. Unknown receipts, mismatched transaction evidence, transport failures and ambiguous wallet submission remain pending and cannot be replayed. Known hashes can be checked again.

The two final P2 review fixes are retained and tested: missing `prepare` IDs resolve before acquiring busy, so invalid lookup cannot strand the instance; mode changes copy the saved policy (including paused state), reset draft fields to the saved active limits with a notice, and invalidate the former session. Clicking the already-selected mode is a no-op. Mounted tests assert a visible USDC 20 limit also rejects a 25 proposal after switching practice/live and after clicking Practice again.

## Primary contract references

Addresses and ABIs were checked against primary sources in the original implementation session on 2026-10-12; recovery preserves that reviewed mapping:

- https://developers.uniswap.org/docs/protocols/v3/deployments/v3-base-deployments — SwapRouter02 `0x2626664c2603336E57B271c5C0b26F421741e481`, QuoterV2 `0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a`, WETH `0x4200000000000000000000000000000000000006`.
- https://developers.circle.com/stablecoins/usdc-contract-addresses — native Base USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`.
- https://github.com/Uniswap/swap-router-contracts/blob/main/contracts/interfaces/IV3SwapRouter.sol — Router02 exact-input tuple.
- https://raw.githubusercontent.com/Uniswap/swap-router-contracts/main/contracts/interfaces/IMulticallExtended.sol — deadline overload.
- https://viem.sh/docs/contract/encodeFunctionData — typed ABI encoding.

Uniswap recommends Universal Router for general current integrations; this reference deliberately implements the plan's smaller constrained V3 Router02 path. It does not claim latest-router or other-protocol coverage.

## Reconstructed regression suite and browser fixture

`npm run test --workspace @webmcp/studio` includes 19 domain tests, 11 wallet/receipt/provider tests, 1 SDK boundary test and 2 mounted UI policy tests. These cover exact quantities, immutable policy/intent, slippage, expiry, cancellation, accounts/networks during asynchronous work, failed simulation, exact approval/deadline encoding, rejection 4001, verified reverts, pending reconciliation, RPC ambiguity, altered transactions, timeout/late-hash leases, duplicate provider gateways, agent-only proposal authority, and the final P2 fixes.

`npm run dev:test --workspace @webmcp/studio` exposes `window.__STUDIO_TEST__` only in that test build:

- `provider`: deterministic FixtureProvider; `changeAccount(address)`, `changeChain(number)` emit events; boolean controls `rejectNext`, `revertNext`, `failSimulation`, `pending`; `sent` records fixture send requests.
- `state()`: JSON-safe mode/context/policy/proposal snapshot.
- `propose(request)`: create an agent-like proposal only; cannot sign.

Click Live wallet then Connect wallet to use the fixture. The banner explicitly says deterministic test wallet/no real funds. Tests must click Simulate & review, check the acknowledgement, then Authorize in wallet; no fixture execution shortcut is exposed. Review checkbox resets on refreshed simulation and between approval and trade.

## Honest limits

No real funds, external signatures, mainnet transfers, token approvals or trades were performed. Funded-wallet compatibility, live liquidity, RPC honesty, finality and real-chain execution remain external gates. No absolute security claim is made.

The prepared fee cap covers L2 execution gas; Base's additional L1 data fee is separately disclosed and reviewed in the wallet. Simulation cannot guarantee future inclusion/price/outcome. Standard transfers/approvals have no onchain expiry after submission; swaps do. Unused approvals may remain after expiry. Session state is memory-only and clears on reload/mode change; retain pending hashes before leaving. Confirmed means successful inclusion, not irreversible finality.

## Final send-chain binding review repair

Independent review identified a conditional wallet-network race: preflight and receipt checks bound the intended chain, but the send request omitted the reviewed chain field. Two new regressions first failed: the accepted fixture payload had no `chainId`, and the fixture accepted missing/wrong-chain requests. `WalletGateway.send` now adds `chainId: "0x2105"` from the immutable reviewed intent to `eth_sendTransaction` only; shared `eth_call` and `eth_estimateGas` payloads remain unchanged. The deterministic provider rejects missing or mismatched send chains before recording acceptance. Existing account/chain rechecks, signer leases and receipt verification remain intact.

Fresh verification after this patch: all 35 app tests pass in 4 files (13 wallet tests); standard TypeScript/Vite production build passes. This is request-level hardening, not a claim that an untrusted wallet must honor the field or that a real wrong-chain transaction occurred. No real wallet or funds were used.
