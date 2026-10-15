# Threat model and operating limits

Scope: the browser SDK, discovery middleware, x402 transport and Base reference Studio. The project has no custody, exchange backend, bridge or contracts of its own.

| Boundary                | Enforcement                                                                                           | External assumption                                                                                                            |
| ----------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Agent → SDK             | Finite JSON snapshots, schema/input/work budgets, admission and registration lifetime, redacted audit | Same-origin handlers/schemas are trusted; JavaScript cannot sandbox hostile page code/Proxy traps or preempt synchronous work. |
| Agent → Studio proposal | Allowlisted actions/assets, exact amounts, policy version, account/chain and expiry                   | Human reviews immutable terms and wallet display; agent language may mislead.                                                  |
| Proposal → wallet       | Fresh review, simulation, exact approvals, current authority checks and provider signing lease        | Wallet/extension and RPC integrity; unresolved requests can intentionally block availability.                                  |
| Transaction → result    | Matching transaction fields, chain, successful receipt and token events                               | RPC may lie and receipts can reorg. Independent RPC/finality assessment is required for financial deployment.                  |
| x402 → payment          | Origin/route caps, per-payment approval, immutable EIP-3009 terms/nonces, one signed retry, verifier  | Application signer/verifier must establish authentic chain state and authorization/resource binding.                           |
| HTTP → catalog          | Private defaults, literal-true authorizer or explicit public metadata, no-store                       | Host application supplies identity and separately protects execution.                                                          |

## Financial limits

Live support is Base 8453 only: ETH and allowlisted native USDC/WETH transfers, plus USDC/WETH Uniswap V3 exact-input swaps through the configured router. Agents cannot choose arbitrary calldata/contracts or unlimited approvals. Exact token approval grants spend authority even if the later swap expires or fails; unused allowances may remain.

Bigint atomic amounts avoid floating-point rounding. Frozen minimum output/slippage terms do not protect against an unfavorable initial quote. Slippage is capped at 1%, proposals expire after 120 seconds, and session proposal count is bounded. Per-proposal limits are not aggregate spending controls. Simulation is a point-in-time check, not a future guarantee.

Unknown outcomes stay pending. Timeouts do not prove no transaction was authorized or broadcast. An unresolved wallet request retains its provider lease; a late hash is recorded for reconciliation. Do not blindly resend. Browser history is in memory and clears on reload/mode change; record pending hashes before leaving. Closing a page cannot revoke a signed transaction.

Execution gas caps do not include every possible Base L1 data fee. Receipt verification establishes matching mined inclusion, not irreversible finality or a configurable finality depth. Actual wallet compatibility, independent RPC reconciliation, funded execution and operational monitoring remain external gates.

## Web, dependencies and data

The production build excludes deterministic wallet fixtures. The browser gate tests trusted local pages under strict self-only CSP without `unsafe-eval`, native registration/cleanup, accessibility and narrow-screen layout. Deploy with HTTPS, suitable CSP/security headers and a reviewed update process. Compromised extensions, injected scripts, dependencies and wallet phishing remain risks.

Input sanitization is neither a universal HTML/XSS nor prompt-injection defense. Render outputs through safe UI APIs; never evaluate agent output or treat natural-language output as authorization. Enforce current policy immediately before irreversible operations.

Dependency audit is a point-in-time known-advisory check. A lockfile and pinned release workflows reduce drift without establishing trust in every dependency. Verify the actual final workflows and complete gate before release.

Never enter a key, seed or mnemonic; no such UI is supplied. Security audit omits inputs/results/errors by default; application sinks own reliability, access and retention. General kit callbacks/diagnostics can contain sensitive inputs. Credential-key redaction cannot remove every secret from deliberately logged free text. Public catalogs must contain no secrets; same-origin code can observe session data and wallet addresses.

Local testing and review do not establish an absence of every exploitable surface. See the [release runbook](release-runbook.md) for real-money readiness requirements.
