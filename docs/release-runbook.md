# Release runbook

The reconstructed branch prepares an unpublished 0.6.0 candidate. Scratch maintenance removed prior unpushed work; historical evidence does not establish the state of recovered files. No automated check uses real keys/funds or publishes/deploys.

## Reproduce checks

From a clean repository checkout with Node 22.22.2+ (22 LTS) or 24.15+ (24 LTS):

```sh
npm ci --ignore-scripts
npm run verify:release
git diff --exit-code -- . ':!dist'
```

The complete command checks formatting, SDK types/tests/build, Studio tests/build, packed CommonJS/ESM consumers and included documents, real native browser registration/invocation/cleanup with strict CSP, canonical example, production fixture exclusion, accessibility/mobile layout, deterministic wallet flows, Python tests and dependency audit. Missing browser support or missing tests must fail rather than pass vacuously. Inspect the actual command and CI on the final reviewed commit.

The browser verifier uses installed Playwright Chromium or its locked development fallback, enabling experimental WebMCP only for trusted locally served pages. A root/restricted CI process may require `--no-sandbox`; that is not a recommended ordinary browsing setup. No disabling of web security is needed. Never point this verifier at untrusted pages or live wallets. The root coordinates browser server ports; avoid concurrent fixture verifiers.

Python requires a separate packaging smoke check. In a new task-owned venv, install the build dependencies pinned in `python/pyproject.toml`, build a wheel from `./python`, install that wheel, change outside the checkout and import `WebMCPAutoSetupMiddleware` from `webmcp_sdk.middleware`. Verify version 0.6.0 and record the interpreter/artifact. Runtime framework dependencies are empty. Installing npm does not provide Python imports. CI should repeat this check.

## Real-money readiness

Code checks do not establish funded deployment readiness. Before financial deployment, obtain an independent security assessment of wallet/RPC/deployment and custom x402 adapters/verifiers; test the actual secure origin, browser/client versions, permission UX and security headers. Any minimal funded transfer/swap requires separately explicit authorization. Inspect exact approval, account/chain, amount, minimum output, fees, rejection and unknown/reverted receipt outcomes, and reconcile through independent RPC with documented finality requirements.

Provide monitoring, incident response and pending transaction/authorization reconciliation outside memory-only UI history before operating a persistent financial service. Implementation/dependency changes require regressions and a fresh complete gate. Never relabel unknown as failed or automatically resend financial requests.

## Merge and publication

On 2026-10-15 the user explicitly authorized merging the reviewed security PR after the report fixes and complete PR maintenance/CI gates pass. This does not authorize npm/PyPI publication, production deployment or funded transactions. Review exact artifacts, migration, residual limits and final commit/check status. Registry publication and financial deployment require separate explicit authorization. Record the exact reviewed commit/version; do not present this library as a stdio server or claim absolute security.
