import type {ModelContext, LegacyModelContext, WebMCPToolDefinition} from './types.js';
export function modernContext(): ModelContext | undefined {
  const context = typeof document !== 'undefined' ? document.modelContext : undefined;
  return context && typeof context.registerTool === 'function' ? context : undefined;
}
export function legacyContext(): LegacyModelContext | undefined {
  const context = typeof navigator !== 'undefined' ? navigator.modelContext : undefined;
  return context && typeof context.registerTool === 'function' && typeof context.unregisterTool === 'function' ? context : undefined;
}
export function registerBrowserTool(tool: WebMCPToolDefinition, mode: 'modern' | 'legacy' | 'none'): {abort: () => void; ready: Promise<void>} | undefined {
  if (mode === 'none') return undefined;
  if (mode === 'legacy') {
    const context = legacyContext(); if (!context) return undefined;
    let ready: Promise<void>;
    try {context.registerTool(tool); ready = Promise.resolve();} catch (error) {ready = Promise.reject(error);}
    return {ready, abort: () => context.unregisterTool(tool.name)};
  }
  const context = modernContext(); if (!context) return undefined;
  const controller = new AbortController(); let ready: Promise<void>;
  const annotations = tool.annotations;
  const consequential = annotations?.consequentialHint === true || annotations?.destructiveHint === true || annotations?.confirmationHint === true
    ? true : annotations?.consequentialHint ?? annotations?.destructiveHint ?? annotations?.confirmationHint;
  const nativeAnnotations = annotations ? {
    ...(annotations.readOnlyHint !== undefined ? {readOnlyHint: annotations.readOnlyHint} : {}),
    ...(consequential !== undefined ? {consequentialHint: consequential} : {}),
    ...(annotations.untrustedContentHint !== undefined ? {untrustedContentHint: annotations.untrustedContentHint} : {}),
    ...(annotations.debugging !== undefined ? {debugging: annotations.debugging} : {}),
  } : undefined;
  try {
    ready = Promise.resolve(context.registerTool({
      name: tool.name, title: tool.title ?? annotations?.title, description: tool.description,
      inputSchema: tool.inputSchema, annotations: nativeAnnotations,
      execute: async (input, options) => tool.handler(input, options?.signal ? {signal: options.signal} : undefined),
    }, {signal: controller.signal}));
  } catch (error) {ready = Promise.reject(error);}
  return {ready, abort: () => controller.abort()};
}
