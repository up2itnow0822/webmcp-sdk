import { T as ToolInvocationEvent, b as WebMCPToolDefinition, C as ConfirmationProvider } from './types-RmhugU8s.js';

/** Bounded input guards, explicit confirmation, admission limits and redacted audit. */

interface RateLimitConfig {
    /** Maximum admitted invocations per window. Denied attempts do not extend the window. */
    maxInvocations: number;
    /** Window duration in milliseconds (default 60000). */
    windowMs?: number;
    message?: string;
}
declare class RateLimiter {
    private invocations;
    private readonly maxInvocations;
    private readonly windowMs;
    readonly message: string;
    constructor(config: RateLimitConfig);
    check(): {
        allowed: boolean;
        remaining: number;
        resetMs: number;
    };
    reset(): void;
}
interface SanitizeOptions {
    stripHtml?: boolean;
    /** Reject strings exceeding this length BEFORE stripping (default 10000). */
    maxStringLength?: number;
    /** Reject arrays exceeding this length (default 100). */
    maxArrayLength?: number;
    /** Reject values deeper than this limit (default 5). */
    maxDepth?: number;
    stripControlChars?: boolean;
    /** Bound the complete JSON input, including keys (default 65536 bytes). */
    maxInputBytes?: number;
    /** Bound the complete JSON input (default 1000 nodes). */
    maxInputNodes?: number;
}
declare function sanitizeInput(input: Record<string, unknown>, options?: SanitizeOptions): Record<string, unknown>;
interface SecurityAuditEvent extends ToolInvocationEvent {
    sanitized: boolean;
    blocked: boolean;
    outcome: 'rejected' | 'succeeded' | 'failed';
    /** Stable classification only; raw handler errors and outputs are never logged. */
    errorCode?: 'rate_limit' | 'input_rejected' | 'policy_blocked' | 'admission_rejected' | 'aborted' | 'handler_error';
    durationMs: number;
}
interface SecurityConfig {
    rateLimit?: RateLimitConfig;
    sanitize?: SanitizeOptions;
    /** Case-insensitive literal substrings, NOT regular expressions. Max 32 rules of 256 characters each. */
    blockedPatterns?: string[];
    audit?: boolean;
    /** Required when audit=true. Throws propagate to direct callers; use a reliable synchronous sink. */
    onAudit?: (event: SecurityAuditEvent) => void;
    /** Inputs omitted by default. Allowed fields still have sensitive keys recursively redacted. */
    auditInputFields?: string[];
}
/** Rate admission happens before kit queueing; direct handler calls use the same guard. */
declare function withSecurity<TInput extends Record<string, unknown>, TOutput>(tool: WebMCPToolDefinition<TInput, TOutput>, config: SecurityConfig): WebMCPToolDefinition<TInput, TOutput>;
/** Destructive actions require an explicit provider returning literal true. */
declare function withConfirmation<TInput extends Record<string, unknown>, TOutput>(tool: WebMCPToolDefinition<TInput, TOutput>, reason: string, provider?: ConfirmationProvider): WebMCPToolDefinition<TInput, TOutput>;

export { type RateLimitConfig, RateLimiter, type SanitizeOptions, type SecurityAuditEvent, type SecurityConfig, sanitizeInput, withConfirmation, withSecurity };
