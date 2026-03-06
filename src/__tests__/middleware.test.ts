/**
 * Tests for WebMCP Auto-Discovery Middleware (Express)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  webmcpDiscovery,
  webmcpAutoSetup,
  type WebMCPDiscoveryOptions,
} from '../middleware/express.js';

// ─── Minimal mock helpers ───

interface MockResponse {
  statusCode: number;
  headersSent: boolean;
  headers: Record<string, string>;
  body: unknown;
  setHeader(name: string, value: string): void;
  getHeader(name: string): string | undefined;
  json(body: unknown): void;
  end(...args: unknown[]): void;
}

function createMockRes(statusCode = 200): MockResponse {
  const res: MockResponse = {
    statusCode,
    headersSent: false,
    headers: {},
    body: undefined,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    getHeader(name) {
      return this.headers[name.toLowerCase()];
    },
    json(body) {
      this.body = body;
      this.headers['content-type'] = 'application/json';
    },
    end(..._args) {
      this.headersSent = true;
    },
  };
  return res;
}

function createMockReq(method = 'GET', url = '/api/data') {
  return { method, url, headers: {} };
}

function runMiddleware(
  middleware: ReturnType<typeof webmcpDiscovery>,
  req: ReturnType<typeof createMockReq>,
  res: MockResponse
): Promise<void> {
  return new Promise((resolve) => {
    middleware(req, res as any, () => {
      // Simulate Express calling res.end() after next()
      res.end();
      resolve();
    });
  });
}

// ─── webmcpDiscovery Tests ───

describe('webmcpDiscovery middleware', () => {
  it('injects MCP-Version header with default value', async () => {
    const res = createMockRes();
    await runMiddleware(webmcpDiscovery(), createMockReq(), res);
    expect(res.headers['mcp-version']).toBe('1.0');
  });

  it('injects MCP-Capabilities header with default tools', async () => {
    const res = createMockRes();
    await runMiddleware(webmcpDiscovery(), createMockReq(), res);
    expect(res.headers['mcp-capabilities']).toBe('tools');
  });

  it('injects Link header pointing to /mcp by default', async () => {
    const res = createMockRes();
    await runMiddleware(webmcpDiscovery(), createMockReq(), res);
    expect(res.headers['link']).toContain('</mcp>; rel="mcp-manifest"');
  });

  it('does NOT inject MCP-Server header when serverName is omitted', async () => {
    const res = createMockRes();
    await runMiddleware(webmcpDiscovery(), createMockReq(), res);
    expect(res.headers['mcp-server']).toBeUndefined();
  });

  it('injects MCP-Server header when serverName is provided', async () => {
    const res = createMockRes();
    await runMiddleware(webmcpDiscovery({ serverName: 'My API' }), createMockReq(), res);
    expect(res.headers['mcp-server']).toBe('My API');
  });

  it('respects custom manifestPath', async () => {
    const res = createMockRes();
    await runMiddleware(webmcpDiscovery({ manifestPath: '/api/mcp' }), createMockReq(), res);
    expect(res.headers['link']).toContain('</api/mcp>; rel="mcp-manifest"');
  });

  it('respects custom version', async () => {
    const res = createMockRes();
    await runMiddleware(webmcpDiscovery({ version: '2.0' }), createMockReq(), res);
    expect(res.headers['mcp-version']).toBe('2.0');
  });

  it('injects multiple capabilities', async () => {
    const res = createMockRes();
    await runMiddleware(
      webmcpDiscovery({ capabilities: ['tools', 'resources', 'prompts'] }),
      createMockReq(),
      res
    );
    expect(res.headers['mcp-capabilities']).toBe('tools,resources,prompts');
  });

  it('adds mcp-tools link rel when tools capability present', async () => {
    const res = createMockRes();
    await runMiddleware(webmcpDiscovery({ capabilities: ['tools'] }), createMockReq(), res);
    expect(res.headers['link']).toContain('rel="mcp-tools"');
  });

  it('adds mcp-resources link rel when resources capability present', async () => {
    const res = createMockRes();
    await runMiddleware(webmcpDiscovery({ capabilities: ['resources'] }), createMockReq(), res);
    expect(res.headers['link']).toContain('rel="mcp-resources"');
  });

  it('skips header injection on 4xx when onlyOnSuccess=true (default)', async () => {
    const res = createMockRes(404);
    await runMiddleware(webmcpDiscovery(), createMockReq(), res);
    expect(res.headers['mcp-version']).toBeUndefined();
  });

  it('skips header injection on 5xx when onlyOnSuccess=true (default)', async () => {
    const res = createMockRes(500);
    await runMiddleware(webmcpDiscovery(), createMockReq(), res);
    expect(res.headers['mcp-version']).toBeUndefined();
  });

  it('injects headers on 4xx when onlyOnSuccess=false', async () => {
    const res = createMockRes(404);
    await runMiddleware(webmcpDiscovery({ onlyOnSuccess: false }), createMockReq(), res);
    expect(res.headers['mcp-version']).toBe('1.0');
  });

  it('injects headers on 201 Created', async () => {
    const res = createMockRes(201);
    await runMiddleware(webmcpDiscovery(), createMockReq(), res);
    expect(res.headers['mcp-version']).toBe('1.0');
  });

  it('does not inject headers when headersSent is true', async () => {
    const res = createMockRes(200);
    res.headersSent = true;
    await runMiddleware(webmcpDiscovery(), createMockReq(), res);
    // headers object stays empty because headersSent guard fires
    expect(res.headers['mcp-version']).toBeUndefined();
  });

  it('calls next() so the request chain continues', async () => {
    const next = vi.fn();
    const res = createMockRes();
    webmcpDiscovery()({} as any, res as any, next);
    expect(next).toHaveBeenCalledOnce();
  });
});

// ─── webmcpAutoSetup Tests ───

describe('webmcpAutoSetup middleware', () => {
  it('serves GET /mcp with JSON manifest', async () => {
    const middleware = webmcpAutoSetup({ serverName: 'Test App' });
    const req = createMockReq('GET', '/mcp');
    const res = createMockRes();
    const next = vi.fn();

    middleware(req as any, res as any, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.body).toMatchObject({ capabilities: ['tools'] });
  });

  it('manifest includes serverName', async () => {
    const middleware = webmcpAutoSetup({ serverName: 'My Server' });
    const req = createMockReq('GET', '/mcp');
    const res = createMockRes();

    middleware(req as any, res as any, vi.fn());

    expect((res.body as any).server?.name).toBe('My Server');
  });

  it('manifest includes tools definitions', async () => {
    const middleware = webmcpAutoSetup({
      tools: [{ name: 'search', description: 'Search docs' }],
    });
    const req = createMockReq('GET', '/mcp');
    const res = createMockRes();

    middleware(req as any, res as any, vi.fn());

    expect((res.body as any).tools).toHaveLength(1);
    expect((res.body as any).tools[0].name).toBe('search');
  });

  it('serves GET /mcp/tools sub-endpoint', async () => {
    const middleware = webmcpAutoSetup({
      tools: [{ name: 'ping', description: 'Ping the server' }],
    });
    const req = createMockReq('GET', '/mcp/tools');
    const res = createMockRes();

    middleware(req as any, res as any, vi.fn());

    expect((res.body as any).tools).toHaveLength(1);
  });

  it('serves GET /mcp/resources sub-endpoint', async () => {
    const middleware = webmcpAutoSetup({
      resources: [{ uri: '/docs', name: 'Documentation' }],
    });
    const req = createMockReq('GET', '/mcp/resources');
    const res = createMockRes();

    middleware(req as any, res as any, vi.fn());

    expect((res.body as any).resources).toHaveLength(1);
  });

  it('infers tools capability when tools are provided', async () => {
    const middleware = webmcpAutoSetup({
      tools: [{ name: 'x', description: 'x' }],
    });
    const req = createMockReq('GET', '/mcp');
    const res = createMockRes();

    middleware(req as any, res as any, vi.fn());

    expect((res.body as any).capabilities).toContain('tools');
  });

  it('infers resources capability when resources are provided', async () => {
    const middleware = webmcpAutoSetup({
      resources: [{ uri: '/data', name: 'Data' }],
    });
    const req = createMockReq('GET', '/mcp');
    const res = createMockRes();

    middleware(req as any, res as any, vi.fn());

    expect((res.body as any).capabilities).toContain('resources');
  });

  it('passes non-manifest routes through to next()', async () => {
    const middleware = webmcpAutoSetup();
    const req = createMockReq('GET', '/api/users');
    const res = createMockRes();
    const next = vi.fn();

    middleware(req as any, res as any, next);
    res.end(); // simulate next() completing

    expect(next).toHaveBeenCalled();
  });

  it('injects discovery headers on passthrough routes', async () => {
    const middleware = webmcpAutoSetup({ serverName: 'Demo' });
    const res = createMockRes(200);
    const next = vi.fn();
    const req = createMockReq('GET', '/api/data');

    middleware(req as any, res as any, next);
    res.end(); // trigger header injection via patched end()

    expect(res.headers['mcp-version']).toBe('1.0');
    expect(res.headers['mcp-server']).toBe('Demo');
  });

  it('respects custom manifestPath in autoSetup', async () => {
    const middleware = webmcpAutoSetup({ manifestPath: '/api/mcp' });
    const req = createMockReq('GET', '/api/mcp');
    const res = createMockRes();

    middleware(req as any, res as any, vi.fn());

    expect(res.body).toMatchObject({ capabilities: ['tools'] });
  });

  it('manifest endpoint includes endpoints map', async () => {
    const middleware = webmcpAutoSetup();
    const req = createMockReq('GET', '/mcp');
    const res = createMockRes();

    middleware(req as any, res as any, vi.fn());

    expect((res.body as any).endpoints).toMatchObject({
      manifest: '/mcp',
      tools: '/mcp/tools',
      resources: '/mcp/resources',
    });
  });

  it('does not serve manifest for POST /mcp', async () => {
    const middleware = webmcpAutoSetup();
    const req = createMockReq('POST', '/mcp');
    const res = createMockRes();
    const next = vi.fn();

    middleware(req as any, res as any, next);

    expect(next).toHaveBeenCalled();
    expect(res.body).toBeUndefined();
  });

  it('handles query strings on manifest path gracefully', async () => {
    const middleware = webmcpAutoSetup();
    const req = createMockReq('GET', '/mcp?debug=true');
    const res = createMockRes();
    const next = vi.fn();

    middleware(req as any, res as any, next);

    // Should still serve manifest
    expect(next).not.toHaveBeenCalled();
    expect(res.body).toBeDefined();
  });
});
