/**
 * Tests for WebMCP Kit — Core SDK
 * Covers: tool registration, navigator.modelContext declaration,
 * input validation, builder pattern, and server JSON generation.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { WebMCPKit, createKit, tool, defineTool } from '../core.js';

// ─── Mock navigator.modelContext ───

function installModelContext() {
  const registeredTools: Record<string, unknown> = {};
  const ctx = {
    registerTool: vi.fn((t: { name: string }) => {
      registeredTools[t.name] = t;
    }),
    unregisterTool: vi.fn((name: string) => {
      delete registeredTools[name];
    }),
    requestUserInteraction: vi.fn(async () => true),
    _tools: registeredTools,
  };
  Object.defineProperty(globalThis, 'navigator', {
    value: { modelContext: ctx },
    writable: true,
    configurable: true,
  });
  return ctx;
}

function removeModelContext() {
  Object.defineProperty(globalThis, 'navigator', {
    value: {},
    writable: true,
    configurable: true,
  });
}

// ─── Core Tool Registration ───

describe('WebMCPKit — core tool registration', () => {
  let kit: WebMCPKit;

  beforeEach(() => {
    kit = createKit();
  });

  it('registers a tool and returns it via getTools()', () => {
    const t = defineTool(
      'search',
      'Search products',
      { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
      async ({ query }) => ({ results: [query] })
    );
    kit.register(t);
    expect(kit.getTools()).toHaveLength(1);
    expect(kit.getTools()[0].name).toBe('search');
  });

  it('applies prefix to tool name', () => {
    const k = createKit({ prefix: 'myapp' });
    k.register(
      defineTool('ping', 'Ping', { type: 'object', properties: {} }, async () => 'pong')
    );
    expect(k.getTools()[0].name).toBe('myapp.ping');
  });

  it('throws if tool name is empty', () => {
    expect(() =>
      kit.register(
        defineTool('', 'desc', { type: 'object', properties: {} }, async () => null)
      )
    ).toThrow(/cannot be empty/i);
  });

  it('throws if tool name exceeds 64 characters', () => {
    expect(() =>
      kit.register(
        defineTool('a'.repeat(65), 'desc', { type: 'object', properties: {} }, async () => null)
      )
    ).toThrow(/exceeds 64 characters/i);
  });

  it('throws if tool name has invalid characters', () => {
    expect(() =>
      kit.register(
        defineTool('My Tool!', 'desc', { type: 'object', properties: {} }, async () => null)
      )
    ).toThrow(/lowercase alphanumeric/i);
  });

  it('throws if inputSchema is not type object', () => {
    expect(() =>
      kit.register(
        defineTool('bad', 'desc', { type: 'string' } as any, async () => null)
      )
    ).toThrow(/type "object"/i);
  });

  it('throws on duplicate registration without replace flag', () => {
    const t = defineTool('ping', 'Ping', { type: 'object', properties: {} }, async () => 'pong');
    kit.register(t);
    expect(() => kit.register(t)).toThrow(/already registered/i);
  });

  it('allows replacement with { replace: true }', () => {
    const t = defineTool('ping', 'Ping', { type: 'object', properties: {} }, async () => 'pong');
    kit.register(t);
    kit.register(t, { replace: true });
    expect(kit.getTools()).toHaveLength(1);
  });

  it('unregisters a tool', () => {
    kit.register(
      defineTool('ping', 'Ping', { type: 'object', properties: {} }, async () => 'pong')
    );
    kit.unregister('ping');
    expect(kit.getTools()).toHaveLength(0);
  });

  it('unregisters all tools', () => {
    kit.register(defineTool('a', 'A', { type: 'object', properties: {} }, async () => 'a'));
    kit.register(defineTool('b', 'B', { type: 'object', properties: {} }, async () => 'b'));
    kit.unregisterAll();
    expect(kit.getTools()).toHaveLength(0);
  });

  it('invokes tool handler directly', async () => {
    kit.register(
      defineTool(
        'add',
        'Add two numbers',
        {
          type: 'object',
          properties: {
            a: { type: 'number' },
            b: { type: 'number' },
          },
          required: ['a', 'b'],
        },
        async ({ a, b }: { a: number; b: number }) => a + b
      )
    );
    const result = await kit.invoke('add', { a: 2, b: 3 });
    expect(result).toBe(5);
  });

  it('throws on invoke for missing tool', async () => {
    await expect(kit.invoke('ghost', {})).rejects.toThrow(/not found/i);
  });
});

// ─── Input Validation ───

describe('WebMCPKit — input validation', () => {
  let kit: WebMCPKit;

  beforeEach(() => {
    kit = createKit();
    kit.register(
      defineTool(
        'search',
        'Search',
        {
          type: 'object',
          properties: {
            query: { type: 'string', minLength: 2, maxLength: 100 },
            limit: { type: 'number', minimum: 1, maximum: 50 },
            category: { type: 'string', enum: ['books', 'electronics', 'clothing'] },
          },
          required: ['query'],
        },
        async ({ query }: { query: string }) => ({ hits: [query] })
      )
    );
  });

  it('rejects missing required field', async () => {
    await expect(kit.invoke('search', {})).rejects.toThrow(/validation failed/i);
  });

  it('rejects wrong type for string field', async () => {
    await expect(kit.invoke('search', { query: 123 })).rejects.toThrow(/validation failed/i);
  });

  it('rejects string shorter than minLength', async () => {
    await expect(kit.invoke('search', { query: 'a' })).rejects.toThrow(/validation failed/i);
  });

  it('rejects number below minimum', async () => {
    await expect(kit.invoke('search', { query: 'shoes', limit: 0 })).rejects.toThrow(/validation failed/i);
  });

  it('rejects invalid enum value', async () => {
    await expect(kit.invoke('search', { query: 'shoes', category: 'pets' })).rejects.toThrow(/validation failed/i);
  });

  it('accepts valid input', async () => {
    await expect(kit.invoke('search', { query: 'shoes', limit: 10, category: 'clothing' })).resolves.toBeDefined();
  });
});

// ─── navigator.modelContext Integration ───

describe('WebMCPKit — navigator.modelContext declaration', () => {
  let ctx: ReturnType<typeof installModelContext>;

  beforeEach(() => {
    ctx = installModelContext();
  });

  afterEach(() => {
    removeModelContext();
  });

  it('detects navigator.modelContext as available', () => {
    expect(WebMCPKit.isAvailable()).toBe(true);
  });

  it('calls registerTool on navigator.modelContext when registering', () => {
    const kit = createKit();
    kit.register(
      defineTool('greet', 'Greet', { type: 'object', properties: {} }, async () => 'hello')
    );
    expect(ctx.registerTool).toHaveBeenCalledOnce();
    expect(ctx.registerTool.mock.calls[0][0].name).toBe('greet');
  });

  it('calls unregisterTool when removing a tool', () => {
    const kit = createKit();
    kit.register(
      defineTool('greet', 'Greet', { type: 'object', properties: {} }, async () => 'hello')
    );
    kit.unregister('greet');
    expect(ctx.unregisterTool).toHaveBeenCalledWith('greet');
  });

  it('does not call registerTool when navigator is absent', () => {
    removeModelContext();
    expect(WebMCPKit.isAvailable()).toBe(false);
    const kit = createKit();
    // Should not throw even without browser context
    expect(() =>
      kit.register(
        defineTool('x', 'X', { type: 'object', properties: {} }, async () => null)
      )
    ).not.toThrow();
  });

  it('requestUserInteraction delegates to modelContext', async () => {
    const kit = createKit();
    const result = await kit.requestUserInteraction('Confirm deletion?');
    expect(ctx.requestUserInteraction).toHaveBeenCalledWith({ reason: 'Confirm deletion?' });
    expect(result).toBe(true);
  });
});

// ─── Builder Pattern ───

describe('tool() builder pattern', () => {
  it('builds a tool with all fields', () => {
    const t = tool('checkout')
      .description('Place an order')
      .input<{ productId: string }>({
        type: 'object',
        properties: { productId: { type: 'string' } },
        required: ['productId'],
      })
      .annotate({ destructiveHint: false, confirmationHint: true })
      .handle(async ({ productId }) => ({ orderId: productId + '-001' }));

    expect(t.name).toBe('checkout');
    expect(t.description).toBe('Place an order');
    expect(t.inputSchema.properties?.productId.type).toBe('string');
    expect(t.annotations?.confirmationHint).toBe(true);
  });

  it('handle() returns a callable tool definition', async () => {
    const t = tool('ping')
      .description('Ping')
      .input({ type: 'object', properties: {} })
      .handle(async () => 'pong');

    expect(await t.handler({})).toBe('pong');
  });

  it('annotate() is optional — no annotations when skipped', () => {
    const t = tool('simple')
      .description('Simple')
      .input({ type: 'object', properties: {} })
      .handle(async () => 'ok');
    expect(t.annotations).toBeUndefined();
  });
});

// ─── Server JSON Generation (manifest shape) ───

describe('WebMCPKit — server JSON / tool manifest generation', () => {
  it('getTools() returns complete tool definitions for manifest serialization', () => {
    const kit = createKit({ prefix: 'shop' });
    kit.register(
      defineTool(
        'search',
        'Search the product catalog',
        {
          type: 'object',
          properties: { query: { type: 'string', description: 'Search keyword' } },
          required: ['query'],
        },
        async () => ({ results: [] })
      )
    );

    const tools = kit.getTools();
    expect(tools).toHaveLength(1);

    const [t] = tools;
    expect(t.name).toBe('shop.search');
    expect(t.description).toBe('Search the product catalog');
    expect(t.inputSchema.type).toBe('object');
    expect(t.inputSchema.required).toContain('query');

    // Verify it serializes cleanly as JSON (no circular refs, no functions at top level)
    const manifest = JSON.parse(JSON.stringify({ tools: tools.map(({ handler: _, ...rest }) => rest) }));
    expect(manifest.tools[0].name).toBe('shop.search');
  });

  it('lifecycle hooks fire in order: before → handler → after', async () => {
    const order: string[] = [];
    const kit = createKit({
      onBeforeInvoke: async () => { order.push('before'); return true; },
      onAfterInvoke: () => { order.push('after'); },
    });
    kit.register(
      defineTool('op', 'Op', { type: 'object', properties: {} }, async () => {
        order.push('handler');
        return 'done';
      })
    );
    await kit.invoke('op', {});
    expect(order).toEqual(['before', 'handler', 'after']);
  });

  it('onBeforeInvoke returning false blocks execution', async () => {
    const kit = createKit({ onBeforeInvoke: async () => false });
    kit.register(
      defineTool('op', 'Op', { type: 'object', properties: {} }, async () => 'never')
    );
    await expect(kit.invoke('op', {})).rejects.toThrow(/blocked/i);
  });

  it('onError hook receives error and tool name', async () => {
    const onError = vi.fn();
    const kit = createKit({ onError });
    kit.register(
      defineTool(
        'fail',
        'Fail',
        { type: 'object', properties: { x: { type: 'string' } }, required: ['x'] },
        async () => { throw new Error('boom'); }
      )
    );
    await expect(kit.invoke('fail', { x: 'ok' })).rejects.toThrow('boom');
    expect(onError).toHaveBeenCalledWith(expect.any(Error), 'fail', { x: 'ok' });
  });
});
