/** React bindings with explicit kit scope and component-owned registrations. */
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { WebMCPKit, createKit } from "./core.js";
import type {
  WebMCPToolDefinition,
  WebMCPKitConfig,
  ToolInvocationEvent,
  ToolResult,
  ToolExecutionContext,
} from "./types.js";

interface KitScope {
  kit: WebMCPKit;
  config?: WebMCPKitConfig;
  enabled: boolean;
}
const KitContext = createContext<KitScope | null>(null);
let sharedScope: KitScope | undefined;
const owners = new WeakMap<WebMCPKit, Map<string, symbol>>();

function snapshotConfig(config: WebMCPKitConfig = {}): WebMCPKitConfig {
  return Object.fromEntries(
    Object.entries(config).filter(([, value]) => value !== undefined),
  );
}
function sameConfig(left: WebMCPKitConfig, right: WebMCPKitConfig): boolean {
  const keys = Object.keys(left) as Array<keyof WebMCPKitConfig>;
  return (
    keys.length === Object.keys(right).length &&
    keys.every((key) => Object.is(left[key], right[key]))
  );
}
function assertConfig(scope: KitScope, config?: WebMCPKitConfig): void {
  if (!config) return;
  const requested = snapshotConfig(config);
  if (Object.keys(requested).length === 0) return;
  if (!scope.config) {
    throw new Error(
      "WebMCP React: hook configuration belongs on the provider; a supplied kit already has its own configuration",
    );
  }
  if (!sameConfig(scope.config, requested)) {
    throw new Error(
      "WebMCP React: conflicting configuration; use an explicit WebMCPProvider with its own kit or config",
    );
  }
}
function useKitScope(config?: WebMCPKitConfig): KitScope {
  const provided = useContext(KitContext);
  if (provided) {
    assertConfig(provided, config);
    return provided;
  }
  if (!sharedScope) {
    const initial = snapshotConfig(config);
    sharedScope = { kit: createKit(initial), config: initial, enabled: true };
  }
  assertConfig(sharedScope, config);
  return sharedScope;
}

export type WebMCPProviderProps = {
  children?: ReactNode;
  /** Disable to revoke descendant hook registrations, for example on logout. */
  enabled?: boolean;
} & (
  { kit: WebMCPKit; config?: never } | { config?: WebMCPKitConfig; kit?: never }
);

/**
 * Scope hooks to a caller-supplied kit or a kit created from explicit configuration.
 * Configuration is immutable for a mounted provider: remount with a new key to
 * change policy. Supplied kits may be replaced; old hook registrations are revoked.
 */
export function WebMCPProvider({
  children,
  enabled = true,
  kit,
  config,
}: WebMCPProviderProps) {
  if (kit && config)
    throw new Error("WebMCP React: provide either kit or config, not both");
  const [initial] = useState(() => {
    const snapshot = snapshotConfig(config);
    return {
      supplied: kit !== undefined,
      kit: kit ?? createKit(snapshot),
      config: snapshot,
    };
  });
  if (initial.supplied !== (kit !== undefined)) {
    throw new Error(
      "WebMCP React: provider kit/config mode changed; remount the provider with a new key",
    );
  }
  if (
    !initial.supplied &&
    !sameConfig(initial.config, snapshotConfig(config))
  ) {
    throw new Error(
      "WebMCP React: provider configuration changed; remount the provider with a new key",
    );
  }
  const activeKit = kit ?? initial.kit;
  const value = useMemo<KitScope>(
    () => ({
      kit: activeKit,
      enabled,
      config: initial.supplied ? undefined : initial.config,
    }),
    [activeKit, enabled, initial],
  );
  return createElement(KitContext.Provider, { value }, children);
}

export interface WebMCPToolLifecycleOptions {
  /** False revokes the tool; true registers its latest committed definition. */
  enabled?: boolean;
}

function useOwnedTools(
  tools: WebMCPToolDefinition[],
  config?: WebMCPKitConfig,
  options?: WebMCPToolLifecycleOptions,
): void {
  const scope = useKitScope(config);
  const kit = scope.kit;
  const enabled = scope.enabled && (options?.enabled ?? true);
  const latest = useRef(tools);
  const owner = useRef(Symbol("WebMCP hook owner"));
  const callbacks = tools.map(({ handler, admit }) => ({ handler, admit }));
  const committed = useRef<
    { callbacks: typeof callbacks; identity: object } | undefined
  >(undefined);
  const unchanged =
    committed.current?.callbacks.length === callbacks.length &&
    callbacks.every(
      (callback, index) =>
        callback.handler === committed.current!.callbacks[index].handler &&
        callback.admit === committed.current!.callbacks[index].admit,
    );
  const callbackIdentity = unchanged ? committed.current!.identity : {};
  // Compare committed identities without publishing abandoned renders. A new
  // handler/admission revokes authorization already awaiting approval or queued.
  useLayoutEffect(() => {
    latest.current = tools;
    committed.current = { callbacks, identity: callbackIdentity };
  });
  const definitions = JSON.stringify(
    tools.map(({ name, title, description, inputSchema, annotations }) => ({
      name,
      title,
      description,
      inputSchema,
      annotations,
    })),
  );

  useLayoutEffect(() => {
    if (!enabled) return;
    let owned = owners.get(kit);
    if (!owned) {
      owned = new Map();
      owners.set(kit, owned);
    }
    const names = new Set<string>();
    for (const tool of latest.current) {
      if (
        names.has(tool.name) ||
        owned.has(tool.name) ||
        kit.getTool(tool.name)
      ) {
        throw new Error(
          `WebMCP React: tool "${tool.name}" is already owned or registered`,
        );
      }
      names.add(tool.name);
    }
    const registrations: Array<{
      name: string;
      registered: WebMCPToolDefinition;
    }> = [];
    let active = true;
    const admitted = new WeakMap<ToolExecutionContext, WebMCPToolDefinition>();
    const currentTool = (name: string) => {
      const current = latest.current.find(
        (candidate) => candidate.name === name,
      );
      if (!active || !current)
        throw new Error(`WebMCP React: tool "${name}" has been revoked`);
      return current;
    };
    const release = () => {
      active = false;
      for (const { name, registered } of registrations) {
        if (owned!.get(name) !== owner.current) continue;
        // An unrelated external replacement is never removed by this owner.
        if (kit.getTool(name) === registered) kit.unregister(name);
        owned!.delete(name);
      }
    };
    try {
      for (const tool of latest.current) {
        const name = tool.name;
        kit.register({
          ...tool,
          admit: (input, context) => {
            const current = currentTool(name);
            if (current.admit) admitted.set(context, current);
            return current.admit?.(input, context);
          },
          handler: (input, context) => {
            const current = currentTool(name);
            const captured = context && admitted.get(context);
            if (
              captured &&
              (captured.admit !== current.admit ||
                captured.handler !== current.handler)
            ) {
              throw new Error(
                `WebMCP React: tool "${name}" state changed during admission; retry with current state`,
              );
            }
            return (captured ?? current).handler(input, context);
          },
          onExecutionRejected: (context, error) => {
            const captured = admitted.get(context);
            const current = latest.current.find(
              (candidate) => candidate.name === name,
            );
            (captured ?? current ?? tool).onExecutionRejected?.(context, error);
          },
        });
        owned.set(name, owner.current);
        registrations.push({ name, registered: kit.getTool(name)! });
      }
    } catch (error) {
      release();
      throw error;
    }
    return release;
  }, [kit, enabled, definitions, callbackIdentity]);
}

/** Register one tool. Changed callbacks or metadata revoke prior authorization and re-register. */
export function useWebMCPTool<
  TInput extends Record<string, unknown> = Record<string, unknown>,
  TOutput = unknown,
>(
  tool: WebMCPToolDefinition<TInput, TOutput>,
  config?: WebMCPKitConfig,
  options?: WebMCPToolLifecycleOptions,
): void {
  useOwnedTools([tool as WebMCPToolDefinition], config, options);
}

/** Register a component-owned set of tools with atomic cleanup on registration failure. */
export function useWebMCPTools(
  tools: WebMCPToolDefinition[],
  config?: WebMCPKitConfig,
  options?: WebMCPToolLifecycleOptions,
): void {
  useOwnedTools(tools, config, options);
}

/** Check whether the current browser exposes a supported WebMCP API. */
export function useWebMCPAvailable(): boolean {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    setAvailable(WebMCPKit.isAvailable());
  }, []);
  return available;
}

/** Subscribe to completion events without replacing the kit's configured callbacks. */
export function useWebMCPLog(maxEntries = 100) {
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 1) {
    throw new Error("WebMCP React: maxEntries must be a positive safe integer");
  }
  const { kit } = useKitScope();
  const [invocations, setInvocations] = useState<
    Array<ToolInvocationEvent & { result?: ToolResult }>
  >([]);
  const limit = useRef(maxEntries);
  useLayoutEffect(() => {
    setInvocations([]);
    return kit.subscribe((event, result) => {
      setInvocations((previous) =>
        [{ ...event, result }, ...previous].slice(0, limit.current),
      );
    });
  }, [kit]);
  useLayoutEffect(() => {
    limit.current = maxEntries;
    setInvocations((previous) => previous.slice(0, maxEntries));
  }, [maxEntries]);
  const clearLog = useCallback(() => setInvocations([]), []);
  return { invocations, clearLog };
}

/** Return the provider's kit, or the backwards-compatible shared default. */
export function useWebMCPKit(config?: WebMCPKitConfig): WebMCPKit {
  return useKitScope(config).kit;
}
