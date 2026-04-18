// src/security.ts
var RateLimiter = class {
  constructor(config) {
    this.invocations = [];
    this.config = {
      maxInvocations: config.maxInvocations,
      windowMs: config.windowMs ?? 6e4,
      message: config.message ?? "Rate limit exceeded. Please try again later."
    };
  }
  check() {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    this.invocations = this.invocations.filter((t) => t > windowStart);
    const remaining = Math.max(0, this.config.maxInvocations - this.invocations.length);
    const resetMs = this.invocations.length > 0 ? this.invocations[0] + this.config.windowMs - now : 0;
    if (this.invocations.length >= this.config.maxInvocations) {
      return { allowed: false, remaining: 0, resetMs };
    }
    this.invocations.push(now);
    return { allowed: true, remaining: remaining - 1, resetMs };
  }
  reset() {
    this.invocations = [];
  }
};
function isDisallowedControlChar(code) {
  return code >= 0 && code <= 8 || code === 11 || code === 12 || code >= 14 && code <= 31 || code === 127;
}
function stripControlChars(value) {
  let result = "";
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (!isDisallowedControlChar(code)) {
      result += value[i];
    }
  }
  return result;
}
function looksLikeHtmlTag(value, start, end) {
  if (end <= start + 1) {
    return false;
  }
  const first = value[start + 1];
  if (!first) {
    return false;
  }
  const code = first.charCodeAt(0);
  const isAsciiLetter = code >= 65 && code <= 90 || code >= 97 && code <= 122;
  return isAsciiLetter || first === "/" || first === "!" || first === "?";
}
function stripHtmlTags(value) {
  let result = "";
  let index = 0;
  while (index < value.length) {
    if (value[index] === "<") {
      const end = value.indexOf(">", index + 1);
      if (end !== -1 && looksLikeHtmlTag(value, index, end)) {
        index = end + 1;
        continue;
      }
    }
    result += value[index];
    index += 1;
  }
  return result;
}
function sanitizeValue(value, options, depth) {
  if (depth > options.maxDepth) {
    return void 0;
  }
  if (typeof value === "string") {
    let sanitized = value;
    if (options.stripHtml) {
      sanitized = stripHtmlTags(sanitized);
    }
    if (options.stripControlChars) {
      sanitized = stripControlChars(sanitized);
    }
    if (sanitized.length > options.maxStringLength) {
      sanitized = sanitized.slice(0, options.maxStringLength);
    }
    return sanitized;
  }
  if (Array.isArray(value)) {
    return value.slice(0, options.maxArrayLength).map((v) => sanitizeValue(v, options, depth + 1));
  }
  if (typeof value === "object" && value !== null) {
    const sanitized = {};
    for (const [k, v] of Object.entries(value)) {
      sanitized[k] = sanitizeValue(v, options, depth + 1);
    }
    return sanitized;
  }
  return value;
}
function sanitizeInput(input, options = {}) {
  const opts = {
    stripHtml: options.stripHtml ?? true,
    maxStringLength: options.maxStringLength ?? 1e4,
    maxArrayLength: options.maxArrayLength ?? 100,
    maxDepth: options.maxDepth ?? 5,
    stripControlChars: options.stripControlChars ?? true
  };
  return sanitizeValue(input, opts, 0);
}
function withSecurity(tool, config) {
  const rateLimiter = config.rateLimit ? new RateLimiter(config.rateLimit) : null;
  const blockedRegexes = (config.blockedPatterns ?? []).map((p) => new RegExp(p, "i"));
  return {
    ...tool,
    handler: async (input) => {
      let sanitized = false;
      let blocked = false;
      if (rateLimiter) {
        const check = rateLimiter.check();
        if (!check.allowed) {
          throw new Error(rateLimiter["config"].message);
        }
      }
      let processedInput = input;
      if (config.sanitize) {
        processedInput = sanitizeInput(
          input,
          config.sanitize
        );
        sanitized = true;
      }
      const inputStr = JSON.stringify(processedInput);
      for (const regex of blockedRegexes) {
        if (regex.test(inputStr)) {
          blocked = true;
          if (config.audit && config.onAudit) {
            config.onAudit({
              toolName: tool.name,
              input,
              timestamp: Date.now(),
              sanitized,
              blocked
            });
          }
          throw new Error(`Input blocked by security policy`);
        }
      }
      if (config.audit && config.onAudit) {
        config.onAudit({
          toolName: tool.name,
          input: processedInput,
          timestamp: Date.now(),
          sanitized,
          blocked
        });
      }
      return tool.handler(processedInput);
    }
  };
}
function withConfirmation(tool, reason) {
  return {
    ...tool,
    annotations: {
      ...tool.annotations,
      destructiveHint: true,
      confirmationHint: true
    },
    handler: async (input) => {
      if (typeof navigator !== "undefined" && navigator.modelContext) {
        const confirmed = await navigator.modelContext.requestUserInteraction({ reason });
        if (!confirmed) {
          throw new Error("User declined confirmation for destructive action");
        }
      }
      return tool.handler(input);
    }
  };
}
export {
  RateLimiter,
  sanitizeInput,
  withConfirmation,
  withSecurity
};
//# sourceMappingURL=security.mjs.map