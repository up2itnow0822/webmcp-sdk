# Canonical browser hello

From the repository root:

```sh
npm ci --ignore-scripts
npm run build
python3 -m http.server 4173 --bind 127.0.0.1
```

Open `http://localhost:4173/examples/browser-hello/`. The visible direct result is `{"message":"Hello, Bill!"}`. A separate status reports current document-native registration readiness; unavailable native support does not prevent direct invocation.

`main.mjs` exports `kit` and exposes that same instance as `window.__HELLO` for local verification. It imports only the built self-contained SDK, awaits `kit.ready()`, invokes fully prefixed `demo.hello`, renders through textContent and unregisters on pagehide. External CSS/module assets work with a self-only script/style CSP. This local static server does not set production security headers; use the repository's controlled browser gate for strict-CSP proof.

See [quickstart](../../docs/browser-hello-quickstart.md), [migration](../../docs/migration-0.6.md) and [release verification](../../docs/release-verification.md). Experimental browser availability is not a universal client guarantee. The example has no wallet or financial action.
