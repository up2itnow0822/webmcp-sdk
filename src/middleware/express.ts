/**
 * WebMCP Auto-Discovery Middleware for Express
 *
 * Automatically injects HTTP response headers so AI agents can discover
 * a server's MCP capabilities without any manual configuration.
 *
 * @example
 * ```ts
 * import express from 'express';
 * import { webmcpDiscovery } from 'webmcp-sdk/middleware/express';
 *
 * const app = express();
 * app.use(webmcpDiscovery());
 * ```
 */

// ─── Types ───

export type MCPCapability = 'tools' | 'resources' | 'prompts' | 'sampling' | 'logging';

export interface WebMCPDiscoveryOptions {
  /** Path to the MCP manifest endpoint. Default: '/mcp' */
  manifestPath?: string;
  /** MCP capabilities to advertise. Default: ['tools'] */
  capabilities?: MCPCapability[];
  /** MCP protocol version. Default: '1.0' */
  version?: string;
  /** Optional server name included in MCP-Server header */
  serverName?: string;
  /** Only inject headers on 2xx responses. Default: true */
  onlyOnSuccess?: boolean;
}

export interface WebMCPAutoSetupOptions extends WebMCPDiscoveryOptions {
  /** Tool definitions to serve at the manifest endpoint */
  tools?: MCPToolDefinition[];
  /** Resource definitions to serve at the manifest endpoint */
  resources?: MCPResourceDefinition[];
}

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  annotations?: Record<string, unknown>;
}

export interface MCPResourceDefinition {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

// Minimal Express-compatible types (no @types/express dependency needed)
interface IncomingRequest {
  method?: string;
  url?: string;
  headers?: Record<string, string | string[] | undefined>;
}

interface OutgoingResponse {
  statusCode: number;
  headersSent: boolean;
  setHeader(name: string, value: string): void;
  getHeader(name: string): string | number | string[] | undefined;
  json(body: unknown): void;
  end(...args: unknown[]): void;
}

type NextFunction = (err?: unknown) => void;

// ─── Header builder ───

function buildLinkHeader(manifestPath: string, capabilities: MCPCapability[]): string {
  const parts: string[] = [`<${manifestPath}>; rel="mcp-manifest"`];

  if (capabilities.includes('tools')) {
    parts.push(`<${manifestPath}/tools>; rel="mcp-tools"`);
  }
  if (capabilities.includes('resources')) {
    parts.push(`<${manifestPath}/resources>; rel="mcp-resources"`);
  }
  if (capabilities.includes('prompts')) {
    parts.push(`<${manifestPath}/prompts>; rel="mcp-prompts"`);
  }

  return parts.join(', ');
}

function injectHeaders(
  res: OutgoingResponse,
  opts: Required<Omit<WebMCPDiscoveryOptions, 'serverName'>> & { serverName?: string }
): void {
  res.setHeader('Link', buildLinkHeader(opts.manifestPath, opts.capabilities));
  res.setHeader('MCP-Version', opts.version);
  res.setHeader('MCP-Capabilities', opts.capabilities.join(','));
  if (opts.serverName) {
    res.setHeader('MCP-Server', opts.serverName);
  }
}

// ─── Core middleware ───

/**
 * Express middleware that injects WebMCP auto-discovery headers on every response.
 * Zero config required — just `app.use(webmcpDiscovery())`.
 */
export function webmcpDiscovery(options: WebMCPDiscoveryOptions = {}) {
  const opts = {
    manifestPath: options.manifestPath ?? '/mcp',
    capabilities: options.capabilities ?? (['tools'] as MCPCapability[]),
    version: options.version ?? '1.0',
    serverName: options.serverName,
    onlyOnSuccess: options.onlyOnSuccess ?? true,
  };

  return function webmcpDiscoveryMiddleware(
    _req: IncomingRequest,
    res: OutgoingResponse,
    next: NextFunction
  ): void {
    // Intercept setHeader to ensure headers are injected before they're sent
    const originalEnd = res.end.bind(res);

    (res as any).end = function (...args: unknown[]) {
      if (!res.headersSent) {
        const statusCode = res.statusCode;
        const shouldInject = opts.onlyOnSuccess
          ? statusCode >= 200 && statusCode < 300
          : true;

        if (shouldInject) {
          injectHeaders(res, opts);
        }
      }
      return originalEnd(...args);
    };

    next();
  };
}

// ─── Auto-setup: discovery headers + /mcp manifest endpoint ───

/**
 * All-in-one middleware that:
 * 1. Injects WebMCP discovery headers on every response
 * 2. Registers a GET /mcp endpoint serving the MCP manifest
 * 3. Registers GET /mcp/tools and GET /mcp/resources sub-endpoints
 *
 * @example
 * ```ts
 * app.use(webmcpAutoSetup({
 *   serverName: 'My API',
 *   tools: [{ name: 'search', description: 'Search the catalog' }],
 * }));
 * ```
 */
export function webmcpAutoSetup(options: WebMCPAutoSetupOptions = {}) {
  const {
    tools = [],
    resources = [],
    serverName,
    manifestPath = '/mcp',
    capabilities,
    version = '1.0',
    onlyOnSuccess = true,
  } = options;

  // Infer capabilities from what's provided
  const inferredCapabilities: MCPCapability[] = capabilities ?? [
    ...(tools.length > 0 ? (['tools'] as MCPCapability[]) : []),
    ...(resources.length > 0 ? (['resources'] as MCPCapability[]) : []),
  ];
  if (inferredCapabilities.length === 0) inferredCapabilities.push('tools');

  const discoveryMiddleware = webmcpDiscovery({
    manifestPath,
    capabilities: inferredCapabilities,
    version,
    serverName,
    onlyOnSuccess,
  });

  // Build manifest payload
  const manifest = {
    schema_version: version,
    server: serverName ? { name: serverName } : undefined,
    capabilities: inferredCapabilities,
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema ?? { type: 'object', properties: {} },
      annotations: t.annotations,
    })),
    resources: resources.map((r) => ({
      uri: r.uri,
      name: r.name,
      description: r.description,
      mimeType: r.mimeType,
    })),
    endpoints: {
      manifest: manifestPath,
      tools: `${manifestPath}/tools`,
      resources: `${manifestPath}/resources`,
    },
  };

  return function webmcpAutoSetupMiddleware(
    req: IncomingRequest,
    res: OutgoingResponse,
    next: NextFunction
  ): void {
    const url = req.url ?? '';
    const urlWithoutQuery = url.split('?')[0];

    // Serve manifest endpoint
    if (req.method === 'GET' && urlWithoutQuery === manifestPath) {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('MCP-Version', version);
      injectHeaders(res, {
        manifestPath,
        capabilities: inferredCapabilities,
        version,
        serverName,
        onlyOnSuccess: false,
      });
      res.json(manifest);
      return;
    }

    // Serve tools sub-endpoint
    if (req.method === 'GET' && urlWithoutQuery === `${manifestPath}/tools`) {
      res.setHeader('Content-Type', 'application/json');
      res.json({ tools: manifest.tools });
      return;
    }

    // Serve resources sub-endpoint
    if (req.method === 'GET' && urlWithoutQuery === `${manifestPath}/resources`) {
      res.setHeader('Content-Type', 'application/json');
      res.json({ resources: manifest.resources });
      return;
    }

    // Apply discovery middleware to all other routes
    discoveryMiddleware(req, res, next);
  };
}
