# Verification scripts

Coordinator owns scripts. Test actual packaged and browser behavior, reject zero tests/missing native support, clean up temporary child processes. Deterministic wallets only; never publish/deploy/transact. Read docs/release-runbook.md when restored.

Core worker is assigned reconstruction of verify-browser.mjs during recovery; coordinator runs final gate and owns all GitHub writes. CI must preserve the repository-required exact `build` check name via an aggregate job that fails if any release or Python packaging job fails; do not change protection policy to fit new job names.

Vite readiness must use vite-readiness.mjs to normalize ANSI/VT control sequences before the strict child ready-banner test. Preserve child exit/error and occupied-port guards; observing an already listening foreign server is not readiness. src/**tests**/vite-readiness.test.ts includes actual GitHub Actions colored output and negative controls.
