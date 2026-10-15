import * as react from 'react';
import { ReactNode } from 'react';
import { W as WebMCPKit } from './core-CgvfhbwQ.js';
import { W as WebMCPKitConfig, f as ToolInvocationEvent, g as ToolResult, h as WebMCPToolDefinition } from './types-CFF4VVYT.js';

interface KitScope {
    kit: WebMCPKit;
    config?: WebMCPKitConfig;
    enabled: boolean;
}
type WebMCPProviderProps = {
    children?: ReactNode;
    /** Disable to revoke descendant hook registrations, for example on logout. */
    enabled?: boolean;
} & ({
    kit: WebMCPKit;
    config?: never;
} | {
    config?: WebMCPKitConfig;
    kit?: never;
});
/**
 * Scope hooks to a caller-supplied kit or a kit created from explicit configuration.
 * Configuration is immutable for a mounted provider: remount with a new key to
 * change policy. Supplied kits may be replaced; old hook registrations are revoked.
 */
declare function WebMCPProvider({ children, enabled, kit, config, }: WebMCPProviderProps): react.FunctionComponentElement<react.ProviderProps<KitScope | null>>;
interface WebMCPToolLifecycleOptions {
    /** False revokes the tool; true registers its latest committed definition. */
    enabled?: boolean;
}
/** Register one tool. Changed callbacks or metadata revoke prior authorization and re-register. */
declare function useWebMCPTool<TInput extends Record<string, unknown> = Record<string, unknown>, TOutput = unknown>(tool: WebMCPToolDefinition<TInput, TOutput>, config?: WebMCPKitConfig, options?: WebMCPToolLifecycleOptions): void;
/** Register a component-owned set of tools with atomic cleanup on registration failure. */
declare function useWebMCPTools(tools: WebMCPToolDefinition[], config?: WebMCPKitConfig, options?: WebMCPToolLifecycleOptions): void;
/** Check whether the current browser exposes a supported WebMCP API. */
declare function useWebMCPAvailable(): boolean;
/** Subscribe to completion events without replacing the kit's configured callbacks. */
declare function useWebMCPLog(maxEntries?: number): {
    invocations: (ToolInvocationEvent & {
        result?: ToolResult;
    })[];
    clearLog: () => void;
};
/** Return the provider's kit, or the backwards-compatible shared default. */
declare function useWebMCPKit(config?: WebMCPKitConfig): WebMCPKit;

export { WebMCPProvider, type WebMCPProviderProps, type WebMCPToolLifecycleOptions, useWebMCPAvailable, useWebMCPKit, useWebMCPLog, useWebMCPTool, useWebMCPTools };
