import { W as WebMCPKitConfig, b as WebMCPToolDefinition, R as RegisterToolOptions, J as JSONSchema, c as ToolAnnotations, d as ToolBuilder } from './types-XNU26brb.js';
export { e as JSONSchemaProperty, M as ModelContext, T as ToolInvocationEvent, a as ToolResult } from './types-XNU26brb.js';

/**
 * WebMCP Kit — Core SDK
 *
 * Makes any website agent-ready in minutes.
 * Wraps navigator.modelContext with type safety, validation,
 * middleware, and developer experience.
 */

declare class WebMCPKit {
    private tools;
    private config;
    private limiter;
    private _registered;
    constructor(config?: WebMCPKitConfig);
    /**
     * Check if WebMCP is available in the current browser
     */
    static isAvailable(): boolean;
    /**
     * Get the full tool name with optional prefix
     */
    private getFullName;
    /**
     * Register a tool with WebMCP
     */
    register<TInput extends Record<string, unknown> = Record<string, unknown>, TOutput = unknown>(tool: WebMCPToolDefinition<TInput, TOutput>, options?: RegisterToolOptions): void;
    /**
     * Unregister a tool
     */
    unregister(name: string): void;
    /**
     * Unregister all tools
     */
    unregisterAll(): void;
    /**
     * Get all registered tool definitions (useful for testing/debugging)
     */
    getTools(): WebMCPToolDefinition[];
    /**
     * Get a specific tool by name
     */
    getTool(name: string): WebMCPToolDefinition | undefined;
    /**
     * Invoke a tool directly (useful for testing without browser)
     */
    invoke<T = unknown>(name: string, input: Record<string, unknown>): Promise<T>;
    /**
     * Request user interaction (confirmation dialog)
     */
    requestUserInteraction(reason?: string): Promise<boolean>;
}
/**
 * Fluent builder for creating WebMCP tools
 *
 * @example
 * ```ts
 * const searchTool = tool('search')
 *   .description('Search products')
 *   .input<{ query: string }>({
 *     type: 'object',
 *     properties: { query: { type: 'string' } },
 *     required: ['query']
 *   })
 *   .annotate({ readOnlyHint: true })
 *   .handle(async ({ query }) => searchProducts(query));
 * ```
 */
declare function tool(name: string): ToolBuilder;
/**
 * Create a new WebMCP Kit instance
 */
declare function createKit(config?: WebMCPKitConfig): WebMCPKit;
/**
 * Quick tool registration for simple cases
 */
declare function defineTool<TInput extends Record<string, unknown>, TOutput>(name: string, description: string, inputSchema: JSONSchema, handler: (input: TInput) => Promise<TOutput> | TOutput, annotations?: ToolAnnotations): WebMCPToolDefinition<TInput, TOutput>;

export { JSONSchema, RegisterToolOptions, ToolAnnotations, ToolBuilder, WebMCPKit, WebMCPKitConfig, WebMCPToolDefinition, createKit, defineTool, tool };
