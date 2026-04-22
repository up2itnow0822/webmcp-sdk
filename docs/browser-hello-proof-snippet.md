# Browser hello proof snippet

This is the short proof block for the repaired `webmcp-sdk` onboarding path.

## What changed

You can now get to one verified success without guessing at hidden setup.

- first success path: `kit.invoke(...)`
- canonical browser path: `examples/browser-hello/`
- browser auto-registration: happens on `kit.register(...)`
- no separate `init()` step required

## Minimal proof

From the repo root:

```bash
npm run build
python3 -m http.server 4173
```

Open:

```text
http://localhost:4173/examples/browser-hello/
```

Click `Run demo.hello`.

Expected visible result:

```json
{
  "message": "Hello, Bill!",
  "registeredInBrowser": false
}
```

If your browser exposes `navigator.modelContext`, the status banner should also show that `demo.hello` was auto-registered in the browser.

## Short code snippet

```typescript
import { createKit, defineTool } from 'webmcp-sdk';

const kit = createKit({ prefix: 'demo' });

kit.register(defineTool(
  'hello',
  'Return a greeting for the supplied name.',
  {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Name to greet' }
    },
    required: ['name']
  },
  async ({ name }) => ({ message: `Hello, ${name}!` })
));

const result = await kit.invoke('demo.hello', { name: 'Bill' });
console.log(result);
```

## Verification snapshot

- `npm run typecheck` passed
- `npm test` passed (`137/137`)
- `npm run build` passed

## Reuse note

Use this block anywhere you need the shortest honest explanation of why the current onboarding path works.
