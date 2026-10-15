/**
 * WebMCP Kit — The developer toolkit for the agent-ready web
 *
 * Make any website agent-ready with WebMCP in minutes.
 *
 * @packageDocumentation
 */

// Core
export { WebMCPKit, createKit, tool, defineTool } from "./core.js";
export { registerDeclarativeTools } from "./declarative.js";
export type { DeclarativeToolOptions } from "./declarative.js";

// Types
export type {
  WebMCPToolDefinition,
  WebMCPKitConfig,
  JSONSchema,
  JSONSchemaProperty,
  ToolAnnotations,
  ToolResult,
  ToolInvocationEvent,
  ToolBuilder,
  RegisterToolOptions,
  ModelContext,
  ModelContextTool,
  LegacyModelContext,
  ToolExecutionContext,
  InvokeOptions,
  ConfirmationProvider,
  JSONSchemaType,
} from "./types.js";
