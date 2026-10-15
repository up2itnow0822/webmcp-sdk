/** Bounded input guards, explicit confirmation, admission limits and redacted audit. */
import type { ConfirmationProvider, ToolExecutionContext, ToolInvocationEvent, WebMCPToolDefinition } from './types.js';
import { snapshotInput } from './input.js';
import { compileSchema } from './validation.js';

export interface RateLimitConfig {
  /** Maximum admitted invocations per window. Denied attempts do not extend the window. */
  maxInvocations: number;
  /** Window duration in milliseconds (default 60000). */
  windowMs?: number;
  message?: string;
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} limit must be a positive safe integer`);
  return value;
}

export class RateLimiter {
  private invocations: number[] = [];
  private readonly maxInvocations: number;
  private readonly windowMs: number;
  readonly message: string;
  constructor(config: RateLimitConfig) {
    this.maxInvocations = positiveInteger(config.maxInvocations, 'maxInvocations');
    this.windowMs = positiveInteger(config.windowMs ?? 60_000, 'windowMs');
    this.message = config.message ?? 'Rate limit exceeded. Please try again later.';
  }
  check(): { allowed: boolean; remaining: number; resetMs: number } {
    const now = Date.now();
    this.invocations = this.invocations.filter((time) => time > now - this.windowMs);
    const resetMs = this.invocations.length ? Math.max(0, this.invocations[0] + this.windowMs - now) : 0;
    if (this.invocations.length >= this.maxInvocations) return { allowed: false, remaining: 0, resetMs };
    this.invocations.push(now);
    return { allowed: true, remaining: this.maxInvocations - this.invocations.length, resetMs };
  }
  reset(): void { this.invocations = []; }
}

export interface SanitizeOptions {
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

type SanitizerOptions = Required<SanitizeOptions>;
function sanitizerOptions(options: SanitizeOptions): SanitizerOptions {
  return {
    stripHtml: options.stripHtml ?? true, stripControlChars: options.stripControlChars ?? true,
    maxStringLength: positiveInteger(options.maxStringLength ?? 10_000, 'maxStringLength'),
    maxArrayLength: positiveInteger(options.maxArrayLength ?? 100, 'maxArrayLength'),
    maxDepth: positiveInteger(options.maxDepth ?? 5, 'maxDepth'),
    maxInputBytes: positiveInteger(options.maxInputBytes ?? 65_536, 'maxInputBytes'),
    maxInputNodes: positiveInteger(options.maxInputNodes ?? 1000, 'maxInputNodes'),
  };
}

/** Each character is visited at most once; unmatched tag candidates preserve their tail. */
function stripHtmlTags(value: string): string {
  const parts: string[] = [];
  let retained = 0;
  let index = 0;
  while (index < value.length) {
    if (value[index] !== '<' || !/[a-z/!?]/i.test(value[index + 1] ?? '')) { index += 1; continue; }
    let end = index + 1;
    while (end < value.length && value[end] !== '>') end += 1;
    if (end === value.length) break;
    parts.push(value.slice(retained, index));
    index = end + 1;
    retained = index;
  }
  parts.push(value.slice(retained));
  return parts.join('');
}
function ownSet(target: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(target, key, { value, enumerable: true, configurable: true, writable: true });
}
function checkFieldLimits(value: unknown, options: SanitizerOptions): void {
  if (typeof value === 'string') {
    if (value.length > options.maxStringLength) throw new Error('Input string length limit exceeded');
  } else if (Array.isArray(value)) {
    if (value.length > options.maxArrayLength) throw new Error('Input array length limit exceeded');
    value.forEach((item) => checkFieldLimits(item, options));
  } else if (value !== null && typeof value === 'object') Object.values(value).forEach((item) => checkFieldLimits(item, options));
}
function sanitizeValue(value: unknown, options: SanitizerOptions): unknown {
  if (typeof value === 'string') {
    let result = options.stripHtml ? stripHtmlTags(value) : value;
    if (options.stripControlChars) result = result.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
    return result;
  }
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item, options));
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) ownSet(result, key, sanitizeValue(item, options));
    return result;
  }
  return value;
}
export function sanitizeInput(input: Record<string, unknown>, options: SanitizeOptions = {}): Record<string, unknown> {
  const resolved = sanitizerOptions(options);
  const safe = snapshotInput(input, { maxInputBytes: resolved.maxInputBytes, maxInputNodes: resolved.maxInputNodes, maxInputDepth: resolved.maxDepth });
  checkFieldLimits(safe, resolved);
  return sanitizeValue(safe, resolved) as Record<string, unknown>;
}

export interface SecurityAuditEvent extends ToolInvocationEvent {
  sanitized: boolean;
  blocked: boolean;
  outcome: 'rejected' | 'succeeded' | 'failed';
  /** Stable classification only; raw handler errors and outputs are never logged. */
  errorCode?: 'rate_limit' | 'input_rejected' | 'policy_blocked' | 'admission_rejected' | 'aborted' | 'handler_error';
  durationMs: number;
}
export interface SecurityConfig {
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
const sensitiveKey = /(?:key|secret|password|passwd|token|authorization|credential|signature|seed|mnemonic|cookie)/i;
function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) ownSet(result, key, sensitiveKey.test(key) ? '[REDACTED]' : redact(item));
    return result;
  }
  return value;
}
interface Admission<TInput> {
  input?: TInput;
  auditInput: Record<string, unknown>;
  started: boolean;
  complete: boolean;
  start: number;
  sanitized: boolean;
  onAbort: () => void;
  auditError?: unknown;
}
/** Rate admission happens before kit queueing; direct handler calls use the same guard. */
export function withSecurity<TInput extends Record<string, unknown>, TOutput>(
  tool: WebMCPToolDefinition<TInput, TOutput>, config: SecurityConfig,
): WebMCPToolDefinition<TInput, TOutput> {
  if (config.audit && typeof config.onAudit !== 'function') throw new Error('Audit requires an explicit onAudit sink');
  const limiter = config.rateLimit ? new RateLimiter(config.rateLimit) : undefined;
  const validator = compileSchema(tool.inputSchema);
  const suppliedPatterns = config.blockedPatterns ?? [];
  if (!Array.isArray(suppliedPatterns) || suppliedPatterns.length > 32) throw new Error('Blocked pattern count limit is 32');
  const patterns = Array.from(suppliedPatterns, (pattern) => {
    if (typeof pattern !== 'string' || pattern.length === 0 || pattern.length > 256) throw new Error('Blocked patterns must be nonempty literal strings of at most 256 characters');
    return pattern.toLowerCase();
  });
  const fields = [...(config.auditInputFields ?? [])];
  const sanitize = config.sanitize ? sanitizerOptions(config.sanitize) : undefined;
  const audit = config.audit ? config.onAudit : undefined;
  const admitted = new WeakMap<ToolExecutionContext, Admission<TInput>>();
  const completed = new WeakSet<ToolExecutionContext>();
  function emit(record: Admission<TInput>, context: ToolExecutionContext, outcome: SecurityAuditEvent['outcome'], errorCode?: SecurityAuditEvent['errorCode']): void {
    if (record.complete) return;
    record.complete = true;
    completed.add(context);
    admitted.delete(context);
    context.signal.removeEventListener('abort', record.onAbort);
    audit?.({ toolName: tool.name, input: record.auditInput, timestamp: Date.now(), sanitized: record.sanitized,
      blocked: outcome === 'rejected', outcome, errorCode, durationMs: Math.max(0, Date.now() - record.start) });
  }
  const admit = async (input: TInput, context: ToolExecutionContext): Promise<void> => {
    if (admitted.has(context)) throw new Error('Execution context already admitted');
    const record: Admission<TInput> = { auditInput: {}, started: false, complete: false, start: Date.now(), sanitized: false, onAbort: () => {} };
    admitted.set(context, record);
    record.onAbort = () => {
      try { emit(record, context, record.started ? 'failed' : 'rejected', 'aborted'); }
      catch (error) { record.auditError = error; }
    };
    context.signal.addEventListener('abort', record.onAbort, { once: true });
    let errorCode: SecurityAuditEvent['errorCode'] = 'input_rejected';
    try {
      context.signal.throwIfAborted();
      if (limiter && !limiter.check().allowed) { errorCode = 'rate_limit'; throw new Error(limiter.message); }
      const original = snapshotInput(input, sanitize ? { maxInputBytes: sanitize.maxInputBytes, maxInputNodes: sanitize.maxInputNodes, maxInputDepth: sanitize.maxDepth } : undefined);
      if (!validator(original).valid) throw new Error('Input does not satisfy tool schema');
      const processed = (sanitize ? sanitizeInput(original, sanitize) : original) as TInput;
      record.sanitized = !!sanitize;
      if (!validator(processed).valid) throw new Error('Sanitized input does not satisfy tool schema');
      for (const field of fields) {
        if (Object.prototype.hasOwnProperty.call(processed, field)) ownSet(record.auditInput, field, sensitiveKey.test(field) ? '[REDACTED]' : redact(processed[field]));
      }
      errorCode = 'policy_blocked';
      if (patterns.length) {
        const rawText = JSON.stringify(original).toLowerCase();
        const processedText = JSON.stringify(processed).toLowerCase();
        if (patterns.some((pattern) => rawText.includes(pattern) || processedText.includes(pattern))) throw new Error('Input blocked by security policy');
      }
      errorCode = 'admission_rejected';
      await tool.admit?.(processed, context);
      context.signal.throwIfAborted();
      record.input = snapshotInput(processed, sanitize ? { maxInputBytes: sanitize.maxInputBytes, maxInputNodes: sanitize.maxInputNodes, maxInputDepth: sanitize.maxDepth } : undefined) as TInput;
      if (!validator(record.input).valid) throw new Error('Admitted input does not satisfy tool schema');
    } catch (error) {
      emit(record, context, 'rejected', context.signal.aborted ? 'aborted' : errorCode);
      throw error;
    }
  };
  return {
    ...tool, admit,
    onExecutionRejected: (context, error) => {
      if (!completed.has(context)) {
        const record = admitted.get(context) ?? { auditInput: {}, started: false, complete: false, start: Date.now(), sanitized: false, onAbort: () => {} };
        emit(record, context, record.started ? 'failed' : 'rejected', 'admission_rejected');
      }
      tool.onExecutionRejected?.(context, error);
    },
    handler: async (input: TInput, providedContext?: ToolExecutionContext): Promise<TOutput> => {
      const context = providedContext ?? Object.freeze({ signal: new AbortController().signal });
      if (!admitted.has(context)) await admit(input, context);
      const record = admitted.get(context);
      if (!record?.input) { context.signal.throwIfAborted(); throw new Error('Security admission unavailable'); }
      admitted.delete(context);
      record.started = true;
      try {
        context.signal.throwIfAborted();
        const output = await tool.handler(record.input, context);
        context.signal.throwIfAborted();
        if (record.auditError) throw record.auditError;
        emit(record, context, 'succeeded');
        return output;
      } catch (error) {
        emit(record, context, 'failed', context.signal.aborted ? 'aborted' : 'handler_error');
        throw error;
      }
    },
  };
}
/** Destructive actions require an explicit provider returning literal true. */
export function withConfirmation<TInput extends Record<string, unknown>, TOutput>(
  tool: WebMCPToolDefinition<TInput, TOutput>, reason: string, provider?: ConfirmationProvider,
): WebMCPToolDefinition<TInput, TOutput> {
  return {
    ...tool,
    annotations: { ...tool.annotations, destructiveHint: true, confirmationHint: true },
    handler: async (input: TInput, context?: ToolExecutionContext): Promise<TOutput> => {
      context?.signal.throwIfAborted();
      if (typeof provider !== 'function') throw new Error('Explicit confirmation provider required');
      if (await provider(reason) !== true) throw new Error('User declined confirmation for destructive action');
      context?.signal.throwIfAborted();
      return tool.handler(input, context);
    },
  };
}
