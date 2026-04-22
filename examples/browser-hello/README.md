# Browser Hello Example

This example now has a canonical walkthrough:
- `../../docs/browser-hello-quickstart.md`

This is the canonical browser-side proof path for `webmcp-sdk`.

It proves three things with the current shipped API:
- you can register a tool with `kit.register(...)`
- you can invoke it directly with `kit.invoke(...)`
- browser auto-registration happens when `navigator.modelContext` is available

## Files

- `index.html` - minimal browser page
- `main.mjs` - registers `demo.hello` using the built package from `../../dist/index.mjs`

## Run locally

From the repo root:

```bash
npm run build
python3 -m http.server 4173
```

Then open:

```text
http://localhost:4173/examples/browser-hello/
```

## What you should see

- A status message showing whether `navigator.modelContext` is available
- One registered tool: `demo.hello`
- A visible JSON result after clicking `Run demo.hello`

## Browser registration note

If you open this page in a normal browser without WebMCP support, the direct invoke path still works, but browser auto-registration will not.

To verify browser-side registration, use a browser environment where `navigator.modelContext` exists, such as Chrome 146+ or a WebMCP polyfill-enabled setup.
