# Browser hello quickstart

You shouldn't have to guess whether a WebMCP tool is registered. This quickstart gets you to one visible success with `webmcp-sdk`, then shows how to verify browser-side registration when `navigator.modelContext` is available.

## What you will prove

By the end of this quickstart, you will have verified that:
- `kit.register(...)` accepts and stores your tool definition
- `kit.invoke(...)` returns a real result you can see in the browser
- browser auto-registration happens when `navigator.modelContext` exists

## What this quickstart uses

This guide is built around the repo's canonical example:
- `examples/browser-hello/index.html`
- `examples/browser-hello/main.mjs`

The example registers one tool, `demo.hello`, from the built package in `dist/`.

## Prerequisites

- Node dependencies installed in this repo
- Python 3 available for a quick local static server

## Step 1: build the package

From the repo root, run:

```bash
npm run build
```

This example imports from `../../dist/index.mjs`, so the build needs to exist before you open the page.

## Step 2: start a local static server

From the same repo root, run:

```bash
python3 -m http.server 4173
```

Leave that terminal open while you test.

## Step 3: open the example page

Open this URL in your browser:

```text
http://localhost:4173/examples/browser-hello/
```

You should see:
- a status banner
- a name input prefilled with `Bill`
- a `Run demo.hello` button
- a JSON result area

## Step 4: verify first visible success

Click `Run demo.hello`.

You should get a JSON result like this:

```json
{
  "message": "Hello, Bill!",
  "registeredInBrowser": false
}
```

If you changed the name field, the message should reflect the new value.

At this point you have already proven the first working path:
- the tool was registered in the kit
- the tool can be invoked directly
- the handler returned a real result

## Step 5: verify browser-side registration

Now look at the status banner.

If your browser exposes `navigator.modelContext`, the banner should say that browser registration was detected and should list `demo.hello` as an auto-registered tool.

If your browser does not expose `navigator.modelContext`, the banner should tell you that direct invoke still works and show the tool name registered in the kit.

That difference is expected.

## What changes when WebMCP is available

The example does not call a separate setup or init function.

This is the key behavior:

```javascript
const kit = createKit({ prefix: 'demo' });
kit.register(defineTool(...));
```

When `navigator.modelContext` exists, `kit.register(...)` also registers the wrapped tool in the browser automatically.

When it does not exist, the tool still works through `kit.invoke(...)`, which gives you a safe first proof path in Node, tests, or a normal browser.

## Where to edit the example

The tool lives in:
- `examples/browser-hello/main.mjs`

The parts you will most likely change first are:
- tool name
- tool description
- input schema
- handler return value

Current example shape:

```javascript
kit.register(
  defineTool(
    'hello',
    'Return a greeting for the supplied name.',
    {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name to greet' }
      },
      required: ['name']
    },
    async ({ name }) => ({
      message: `Hello, ${name}!`,
      registeredInBrowser: WebMCPKit.isAvailable()
    })
  )
);
```

## Common checks if something looks wrong

### The page loads but the result never changes
- Make sure you ran `npm run build`
- Make sure the static server is running from the repo root
- Open the browser console and check for module-load errors

### The page works, but browser registration says unavailable
- That usually means your browser does not expose `navigator.modelContext`
- The direct invoke path can still succeed
- Use Chrome 146+ or a WebMCP polyfill-enabled setup if you want to test browser auto-registration

### You changed the example, but the browser still shows the old behavior
- Rebuild with `npm run build`
- Refresh the page after the rebuild

## Next step after this quickstart

Once this page works, move to the top-level README section on browser registration or replace `demo.hello` with your real tool and keep the same proof loop.

If you want the smallest possible safe next step, edit only the handler response first, reload, and confirm the JSON output changed the way you expected.
