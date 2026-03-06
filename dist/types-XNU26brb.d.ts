/**
 * WebMCP Kit — Type definitions for the Web Model Context Protocol
 *
 * Based on the W3C Web Machine Learning Community Group specification:
 * https://webmachinelearning.github.io/webmcp/
 *
 * Chrome 146 Early Preview (February 2026)
 */
interface JSONSchema {
    type: 'object' | 'string' | 'number' | 'boolean' | 'array' | 'integer' | 'null';
    properties?: Record<string, JSONSchemaProperty>;
    required?: string[];
    description?: string;
    additionalProperties?: boolean;
}
interface JSONSchemaProperty {
    type: string;
    description?: string;
    enum?: (string | number | boolean)[];
    default?: unknown;
    items?: JSONSchemaProperty;
    minimum?: number;
    maximum?: number;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    format?: string;
}
/**
 * Annotation hints for tool behavior.
 * Advisory — the browser/agent decides how to handle them.
 */
interface ToolAnnotations {
    /** Indicates this tool may have destructive side effects */
    destructiveHint?: boolean;
    /** Indicates this tool only reads data, no side effects */
    readOnlyHint?: boolean;
    /** Indicates this tool may take a long time to execute */
    longRunningHint?: boolean;
    /** Indicates this tool requires user confirmation before execution */
    confirmationHint?: boolean;
    /** Human-readable title for consent prompts */
    title?: string;
}
/**
 * Tool definition registered with the browser via navigator.modelContext
 */
interface WebMCPToolDefinition<TInput = Record<string, unknown>, TOutput = unknown> {
    /** Unique tool name (lowercase, alphanumeric + hyphens) */
    name: string;
    /** Natural language description for LLM tool selection */
    description: string;
    /** JSON Schema defining expected input parameters */
    inputSchema: JSONSchema;
    /** Handler function invoked when an agent calls this tool */
    handler: (input: TInput) => Promise<TOutput> | TOutput;
    /** Optional annotations providing behavioral hints */
    annotations?: ToolAnnotations;
}
/**
 * Options for tool registration
 */
interface RegisterToolOptions {
    /** Override an existing tool with the same name */
    replace?: boolean;
    /** Enable debug logging for this tool */
    debug?: boolean;
}
/**
 * Result of a tool invocation
 */
interface ToolResult<T = unknown> {
    success: boolean;
    data?: T;
    error?: string;
    metadata?: {
        executionMs: number;
        toolName: string;
        timestamp: number;
    };
}
/**
 * Event emitted when an agent invokes a tool
 */
interface ToolInvocationEvent {
    toolName: string;
    input: Record<string, unknown>;
    timestamp: number;
    agentId?: string;
}
interface ModelContext {
    registerTool(tool: WebMCPToolDefinition): void;
    unregisterTool(name: string): void;
    getRegisteredTools(): WebMCPToolDefinition[];
    requestUserInteraction(options?: {
        reason?: string;
    }): Promise<boolean>;
}
declare global {
    interface Navigator {
        modelContext?: ModelContext;
    }
}
interface WebMCPKitConfig {
    /** Prefix for all tool names (e.g., 'myapp' → 'myapp.search') */
    prefix?: string;
    /** Enable debug logging */
    debug?: boolean;
    /** Global error handler for tool failures */
    onError?: (error: Error, toolName: string, input: unknown) => void;
    /** Hook called before every tool invocation */
    onBeforeInvoke?: (event: ToolInvocationEvent) => boolean | Promise<boolean>;
    /** Hook called after every tool invocation */
    onAfterInvoke?: (event: ToolInvocationEvent, result: ToolResult) => void;
    /** Maximum concurrent tool executions (default: 10) */
    maxConcurrent?: number;
}
interface ToolBuilder<TInput = Record<string, unknown>, TOutput = unknown> {
    description(desc: string): ToolBuilder<TInput, TOutput>;
    input<T>(schema: JSONSchema): ToolBuilder<T, TOutput>;
    output<T>(): ToolBuilder<TInput, T>;
    annotate(annotations: ToolAnnotations): ToolBuilder<TInput, TOutput>;
    handle(handler: (input: TInput) => Promise<TOutput> | TOutput): WebMCPToolDefinition<TInput, TOutput>;
}

export type { JSONSchema as J, ModelContext as M, RegisterToolOptions as R, ToolInvocationEvent as T, WebMCPKitConfig as W, ToolResult as a, WebMCPToolDefinition as b, ToolAnnotations as c, ToolBuilder as d, JSONSchemaProperty as e };
