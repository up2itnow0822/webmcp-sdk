import { T as ToolInvocationEvent, b as WebMCPToolDefinition } from './types-XNU26brb.mjs';

/**
 * WebMCP Kit — Security Middleware
 *
 * Rate limiting, input sanitization, and security guards
 * for WebMCP tool handlers.
 */

interface RateLimitConfig {
    /** Maximum invocations per window */
    maxInvocations: number;
    /** Window duration in milliseconds (default: 60000 = 1 minute) */
    windowMs?: number;
    /** Message returned when rate limited */
    message?: string;
}
declare class RateLimiter {
    private invocations;
    private config;
    constructor(config: RateLimitConfig);
    check(): {
        allowed: boolean;
        remaining: number;
        resetMs: number;
    };
    reset(): void;
}
interface SanitizeOptions {
    /** Strip HTML tags from string inputs */
    stripHtml?: boolean;
    /** Maximum string length for any field (default: 10000) */
    maxStringLength?: number;
    /** Maximum array length for any field (default: 100) */
    maxArrayLength?: number;
    /** Maximum object depth (default: 5) */
    maxDepth?: number;
    /** Strip null bytes and control characters */
    stripControlChars?: boolean;
}
declare function sanitizeInput(input: Record<string, unknown>, options?: SanitizeOptions): Record<string, unknown>;
interface SecurityConfig {
    /** Rate limiting configuration */
    rateLimit?: RateLimitConfig;
    /** Input sanitization options */
    sanitize?: SanitizeOptions;
    /** Blocked input patterns (regex strings) */
    blockedPatterns?: string[];
    /** Log all invocations for audit */
    audit?: boolean;
    /** Audit log handler */
    onAudit?: (event: ToolInvocationEvent & {
        sanitized: boolean;
        blocked: boolean;
    }) => void;
}
/**
 * Wrap a tool with security middleware
 *
 * @example
 * ```ts
 * const secureTool = withSecurity(myTool, {
 *   rateLimit: { maxInvocations: 10, windowMs: 60000 },
 *   sanitize: { stripHtml: true },
 *   blockedPatterns: ['<script', 'javascript:'],
 *   audit: true,
 * });
 * ```
 */
declare function withSecurity<TInput extends Record<string, unknown>, TOutput>(tool: WebMCPToolDefinition<TInput, TOutput>, config: SecurityConfig): WebMCPToolDefinition<TInput, TOutput>;
/**
 * Create a confirmation-required wrapper for destructive tools
 *
 * @example
 * ```ts
 * const safeDeleteTool = withConfirmation(deleteTool, 'This will delete your account.');
 * ```
 */
declare function withConfirmation<TInput extends Record<string, unknown>, TOutput>(tool: WebMCPToolDefinition<TInput, TOutput>, reason: string): WebMCPToolDefinition<TInput, TOutput>;

export { type RateLimitConfig, RateLimiter, type SanitizeOptions, type SecurityConfig, sanitizeInput, withConfirmation, withSecurity };
