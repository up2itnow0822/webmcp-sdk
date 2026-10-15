/** SDK types mapped to the October 2026 document.modelContext registration surface. */
export type JSONSchemaType = 'object' | 'string' | 'number' | 'boolean' | 'array' | 'integer' | 'null';
export interface JSONSchema {
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
export interface JSONSchemaProperty extends JSONSchema {default?: unknown;}
export interface ToolExecutionContext {readonly signal: AbortSignal;}
export interface InvokeOptions {signal?: AbortSignal;}
export type ConfirmationProvider = (reason?: string) => boolean | Promise<boolean>;
/** Advisory metadata, never an authorization grant. Legacy hints are mapped by the native adapter. */
export interface ToolAnnotations {
  consequentialHint?: boolean;
  untrustedContentHint?: boolean;
  debugging?: boolean;
  destructiveHint?: boolean;
  readOnlyHint?: boolean;
  longRunningHint?: boolean;
  confirmationHint?: boolean;
  title?: string;
}
export interface WebMCPToolDefinition<TInput = Record<string, unknown>, TOutput = unknown> {
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
export interface RegisterToolOptions {replace?: boolean; debug?: boolean;}
export interface ToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: {executionMs: number; toolName: string; timestamp: number;};
}
export interface ToolInvocationEvent {
  toolName: string;
  input: Record<string, unknown>;
  timestamp: number;
  agentId?: string;
}
export interface ModelContextTool {
  name: string;
  title?: string;
  description: string;
  inputSchema: JSONSchema;
  execute: (input: Record<string, unknown>, options?: InvokeOptions) => Promise<unknown>;
  annotations?: ToolAnnotations;
}
/** Current native registration subset; discovery is outside the adapter's scope. */
export interface ModelContext {registerTool(tool: ModelContextTool, options?: {signal?: AbortSignal}): Promise<void>;}
export interface LegacyModelContext {
  registerTool(tool: WebMCPToolDefinition): void;
  unregisterTool(name: string): void;
  getRegisteredTools?(): WebMCPToolDefinition[];
  requestUserInteraction?(options?: {reason?: string}): Promise<boolean>;
}
declare global {
  interface Document {modelContext?: ModelContext;}
  interface Navigator {modelContext?: LegacyModelContext;}
}
export interface WebMCPKitConfig {
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
export interface ToolBuilder<TInput = Record<string, unknown>, TOutput = unknown> {
  description(desc: string): ToolBuilder<TInput, TOutput>;
  input<T>(schema: JSONSchema): ToolBuilder<T, TOutput>;
  output<T>(): ToolBuilder<TInput, T>;
  annotate(annotations: ToolAnnotations): ToolBuilder<TInput, TOutput>;
  handle(handler: (input: TInput, context?: ToolExecutionContext) => Promise<TOutput> | TOutput): WebMCPToolDefinition<TInput, TOutput>;
}
