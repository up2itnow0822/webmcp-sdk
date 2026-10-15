# Actual browser verification recovery

Date: 2026-10-15 UTC. Coordinator assigned this worker `scripts/verify-browser.mjs` plus its fresh execution. The missing-script command first failed with MODULE_NOT_FOUND. The reconstructed verifier owns its strict-CSP HTTP server, test-mode Vite child process, Playwright browser/context and all cleanup within one Node process. It never connects a live wallet or uses funds.

## Fresh commands and browser

```sh
npm run build
npm run studio:build
npm run verify:browser
```

SDK build and Studio production build passed. Final browser command exited zero with **7/7 named checks**, **zero page errors**, and realFunds:false. Browser: Chromium **153.0.8010.0**; executable **/tmp/chromium**, from the locked development fallback package **@sparticuz/chromium 153.0.0**. Installed Playwright Chromium or explicit PLAYWRIGHT_CHROMIUM_EXECUTABLE is also supported; missing native support fails.

Launch arguments were --no-sandbox, --disable-dev-shm-usage, --no-zygote, --enable-experimental-web-platform-features, --enable-blink-features=WebMCP, --enable-features=WebMCP. No disabling of web security, site isolation or insecure content is used. The root-only sandbox exception is for trusted local test pages, not ordinary browsing guidance.

Last run origins: static server http://127.0.0.1:39645; self-spawned fixture Vite http://127.0.0.1:4188. Vite uses the root installed CLI, absolute Studio config, Studio cwd, --mode test, explicit host/port and --strictPort. A bounded readiness wait requires this child's actual VITE ready banner before fetching; it cannot certify another process already using the port.

## Seven nonvacuous checks

| Check                | Fresh result and assertions                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native + strict CSP  | PASS. document.modelContext.getTools and executeTool must exist. Native demo.hello returns parsed string JSON from executeTool(tool, JSON.stringify(args)). unregisterAll leaves no native tools. Strict self-only script CSP actually blocks inline script and Function construction.                                                                                                               |
| Canonical example    | PASS. Actual examples/browser-hello files show document.modelContext ready. Registered: demo.hello; direct invocation renders Bill then Reviewer. Native consumer invocation returns Consumer greeting, then cleanup empties native registry.                                                                                                                                                        |
| Production Studio    | PASS. Built app renders Your wallet. Your decision.; runtime **STUDIO_TEST** absent; built assets contain no fixture interface/provider/chunk.                                                                                                                                                                                                                                                       |
| Accessibility        | PASS. Axe in explicit browser.newContext with wcag2a/wcag2aa/wcag21aa: **0 violations, 25 passing checks**. This covers this rendered state and these rules, not universal accessibility certification.                                                                                                                                                                                              |
| Mobile               | PASS. At viewport 390x844 CSS pixels, document and body widths are both 390; heading visible, no horizontal overflow.                                                                                                                                                                                                                                                                                |
| Reviewed wallet flow | PASS. Save USDC20 in practice, switch live fixture and connect: USDC25 transfer is denied with Amount exceeds, zero proposals/sends. Reset limit100. ETH0.01 transfer requires fresh unchecked review consent and confirms, sent1. USDC25 swap requires separate fresh unchecked consent for exact approval and then swap; approval hash verified before new simulation; final confirmed with sent3. |
| Agent + revocation   | PASS. Native tools are exactly studio.studio_state and studio.studio_propose; none execute/sign/approve. Native USDC10 transfer proposal P-3 adds no send. UI rejects it, status cancelled and sends remain3. Fixture account change removes wallet context and disables proposals; sends stay3.                                                                                                     |

The account-context snapshot omits an undefined context during JSON serialization; the harness normalizes nullish absence to null rather than requiring a property the fixture does not emit. Proposal selection uses the actual accessible row name containing P-3 (the UI name begins with the action, not the ID).

CSP served by the static server:

```text
default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'
```

## Failures caught and repaired in the harness

- The stock bundled-browser extractor failed with EINVAL chown('/tmp/fonts') on the managed filesystem. The verifier now uses the pinned package's public binary inflate helper and its trusted archives, resolving its locked tar-fs dependency and extracting with chown:false. No package source/lock/dependency was changed by this worker.
- Initial complete flow passed six checks but the final account-context assertion timed out because absent undefined context is omitted rather than serialized null; the normalized predicate matches the actual state contract.
- A real occupied-port negative control found that the naive substring ready in also occurs in already in use. It was replaced by the actual VITE version/ready-banner expression. Repeating the control now exits1 before any browser PASS when port4188 belongs to a foreign server; the normal seven-check run then passed again.

Cleanup is attempted for context, browser, Vite and HTTP server even if an earlier cleanup throws. A separate post-run connection check confirmed both the final static port and4188 refused connections. No screenshots were uploaded.

## Other fresh verification

After moving the existing JSON freeze helper into input.ts for the security worker's confirmation TOCTOU repair, SDK `npm test` passed **294/294 (10 files)** and `npm run typecheck` passed. An intermediate import omission was detected by typecheck and corrected before this green result. Root owns final rebuild, formatting, packed artifacts, complete release gate and CI checks on the reviewed commit.

These are actual native local-browser and deterministic fixture results, not live-funded transaction verification, facilitator verification, irreversible chain finality or universal client support. The test-mode server deliberately contains a fake wallet; the separate production-build check excludes it.
