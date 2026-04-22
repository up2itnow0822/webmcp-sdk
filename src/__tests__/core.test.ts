import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WebMCPKit, createKit, tool, defineTool } from '../core.js';
import { installMockContext } from '../testing.js';

describe('WebMCPKit', () => {
  let kit: WebMCPKit;
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    kit = createKit({ debug: false });
  });

  afterEach(() => {
    if (cleanup) {
      cleanup();
      cleanup = undefined;
    }
  });

  it('creates a kit instance', () => {
    expect(kit).toBeInstanceOf(WebMCPKit);
  });

  it('registers a tool', () => {
    kit.register({
      name: 'search',
      description: 'Search for products',
      inputSchema: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
      handler: async ({ query }) => ({ results: [], query }),
    });

    expect(kit.getTools()).toHaveLength(1);
    expect(kit.getTools()[0].name).toBe('search');
  });

  it('registers with prefix', () => {
    const prefixed = createKit({ prefix: 'myapp' });
    prefixed.register({
      name: 'search',
      description: 'Search',
      inputSchema: { type: 'object' },
      handler: async () => ({}),
    });

    expect(prefixed.getTools()[0].name).toBe('myapp.search');
  });

  it('rejects invalid tool names', () => {
    expect(() =>
      kit.register({
        name: 'UPPERCASE',
        description: 'Bad name',
        inputSchema: { type: 'object' },
        handler: async () => ({}),
      })
    ).toThrow(/lowercase/);
  });

  it('rejects empty tool names', () => {
    expect(() =>
      kit.register({
        name: '',
        description: 'Empty name',
        inputSchema: { type: 'object' },
        handler: async () => ({}),
      })
    ).toThrow(/empty/);
  });

  it('rejects duplicate registration without replace', () => {
    const def = {
      name: 'dupe',
      description: 'Test',
      inputSchema: { type: 'object' as const },
      handler: async () => ({}),
    };
    kit.register(def);
    expect(() => kit.register(def)).toThrow(/already registered/);
  });

  it('allows replacement with replace: true', () => {
    kit.register({
      name: 'replaceable',
      description: 'v1',
      inputSchema: { type: 'object' },
      handler: async () => 'v1',
    });
    kit.register(
      {
        name: 'replaceable',
        description: 'v2',
        inputSchema: { type: 'object' },
        handler: async () => 'v2',
      },
      { replace: true }
    );

    expect(kit.getTools()[0].description).toBe('v2');
  });

  it('invokes a tool directly', async () => {
    kit.register({
      name: 'echo',
      description: 'Echo input',
      inputSchema: {
        type: 'object',
        properties: { message: { type: 'string' } },
      },
      handler: async ({ message }) => ({ echo: message }),
    });

    const result = await kit.invoke<{ echo: string }>('echo', { message: 'hello' });
    expect(result.echo).toBe('hello');
  });

  it('validates required fields', async () => {
    kit.register({
      name: 'strict',
      description: 'Strict input',
      inputSchema: {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name'],
      },
      handler: async ({ name }) => name,
    });

    await expect(kit.invoke('strict', {})).rejects.toThrow(/required/);
  });

  it('validates field types', async () => {
    kit.register({
      name: 'typed',
      description: 'Typed input',
      inputSchema: {
        type: 'object',
        properties: { count: { type: 'number' } },
      },
      handler: async ({ count }) => count,
    });

    await expect(kit.invoke('typed', { count: 'not a number' })).rejects.toThrow(/number/);
  });

  it('validates enum values', async () => {
    kit.register({
      name: 'enumed',
      description: 'Enum input',
      inputSchema: {
        type: 'object',
        properties: {
          color: { type: 'string', enum: ['red', 'blue', 'green'] },
        },
      },
      handler: async ({ color }) => color,
    });

    await expect(kit.invoke('enumed', { color: 'purple' })).rejects.toThrow(/one of/);
  });

  it('unregisters a tool', () => {
    kit.register({
      name: 'temp',
      description: 'Temporary',
      inputSchema: { type: 'object' },
      handler: async () => ({}),
    });

    expect(kit.getTools()).toHaveLength(1);
    kit.unregister('temp');
    expect(kit.getTools()).toHaveLength(0);
  });

  it('unregisters all tools', () => {
    kit.register({
      name: 'tool-a',
      description: 'A',
      inputSchema: { type: 'object' },
      handler: async () => ({}),
    });
    kit.register({
      name: 'tool-b',
      description: 'B',
      inputSchema: { type: 'object' },
      handler: async () => ({}),
    });

    kit.unregisterAll();
    expect(kit.getTools()).toHaveLength(0);
  });

  it('calls onError on handler failure', async () => {
    let capturedError: Error | null = null;
    const errorKit = createKit({
      onError: (err) => {
        capturedError = err;
      },
    });

    errorKit.register({
      name: 'failing',
      description: 'This fails',
      inputSchema: { type: 'object' },
      handler: async () => {
        throw new Error('boom');
      },
    });

    await expect(errorKit.invoke('failing', {})).rejects.toThrow('boom');
    expect(capturedError).not.toBeNull();
    expect(capturedError!.message).toBe('boom');
  });

  it('calls onBeforeInvoke and can block', async () => {
    const blockKit = createKit({
      onBeforeInvoke: () => false,
    });

    blockKit.register({
      name: 'blocked',
      description: 'Blocked tool',
      inputSchema: { type: 'object' },
      handler: async () => 'should not run',
    });

    await expect(blockKit.invoke('blocked', {})).rejects.toThrow(/blocked/i);
  });

  it('isAvailable returns false outside browser', () => {
    expect(WebMCPKit.isAvailable()).toBe(false);
  });

  it('auto-registers tools in navigator.modelContext when available', () => {
    const mock = installMockContext();
    cleanup = mock.cleanup;

    const browserKit = createKit({ prefix: 'demo' });
    browserKit.register({
      name: 'hello',
      description: 'Return a greeting',
      inputSchema: {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name'],
      },
      handler: async ({ name }) => ({ message: `Hello, ${name}!` }),
    });

    expect(mock.getTools()).toHaveLength(1);
    expect(mock.getTools()[0].name).toBe('demo.hello');
  });

  it('unregister removes the tool from navigator.modelContext when available', () => {
    const mock = installMockContext();
    cleanup = mock.cleanup;

    const browserKit = createKit({ prefix: 'demo' });
    browserKit.register({
      name: 'hello',
      description: 'Return a greeting',
      inputSchema: {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name'],
      },
      handler: async ({ name }) => ({ message: `Hello, ${name}!` }),
    });

    browserKit.unregister('hello');
    expect(mock.getTools()).toHaveLength(0);
  });
});

describe('tool builder', () => {
  it('creates a tool definition with fluent API', () => {
    const searchTool = tool('search')
      .description('Search products')
      .input({
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      })
      .annotate({ readOnlyHint: true })
      .handle(async ({ query }: { query: string }) => ({ results: [], query }));

    expect(searchTool.name).toBe('search');
    expect(searchTool.description).toBe('Search products');
    expect(searchTool.annotations?.readOnlyHint).toBe(true);
    expect(searchTool.inputSchema.required).toContain('query');
  });
});

describe('defineTool', () => {
  it('creates a tool definition', () => {
    const t = defineTool(
      'get-user',
      'Get a user by ID',
      {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
      async ({ id }) => ({ id, name: 'Test' })
    );

    expect(t.name).toBe('get-user');
    expect(t.description).toBe('Get a user by ID');
  });
});
