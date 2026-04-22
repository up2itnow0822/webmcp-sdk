# Onboarding repair comparison

This note shows what was broken in `webmcp-sdk` onboarding before the repair pass and what now works.

| Area | Before | Now |
|---|---|---|
| First success path | README jumped toward browser-specific setup too early | README starts with a direct verified-success path using `kit.invoke(...)` |
| Browser setup | README referenced `kit.init()` even though the SDK does not expose it | Docs explain that browser auto-registration happens on `kit.register(...)` |
| Browser proof | No single canonical browser walkthrough | `docs/browser-hello-quickstart.md` plus `examples/browser-hello/` provide one canonical path |
| Testing docs | README referenced nonexistent helpers `createMockBrowserContext` and `WebMCPTestRunner` | README now uses the real helpers `createMockContext`, `testTool`, and `formatTestResults` |
| React example | README used `parameters` instead of the real `inputSchema` field | React example now matches the shipped API |
| Express example | README referenced nonexistent `createWebMCPMiddleware` | README now uses the real `webmcpDiscovery` export |
| x402 example | Example omitted `defineTool` import and used a handler shape the SDK does not support | Example now imports `defineTool` and uses a valid input schema |
| Security section | Docs named nonexistent `SecurityMiddleware` | Docs now point to real helpers in `webmcp-sdk/security` |
| Browser registration evidence | No explicit regression coverage for browser auto-registration | Core tests now cover auto-registration and unregister behavior when `navigator.modelContext` is available |

## What this means in practice

The onboarding path is no longer asking a developer to trust the docs blindly.

Now the flow is:
1. get one verified success quickly
2. run one canonical browser example
3. check browser auto-registration only if the environment supports it
4. then move into deeper integrations

## Proof points behind the repair

- canonical quickstart: `docs/browser-hello-quickstart.md`
- canonical browser example: `examples/browser-hello/`
- isolated transfer patch: `ops/patches/webmcp-sdk-onboarding-fixes-2026-04-22.patch`
- verification snapshot: `npm run typecheck`, `npm test` (`137/137`), `npm run build`

## Best reuse

Use this note when you need to explain why the onboarding path is different now, why the repair mattered, or why the current docs are safer to distribute.
