// src/core.ts
var TOOL_NAME_REGEX = /^[a-z][a-z0-9_.-]*$/;
function validateToolName(name) {
  if (!name || name.length === 0) {
    throw new Error("WebMCP Kit: Tool name cannot be empty");
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
function validateInputSchema(schema) {
  if (!schema || schema.type !== "object") {
    throw new Error('WebMCP Kit: inputSchema must be a JSON Schema with type "object"');
  }
}
function validateInput(input, schema) {
  const errors = [];
  if (typeof input !== "object" || input === null) {
    return { valid: false, errors: ["Input must be an object"] };
  }
  const obj = input;
  if (schema.required) {
    for (const field of schema.required) {
      if (!(field in obj) || obj[field] === void 0) {
        errors.push(`Missing required field: "${field}"`);
      }
    }
  }
  if (schema.properties) {
    for (const [key, prop] of Object.entries(schema.properties)) {
      if (key in obj && obj[key] !== void 0 && obj[key] !== null) {
        const value = obj[key];
        if (prop.type === "string" && typeof value !== "string") {
          errors.push(`Field "${key}" must be a string`);
        } else if (prop.type === "number" && typeof value !== "number") {
          errors.push(`Field "${key}" must be a number`);
        } else if (prop.type === "boolean" && typeof value !== "boolean") {
          errors.push(`Field "${key}" must be a boolean`);
        } else if (prop.type === "array" && !Array.isArray(value)) {
          errors.push(`Field "${key}" must be an array`);
        }
        if (prop.enum && !prop.enum.includes(value)) {
          errors.push(`Field "${key}" must be one of: ${prop.enum.join(", ")}`);
        }
        if (prop.type === "string" && typeof value === "string") {
          if (prop.minLength !== void 0 && value.length < prop.minLength) {
            errors.push(`Field "${key}" must be at least ${prop.minLength} characters`);
          }
          if (prop.maxLength !== void 0 && value.length > prop.maxLength) {
            errors.push(`Field "${key}" must be at most ${prop.maxLength} characters`);
          }
          if (prop.pattern && !new RegExp(prop.pattern).test(value)) {
            errors.push(`Field "${key}" does not match pattern: ${prop.pattern}`);
          }
        }
        if ((prop.type === "number" || prop.type === "integer") && typeof value === "number") {
          if (prop.minimum !== void 0 && value < prop.minimum) {
            errors.push(`Field "${key}" must be >= ${prop.minimum}`);
          }
          if (prop.maximum !== void 0 && value > prop.maximum) {
            errors.push(`Field "${key}" must be <= ${prop.maximum}`);
          }
        }
      }
    }
  }
  return { valid: errors.length === 0, errors };
}
var ConcurrencyLimiter = class {
  constructor(max) {
    this.max = max;
    this.running = 0;
    this.queue = [];
  }
  async acquire() {
    if (this.running < this.max) {
      this.running++;
      return;
    }
    return new Promise((resolve) => {
      this.queue.push(() => {
        this.running++;
        resolve();
      });
    });
  }
  release() {
    this.running--;
    const next = this.queue.shift();
    if (next) next();
  }
};
var WebMCPKit = class _WebMCPKit {
  constructor(config = {}) {
    this.tools = /* @__PURE__ */ new Map();
    this._registered = /* @__PURE__ */ new Set();
    this.config = {
      prefix: config.prefix ?? "",
      debug: config.debug ?? false,
      onError: config.onError ?? (() => {
      }),
      onBeforeInvoke: config.onBeforeInvoke ?? (() => true),
      onAfterInvoke: config.onAfterInvoke ?? (() => {
      }),
      maxConcurrent: config.maxConcurrent ?? 10
    };
    this.limiter = new ConcurrencyLimiter(this.config.maxConcurrent);
  }
  /**
   * Check if WebMCP is available in the current browser
   */
  static isAvailable() {
    return typeof navigator !== "undefined" && "modelContext" in navigator;
  }
  /**
   * Get the full tool name with optional prefix
   */
  getFullName(name) {
    return this.config.prefix ? `${this.config.prefix}.${name}` : name;
  }
  /**
   * Register a tool with WebMCP
   */
  register(tool2, options = {}) {
    const fullName = this.getFullName(tool2.name);
    validateToolName(fullName);
    validateInputSchema(tool2.inputSchema);
    if (this.tools.has(fullName) && !options.replace) {
      throw new Error(`WebMCP Kit: Tool "${fullName}" is already registered. Use { replace: true } to override.`);
    }
    const wrappedTool = {
      ...tool2,
      name: fullName,
      handler: async (input) => {
        const startTime = Date.now();
        const event = {
          toolName: fullName,
          input,
          timestamp: startTime
        };
        const validation = validateInput(input, tool2.inputSchema);
        if (!validation.valid) {
          const error = new Error(`Input validation failed: ${validation.errors.join("; ")}`);
          this.config.onError(error, fullName, input);
          throw error;
        }
        const proceed = await this.config.onBeforeInvoke(event);
        if (!proceed) {
          throw new Error(`Tool invocation blocked by onBeforeInvoke hook`);
        }
        await this.limiter.acquire();
        try {
          const data = await tool2.handler(input);
          const result = {
            success: true,
            data,
            metadata: {
              executionMs: Date.now() - startTime,
              toolName: fullName,
              timestamp: startTime
            }
          };
          this.config.onAfterInvoke(event, result);
          if (this.config.debug) {
            console.log(`[WebMCP Kit] ${fullName} completed in ${result.metadata.executionMs}ms`);
          }
          return data;
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          this.config.onError(error, fullName, input);
          const result = {
            success: false,
            error: error.message,
            metadata: {
              executionMs: Date.now() - startTime,
              toolName: fullName,
              timestamp: startTime
            }
          };
          this.config.onAfterInvoke(event, result);
          throw error;
        } finally {
          this.limiter.release();
        }
      }
    };
    this.tools.set(fullName, wrappedTool);
    if (_WebMCPKit.isAvailable()) {
      navigator.modelContext.registerTool(wrappedTool);
      this._registered.add(fullName);
      if (this.config.debug) {
        console.log(`[WebMCP Kit] Registered tool: ${fullName}`);
      }
    }
  }
  /**
   * Unregister a tool
   */
  unregister(name) {
    const fullName = this.getFullName(name);
    this.tools.delete(fullName);
    if (_WebMCPKit.isAvailable() && this._registered.has(fullName)) {
      navigator.modelContext.unregisterTool(fullName);
      this._registered.delete(fullName);
    }
  }
  /**
   * Unregister all tools
   */
  unregisterAll() {
    for (const name of this.tools.keys()) {
      if (_WebMCPKit.isAvailable() && this._registered.has(name)) {
        navigator.modelContext.unregisterTool(name);
      }
    }
    this.tools.clear();
    this._registered.clear();
  }
  /**
   * Get all registered tool definitions (useful for testing/debugging)
   */
  getTools() {
    return Array.from(this.tools.values());
  }
  /**
   * Get a specific tool by name
   */
  getTool(name) {
    return this.tools.get(this.getFullName(name));
  }
  /**
   * Invoke a tool directly (useful for testing without browser)
   */
  async invoke(name, input) {
    const tool2 = this.getTool(name);
    if (!tool2) {
      throw new Error(`WebMCP Kit: Tool "${this.getFullName(name)}" not found`);
    }
    return tool2.handler(input);
  }
  /**
   * Request user interaction (confirmation dialog)
   */
  async requestUserInteraction(reason) {
    if (_WebMCPKit.isAvailable()) {
      return navigator.modelContext.requestUserInteraction({ reason });
    }
    return true;
  }
};
function tool(name) {
  let _description = "";
  let _inputSchema = { type: "object" };
  let _annotations = {};
  const builder = {
    description(desc) {
      _description = desc;
      return builder;
    },
    input(schema) {
      _inputSchema = schema;
      return builder;
    },
    output() {
      return builder;
    },
    annotate(annotations) {
      _annotations = annotations;
      return builder;
    },
    handle(handler) {
      return {
        name,
        description: _description,
        inputSchema: _inputSchema,
        handler,
        annotations: Object.keys(_annotations).length > 0 ? _annotations : void 0
      };
    }
  };
  return builder;
}
function createKit(config) {
  return new WebMCPKit(config);
}
function defineTool(name, description, inputSchema, handler, annotations) {
  return { name, description, inputSchema, handler, annotations };
}
export {
  WebMCPKit,
  createKit,
  defineTool,
  tool
};
//# sourceMappingURL=index.mjs.map