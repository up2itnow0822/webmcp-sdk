/** SDK types mapped to the October 2026 document.modelContext registration surface. */
type JSONSchemaType = 'object' | 'string' | 'number' | 'boolean' | 'array' | 'integer' | 'null';
interface JSONSchema {
    type?: JSONSchemaType | JSONSchemaType[];
    properties?: Record<string, JSONSchemaProperty | boolean>;
    required?: string[];
    description?: string;
    additionalProperties?: boolean | JSONSchema;
    items?: JSONSchema | boolean | Array<JSONSchema | boolean>;
    enum?: unknown[];
    const?: unknown;
    minimum?: number;
    maximum?: number;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    format?: string;
    [keyword: string]: unknown;
}
interface JSONSchemaProperty extends JSONSchema {
    default?: unknown;
}
interface ToolExecutionContext {
    readonly signal: AbortSignal;
}
interface InvokeOptions {
    signal?: AbortSignal;
}
type ConfirmationProvider = (reason?: string) => boolean | Promise<boolean>;
/** Advisory metadata, never an authorization grant. Legacy hints are mapped by the native adapter. */
interface ToolAnnotations {
    consequentialHint?: boolean;
    untrustedContentHint?: boolean;
    debugging?: boolean;
    destructiveHint?: boolean;
    readOnlyHint?: boolean;
    longRunningHint?: boolean;
    confirmationHint?: boolean;
    title?: string;
}
interface WebMCPToolDefinition<TInput = Record<string, unknown>, TOutput = unknown> {
    name: string;
    title?: string;
    description: string;
    inputSchema: JSONSchema;
    handler: (input: TInput, context?: ToolExecutionContext) => Promise<TOutput> | TOutput;
    /** Prequeue admission receives the same context identity as the handler. */
    admit?: (input: TInput, context: ToolExecutionContext) => void | Promise<void>;
    /** Every caller failure, including failures before admission. */
    onExecutionRejected?: (context: ToolExecutionContext, error: Error) => void;
    annotations?: ToolAnnotations;
}
interface RegisterToolOptions {
    replace?: boolean;
    debug?: boolean;
}
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
interface ToolInvocationEvent {
    toolName: string;
    input: Record<string, unknown>;
    timestamp: number;
    agentId?: string;
}
interface ModelContextTool {
    name: string;
    title?: string;
    description: string;
    inputSchema: JSONSchema;
    execute: (input: Record<string, unknown>, options?: InvokeOptions) => Promise<unknown>;
    annotations?: ToolAnnotations;
}
/** Current native registration subset; discovery is outside the adapter's scope. */
interface ModelContext {
    registerTool(tool: ModelContextTool, options?: {
        signal?: AbortSignal;
    }): Promise<void>;
}
interface LegacyModelContext {
    registerTool(tool: WebMCPToolDefinition): void;
    unregisterTool(name: string): void;
    getRegisteredTools?(): WebMCPToolDefinition[];
    requestUserInteraction?(options?: {
        reason?: string;
    }): Promise<boolean>;
}
declare global {
    interface Document {
        modelContext?: ModelContext;
    }
    interface Navigator {
        modelContext?: LegacyModelContext;
    }
}
interface WebMCPKitConfig {
    prefix?: string;
    debug?: boolean;
    onError?: (error: Error, toolName: string, input: unknown) => void;
    onBeforeInvoke?: (event: ToolInvocationEvent) => boolean | Promise<boolean>;
    onAfterInvoke?: (event: ToolInvocationEvent, result: ToolResult) => void;
    maxConcurrent?: number;
    maxQueued?: number;
    timeoutMs?: number;
    maxInputBytes?: number;
    maxInputNodes?: number;
    maxInputDepth?: number;
    confirmationProvider?: ConfirmationProvider;
    browserAdapter?: 'modern' | 'legacy' | 'none';
}
interface ToolBuilder<TInput = Record<string, unknown>, TOutput = unknown> {
    description(desc: string): ToolBuilder<TInput, TOutput>;
    input<T>(schema: JSONSchema): ToolBuilder<T, TOutput>;
    output<T>(): ToolBuilder<TInput, T>;
    annotate(annotations: ToolAnnotations): ToolBuilder<TInput, TOutput>;
    handle(handler: (input: TInput, context?: ToolExecutionContext) => Promise<TOutput> | TOutput): WebMCPToolDefinition<TInput, TOutput>;
}

export type { ConfirmationProvider as C, InvokeOptions as I, JSONSchema as J, LegacyModelContext as L, ModelContext as M, RegisterToolOptions as R, ToolInvocationEvent as T, WebMCPKitConfig as W, ToolResult as a, WebMCPToolDefinition as b, ModelContextTool as c, ToolExecutionContext as d, ToolAnnotations as e, ToolBuilder as f, JSONSchemaProperty as g };
