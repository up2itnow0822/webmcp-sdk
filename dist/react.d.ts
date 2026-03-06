import { WebMCPKit } from './index.js';
import { W as WebMCPKitConfig, T as ToolInvocationEvent, a as ToolResult, b as WebMCPToolDefinition } from './types-XNU26brb.js';

/**
 * WebMCP Kit — React Hooks & Components
 *
 * React bindings for WebMCP tool registration.
 * Tools are registered on mount and cleaned up on unmount.
 */

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
declare function useWebMCPTool<TInput extends Record<string, unknown> = Record<string, unknown>, TOutput = unknown>(tool: WebMCPToolDefinition<TInput, TOutput>, config?: WebMCPKitConfig): void;
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
declare function useWebMCPTools(tools: WebMCPToolDefinition[], config?: WebMCPKitConfig): void;
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
declare function useWebMCPAvailable(): boolean;
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
declare function useWebMCPLog(maxEntries?: number): {
    invocations: (ToolInvocationEvent & {
        result?: ToolResult;
    })[];
    clearLog: () => void;
};
/**
 * Get the shared WebMCP Kit instance for advanced usage.
 */
declare function useWebMCPKit(config?: WebMCPKitConfig): WebMCPKit;

export { useWebMCPAvailable, useWebMCPKit, useWebMCPLog, useWebMCPTool, useWebMCPTools };
