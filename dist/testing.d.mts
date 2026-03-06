import { M as ModelContext, b as WebMCPToolDefinition } from './types-XNU26brb.mjs';

/**
 * WebMCP Kit — Testing Utilities
 *
 * Test your WebMCP tools without a browser.
 * Simulate agent interactions, validate schemas, and
 * measure tool quality.
 */

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
declare function createMockContext(): {
    context: ModelContext;
    getTools: () => WebMCPToolDefinition<Record<string, unknown>, unknown>[];
    getTool: (name: string) => WebMCPToolDefinition<Record<string, unknown>, unknown> | undefined;
    invoke: <T = unknown>(name: string, input: Record<string, unknown>) => Promise<T>;
};
/**
 * Install mock context on global navigator for testing.
 * Call cleanup() when done.
 */
declare function installMockContext(): {
    cleanup: () => void;
    context: ModelContext;
    getTools: () => WebMCPToolDefinition<Record<string, unknown>, unknown>[];
    getTool: (name: string) => WebMCPToolDefinition<Record<string, unknown>, unknown> | undefined;
    invoke: <T = unknown>(name: string, input: Record<string, unknown>) => Promise<T>;
};
/**
 * Validate that a tool definition is well-formed
 */
declare function validateToolDefinition(tool: WebMCPToolDefinition): {
    valid: boolean;
    errors: string[];
    warnings: string[];
};
interface ToolTestCase {
    name: string;
    input: Record<string, unknown>;
    expectSuccess?: boolean;
    expectError?: string | RegExp;
    validate?: (result: unknown) => boolean | string;
    timeoutMs?: number;
}
interface ToolTestResult {
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
declare function testTool(tool: WebMCPToolDefinition, cases: ToolTestCase[]): Promise<ToolTestResult[]>;
/**
 * Format test results as a readable string
 */
declare function formatTestResults(results: ToolTestResult[]): string;
/**
 * Score how well a tool is defined for LLM consumption.
 * Higher scores mean LLMs are more likely to use the tool correctly.
 */
declare function scoreToolQuality(tool: WebMCPToolDefinition): {
    score: number;
    maxScore: number;
    breakdown: Record<string, {
        score: number;
        max: number;
        tip?: string;
    }>;
};

export { type ToolTestCase, type ToolTestResult, createMockContext, formatTestResults, installMockContext, scoreToolQuality, testTool, validateToolDefinition };
