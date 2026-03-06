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
type MCPCapability = 'tools' | 'resources' | 'prompts' | 'sampling' | 'logging';
interface WebMCPDiscoveryOptions {
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
interface WebMCPAutoSetupOptions extends WebMCPDiscoveryOptions {
    /** Tool definitions to serve at the manifest endpoint */
    tools?: MCPToolDefinition[];
    /** Resource definitions to serve at the manifest endpoint */
    resources?: MCPResourceDefinition[];
}
interface MCPToolDefinition {
    name: string;
    description: string;
    inputSchema?: Record<string, unknown>;
    annotations?: Record<string, unknown>;
}
interface MCPResourceDefinition {
    uri: string;
    name: string;
    description?: string;
    mimeType?: string;
}
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
/**
 * Express middleware that injects WebMCP auto-discovery headers on every response.
 * Zero config required — just `app.use(webmcpDiscovery())`.
 */
declare function webmcpDiscovery(options?: WebMCPDiscoveryOptions): (_req: IncomingRequest, res: OutgoingResponse, next: NextFunction) => void;
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
declare function webmcpAutoSetup(options?: WebMCPAutoSetupOptions): (req: IncomingRequest, res: OutgoingResponse, next: NextFunction) => void;

export { type MCPCapability, type MCPResourceDefinition, type MCPToolDefinition, type WebMCPAutoSetupOptions, type WebMCPDiscoveryOptions, webmcpAutoSetup, webmcpDiscovery };
