![CI](https://github.com/up2itnow0822/webmcp-sdk/actions/workflows/ci.yml/badge.svg)
![CodeQL](https://github.com/up2itnow0822/webmcp-sdk/actions/workflows/codeql.yml/badge.svg)
![npm](https://img.shields.io/npm/v/webmcp-sdk)
![License](https://img.shields.io/npm/l/webmcp-sdk)

# webmcp-sdk 🌐🤖

**Make any website agent-ready with [WebMCP](https://webmachinelearning.github.io/webmcp/) in minutes.**

The developer toolkit for the W3C Web Model Context Protocol — the standard that turns websites into structured tools for AI agents. No screen scraping. No Puppeteer scripts. Your frontend JavaScript becomes the agent interface.

Zero dependencies. Full TypeScript. Production CI verified.

---

## Why Now?

Chrome 146 shipped `navigator.modelContext` in February 2026. It's flag-gated today — but this is the Canary that ships to 3 billion users. When it graduates, every website that isn't already WebMCP-ready gets left behind.

Microsoft co-authored the spec. W3C is fast-tracking it. Formal announcement is expected at Google I/O mid-2026. The window to build before mainstream coverage closes is right now.

`webmcp-sdk` is the Express to Chrome's HTTP — the implementation layer that makes the low-level API actually usable.

---

## What You Get

- 🏗️ **TypeScript-first** — Full types for the WebMCP API surface
- ⚡ **Builder pattern** — Fluent API, no boilerplate
- 🛡️ **Security middleware** — Rate limiting, input sanitization, audit logging
- ⚛️ **React hooks** — `useWebMCPTool()` registers on mount, cleans up on unmount
- 🧪 **Testing utilities** — Mock browser context, test runner, quality scorer
- ✅ **Input validation** — JSON Schema validation before your handler runs
- 🔒 **Confirmation guards** — Destructive actions require user approval
- 🔍 **Express auto-discovery** — Agents find your tools automatically, zero config

---

## Install

```bash
npm install webmcp-sdk
```

---

## Quick Start — Register a Tool

```typescript
import { createKit, defineTool } from 'webmcp-sdk';

const kit = createKit({ prefix: 'myshop' });

kit.register(defineTool(
  'search',
  'Search products by keyword. Returns matching products with prices and availability.',
  {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search keyword or phrase' },
      category: { type: 'string', enum: ['electronics', 'clothing', 'home'] },
      maxResults: { type: 'number', minimum: 1, maximum: 50 },
    },
    required: ['query'],
  },
  async ({ query, category, maxResults = 10 }) => {
    const results = await yourSearchFunction(query, { category, limit: maxResults });
    return { results, total: results.length };
  }
));
```

When an AI agent visits your site in Chrome 146+, it sees `myshop.search` as a callable, typed tool. That's it.

---

## Builder Pattern

```typescript
import { createKit, tool } from 'webmcp-sdk';

const kit = createKit();

kit.register(
  tool('add-to-cart')
    .description('Add a product to the shopping cart by product ID')
    .input({
      type: 'object',
      properties: {
        productId: { type: 'string', description: 'Product ID' },
        quantity: { type: 'number', minimum: 1, maximum: 99 },
      },
      required: ['productId'],
    })
    .annotate({ destructiveHint: false, confirmationHint: false })
    .handle(async ({ productId, quantity = 1 }) => {
      return await addToCart(productId, quantity);
    })
);
```

---

## Server-Side Auto-Discovery (Express)

Any agent that hits your server instantly knows where to find your MCP tools — no docs, no config.

### Zero Config

```typescript
import express from 'express';
import { webmcpDiscovery } from 'webmcp-sdk/middleware/express';

const app = express();
app.use(webmcpDiscovery());    // agents auto-discover your /mcp endpoint
```

Every response gets:
```
Link: </mcp>; rel="mcp-manifest", </mcp/tools>; rel="mcp-tools"
MCP-Version: 1.0
MCP-Capabilities: tools
```

### Full Auto-Setup (headers + manifest endpoint)

```typescript
import { webmcpAutoSetup } from 'webmcp-sdk/middleware/express';

app.use(webmcpAutoSetup({
  serverName: 'My API',
  tools: [
    { name: 'search', description: 'Search the product catalog' },
    { name: 'checkout', description: 'Place an order' },
  ],
  resources: [
    { uri: '/docs', name: 'API Documentation' },
  ],
}));
// → Injects discovery headers on all responses
// → GET /mcp  returns full manifest JSON
// → GET /mcp/tools
// → GET /mcp/resources
```

### Custom Options

```typescript
app.use(webmcpDiscovery({
  manifestPath: '/api/mcp',
  capabilities: ['tools', 'resources', 'prompts'],
  version: '1.0',
  serverName: 'My App',
  onlyOnSuccess: true,   // skip 4xx/5xx (default: true)
}));
```

### FastAPI

```python
from fastapi import FastAPI
from webmcp_sdk.middleware import WebMCPDiscoveryMiddleware

app = FastAPI()
app.add_middleware(WebMCPDiscoveryMiddleware)
```

With options:

```python
app.add_middleware(
    WebMCPDiscoveryMiddleware,
    manifest_path='/mcp',
    capabilities=['tools', 'resources'],
    server_name='My API',
    only_on_success=True,
)
```

Full auto-setup:

```python
from webmcp_sdk.middleware import WebMCPAutoSetupMiddleware

app.add_middleware(
    WebMCPAutoSetupMiddleware,
    server_name='My API',
    tools=[{'name': 'search', 'description': 'Search products'}],
)
```

---

## React Integration

```typescript
import { useWebMCPTool, useWebMCPAvailable } from 'webmcp-sdk/react';
```

```tsx
function ProductSearch() {
  useWebMCPTool({
    name: 'search',
    description: 'Search products in the catalog',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Search term' } },
      required: ['query'],
    },
    handler: async ({ query }) => {
      const results = await searchProducts(query);
      return { results, count: results.length };
    },
  });

  return <div>Search is agent-ready! 🤖</div>;
}

function App() {
  const isAgentReady = useWebMCPAvailable();
  return (
    <div>
      {isAgentReady && <span>🟢 WebMCP Active</span>}
      <ProductSearch />
    </div>
  );
}
```

### Available Hooks

| Hook | Purpose |
|------|---------|
| `useWebMCPTool(tool)` | Register a single tool (auto-cleanup on unmount) |
| `useWebMCPTools(tools[])` | Register multiple tools at once |
| `useWebMCPAvailable()` | Check if WebMCP is available in the browser |
| `useWebMCPLog(maxEntries?)` | Track agent tool invocations for debugging |
| `useWebMCPKit(config?)` | Get the shared Kit instance for advanced usage |

---

## Security

```typescript
import { withSecurity, withConfirmation } from 'webmcp-sdk/security';

// Rate limit + sanitize + block patterns + audit
const secureTool = withSecurity(myTool, {
  rateLimit: { maxInvocations: 10, windowMs: 60_000 },
  sanitize: { stripHtml: true, maxStringLength: 5000 },
  blockedPatterns: ['<script', 'javascript:', 'data:text/html'],
  audit: true,
  onAudit: (event) => analytics.track('agent_tool_call', event),
});

// Require user confirmation for destructive actions
const safeDeleteTool = withConfirmation(
  deleteTool,
  'This will permanently delete your account and all data.'
);
```

| Feature | What It Does |
|---------|-------------|
| **Rate Limiting** | Sliding window rate limiter per tool |
| **Input Sanitization** | Strip HTML, control chars, truncate strings/arrays |
| **Blocked Patterns** | Regex-based input rejection (XSS, injection) |
| **Audit Logging** | Hook for every invocation with sanitization status |
| **Confirmation Guards** | `requestUserInteraction()` before destructive actions |
| **Concurrency Limiting** | Cap parallel tool executions (default: 10) |

---

## Testing

```typescript
import {
  createMockContext,
  validateToolDefinition,
  testTool,
  scoreToolQuality,
  formatTestResults,
} from 'webmcp-sdk/testing';

// Validate your tool definition
const validation = validateToolDefinition(myTool);
console.log(validation.errors);    // Schema/name issues
console.log(validation.warnings);  // LLM readability tips

// Score tool quality for LLM consumption
const { score, maxScore, breakdown } = scoreToolQuality(myTool);
console.log(`Quality: ${score}/${maxScore}`);

// Run test cases
const results = await testTool(myTool, [
  { name: 'basic search', input: { query: 'shoes' }, validate: (r) => r.results.length > 0 },
  { name: 'empty query fails', input: {}, expectError: /required/ },
]);
console.log(formatTestResults(results));

// Mock browser for integration tests
const { context, invoke } = createMockContext();
context.registerTool(myTool);
const result = await invoke('my-tool', { query: 'test' });
```

---

## How It Relates to Chrome 146 / W3C WebMCP

Chrome's WebMCP is the browser-native standard — the low-level API (`navigator.modelContext`) that lets websites declare callable tools for AI agents. `webmcp-sdk` is the implementation layer: builder pattern, React hooks, Express middleware, security, and testing utilities that make building Chrome WebMCP-compliant sites practical.

```typescript
// Raw Chrome WebMCP API
navigator.modelContext.tools = [{
  name: 'search',
  description: 'Search products',
  inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
}];

// webmcp-sdk — same result, less code
server.tool('search', {
  description: 'Search products',
  parameters: z.object({ query: z.string() }),
  handler: async ({ query }) => searchProducts(query),
});
```

Sites built with `webmcp-sdk` will be natively agent-ready when Chrome WebMCP graduates from Canary to stable — no refactoring required.

---

## Browser Support

| Browser | Status | Version |
|---------|--------|---------|
| Chrome | ✅ Early Preview (flag-gated) | 146+ |
| Edge | 🟡 Expected (shares Chromium) | TBD |
| Firefox | ⏳ No signal yet | — |
| Safari | ⏳ No signal yet | — |

**Enable in Chrome 146:** `chrome://flags` → "Experimental Web Platform Features" → Enable → Relaunch

---

## API Reference

### Core

| Export | Type | Description |
|--------|------|-------------|
| `createKit(config?)` | Function | Create a WebMCP Kit instance |
| `tool(name)` | Function | Start building a tool with fluent API |
| `defineTool(name, desc, schema, handler)` | Function | Quick tool definition |
| `WebMCPKit.isAvailable()` | Static | Check if `navigator.modelContext` exists |
| `kit.register(tool, opts?)` | Method | Register a tool |
| `kit.unregister(name)` | Method | Remove a tool |
| `kit.invoke(name, input)` | Method | Call a tool directly (for testing) |
| `kit.getTools()` | Method | List all registered tools |

### Config Options

```typescript
createKit({
  prefix: 'myapp',                          // Tool name prefix
  debug: true,                               // Console logging
  maxConcurrent: 10,                         // Max parallel handler executions
  onError: (err, name) => {},               // Global error handler
  onBeforeInvoke: (event) => true,          // Block/allow invocations
  onAfterInvoke: (event, result) => {},     // Post-invocation hook
});
```

---

## Roadmap

- [x] Core SDK with TypeScript types
- [x] Builder pattern for tool definitions
- [x] Input validation (JSON Schema)
- [x] Security middleware (rate limit, sanitize, block, audit)
- [x] React hooks
- [x] Testing utilities + mock context
- [x] Tool quality scorer
- [x] Express auto-discovery middleware
- [ ] Vue/Svelte adapters
- [ ] CLI scanner (auto-generate tools from existing forms/APIs)
- [ ] `.well-known/webmcp` manifest generator
- [ ] Next.js / Remix integration
- [ ] Declarative HTML annotation parsing

---

## License

MIT

---

Built by [up2itnow](https://github.com/up2itnow) · Part of the agentic web infrastructure stack
