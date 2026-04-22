# webmcp-sdk

> **AI Disclosure:** This README was written with AI assistance and reviewed for accuracy.

## The developer toolkit for W3C WebMCP -- the standard shipping in Chrome 146

**Make any website agent-ready in 10 minutes. Built for navigator.modelContext.**

[![W3C Draft](https://img.shields.io/badge/W3C-Draft%20Spec-blue)](https://webmachinelearning.github.io/webmcp/)
[![Chrome 146 Compatible](https://img.shields.io/badge/Chrome%20146-Compatible-green)](https://chromestatus.com/feature/webmcp)
[![npm version](https://img.shields.io/npm/v/webmcp-sdk)](https://www.npmjs.com/package/webmcp-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

---

## ✅ Google + W3C Validated — Why Now Is the Moment

**March 2026 update:** Google shipped WebMCP in Chrome 146 Canary. Google, Microsoft, and W3C co-authored the specification. This is not a startup experiment — it's Big Tech stamping a new web standard.

### Why Now?

- **Chrome 146 Canary** shipped WebMCP in February 2026. Broad stable release expected mid-to-late 2026.
- **Google + Microsoft + W3C** co-authored the spec. Three institutions that don't move together unless something matters.
- **Real implementations are live.** LocalPlate (restaurant booking) shipped WebMCP on Astro. Existing HTML form sites become agent-compatible with minimal changes.
- **The adoption curve is early.** Developers who ship WebMCP integrations now own the search results, the tutorials, and the mindshare when the stable release lands.
- **`webmcp-sdk` is the only TypeScript-first implementation toolkit.** We built it before the spec finalized and we maintain it as the standard evolves.

If you're building for the agentic web, the window to establish yourself as an early implementer is right now.

---

## Why webmcp-sdk?

Google and Microsoft co-authored the W3C WebMCP specification. The standard shipped in Chrome 146 Canary (February 2026). **We built the implementation toolkit.**

The raw `navigator.modelContext` API is low-level. `webmcp-sdk` gives developers a TypeScript-first, production-ready layer on top of it:

- **Zero to agent-ready in 10 minutes** -- declarative HTML attributes or imperative JavaScript
- **Security middleware built in** -- rate limiting, input sanitization, audit logging
- **React hooks** -- `useWebMCPTool()` registers on mount, cleans up on unmount
- **Testing utilities** -- mock browser context, test runner, quality scorer
- **agentwallet-sdk compatible** -- plug in x402 agent payments with 2 lines of code
- **50/50 compatibility tests passing** on Chrome 146 Canary

If you are building for the agentic web, this is the toolkit.

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

Pair with `agent-wallet-sdk` to accept x402 micropayments inside your WebMCP tools:

```typescript
import { createKit, defineTool } from 'webmcp-sdk';
import { AgentWallet } from 'agent-wallet-sdk';

const kit = createKit({ prefix: 'api' });
const wallet = new AgentWallet({ chain: 'base', privateKey: process.env.AGENT_KEY });

kit.register(defineTool(
  'premium_data',
  'Fetch premium market data (0.01 USDC per call)',
  {
    type: 'object',
    properties: {
      symbol: { type: 'string', description: 'Market symbol to fetch' },
      agentAddress: { type: 'string', description: 'Payer address to charge' }
    },
    required: ['symbol', 'agentAddress']
  },
  async ({ symbol, agentAddress }) => {
    await wallet.receiveX402Payment(agentAddress, '0.01');
    return fetchPremiumData(symbol);
  }
));
```

---

## The W3C WebMCP Specification

WebMCP is a W3C draft specification that adds a `navigator.modelContext` API to browsers. It lets AI agents interact with web pages through a standardized interface — registering tools, reading structured context, and calling functions declared by the page.

**Key links:**
- [W3C Spec Draft](https://webmachinelearning.github.io/webmcp/)
- [Chrome Status](https://chromestatus.com/feature/webmcp)
- [awesome-webmcp](https://github.com/up2itnow0822/awesome-webmcp)

---

## Claude Code Compatibility

Companion note in this repo:
- `docs/claude-code-polyfill-bridge.md`

`webmcp-sdk` works with Claude Code's Chrome Extension through the `@mcp-b/global` polyfill. Here's how the pieces connect:

**How it works:** When Claude Code's Chrome Extension visits a page that has `webmcp-sdk` tool registration code on it, the extension detects `navigator.modelContext` (provided by the polyfill in pre-stable Chrome, or natively in Chrome 146+). Claude discovers your registered tools and can invoke them directly from the chat interface.

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

**Tracking native support:** GitHub Issue [#30645](https://github.com/anthropics/claude-code/issues/30645) on `anthropics/claude-code` tracks native WebMCP support in the Claude Chrome Extension. The polyfill bridges the gap until that ships.

**Compatibility matrix:**

| Browser | WebMCP Support | Notes |
|---|---|---|
| Chrome 146 Canary | Native `navigator.modelContext` | Full support, no polyfill needed |
| Chrome stable (pre-146) | Via `@mcp-b/global` polyfill | Works with Claude Chrome Extension |
| Edge | Expected (Chromium-based) | Tracking W3C spec adoption |
| Firefox / Safari | Not yet | W3C working group stage |

## Proxy Relay — Reach Private Endpoints From the Browser Sandbox

Chrome's Content Security Policy blocks tool handlers from calling private APIs directly. The **Proxy Relay** routes those calls through a local HTTP server (or a Service Worker) so your tools can reach authenticated, internal, or CORS-restricted endpoints without opening up your CSP.

### Quick Start

```typescript
import { createKit, defineTool } from 'webmcp-sdk';

// Pass the relay endpoint once — it's available on kit.proxy everywhere
const kit = createKit({ proxyEndpoint: 'http://localhost:3001' });

kit.register(defineTool(
  'internal-data',
  'Fetch data from a private internal API',
  { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  async ({ id }) => {
    const res = await kit.proxy!.get<{ name: string }>(
      `https://internal-api.company.com/records/${id}`
    );
    if (!res.ok) throw new Error(`Upstream error: ${res.status}`);
    return res.data;
  }
));
```

### ProxyRelay Standalone

```typescript
import { ProxyRelay } from 'webmcp-sdk';

const relay = new ProxyRelay({
  relayUrl: 'http://localhost:3001',
  auth: { type: 'bearer', token: process.env.MY_API_KEY! },
  defaultTimeoutMs: 10_000,
});

// GET
const { data } = await relay.get<User[]>('https://api.private.com/users');

// POST
const { data: created } = await relay.post('https://api.private.com/users', {
  name: 'Alice',
  role: 'admin',
});
```

### Auth Strategies

```typescript
// API key header
new ProxyRelay({ relayUrl: '...', auth: { type: 'apiKey', header: 'X-Api-Key', key: 'secret' } });

// Bearer token
new ProxyRelay({ relayUrl: '...', auth: { type: 'bearer', token: 'my-jwt' } });

// Custom headers
new ProxyRelay({ relayUrl: '...', auth: { type: 'custom', headers: { 'X-Tenant': 'acme' } } });
```

### Service Worker Bridge

For zero-infrastructure setups, the relay can use a `BroadcastChannel` to dispatch requests through a registered Service Worker:

```typescript
const relay = new ProxyRelay({
  relayUrl: '/sw-proxy',
  useServiceWorker: true,
});
```

Your Service Worker listens on the `'webmcp-proxy'` BroadcastChannel, forwards the request, and posts back the response.

---

## Tamper-Evident Audit Logging

Every tool invocation can be recorded in a cryptographic hash chain. Any post-hoc modification to the log is immediately detectable — each entry commits to the previous entry's hash, forming an append-only audit trail.

### Enable With One Line

```typescript
const kit = createKit({ audit: true });

kit.register(defineTool(
  'search',
  'Search products',
  { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
  async ({ query }) => searchProducts(query)
));

await kit.invoke('search', { query: 'headphones' });
await kit.invoke('search', { query: 'laptop' });

// Inspect the log
const entries = kit.getAuditLog();
console.log(entries[0]);
// {
//   index: 0,
//   timestamp: '2026-03-11T10:30:00.000Z',
//   timestampMs: 1741691400000,
//   toolName: 'search',
//   inputHash:  'a3f2...', // SHA-256 of JSON.stringify(input)
//   outputHash: 'b8c1...', // SHA-256 of JSON.stringify(output)
//   error: null,
//   prevHash: '',          // empty for genesis entry
//   entryHash: 'e4d9...'   // SHA-256 over all fields above
// }

// Verify the full chain hasn't been tampered with
const isValid = kit.verifyAuditLog();
console.log(isValid); // true
```

### AuditLog Standalone

```typescript
import { AuditLog } from 'webmcp-sdk';

const log = new AuditLog();

log.record('my-tool', { query: 'hello' }, { result: 'world' });
log.recordError('my-tool', { query: 'bad' }, new Error('upstream timeout'));

const result = log.verify();
if (!result.valid) {
  console.error(`Chain broken at entry ${result.index}: ${result.reason}`);
}

// Export for persistence
const json = log.export();
localStorage.setItem('audit-log', json);

// Re-import and re-verify
const log2 = new AuditLog();
log2.import(json);
console.log(log2.verify().valid); // true (or false if storage was tampered with)
```

### How the Hash Chain Works

```
Entry 0: { inputHash, outputHash, timestamp, toolName, prevHash: "" }
         → entryHash = SHA256(canonical(entry 0))

Entry 1: { inputHash, outputHash, timestamp, toolName, prevHash: entryHash(0) }
         → entryHash = SHA256(canonical(entry 1))

Entry N: { ..., prevHash: entryHash(N-1) }
         → entryHash = SHA256(canonical(entry N))
```

`verifyAuditLog()` walks the chain and recomputes every `entryHash`. If any field in any entry was changed after recording, the recomputed hash won't match and verification returns `false`.

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

Recent vulnerabilities in MCP ecosystems (Azure CVE-2026-26118 SSRF CVSS 8.8, Atlassian CVE-2026-27825 RCE) reinforce that MCP security requires defense in depth, not just SDK-level protections.

---

## Contributing

PRs welcome. Run `npm test` before submitting. The spec is evolving - if you find a Chrome 146 compatibility issue, open an issue with your Canary version.

---

## License

MIT
