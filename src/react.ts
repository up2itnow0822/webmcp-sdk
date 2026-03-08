/**
 * WebMCP Kit — React Hooks & Components
 *
 * React bindings for WebMCP tool registration.
 * Tools are registered on mount and cleaned up on unmount.
 */

import { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import { WebMCPKit, createKit } from './core.js';
import type {
  WebMCPToolDefinition,
  WebMCPKitConfig,
  JSONSchema,
  ToolAnnotations,
  ToolInvocationEvent,
  ToolResult,
} from './types.js';

// ─── Context ───

let _sharedKit: WebMCPKit | null = null;

/**
 * Get or create a shared WebMCP Kit instance for React
 */
function getSharedKit(config?: WebMCPKitConfig): WebMCPKit {
  if (!_sharedKit) {
    _sharedKit = createKit(config);
  }
  return _sharedKit;
}

// ─── Hooks ───

/**
 * Register a WebMCP tool that lives for the component's lifetime.
 * Tool is registered on mount and unregistered on unmount.
 *
 * @example
 * ```tsx
 * function SearchComponent() {
 *   useWebMCPTool({
 *     name: 'search',
 *     description: 'Search products in the catalog',
 *     inputSchema: {
 *       type: 'object',
 *       properties: { query: { type: 'string' } },
 *       required: ['query']
 *     },
 *     handler: async ({ query }) => {
 *       const results = await searchProducts(query);
 *       return { results, count: results.length };
 *     }
 *   });
 *
 *   return <div>Search is agent-ready!</div>;
 * }
 * ```
 */
export function useWebMCPTool<TInput extends Record<string, unknown> = Record<string, unknown>, TOutput = unknown>(
  tool: WebMCPToolDefinition<TInput, TOutput>,
  config?: WebMCPKitConfig
): void {
  const kit = useMemo(() => getSharedKit(config), []);
  const registeredRef = useRef(false);

  useEffect(() => {
    if (!registeredRef.current) {
      kit.register(tool as WebMCPToolDefinition, { replace: true });
      registeredRef.current = true;
    }

    return () => {
      kit.unregister(tool.name);
      registeredRef.current = false;
    };
  }, [tool.name]);
}

/**
 * Register multiple WebMCP tools at once.
 *
 * @example
 * ```tsx
 * function App() {
 *   useWebMCPTools([searchTool, cartTool, checkoutTool]);
 *   return <div>App is agent-ready!</div>;
 * }
 * ```
 */
export function useWebMCPTools(
  tools: WebMCPToolDefinition[],
  config?: WebMCPKitConfig
): void {
  const kit = useMemo(() => getSharedKit(config), []);

  useEffect(() => {
    for (const tool of tools) {
      kit.register(tool, { replace: true });
    }

    return () => {
      for (const tool of tools) {
        kit.unregister(tool.name);
      }
    };
  }, [tools.map((t) => t.name).join(',')]);
}

/**
 * Check if WebMCP is available in the current browser.
 *
 * @example
 * ```tsx
 * function App() {
 *   const isAvailable = useWebMCPAvailable();
 *   return isAvailable
 *     ? <AgentReadyApp />
 *     : <RegularApp />;
 * }
 * ```
 */
export function useWebMCPAvailable(): boolean {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    setAvailable(WebMCPKit.isAvailable());
  }, []);

  return available;
}

/**
 * Track tool invocations for analytics/debugging.
 *
 * @example
 * ```tsx
 * function DebugPanel() {
 *   const { invocations, clearLog } = useWebMCPLog();
 *   return (
 *     <div>
 *       <h3>Agent Activity ({invocations.length} calls)</h3>
 *       {invocations.map(inv => (
 *         <div key={inv.timestamp}>
 *           {inv.toolName}: {inv.result?.success ? '✅' : '❌'}
 *         </div>
 *       ))}
 *       <button onClick={clearLog}>Clear</button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useWebMCPLog(maxEntries = 100) {
  const [invocations, setInvocations] = useState<
    Array<ToolInvocationEvent & { result?: ToolResult }>
  >([]);

  const kit = useMemo(
    () =>
      getSharedKit({
        onAfterInvoke: (event, result) => {
          setInvocations((prev) =>
            [{ ...event, result }, ...prev].slice(0, maxEntries)
          );
        },
      }),
    []
  );

  const clearLog = useCallback(() => setInvocations([]), []);

  return { invocations, clearLog };
}

/**
 * Get the shared WebMCP Kit instance for advanced usage.
 */
export function useWebMCPKit(config?: WebMCPKitConfig): WebMCPKit {
  return useMemo(() => getSharedKit(config), []);
}
