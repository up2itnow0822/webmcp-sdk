/**
 * WebMCP Kit — The developer toolkit for the agent-ready web
 *
 * Make any website agent-ready with WebMCP in minutes.
 *
 * @packageDocumentation
 */

// Core
export { WebMCPKit, createKit, tool, defineTool } from './core.js';

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
} from './types.js';
