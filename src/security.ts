/**
 * WebMCP Kit — Security Middleware
 *
 * Rate limiting, input sanitization, and security guards
 * for WebMCP tool handlers.
 */

import type {
  WebMCPToolDefinition,
  ToolAnnotations,
  ToolInvocationEvent,
} from './types.js';

// ─── Rate Limiter ───

export interface RateLimitConfig {
  /** Maximum invocations per window */
  maxInvocations: number;
  /** Window duration in milliseconds (default: 60000 = 1 minute) */
  windowMs?: number;
  /** Message returned when rate limited */
  message?: string;
}

export class RateLimiter {
  private invocations: number[] = [];
  private config: Required<RateLimitConfig>;

  constructor(config: RateLimitConfig) {
    this.config = {
      maxInvocations: config.maxInvocations,
      windowMs: config.windowMs ?? 60_000,
      message: config.message ?? 'Rate limit exceeded. Please try again later.',
    };
  }

  check(): { allowed: boolean; remaining: number; resetMs: number } {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    // Prune old invocations
    this.invocations = this.invocations.filter((t) => t > windowStart);

    const remaining = Math.max(0, this.config.maxInvocations - this.invocations.length);
    const resetMs = this.invocations.length > 0
      ? this.invocations[0] + this.config.windowMs - now
      : 0;

    if (this.invocations.length >= this.config.maxInvocations) {
      return { allowed: false, remaining: 0, resetMs };
    }

    this.invocations.push(now);
    return { allowed: true, remaining: remaining - 1, resetMs };
  }

  reset(): void {
    this.invocations = [];
  }
}

// ─── Input Sanitizer ───

export interface SanitizeOptions {
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

const HTML_TAG_REGEX = /<[^>]*>/g;
const CONTROL_CHAR_REGEX = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

function sanitizeValue(value: unknown, options: Required<SanitizeOptions>, depth: number): unknown {
  if (depth > options.maxDepth) {
    return undefined;
  }

  if (typeof value === 'string') {
    let sanitized = value;
    if (options.stripHtml) {
      sanitized = sanitized.replace(HTML_TAG_REGEX, '');
    }
    if (options.stripControlChars) {
      sanitized = sanitized.replace(CONTROL_CHAR_REGEX, '');
    }
    if (sanitized.length > options.maxStringLength) {
      sanitized = sanitized.slice(0, options.maxStringLength);
    }
    return sanitized;
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, options.maxArrayLength)
      .map((v) => sanitizeValue(v, options, depth + 1));
  }

  if (typeof value === 'object' && value !== null) {
    const sanitized: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      sanitized[k] = sanitizeValue(v, options, depth + 1);
    }
    return sanitized;
  }

  return value;
}

export function sanitizeInput(
  input: Record<string, unknown>,
  options: SanitizeOptions = {}
): Record<string, unknown> {
  const opts: Required<SanitizeOptions> = {
    stripHtml: options.stripHtml ?? true,
    maxStringLength: options.maxStringLength ?? 10_000,
    maxArrayLength: options.maxArrayLength ?? 100,
    maxDepth: options.maxDepth ?? 5,
    stripControlChars: options.stripControlChars ?? true,
  };

  return sanitizeValue(input, opts, 0) as Record<string, unknown>;
}

// ─── Security Middleware ───

export interface SecurityConfig {
  /** Rate limiting configuration */
  rateLimit?: RateLimitConfig;
  /** Input sanitization options */
  sanitize?: SanitizeOptions;
  /** Blocked input patterns (regex strings) */
  blockedPatterns?: string[];
  /** Log all invocations for audit */
  audit?: boolean;
  /** Audit log handler */
  onAudit?: (event: ToolInvocationEvent & { sanitized: boolean; blocked: boolean }) => void;
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
export function withSecurity<TInput extends Record<string, unknown>, TOutput>(
  tool: WebMCPToolDefinition<TInput, TOutput>,
  config: SecurityConfig
): WebMCPToolDefinition<TInput, TOutput> {
  const rateLimiter = config.rateLimit ? new RateLimiter(config.rateLimit) : null;
  const blockedRegexes = (config.blockedPatterns ?? []).map((p) => new RegExp(p, 'i'));

  return {
    ...tool,
    handler: async (input: TInput): Promise<TOutput> => {
      let sanitized = false;
      let blocked = false;

      // Rate limiting
      if (rateLimiter) {
        const check = rateLimiter.check();
        if (!check.allowed) {
          throw new Error(rateLimiter['config'].message);
        }
      }

      // Input sanitization
      let processedInput = input;
      if (config.sanitize) {
        processedInput = sanitizeInput(
          input as Record<string, unknown>,
          config.sanitize
        ) as TInput;
        sanitized = true;
      }

      // Blocked pattern check
      const inputStr = JSON.stringify(processedInput);
      for (const regex of blockedRegexes) {
        if (regex.test(inputStr)) {
          blocked = true;

          if (config.audit && config.onAudit) {
            config.onAudit({
              toolName: tool.name,
              input: input as Record<string, unknown>,
              timestamp: Date.now(),
              sanitized,
              blocked,
            });
          }

          throw new Error(`Input blocked by security policy`);
        }
      }

      // Audit logging
      if (config.audit && config.onAudit) {
        config.onAudit({
          toolName: tool.name,
          input: processedInput as Record<string, unknown>,
          timestamp: Date.now(),
          sanitized,
          blocked,
        });
      }

      return tool.handler(processedInput);
    },
  };
}

/**
 * Create a confirmation-required wrapper for destructive tools
 *
 * @example
 * ```ts
 * const safeDeleteTool = withConfirmation(deleteTool, 'This will delete your account.');
 * ```
 */
export function withConfirmation<TInput extends Record<string, unknown>, TOutput>(
  tool: WebMCPToolDefinition<TInput, TOutput>,
  reason: string
): WebMCPToolDefinition<TInput, TOutput> {
  return {
    ...tool,
    annotations: {
      ...tool.annotations,
      destructiveHint: true,
      confirmationHint: true,
    },
    handler: async (input: TInput): Promise<TOutput> => {
      // Request user interaction if WebMCP is available
      if (typeof navigator !== 'undefined' && navigator.modelContext) {
        const confirmed = await navigator.modelContext.requestUserInteraction({ reason });
        if (!confirmed) {
          throw new Error('User declined confirmation for destructive action');
        }
      }
      return tool.handler(input);
    },
  };
}
