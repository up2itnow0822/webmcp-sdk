# webmcp-sdk 🌐🤖

**Make any website agent-ready with [WebMCP](https://webmachinelearning.github.io/webmcp/) in minutes.**

The developer toolkit for the new W3C Web Model Context Protocol — the standard that turns websites into structured tools for AI agents. No screen scraping. No Puppeteer scripts. Your frontend JavaScript becomes the agent interface.

[![npm version](https://img.shields.io/npm/v/webmcp-sdk)](https://www.npmjs.com/package/webmcp-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

---

## Why WebMCP Kit?

[WebMCP](https://webmachinelearning.github.io/webmcp/) shipped in Chrome 146 (Feb 2026) as an early preview. It lets any website expose structured, callable tools to AI agents through `navigator.modelContext`. But the raw API is low-level.

**webmcp-sdk** gives you:

- 🏗️ **TypeScript-first** — Full types for the entire WebMCP API
- ⚡ **Builder pattern** — Fluent API for defining tools
- 🛡️ **Security middleware** — Rate limiting, input sanitization, blocked patterns, audit logging
- ⚛️ **React hooks** — `useWebMCPTool()` registers on mount, cleans up on unmount
- 🧪 **Testing utilities** — Mock browser context, test runner, quality scorer
- ✅ **Input validation** — JSON Schema validation before your handler runs
- 🔒 **Confirmation guards** — Destructive actions require user approval
- 📊 **Tool quality scoring** — Know if LLMs will understand your tool definitions

## v0.4.0 — Auto-Discovery Middleware

**New in v0.2.0:** Server-side auto-discovery middleware for Express and FastAPI. Any agent that hits your server now instantly knows where to find your MCP tools — zero config, zero documentation required.

```ts
import { webmcpDiscovery } from 'webmcp-sdk/middleware/express';
app.use(webmcpDiscovery());        // ← that's it
// Every response now carries: Link: </mcp>; rel="mcp-manifest"
```

---

## Server-Side Auto-Discovery Middleware

Make your Express or FastAPI server **instantly agent-discoverable** by injecting standard HTTP headers on every response. AI agents can find your MCP manifest without any docs or configuration.

### Express — Zero Config

```ts
import express from 'express';
import { webmcpDiscovery } from 'webmcp-sdk/middleware/express';

const app = express();
app.use(webmcpDiscovery());    // agents now auto-discover your /mcp endpoint
```

Every response gets:
```
Link: </mcp>; rel="mcp-manifest", </mcp/tools>; rel="mcp-tools"
MCP-Version: 1.0
MCP-Capabilities: tools
```

### Express — Full Auto-Setup (headers + manifest endpoint)

```ts
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
// → Registers GET /mcp  (full manifest JSON)
// → Registers GET /mcp/tools
// → Registers GET /mcp/resources
```

### Express — Custom Options

```ts
app.use(webmcpDiscovery({
  manifestPath: '/api/mcp',                         // default: '/mcp'
  capabilities: ['tools', 'resources', 'prompts'],  // default: ['tools']
  version: '1.0',
  serverName: 'My App',
  onlyOnSuccess: true,                              // skip 4xx/5xx (default: true)
}));
```

### FastAPI — Zero Config

```python
from fastapi import FastAPI
from webmcp_sdk.middleware import WebMCPDiscoveryMiddleware

app = FastAPI()
app.add_middleware(WebMCPDiscoveryMiddleware)
```

### FastAPI — With Options

```python
app.add_middleware(
    WebMCPDiscoveryMiddleware,
    manifest_path='/mcp',
    capabilities=['tools', 'resources'],
    version='1.0',
    server_name='My API',
    only_on_success=True,
)
```

### FastAPI — Full Auto-Setup

```python
from webmcp_sdk.middleware import WebMCPAutoSetupMiddleware

app.add_middleware(
    WebMCPAutoSetupMiddleware,
    server_name='My API',
    tools=[
        {'name': 'search', 'description': 'Search products'},
    ],
)
# → GET /mcp serves the full manifest automatically
```

### Why this beats Mastra

Mastra's agent discovery requires config files and manual wiring. WebMCP auto-discovery is **3 lines of code** — add the middleware, done. Every agent that hits any endpoint immediately knows your server is MCP-capable.

---


## Relationship to the W3C WebMCP Standard

Google shipped WebMCP (Web Model Context Protocol) in Chrome 146 Canary (February 2026). It's heading to W3C standardization with a formal announcement expected at Google I/O mid-2026. Our product shares the name -- here's why that's intentional.

**Chrome's WebMCP** is the browser-native standard: a low-level API (`navigator.modelContext`) that lets websites declare structured, callable tools for AI agents.

**webmcp-sdk** is the implementation toolkit: builder pattern, React hooks, Express/Next.js middleware, security layer, and testing utilities that make it easy to build Chrome WebMCP-compliant sites.

We're the [Express](https://expressjs.com/) to their HTTP spec. Every major protocol needs an implementation layer.

```typescript
// Raw Chrome WebMCP API (verbose)
navigator.modelContext.tools = [{
  name: 'search',
  description: 'Search products',
  inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
  // ... manual handler wiring ...
}];

// webmcp-sdk (same result, 10x less code)
server.tool('search', {
  description: 'Search products',
  parameters: z.object({ query: z.string() }),
  handler: async ({ query }) => searchProducts(query),
});
```

As Chrome WebMCP moves from Canary to stable release, sites built with webmcp-sdk will be natively agent-ready without major refactoring.

## Quick Start

```bash
npm install webmcp-sdk
```text

### Register a tool in 30 seconds

```typescript
import { createKit, defineTool } from 'webmcp-kit';

const kit = createKit({ prefix: 'myshop' });

kit.register(defineTool(
  'search',
  'Search products by keyword. Returns matching products with prices and availability.',
  {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search keyword or phrase' },
      category: { type: 'string', enum: ['electronics', 'clothing', 'home'], description: 'Product category filter' },
      maxResults: { type: 'number', description: 'Maximum results to return', minimum: 1, maximum: 50 },
    },
    required: ['query'],
  },
  async ({ query, category, maxResults = 10 }) => {
    const results = await yourSearchFunction(query, { category, limit: maxResults });
    return { results, total: results.length };
  }
));
```text

That's it. When an AI agent visits your site in Chrome 146+, it sees `myshop.search` as a callable tool with typed parameters.

### Builder Pattern

```typescript
import { createKit, tool } from 'webmcp-kit';

const kit = createKit();

kit.register(
  tool('add-to-cart')
    .description('Add a product to the shopping cart by product ID')
    .input({
      type: 'object',
      properties: {
        productId: { type: 'string', description: 'Product ID' },
        quantity: { type: 'number', description: 'Quantity to add', minimum: 1, maximum: 99 },
      },
      required: ['productId'],
    })
    .annotate({ destructiveHint: false, confirmationHint: false })
    .handle(async ({ productId, quantity = 1 }) => {
      return await addToCart(productId, quantity);
    })
);
```text

## React Integration

```bash
import { useWebMCPTool, useWebMCPAvailable } from 'webmcp-kit/react';
```text

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
```text

### Available Hooks

| Hook | Purpose |
|------|---------|
| `useWebMCPTool(tool)` | Register a single tool (auto-cleanup on unmount) |
| `useWebMCPTools(tools[])` | Register multiple tools at once |
| `useWebMCPAvailable()` | Check if WebMCP is available in the browser |
| `useWebMCPLog(maxEntries?)` | Track agent tool invocations for debugging |
| `useWebMCPKit(config?)` | Get the shared Kit instance for advanced usage |

## Security

```typescript
import { withSecurity, withConfirmation } from 'webmcp-kit/security';

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
```text

### Security Features

| Feature | What It Does |
|---------|-------------|
| **Rate Limiting** | Sliding window rate limiter per tool |
| **Input Sanitization** | Strip HTML, control chars, truncate strings/arrays, limit depth |
| **Blocked Patterns** | Regex-based input rejection (XSS, injection) |
| **Audit Logging** | Hook for every invocation with sanitization/block status |
| **Confirmation Guards** | `requestUserInteraction()` before destructive actions |
| **Concurrency Limiting** | Cap parallel tool executions (default: 10) |

## Testing

```typescript
import {
  createMockContext,
  validateToolDefinition,
  testTool,
  scoreToolQuality,
  formatTestResults,
} from 'webmcp-kit/testing';

// Validate your tool definition
const validation = validateToolDefinition(myTool);
console.log(validation.errors);   // Schema/name issues
console.log(validation.warnings); // LLM readability tips

// Score tool quality for LLM consumption
const { score, maxScore, breakdown } = scoreToolQuality(myTool);
console.log(`Quality: ${score}/${maxScore}`);
// breakdown shows name, description, schema, annotations scores + tips

// Run test cases
const results = await testTool(myTool, [
  { name: 'basic search', input: { query: 'shoes' }, validate: (r) => r.results.length > 0 },
  { name: 'empty query fails', input: {}, expectError: /required/ },
  { name: 'timeout handling', input: { query: 'slow' }, timeoutMs: 5000 },
]);
console.log(formatTestResults(results));
// ✅ basic search (3ms)
// ✅ empty query fails (1ms)
// ❌ timeout handling (5001ms)
//    └─ Timeout after 5000ms
// 2/3 passed (1 failed)

// Mock browser for integration tests
const { context, invoke } = createMockContext();
context.registerTool(myTool);
const result = await invoke('my-tool', { query: 'test' });
```text

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
  prefix: 'myapp',           // Tool name prefix
  debug: true,                // Console logging
  maxConcurrent: 10,          // Max parallel handler executions
  onError: (err, name) => {}, // Global error handler
  onBeforeInvoke: (event) => true, // Block/allow invocations
  onAfterInvoke: (event, result) => {}, // Post-invocation hook
});
```text

## Browser Support

| Browser | Status | Version |
|---------|--------|---------|
| Chrome | ✅ Early Preview (flag-gated) | 146+ |
| Edge | 🟡 Expected (shares Chromium) | TBD |
| Firefox | ⏳ No signal yet | — |
| Safari | ⏳ No signal yet | — |

**Enable in Chrome 146:** `chrome://flags` → "Experimental Web Platform Features" → Enable → Relaunch

## How It Works

```text
Your Website                    AI Agent (Claude, GPT, Gemini...)
┌─────────────┐                ┌──────────────┐
│ webmcp-kit  │ ──registers──▶ │   Browser    │ ◀──discovers── │ Agent │
│             │                │  modelContext │                │       │
│ kit.register│ ◀──invokes─── │              │ ──calls──────▶ │       │
│  (handler)  │ ──returns───▶ │              │ ──returns────▶ │       │
└─────────────┘                └──────────────┘                └───────┘
```text

No server needed. Your frontend JavaScript IS the tool server.

## Roadmap

- [x] Core SDK with TypeScript types
- [x] Builder pattern for tool definitions
- [x] Input validation (JSON Schema)
- [x] Security middleware (rate limit, sanitize, block, audit)
- [x] React hooks
- [x] Testing utilities + mock context
- [x] Tool quality scorer
- [ ] Vue/Svelte adapters
- [ ] CLI scanner (auto-generate tools from existing forms/APIs)
- [ ] Analytics dashboard
- [ ] `.well-known/webmcp` manifest generator
- [ ] Next.js / Remix integration
- [ ] Declarative HTML `<form>` tool registration

## License

MIT

---

Built by [up2itnow](https://github.com/up2itnow) · Part of the agentic web infrastructure stack
