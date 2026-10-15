/** Bounded local execution with observable native-browser registration. */
import type {
  WebMCPToolDefinition,
  WebMCPKitConfig,
  ToolResult,
  ToolInvocationEvent,
  ToolAnnotations,
  JSONSchema,
  ToolBuilder,
  RegisterToolOptions,
  ToolExecutionContext,
  InvokeOptions,
} from "./types.js";
import { snapshotInput, validateLimit, freezeInput } from "./input.js";
import { compileSchema } from "./validation.js";
import { modernContext, registerBrowserTool } from "./browser.js";
const TOOL_NAME_REGEX = /^[a-z][a-z0-9_.-]*$/;
function validateToolName(name: string): void {
  if (typeof name !== "string" || !name)
    throw new Error("WebMCP Kit: Tool name cannot be empty");
  if (name.length > 64)
    throw new Error("WebMCP Kit: Tool name exceeds 64 characters");
  if (!TOOL_NAME_REGEX.test(name))
    throw new Error(
      "WebMCP Kit: Tool name must be lowercase alphanumeric with hyphens/dots/underscores",
    );
}
function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new Error("Tool invocation aborted");
}
class ConcurrencyLimiter {
  private running = 0;
  private queue: Array<{
    start: () => void;
    reject: (error: Error) => void;
    signal: AbortSignal;
    cancel: () => void;
  }> = [];
  constructor(
    private max: number,
    private maxQueued: number,
  ) {}
  acquire(signal: AbortSignal): Promise<() => void> {
    if (signal.aborted) return Promise.reject(abortError(signal));
    if (this.running < this.max) {
      this.running++;
      return Promise.resolve(() => this.release());
    }
    if (this.queue.length >= this.maxQueued)
      return Promise.reject(new Error("WebMCP Kit: Invocation queue is full"));
    return new Promise((resolve, reject) => {
      const entry = {
        signal,
        reject,
        start: () => {
          signal.removeEventListener("abort", entry.cancel);
          this.running++;
          resolve(() => this.release());
        },
        cancel: () => {
          const index = this.queue.indexOf(entry);
          if (index >= 0) this.queue.splice(index, 1);
          reject(abortError(signal));
        },
      };
      this.queue.push(entry);
      signal.addEventListener("abort", entry.cancel, { once: true });
    });
  }
  private release(): void {
    this.running--;
    const next = this.queue.shift();
    if (next) next.start();
  }
}
type CompletionListener = (
  event: ToolInvocationEvent,
  result: ToolResult,
) => void;
export class WebMCPKit {
  private tools = new Map<string, WebMCPToolDefinition>();
  private config: WebMCPKitConfig & {
    maxConcurrent: number;
    maxQueued: number;
    timeoutMs: number;
    maxInputBytes: number;
    maxInputNodes: number;
    maxInputDepth: number;
    browserAdapter: "modern" | "legacy" | "none";
  };
  private limiter: ConcurrencyLimiter;
  private admitted = 0;
  private registrations = new Map<
    string,
    { abort: () => void; ready: Promise<void> }
  >();
  private listeners = new Set<CompletionListener>();
  private lifetimes = new Map<string, AbortController>();
  constructor(config: WebMCPKitConfig = {}) {
    this.config = {
      ...config,
      maxConcurrent: config.maxConcurrent ?? 10,
      maxQueued: config.maxQueued ?? 100,
      timeoutMs: config.timeoutMs ?? 30000,
      maxInputBytes: config.maxInputBytes ?? 65536,
      maxInputNodes: config.maxInputNodes ?? 1000,
      maxInputDepth: config.maxInputDepth ?? 10,
      browserAdapter: config.browserAdapter ?? "modern",
    };
    for (const key of [
      "maxConcurrent",
      "maxQueued",
      "timeoutMs",
      "maxInputBytes",
      "maxInputNodes",
      "maxInputDepth",
    ] as const)
      validateLimit(key, this.config[key], key === "maxQueued");
    validateLimit(
      "total invocation capacity",
      this.config.maxConcurrent + this.config.maxQueued,
    );
    if (this.config.timeoutMs > 2147483647)
      throw new Error("WebMCP Kit: timeoutMs exceeds supported timer limit");
    if (!["modern", "legacy", "none"].includes(this.config.browserAdapter))
      throw new Error("Invalid browserAdapter");
    if (this.config.prefix) validateToolName(this.config.prefix);
    if (
      this.config.confirmationProvider !== undefined &&
      typeof this.config.confirmationProvider !== "function"
    )
      throw new Error("confirmationProvider must be a function");
    this.limiter = new ConcurrencyLimiter(
      this.config.maxConcurrent,
      this.config.maxQueued,
    );
  }
  static isAvailable(): boolean {
    return !!modernContext();
  }
  private getFullName(name: string): string {
    return this.config.prefix && !name.startsWith(`${this.config.prefix}.`)
      ? `${this.config.prefix}.${name}`
      : name;
  }
  subscribe(listener: CompletionListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  register<
    TInput extends Record<string, unknown> = Record<string, unknown>,
    TOutput = unknown,
  >(
    tool: WebMCPToolDefinition<TInput, TOutput>,
    options: RegisterToolOptions = {},
  ): void {
    const fullName = this.getFullName(tool.name);
    validateToolName(fullName);
    const schema = snapshotInput(tool.inputSchema, {
      maxInputBytes: 262144,
      maxInputNodes: 10000,
      maxInputDepth: 64,
    }) as JSONSchema;
    const validate = compileSchema(schema);
    if (typeof tool.handler !== "function")
      throw new Error("WebMCP Kit: handler must be a function");
    if (this.tools.has(fullName) && !options.replace)
      throw new Error(
        `WebMCP Kit: Tool "${fullName}" is already registered. Use { replace: true } to override.`,
      );
    this.lifetimes
      .get(fullName)
      ?.abort(new Error("Tool registration revoked: replaced"));
    const lifetime = new AbortController();
    this.lifetimes.set(fullName, lifetime);
    this.registrations.get(fullName)?.abort();
    this.registrations.delete(fullName);
    const wrapped: WebMCPToolDefinition = {
      ...(tool as WebMCPToolDefinition),
      name: fullName,
      inputSchema: schema,
      handler: (input, context) =>
        this.execute(
          fullName,
          tool as WebMCPToolDefinition,
          validate,
          input,
          context,
          lifetime.signal,
        ),
    };
    this.tools.set(fullName, wrapped);
    const registration = registerBrowserTool(
      wrapped,
      this.config.browserAdapter,
    );
    if (registration) {
      registration.ready = registration.ready.catch((error) => {
        this.reportError(asError(error), fullName, undefined);
        throw error;
      });
      // Keep rejection observable through ready without an unhandled rejection before it is awaited.
      void registration.ready.catch(() => {});
      this.registrations.set(fullName, registration);
    }
  }
  async ready(): Promise<void> {
    await Promise.all(
      [...this.registrations.values()].map((value) => value.ready),
    );
  }
  unregister(name: string): void {
    const fullName = this.getFullName(name);
    this.tools.delete(fullName);
    this.lifetimes
      .get(fullName)
      ?.abort(new Error("Tool registration revoked: unregistered"));
    this.lifetimes.delete(fullName);
    this.registrations.get(fullName)?.abort();
    this.registrations.delete(fullName);
  }
  unregisterAll(): void {
    for (const controller of this.lifetimes.values())
      controller.abort(new Error("Tool registration revoked: unregistered"));
    this.lifetimes.clear();
    for (const registration of this.registrations.values())
      registration.abort();
    this.tools.clear();
    this.registrations.clear();
  }
  getTools(): WebMCPToolDefinition[] {
    return [...this.tools.values()];
  }
  getTool(name: string): WebMCPToolDefinition | undefined {
    return this.tools.get(this.getFullName(name));
  }
  async invoke<T = unknown>(
    name: string,
    input: Record<string, unknown>,
    options: InvokeOptions = {},
  ): Promise<T> {
    const tool = this.getTool(name);
    if (!tool)
      throw new Error(`WebMCP Kit: Tool "${this.getFullName(name)}" not found`);
    return tool.handler(
      input,
      options.signal ? { signal: options.signal } : undefined,
    ) as Promise<T>;
  }
  async requestUserInteraction(reason?: string): Promise<boolean> {
    if (!this.config.confirmationProvider)
      throw new Error("WebMCP Kit: Explicit confirmationProvider is required");
    return (await this.config.confirmationProvider(reason)) === true;
  }
  private reportError(error: Error, name: string, input: unknown): void {
    try {
      this.config.onError?.(error, name, input);
    } catch {
      /* Diagnostic callbacks cannot change execution. */
    }
  }
  private complete(event: ToolInvocationEvent, result: ToolResult): void {
    try {
      this.config.onAfterInvoke?.(event, result);
    } catch (error) {
      this.reportError(asError(error), event.toolName, event.input);
    }
    for (const listener of this.listeners) {
      try {
        listener(event, result);
      } catch (error) {
        this.reportError(asError(error), event.toolName, event.input);
      }
    }
  }
  /** Retain total admission until asynchronous policy/operation work actually quiesces. */
  private acquireAdmission(): () => void {
    if (this.admitted >= this.config.maxConcurrent + this.config.maxQueued)
      throw new Error(
        "WebMCP Kit: Invocation admission capacity and queue are full",
      );
    this.admitted++;
    return () => {
      this.admitted--;
    };
  }
  private async execute(
    name: string,
    tool: WebMCPToolDefinition,
    validate: ReturnType<typeof compileSchema>,
    raw: unknown,
    external?: ToolExecutionContext,
    lifetime?: AbortSignal,
  ): Promise<unknown> {
    const start = Date.now();
    const controller = new AbortController();
    const context: ToolExecutionContext = Object.freeze({
      signal: controller.signal,
    });
    const externalAbort = () =>
      controller.abort(
        external?.signal.reason ?? new Error("Tool invocation aborted"),
      );
    external?.signal.addEventListener("abort", externalAbort, { once: true });
    if (external?.signal.aborted) externalAbort();
    const lifetimeAbort = () =>
      controller.abort(
        lifetime?.reason ??
          new Error("Tool registration revoked: unregistered"),
      );
    lifetime?.addEventListener("abort", lifetimeAbort, { once: true });
    if (lifetime?.aborted) lifetimeAbort();
    const timer = setTimeout(
      () =>
        controller.abort(
          new Error(`Tool invocation timeout after ${this.config.timeoutMs}ms`),
        ),
      this.config.timeoutMs,
    );
    let event: ToolInvocationEvent = {
      toolName: name,
      input: {},
      timestamp: start,
    };
    let rejectAbort!: (error: Error) => void;
    const aborted = new Promise<never>((_, reject) => {
      rejectAbort = reject;
    });
    const onAbort = () => rejectAbort(abortError(controller.signal));
    controller.signal.addEventListener("abort", onAbort, { once: true });
    if (controller.signal.aborted) onAbort();
    const operation = async () => {
      if (controller.signal.aborted) throw abortError(controller.signal);
      const releaseAdmission = this.acquireAdmission();
      try {
        const input = snapshotInput(raw, this.config);
        freezeInput(input);
        event = { ...event, input };
        const result = validate(input);
        if (!result.valid)
          throw new Error(
            `Input validation failed: ${result.errors.join("; ")}`,
          );
        if (
          this.config.onBeforeInvoke &&
          !(await this.config.onBeforeInvoke(event))
        )
          throw new Error("Tool invocation blocked by onBeforeInvoke hook");
        if (controller.signal.aborted) throw abortError(controller.signal);
        await tool.admit?.(input, context);
        if (controller.signal.aborted) throw abortError(controller.signal);
        const release = await this.limiter.acquire(controller.signal);
        try {
          if (controller.signal.aborted) throw abortError(controller.signal);
          return await tool.handler(input, context);
        } finally {
          release();
        }
      } finally {
        releaseAdmission();
      }
    };
    try {
      const data = await Promise.race([operation(), aborted]);
      this.complete(event, {
        success: true,
        data,
        metadata: {
          executionMs: Date.now() - start,
          toolName: name,
          timestamp: start,
        },
      });
      return data;
    } catch (caught) {
      const error = asError(caught);
      controller.abort(error);
      try {
        tool.onExecutionRejected?.(context, error);
      } catch (hookError) {
        this.reportError(asError(hookError), name, event.input);
      }
      this.reportError(error, name, event.input);
      this.complete(event, {
        success: false,
        error: error.message,
        metadata: {
          executionMs: Date.now() - start,
          toolName: name,
          timestamp: start,
        },
      });
      throw error;
    } finally {
      clearTimeout(timer);
      external?.signal.removeEventListener("abort", externalAbort);
      lifetime?.removeEventListener("abort", lifetimeAbort);
      controller.signal.removeEventListener("abort", onAbort);
    }
  }
}
export function tool(name: string): ToolBuilder {
  let description = "";
  let inputSchema: JSONSchema = { type: "object" };
  let annotations: ToolAnnotations = {};
  const builder: ToolBuilder = {
    description(value) {
      description = value;
      return builder;
    },
    input(schema) {
      inputSchema = schema;
      return builder as any;
    },
    output() {
      return builder as any;
    },
    annotate(value) {
      annotations = value;
      return builder;
    },
    handle(handler: (input: any) => any): WebMCPToolDefinition {
      return {
        name,
        description,
        inputSchema,
        handler,
        annotations: Object.keys(annotations).length ? annotations : undefined,
      };
    },
  };
  return builder;
}
export function createKit(config?: WebMCPKitConfig): WebMCPKit {
  return new WebMCPKit(config);
}
export function defineTool<TInput extends Record<string, unknown>, TOutput>(
  name: string,
  description: string,
  inputSchema: JSONSchema,
  handler: (
    input: TInput,
    context?: ToolExecutionContext,
  ) => Promise<TOutput> | TOutput,
  annotations?: ToolAnnotations,
): WebMCPToolDefinition<TInput, TOutput> {
  return { name, description, inputSchema, handler, annotations };
}
