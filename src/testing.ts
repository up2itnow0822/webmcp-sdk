/**
 * WebMCP Kit — Testing Utilities
 *
 * Test your WebMCP tools without a browser.
 * Simulate agent interactions, validate schemas, and
 * measure tool quality.
 */

import type {
  WebMCPToolDefinition,
  JSONSchema,
  ToolResult,
  ModelContext,
} from './types.js';

// ─── Mock Browser Environment ───

/**
 * Create a mock navigator.modelContext for testing outside Chrome.
 * Registered tools can be invoked via the returned context.
 *
 * @example
 * ```ts
 * const { context, getTools, invoke } = createMockContext();
 * // Register tools against the mock
 * context.registerTool(myTool);
 * // Invoke them
 * const result = await invoke('my-tool', { query: 'test' });
 * ```
 */
export function createMockContext() {
  const tools = new Map<string, WebMCPToolDefinition>();

  const context: ModelContext = {
    registerTool(tool: WebMCPToolDefinition) {
      tools.set(tool.name, tool);
    },
    unregisterTool(name: string) {
      tools.delete(name);
    },
    getRegisteredTools() {
      return Array.from(tools.values());
    },
    async requestUserInteraction() {
      return true; // Always approve in tests
    },
  };

  return {
    context,
    getTools: () => Array.from(tools.values()),
    getTool: (name: string) => tools.get(name),
    invoke: async <T = unknown>(name: string, input: Record<string, unknown>): Promise<T> => {
      const tool = tools.get(name);
      if (!tool) throw new Error(`Tool "${name}" not registered`);
      return tool.handler(input) as Promise<T>;
    },
  };
}

/**
 * Install mock context on global navigator for testing.
 * Call cleanup() when done.
 */
export function installMockContext() {
  const mock = createMockContext();

  const originalModelContext = (globalThis as any).navigator?.modelContext;
  if (typeof globalThis.navigator === 'undefined') {
    (globalThis as any).navigator = {};
  }
  (globalThis as any).navigator.modelContext = mock.context;

  return {
    ...mock,
    cleanup: () => {
      if (originalModelContext !== undefined) {
        (globalThis as any).navigator.modelContext = originalModelContext;
      } else {
        delete (globalThis as any).navigator.modelContext;
      }
    },
  };
}

// ─── Schema Validation ───

/**
 * Validate that a tool definition is well-formed
 */
export function validateToolDefinition(tool: WebMCPToolDefinition): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Name validation
  if (!tool.name) errors.push('Tool name is required');
  if (tool.name && !/^[a-z][a-z0-9_.-]*$/.test(tool.name)) {
    errors.push('Tool name must be lowercase alphanumeric with hyphens/dots/underscores');
  }
  if (tool.name && tool.name.length > 64) {
    errors.push('Tool name must be 64 characters or fewer');
  }

  // Description validation
  if (!tool.description) errors.push('Tool description is required');
  if (tool.description && tool.description.length < 10) {
    warnings.push('Tool description is very short — LLMs need clear descriptions to select the right tool');
  }
  if (tool.description && tool.description.length > 500) {
    warnings.push('Tool description is very long — consider being more concise for token efficiency');
  }

  // Schema validation
  if (!tool.inputSchema) errors.push('inputSchema is required');
  if (tool.inputSchema && tool.inputSchema.type !== 'object') {
    errors.push('inputSchema.type must be "object"');
  }
  if (tool.inputSchema?.properties) {
    for (const [key, prop] of Object.entries(tool.inputSchema.properties)) {
      if (!prop.type) errors.push(`Property "${key}" is missing type`);
      if (!prop.description) {
        warnings.push(`Property "${key}" has no description — this helps LLMs fill it correctly`);
      }
    }
  }

  // Handler validation
  if (!tool.handler) errors.push('handler function is required');
  if (tool.handler && typeof tool.handler !== 'function') {
    errors.push('handler must be a function');
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ─── Test Runner ───

export interface ToolTestCase {
  name: string;
  input: Record<string, unknown>;
  expectSuccess?: boolean;
  expectError?: string | RegExp;
  validate?: (result: unknown) => boolean | string;
  timeoutMs?: number;
}

export interface ToolTestResult {
  name: string;
  passed: boolean;
  durationMs: number;
  error?: string;
  result?: unknown;
}

/**
 * Run test cases against a tool
 *
 * @example
 * ```ts
 * const results = await testTool(searchTool, [
 *   {
 *     name: 'basic search',
 *     input: { query: 'shoes' },
 *     expectSuccess: true,
 *     validate: (r) => Array.isArray(r.results),
 *   },
 *   {
 *     name: 'empty query fails',
 *     input: { query: '' },
 *     expectError: /query.*required/i,
 *   },
 * ]);
 *
 * console.log(formatTestResults(results));
 * ```
 */
export async function testTool(
  tool: WebMCPToolDefinition,
  cases: ToolTestCase[]
): Promise<ToolTestResult[]> {
  const results: ToolTestResult[] = [];

  for (const tc of cases) {
    const start = Date.now();
    let passed = false;
    let error: string | undefined;
    let result: unknown;

    try {
      const timeoutPromise = tc.timeoutMs
        ? new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Timeout after ${tc.timeoutMs}ms`)), tc.timeoutMs)
          )
        : null;

      const handlerPromise = tool.handler(tc.input);
      result = timeoutPromise
        ? await Promise.race([handlerPromise, timeoutPromise])
        : await handlerPromise;

      if (tc.expectError) {
        error = `Expected error but succeeded with: ${JSON.stringify(result)}`;
      } else if (tc.expectSuccess !== false) {
        if (tc.validate) {
          const validation = tc.validate(result);
          if (validation === true) {
            passed = true;
          } else {
            error = typeof validation === 'string' ? validation : 'Validation failed';
          }
        } else {
          passed = true;
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (tc.expectError) {
        if (typeof tc.expectError === 'string') {
          passed = errMsg.includes(tc.expectError);
        } else {
          passed = tc.expectError.test(errMsg);
        }
        if (!passed) {
          error = `Expected error matching ${tc.expectError}, got: ${errMsg}`;
        }
      } else {
        error = errMsg;
      }
    }

    results.push({
      name: tc.name,
      passed,
      durationMs: Date.now() - start,
      error,
      result,
    });
  }

  return results;
}

/**
 * Format test results as a readable string
 */
export function formatTestResults(results: ToolTestResult[]): string {
  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;

  const lines = results.map((r) => {
    const icon = r.passed ? '✅' : '❌';
    const duration = `${r.durationMs}ms`;
    const err = r.error ? `\n   └─ ${r.error}` : '';
    return `${icon} ${r.name} (${duration})${err}`;
  });

  lines.push('');
  lines.push(`${passed}/${results.length} passed${failed > 0 ? ` (${failed} failed)` : ''}`);

  return lines.join('\n');
}

// ─── Tool Description Quality Scorer ───

/**
 * Score how well a tool is defined for LLM consumption.
 * Higher scores mean LLMs are more likely to use the tool correctly.
 */
export function scoreToolQuality(tool: WebMCPToolDefinition): {
  score: number;
  maxScore: number;
  breakdown: Record<string, { score: number; max: number; tip?: string }>;
} {
  const breakdown: Record<string, { score: number; max: number; tip?: string }> = {};

  // Name quality (0-10)
  let nameScore = 0;
  if (tool.name) nameScore += 3;
  if (tool.name && tool.name.length >= 3 && tool.name.length <= 30) nameScore += 3;
  if (tool.name && tool.name.includes('_') || tool.name?.includes('.')) nameScore += 2;
  if (tool.name && !tool.name.includes('tool') && !tool.name.includes('function')) nameScore += 2;
  breakdown.name = {
    score: nameScore,
    max: 10,
    tip: nameScore < 7 ? 'Use descriptive verb_noun names like "search_products" or "get_user"' : undefined,
  };

  // Description quality (0-20)
  let descScore = 0;
  if (tool.description) descScore += 5;
  if (tool.description && tool.description.length >= 20) descScore += 5;
  if (tool.description && tool.description.length <= 200) descScore += 3;
  if (tool.description && /\b(returns?|provides?|gets?|searches?|creates?|updates?|deletes?)\b/i.test(tool.description)) descScore += 4;
  if (tool.description && !tool.description.includes('TODO') && !tool.description.includes('...')) descScore += 3;
  breakdown.description = {
    score: descScore,
    max: 20,
    tip: descScore < 15 ? 'Write clear descriptions that tell the LLM WHEN and WHY to use this tool' : undefined,
  };

  // Schema quality (0-20)
  let schemaScore = 0;
  if (tool.inputSchema) schemaScore += 5;
  if (tool.inputSchema?.properties && Object.keys(tool.inputSchema.properties).length > 0) schemaScore += 5;
  if (tool.inputSchema?.required && tool.inputSchema.required.length > 0) schemaScore += 3;
  const hasDescriptions = tool.inputSchema?.properties
    ? Object.values(tool.inputSchema.properties).every((p) => p.description)
    : false;
  if (hasDescriptions) schemaScore += 5;
  if (tool.inputSchema?.properties) {
    const hasConstraints = Object.values(tool.inputSchema.properties).some(
      (p) => p.enum || p.minimum !== undefined || p.maximum !== undefined || p.pattern
    );
    if (hasConstraints) schemaScore += 2;
  }
  breakdown.schema = {
    score: schemaScore,
    max: 20,
    tip: schemaScore < 15 ? 'Add descriptions to all properties and use enums/constraints where possible' : undefined,
  };

  // Annotations (0-10)
  let annotScore = 0;
  if (tool.annotations) annotScore += 5;
  if (tool.annotations?.readOnlyHint !== undefined || tool.annotations?.destructiveHint !== undefined) annotScore += 5;
  breakdown.annotations = {
    score: annotScore,
    max: 10,
    tip: annotScore < 5 ? 'Add annotations like readOnlyHint or destructiveHint to help agents make safer decisions' : undefined,
  };

  const totalScore = Object.values(breakdown).reduce((sum, b) => sum + b.score, 0);
  const maxScore = Object.values(breakdown).reduce((sum, b) => sum + b.max, 0);

  return { score: totalScore, maxScore, breakdown };
}
