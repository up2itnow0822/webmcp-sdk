# Legacy clients and polyfills

The default SDK adapter uses `document.modelContext`, `execute`, asynchronous readiness and registration AbortSignals. Agent/browser-client discovery is a separate compatibility boundary; the SDK does not guarantee any extension detects a registered tool.

A separately tested historical navigator integration may explicitly select:

```js
const kit = createKit({ browserAdapter: "legacy" });
```

This requires the legacy register/unregister contract. It does not automatically adapt an arbitrary polyfill or implement a relay, MCP server or authentication system. Native availability checks still concern the modern document API. Test registration, invocation, errors and cleanup with the exact client/origin before relying on it.

If a polyfill is necessary, review and pin it, bundle it locally and assess its permissions. Do not inject an unversioned remote script into a financial page. Old browser prompt methods are not confirmation providers: explicit application review and external-wallet authorization remain required. The canonical example intentionally uses no polyfill or remote dependency. See [migration](migration-0.6.md) and [threat model](threat-model.md).
