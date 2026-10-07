# webmcp-sdk

> **AI Disclosure:** This README was written with AI assistance and reviewed for accuracy.

## A TypeScript toolkit for WebMCP

**Register WebMCP tools on your site, with React hooks, security helpers, and testing utilities. Built for `navigator.modelContext`.**

[![Spec: W3C Community Group draft](https://img.shields.io/badge/Spec-W3C%20CG%20draft-blue)](https://webmachinelearning.github.io/webmcp/)
[![Chrome Platform Status](https://img.shields.io/badge/Chrome-Platform%20Status-lightgrey)](https://chromestatus.com/feature/5117755740913664)
[![npm version](https://img.shields.io/npm/v/webmcp-sdk)](https://www.npmjs.com/package/webmcp-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

---

## WebMCP status (checked October 2026)

- WebMCP is a proposed web API. The [specification](https://webmachinelearning.github.io/webmcp/) is being incubated in a W3C Community Group; it is not a W3C Recommendation.
- [Chrome Platform Status](https://chromestatus.com/feature/5117755740913664) lists a developer trial from Chrome 146 and an origin trial starting in Chrome 149. Check that page for current milestones.
- Chrome's current guidance registers tools on `document.modelContext` and marks `navigator.modelContext` as deprecated in Chromium 150 ([Chrome guidance](https://github.com/GoogleChrome/modern-web-guidance/blob/main/skills/modern-web-guidance/guides/webmcp/agentic-javascript-tools.md)). `webmcp-sdk` 0.5.8 registers through `navigator.modelContext`. Test against your target browser before relying on native registration.

---

## Why webmcp-sdk?

The raw `navigator.modelContext` API is low-level. `webmcp-sdk` gives developers a TypeScript-first layer on top of it:

- **Declarative or imperative registration** -- HTML attributes or JavaScript
- **Security middleware built in** -- rate limiting, input sanitization, audit logging
- **React hooks** -- `useWebMCPTool()` registers on mount, cleans up on unmount
- **Testing utilities** -- mock browser context, test runner, quality scorer
- **Pairs with agentwallet-sdk** -- for x402 payment logic, see the section below

---

## Quick Install

```bash
npm i webmcp-sdk
```

## Fastest Path to First Verified Success

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
  async ({ name }) => {
    return { message: `Hello, ${name}!` };
  }
));

const result = await kit.invoke('demo.hello', { name: 'Bill' });
console.log(result);
// { message: 'Hello, Bill!' }
```

This works in Node or tests with no browser setup.

When `navigator.modelContext` is available in the browser, `kit.register(...)` also registers the tool there automatically. There is no separate `init()` step.

## Browser Registration

Canonical docs and example in this repo:
- `docs/browser-hello-quickstart.md`
- `examples/browser-hello/`

```typescript
import { createKit, defineTool } from 'webmcp-sdk';

const kit = createKit({ prefix: 'myshop' });

kit.register(defineTool(
  'search',
  'Search products by keyword. Returns matching products with prices and availability.',
  {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search term' },
      limit: { type: 'number', description: 'Max results' }
    },
    required: ['query']
  },
  async ({ query, limit = 10 }) => {
    const results = await db.products.search(query, limit);
    return { products: results, count: results.length };
  }
));
```

If WebMCP is available, your tool is now agent-readable.

For the full browser proof path, including build, local serve, visible result, and auto-registration checks, follow `docs/browser-hello-quickstart.md` and use `examples/browser-hello/`.

---

## React Integration

```tsx
import { useWebMCPTool } from 'webmcp-sdk/react';

function ProductSearch() {
  useWebMCPTool({
    name: 'search_products',
    description: 'Search the product catalog',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query']
    },
    handler: async ({ query }) => searchProducts(query)
  });

  return <SearchUI />;
}
```

---

## Security Middleware (Express)

```typescript
import { webmcpDiscovery } from 'webmcp-sdk/middleware/express';

app.use(webmcpDiscovery({
  serverName: 'My API',
  manifestPath: '/mcp'
}));
```

---

## Testing

```typescript
import { defineTool } from 'webmcp-sdk';
import { createMockContext, testTool, formatTestResults } from 'webmcp-sdk/testing';

const searchTool = defineTool(
  'search_products',
  'Search the product catalog by keyword.',
  {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search keyword' }
    },
    required: ['query']
  },
  async ({ query }) => ({ results: [{ name: `Product for ${query}` }], total: 1 })
);

const { context, invoke } = createMockContext();
context.registerTool(searchTool);

const result = await invoke('search_products', { query: 'laptop' });
console.log(result);
// { results: [{ name: 'Product for laptop' }], total: 1 }

const results = await testTool(searchTool, [
  {
    name: 'basic search',
    input: { query: 'laptop' },
    expectSuccess: true,
    validate: (value) => Array.isArray(value.results)
  }
]);

console.log(formatTestResults(results));
```

---

## agentwallet-sdk Integration (x402 Payments)

The npm package is `agentwallet-sdk` (no hyphen between "agent" and "wallet").
It provides an x402 client, x402 middleware, and `SpendingPolicy`. It is
non-custodial: you supply your own viem `WalletClient`.

```bash
npm install agentwallet-sdk viem
```

See the [agentwallet-sdk README](https://github.com/up2itnow0822/agent-wallet-sdk#readme)
for the current x402 API before wiring payments into a WebMCP tool handler.
Start on Base Sepolia.

---

## The W3C WebMCP Specification

WebMCP is a proposed web API, incubated in a W3C Community Group, that adds a model-context API to browsers (`navigator.modelContext` in earlier drafts, `document.modelContext` in Chrome's current guidance). It lets AI agents interact with web pages through a standardized interface — registering tools, reading structured context, and calling functions declared by the page.

**Key links:**
- [Spec draft (W3C Community Group)](https://webmachinelearning.github.io/webmcp/)
- [Chrome Platform Status: WebMCP](https://chromestatus.com/feature/5117755740913664)
- [awesome-webmcp](https://github.com/up2itnow0822/awesome-webmcp)

---

## Claude Code Compatibility

Companion note in this repo:
- `docs/claude-code-polyfill-bridge.md`

`webmcp-sdk` works with Claude Code's Chrome Extension through the `@mcp-b/global` polyfill. Here's how the pieces connect:

**How it works:** When Claude Code's Chrome Extension visits a page that has `webmcp-sdk` tool registration code on it, the extension detects `navigator.modelContext` (provided by the polyfill, or natively where the browser exposes it). Claude discovers your registered tools and can invoke them directly from the chat interface.

**Setup for site owners:**

You can also start from the repo example in `examples/browser-hello/` and swap its `demo.hello` tool for your real tool.

```html
<!-- Load the polyfill for browsers without native navigator.modelContext -->
<script src="https://unpkg.com/@mcp-b/global"></script>

<!-- Your webmcp-sdk tool registration -->
<script type="module">
  import { createKit, defineTool } from 'webmcp-sdk';

  const kit = createKit({ prefix: 'mysite' });
  kit.register(defineTool(
    'search',
    'Search this site',
    { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] },
    async ({ q }) => siteSearch(q)
  ));
</script>
```

**What Claude Code users get:** When visiting your page with the Claude Chrome Extension active, your site's tools appear alongside Claude's built-in MCP tools. No configuration needed on the user's side - discovery is automatic through `navigator.modelContext`.

**Native support:** GitHub Issue [#30645](https://github.com/anthropics/claude-code/issues/30645) on `anthropics/claude-code` requested native WebMCP support in the Claude Chrome Extension (the issue is now closed). Check the extension's current docs before relying on native discovery.

**Compatibility matrix:**

| Browser | WebMCP support | Notes |
|---|---|---|
| Chrome (dev trial / origin trial) | Native, behind trial or flag | See [Chrome Platform Status](https://chromestatus.com/feature/5117755740913664); current guidance uses `document.modelContext` |
| Chrome without the trial | Via `@mcp-b/global` polyfill | Polyfill provides `navigator.modelContext` |
| Other browsers | No native support known | Use the polyfill and test |

---

## Security

**MCP security is an active concern.** The [OWASP MCP Top 10](https://owasp.org/www-project-mcp-top-10/) documents the primary attack surfaces for Model Context Protocol implementations, including tool poisoning, prompt injection via tool output, and covert channel abuse.

webmcp-sdk includes security helpers under `webmcp-sdk/security`, including `withSecurity`, `RateLimiter`, and `sanitizeInput`. However, no SDK eliminates all MCP-related risks. Before deploying in production:

- Review the [OWASP MCP Top 10](https://owasp.org/www-project-mcp-top-10/) and assess which risks apply to your use case
- Implement an MCP tool allowlist (deny-all by default, allow only what you need)
- Enable audit logging for all tool calls
- Monitor for abnormal call patterns (frequency spikes, oversized responses)
- Keep webmcp-sdk updated - security patches are prioritized

For a full enterprise MCP allowlist template, see our guide: [Build Your Own MCP Allowlist](https://ai-agent-economy.hashnode.dev/build-your-own-mcp-allowlist-enterprise-security-template-2026).

Recent vulnerabilities in MCP servers (for example CVE-2026-26118 in Azure MCP Server and CVE-2026-27825 in MCP Atlassian) reinforce that MCP security requires defense in depth, not just SDK-level protections.

---

## Contributing

PRs welcome. Run `npm test` before submitting. The spec is evolving - if you find a browser compatibility issue, open an issue with your browser version and channel.

---

## License

MIT
