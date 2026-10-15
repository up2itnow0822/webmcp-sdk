import { W as WebMCPKitConfig, f as ToolInvocationEvent, g as ToolResult, h as WebMCPToolDefinition, R as RegisterToolOptions, I as InvokeOptions, J as JSONSchema, T as ToolExecutionContext, d as ToolAnnotations, e as ToolBuilder } from './types-CFF4VVYT.js';

/** Bounded local execution with observable native-browser registration. */

type CompletionListener = (event: ToolInvocationEvent, result: ToolResult) => void;
declare class WebMCPKit {
    private tools;
    private config;
    private limiter;
    private admitted;
    private registrations;
    private listeners;
    private lifetimes;
    constructor(config?: WebMCPKitConfig);
    static isAvailable(): boolean;
    private getFullName;
    subscribe(listener: CompletionListener): () => void;
    register<TInput extends Record<string, unknown> = Record<string, unknown>, TOutput = unknown>(tool: WebMCPToolDefinition<TInput, TOutput>, options?: RegisterToolOptions): void;
    ready(): Promise<void>;
    unregister(name: string): void;
    unregisterAll(): void;
    getTools(): WebMCPToolDefinition[];
    getTool(name: string): WebMCPToolDefinition | undefined;
    invoke<T = unknown>(name: string, input: Record<string, unknown>, options?: InvokeOptions): Promise<T>;
    requestUserInteraction(reason?: string): Promise<boolean>;
    private reportError;
    private complete;
    /** Retain total admission until asynchronous policy/operation work actually quiesces. */
    private acquireAdmission;
    private execute;
}
declare function tool(name: string): ToolBuilder;
declare function createKit(config?: WebMCPKitConfig): WebMCPKit;
declare function defineTool<TInput extends Record<string, unknown>, TOutput>(name: string, description: string, inputSchema: JSONSchema, handler: (input: TInput, context?: ToolExecutionContext) => Promise<TOutput> | TOutput, annotations?: ToolAnnotations): WebMCPToolDefinition<TInput, TOutput>;

export { WebMCPKit as W, createKit as c, defineTool as d, tool as t };
