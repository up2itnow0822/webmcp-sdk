# Claude Code and polyfill bridge

This note connects the repaired `webmcp-sdk` browser onboarding flow to the current Claude Code browser story.

## What this solves

You may want two things at once:
- a browser page that can prove your tool works right now
- a path for Claude Code users to discover that tool before native browser support is universal

This is the bridge:
- `webmcp-sdk` gives you the tool registration path
- `navigator.modelContext` is the browser capability Claude Code looks for
- Chrome 146+ can expose that natively
- `@mcp-b/global` can provide the bridge in earlier Chrome setups

## Short mental model

Use the same tool registration code either way.

```typescript
const kit = createKit({ prefix: 'demo' });
kit.register(defineTool(...));
```

If `navigator.modelContext` is available, `kit.register(...)` also auto-registers the tool in the browser.

If it is not available, direct invocation still works through `kit.invoke(...)`.

That means your first proof path and your Claude Code path stay aligned instead of splitting into two different examples.

## Fastest proof path

Start with the repo's canonical browser example:
- `examples/browser-hello/`
- `docs/browser-hello-quickstart.md`

That example already proves:
- the tool registers in the kit
- the tool invokes successfully in the page
- browser registration is surfaced clearly when `navigator.modelContext` exists

## When to use the polyfill

Use the polyfill when:
- you want Claude Code compatibility in a Chrome environment that does not yet expose native `navigator.modelContext`
- you want the same page to demonstrate both direct invoke and browser registration behavior

Do not use a separate SDK setup path for this. The same `kit.register(...)` flow should stay canonical.

## Minimal page example

```html
<script src="https://unpkg.com/@mcp-b/global"></script>
<script type="module">
  import { createKit, defineTool } from 'webmcp-sdk';

  const kit = createKit({ prefix: 'mysite' });

  kit.register(defineTool(
    'search',
    'Search this site',
    {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'Search query' }
      },
      required: ['q']
    },
    async ({ q }) => siteSearch(q)
  ));
</script>
```

## What Claude Code users should expect

When the Claude browser extension visits a page where `navigator.modelContext` is available, your registered tools can become discoverable to Claude from that page context.

In practice, the cleanest site-owner promise is:
- direct invoke works even without browser capability support
- browser registration becomes available when native support or the polyfill provides `navigator.modelContext`

## Common mistakes to avoid

### Adding a fake init step
Do not add `kit.init()` examples. The repaired onboarding path intentionally avoids that because `kit.register(...)` is the real registration step.

### Treating browser support as the first proof
Do not force browser capability support to be the first success condition. Keep `kit.invoke(...)` as the first proof, then layer browser registration on top.

### Creating a separate Claude-only example
Do not split the example unless you truly need a different product surface. The browser hello example should remain the canonical proof path.

## Recommended wording when you explain this publicly

Use language like this:

> `webmcp-sdk` gives you a working tool path first. If `navigator.modelContext` is present, the same `kit.register(...)` call also makes the tool browser-discoverable for WebMCP-aware clients such as Claude Code setups using native support or the `@mcp-b/global` bridge.

That wording stays accurate without overclaiming universal browser support.

## References

- canonical quickstart: `docs/browser-hello-quickstart.md`
- proof snippet: `docs/browser-hello-proof-snippet.md`
- browser example: `examples/browser-hello/`
- Claude Code section in README: `README.md`
- native support tracking: `https://github.com/anthropics/claude-code/issues/30645`
