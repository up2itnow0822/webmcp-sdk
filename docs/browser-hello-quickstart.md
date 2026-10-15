# Browser hello quickstart

Use the canonical repository example to distinguish local tool execution from current native browser registration.

```sh
npm ci --ignore-scripts
npm run build
python3 -m http.server 4173 --bind 127.0.0.1
```

Open `http://localhost:4173/examples/browser-hello/`. The page imports the built `dist/index.mjs`, loads only external module/CSS files and automatically invokes `demo.hello`. With name Bill, the visible JSON is `{"message":"Hello, Bill!"}`. The button repeats direct invocation with the current name.

Direct invoke works without native WebMCP. The status separately reports whether `document.modelContext` exists and whether awaited native registration succeeded. A registration failure is shown explicitly; local invocation can still work. `window.__HELLO` and the module's exported `kit` expose the same example instance for local verification. `pagehide` unregisters its tools; reload to start a fresh registration after leaving.

The default SDK adapter maps handlers to native `execute`, awaits asynchronous registration through `kit.ready()` and uses registration AbortSignals for cleanup. No `init()` call, navigator probe, undocumented consumer method or imported polyfill is required. Browser-native availability depends on experimental browser support and a suitable secure origin; no minimum Chrome version alone guarantees it.

If the page fails, rebuild, serve from the repository root and inspect module/status errors. Do not open the HTML as a file URL. The simple Python server does not set production security headers. The controlled `npm run verify:browser` gate separately tests native invocation/cleanup and the example under strict CSP; a working direct result alone does not establish native support. Never add wallet keys or signing to this greeting example.
