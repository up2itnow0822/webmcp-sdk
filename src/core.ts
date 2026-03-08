/**
 * WebMCP Kit — Core SDK
 *
 * Makes any website agent-ready in minutes.
 * Wraps navigator.modelContext with type safety, validation,
 * middleware, and developer experience.
 */

import type {
  WebMCPToolDefinition,
  WebMCPKitConfig,
  ToolResult,
  ToolInvocationEvent,
  ToolAnnotations,
  JSONSchema,
  ToolBuilder,
  RegisterToolOptions,
} from './types.js';

// ─── Validation ───

const TOOL_NAME_REGEX = /^[a-z][a-z0-9_.-]*$/;

function validateToolName(name: string): void {
  if (!name || name.length === 0) {
    throw new Error('WebMCP Kit: Tool name cannot be empty');
  }
  if (name.length > 64) {
    throw new Error(`WebMCP Kit: Tool name "${name}" exceeds 64 characters`);
  }
  if (!TOOL_NAME_REGEX.test(name)) {
    throw new Error(
      `WebMCP Kit: Tool name "${name}" must be lowercase alphanumeric with hyphens/dots/underscores`
    );
  }
}

function validateInputSchema(schema: JSONSchema): void {
  if (!schema || schema.type !== 'object') {
    throw new Error('WebMCP Kit: inputSchema must be a JSON Schema with type "object"');
  }
}

// ─── Input Validation at Runtime ───

function validateInput(input: unknown, schema: JSONSchema): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (typeof input !== 'object' || input === null) {
    return { valid: false, errors: ['Input must be an object'] };
  }

  const obj = input as Record<string, unknown>;

  // Check required fields
  if (schema.required) {
    for (const field of schema.required) {
      if (!(field in obj) || obj[field] === undefined) {
        errors.push(`Missing required field: "${field}"`);
      }
    }
  }

  // Check property types
  if (schema.properties) {
    for (const [key, prop] of Object.entries(schema.properties)) {
      if (key in obj && obj[key] !== undefined && obj[key] !== null) {
        const value = obj[key];
        // Type checking
        if (prop.type === 'string' && typeof value !== 'string') {
          errors.push(`Field "${key}" must be a string`);
        } else if (prop.type === 'number' && typeof value !== 'number') {
          errors.push(`Field "${key}" must be a number`);
        } else if (prop.type === 'boolean' && typeof value !== 'boolean') {
          errors.push(`Field "${key}" must be a boolean`);
        } else if (prop.type === 'array' && !Array.isArray(value)) {
          errors.push(`Field "${key}" must be an array`);
        }
        // Enum validation
        if (prop.enum && !prop.enum.includes(value as string | number | boolean)) {
          errors.push(`Field "${key}" must be one of: ${prop.enum.join(', ')}`);
        }
        // String constraints
        if (prop.type === 'string' && typeof value === 'string') {
          if (prop.minLength !== undefined && value.length < prop.minLength) {
            errors.push(`Field "${key}" must be at least ${prop.minLength} characters`);
          }
          if (prop.maxLength !== undefined && value.length > prop.maxLength) {
            errors.push(`Field "${key}" must be at most ${prop.maxLength} characters`);
          }
          if (prop.pattern && !new RegExp(prop.pattern).test(value)) {
            errors.push(`Field "${key}" does not match pattern: ${prop.pattern}`);
          }
        }
        // Number constraints
        if ((prop.type === 'number' || prop.type === 'integer') && typeof value === 'number') {
          if (prop.minimum !== undefined && value < prop.minimum) {
            errors.push(`Field "${key}" must be >= ${prop.minimum}`);
          }
          if (prop.maximum !== undefined && value > prop.maximum) {
            errors.push(`Field "${key}" must be <= ${prop.maximum}`);
          }
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// ─── Concurrency Limiter ───

class ConcurrencyLimiter {
  private running = 0;
  private queue: Array<() => void> = [];

  constructor(private max: number) {}

  async acquire(): Promise<void> {
    if (this.running < this.max) {
      this.running++;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(() => {
        this.running++;
        resolve();
      });
    });
  }

  release(): void {
    this.running--;
    const next = this.queue.shift();
    if (next) next();
  }
}

// ─── WebMCP Kit Instance ───

export class WebMCPKit {
  private tools = new Map<string, WebMCPToolDefinition>();
  private config: Required<WebMCPKitConfig>;
  private limiter: ConcurrencyLimiter;
  private _registered = new Set<string>();

  constructor(config: WebMCPKitConfig = {}) {
    this.config = {
      prefix: config.prefix ?? '',
      debug: config.debug ?? false,
      onError: config.onError ?? (() => {}),
      onBeforeInvoke: config.onBeforeInvoke ?? (() => true),
      onAfterInvoke: config.onAfterInvoke ?? (() => {}),
      maxConcurrent: config.maxConcurrent ?? 10,
    };
    this.limiter = new ConcurrencyLimiter(this.config.maxConcurrent);
  }

  /**
   * Check if WebMCP is available in the current browser
   */
  static isAvailable(): boolean {
    return typeof navigator !== 'undefined' && 'modelContext' in navigator;
  }

  /**
   * Get the full tool name with optional prefix
   */
  private getFullName(name: string): string {
    return this.config.prefix ? `${this.config.prefix}.${name}` : name;
  }

  /**
   * Register a tool with WebMCP
   */
  register<TInput extends Record<string, unknown> = Record<string, unknown>, TOutput = unknown>(
    tool: WebMCPToolDefinition<TInput, TOutput>,
    options: RegisterToolOptions = {}
  ): void {
    const fullName = this.getFullName(tool.name);

    // Validate
    validateToolName(fullName);
    validateInputSchema(tool.inputSchema);

    if (this.tools.has(fullName) && !options.replace) {
      throw new Error(`WebMCP Kit: Tool "${fullName}" is already registered. Use { replace: true } to override.`);
    }

    // Wrap handler with middleware
    const wrappedTool: WebMCPToolDefinition = {
      ...tool,
      name: fullName,
      handler: async (input: Record<string, unknown>) => {
        const startTime = Date.now();
        const event: ToolInvocationEvent = {
          toolName: fullName,
          input,
          timestamp: startTime,
        };

        // Input validation
        const validation = validateInput(input, tool.inputSchema);
        if (!validation.valid) {
          const error = new Error(`Input validation failed: ${validation.errors.join('; ')}`);
          this.config.onError(error, fullName, input);
          throw error;
        }

        // Before hook
        const proceed = await this.config.onBeforeInvoke(event);
        if (!proceed) {
          throw new Error(`Tool invocation blocked by onBeforeInvoke hook`);
        }

        // Execute with concurrency limit
        await this.limiter.acquire();
        try {
          const data = await (tool.handler as (input: Record<string, unknown>) => Promise<unknown>)(input);
          const result: ToolResult = {
            success: true,
            data,
            metadata: {
              executionMs: Date.now() - startTime,
              toolName: fullName,
              timestamp: startTime,
            },
          };

          this.config.onAfterInvoke(event, result);

          if (this.config.debug) {
            console.log(`[WebMCP Kit] ${fullName} completed in ${result.metadata!.executionMs}ms`);
          }

          return data;
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          this.config.onError(error, fullName, input);

          const result: ToolResult = {
            success: false,
            error: error.message,
            metadata: {
              executionMs: Date.now() - startTime,
              toolName: fullName,
              timestamp: startTime,
            },
          };

          this.config.onAfterInvoke(event, result);
          throw error;
        } finally {
          this.limiter.release();
        }
      },
    };

    this.tools.set(fullName, wrappedTool);

    // Register with browser if available
    if (WebMCPKit.isAvailable()) {
      navigator.modelContext!.registerTool(wrappedTool);
      this._registered.add(fullName);

      if (this.config.debug) {
        console.log(`[WebMCP Kit] Registered tool: ${fullName}`);
      }
    }
  }

  /**
   * Unregister a tool
   */
  unregister(name: string): void {
    const fullName = this.getFullName(name);
    this.tools.delete(fullName);

    if (WebMCPKit.isAvailable() && this._registered.has(fullName)) {
      navigator.modelContext!.unregisterTool(fullName);
      this._registered.delete(fullName);
    }
  }

  /**
   * Unregister all tools
   */
  unregisterAll(): void {
    for (const name of this.tools.keys()) {
      if (WebMCPKit.isAvailable() && this._registered.has(name)) {
        navigator.modelContext!.unregisterTool(name);
      }
    }
    this.tools.clear();
    this._registered.clear();
  }

  /**
   * Get all registered tool definitions (useful for testing/debugging)
   */
  getTools(): WebMCPToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get a specific tool by name
   */
  getTool(name: string): WebMCPToolDefinition | undefined {
    return this.tools.get(this.getFullName(name));
  }

  /**
   * Invoke a tool directly (useful for testing without browser)
   */
  async invoke<T = unknown>(name: string, input: Record<string, unknown>): Promise<T> {
    const tool = this.getTool(name);
    if (!tool) {
      throw new Error(`WebMCP Kit: Tool "${this.getFullName(name)}" not found`);
    }
    return tool.handler(input) as Promise<T>;
  }

  /**
   * Request user interaction (confirmation dialog)
   */
  async requestUserInteraction(reason?: string): Promise<boolean> {
    if (WebMCPKit.isAvailable()) {
      return navigator.modelContext!.requestUserInteraction({ reason });
    }
    // Fallback for non-browser environments
    return true;
  }
}

// ─── Builder Pattern ───

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
export function tool(name: string): ToolBuilder {
  let _description = '';
  let _inputSchema: JSONSchema = { type: 'object' };
  let _annotations: ToolAnnotations = {};

  const builder: ToolBuilder = {
    description(desc: string) {
      _description = desc;
      return builder;
    },
    input(schema: JSONSchema) {
      _inputSchema = schema;
      return builder as any;
    },
    output() {
      return builder as any;
    },
    annotate(annotations: ToolAnnotations) {
      _annotations = annotations;
      return builder;
    },
    handle(handler: (input: any) => any): WebMCPToolDefinition {
      return {
        name,
        description: _description,
        inputSchema: _inputSchema,
        handler,
        annotations: Object.keys(_annotations).length > 0 ? _annotations : undefined,
      };
    },
  };

  return builder;
}

// ─── Convenience Functions ───

/**
 * Create a new WebMCP Kit instance
 */
export function createKit(config?: WebMCPKitConfig): WebMCPKit {
  return new WebMCPKit(config);
}

/**
 * Quick tool registration for simple cases
 */
export function defineTool<TInput extends Record<string, unknown>, TOutput>(
  name: string,
  description: string,
  inputSchema: JSONSchema,
  handler: (input: TInput) => Promise<TOutput> | TOutput,
  annotations?: ToolAnnotations
): WebMCPToolDefinition<TInput, TOutput> {
  return { name, description, inputSchema, handler, annotations };
}
