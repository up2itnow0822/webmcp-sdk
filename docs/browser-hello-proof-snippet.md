# Browser hello proof

```js
import { createKit, defineTool } from "webmcp-sdk";
const kit = createKit({ prefix: "demo" });
kit.register(
  defineTool(
    "hello",
    "Return a greeting",
    {
      type: "object",
      properties: { name: { type: "string", maxLength: 100 } },
      required: ["name"],
      additionalProperties: false,
    },
    ({ name }) => ({ message: `Hello, ${name}!` }),
  ),
);
await kit.ready();
console.log(await kit.invoke("demo.hello", { name: "Bill" }));
// { message: 'Hello, Bill!' }
// On teardown: kit.unregisterAll();
```

This proves guarded local invocation. Native readiness requires an available `document.modelContext`; `ready()` reports registration errors but does not manufacture browser support. Native registration uses `execute` and registration AbortSignals. See the [canonical quickstart](browser-hello-quickstart.md) and [current release record](release-verification.md). Earlier navigator examples/test counts are historical.
