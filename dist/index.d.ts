import { W as WebMCPKit } from './core-CgvfhbwQ.js';
export { c as createKit, d as defineTool, t as tool } from './core-CgvfhbwQ.js';
import { T as ToolExecutionContext } from './types-CFF4VVYT.js';
export { C as ConfirmationProvider, I as InvokeOptions, J as JSONSchema, a as JSONSchemaProperty, b as JSONSchemaType, L as LegacyModelContext, M as ModelContext, c as ModelContextTool, R as RegisterToolOptions, d as ToolAnnotations, e as ToolBuilder, f as ToolInvocationEvent, g as ToolResult, W as WebMCPKitConfig, h as WebMCPToolDefinition } from './types-CFF4VVYT.js';

interface DeclarativeToolOptions {
    handlers: Record<string, (input: Record<string, unknown>, context?: ToolExecutionContext) => unknown | Promise<unknown>>;
}
/** Bind form metadata to explicit trusted code; HTML never supplies an executable handler. */
declare function registerDeclarativeTools(kit: WebMCPKit, root: ParentNode, options: DeclarativeToolOptions): () => void;

export { type DeclarativeToolOptions, ToolExecutionContext, WebMCPKit, registerDeclarativeTools };
