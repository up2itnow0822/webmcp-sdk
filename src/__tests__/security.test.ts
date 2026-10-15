import { afterEach, describe, expect, it, vi } from "vitest";
import {
  RateLimiter,
  sanitizeInput,
  withConfirmation,
  withSecurity,
} from "../security.js";
import { createKit } from "../core.js";
import type { WebMCPToolDefinition } from "../types.js";
const definition = (
  handler = vi.fn(async (input: Record<string, unknown>) => input),
): WebMCPToolDefinition => ({
  name: "secure",
  description: "A harmless test tool",
  inputSchema: { type: "object" },
  handler,
});
afterEach(() => vi.useRealTimers());
describe("bounded safe sanitization", () => {
  it.each(["__proto__", "prototype", "constructor"])(
    "rejects nested dangerous key %s",
    (key) => {
      const input = JSON.parse(`{"nested":{"${key}":{"polluted":true}}}`);
      expect(() => sanitizeInput(input)).toThrow(/key|prototype/i);
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    },
  );
  it.each([
    new Date(),
    Object.create({ inherited: 1 }),
    { n: Infinity },
    { n: NaN },
    { n: undefined },
  ])("rejects non-JSON input %j", (nested) => {
    expect(() => sanitizeInput({ nested })).toThrow();
  });
  it("rejects cycles", () => {
    const input: Record<string, unknown> = {};
    input.self = input;
    expect(() => sanitizeInput(input)).toThrow(/cycle|circular/i);
  });
  it("rejects getters without executing them", () => {
    const getter = vi.fn(() => "secret");
    const input = Object.defineProperty({}, "credential", {
      enumerable: true,
      get: getter,
    });
    expect(() => sanitizeInput(input)).toThrow(/accessor|property/i);
    expect(getter).not.toHaveBeenCalled();
  });
  it("rejects oversized strings before stripping instead of truncating", () => {
    expect(() =>
      sanitizeInput({ value: "<b>".repeat(100) }, { maxStringLength: 10 }),
    ).toThrow(/string|length|limit/i);
  });
  it("rejects excessive array length and depth instead of changing shape", () => {
    expect(() =>
      sanitizeInput({ values: [1, 2, 3] }, { maxArrayLength: 2 }),
    ).toThrow(/array|length|limit/i);
    expect(() =>
      sanitizeInput({ nested: { value: 1 } }, { maxDepth: 1 }),
    ).toThrow(/depth/i);
  });
  it("rejects wide inputs by node and byte budgets", () => {
    expect(() => sanitizeInput({ a: 1, b: 2 }, { maxInputNodes: 2 })).toThrow(
      /node/i,
    );
    expect(() => sanitizeInput({ value: "abc" }, { maxInputBytes: 5 })).toThrow(
      /byte/i,
    );
  });
  it("strips HTML and control chars preserving ordinary own fields", () => {
    expect(
      sanitizeInput({
        value: "<b>Hi</b>\u0000",
        mathematical: "2 < 3",
        nested: ["<i>x</i>"],
      }),
    ).toEqual({
      value: "Hi",
      mathematical: "2 < 3",
      nested: ["x"],
    });
  });
  it.each([0, -1, NaN, Infinity, 1.5])(
    "rejects invalid sanitizer limits %s",
    (limit) => {
      expect(() => sanitizeInput({}, { maxInputNodes: limit })).toThrow(
        /limit|positive|integer/i,
      );
    },
  );
  it("handles repeated unmatched angle brackets within the configured budget", () => {
    const value = "<".repeat(9000);
    expect(sanitizeInput({ value }).value).toBe(value);
  });
});
describe("explicit confirmation", () => {
  it.each(["security inside", "security outside"])(
    "preserves admission, annotations and audit with %s confirmation",
    async (order) => {
      const provider = vi.fn(async () => true),
        audit = vi.fn();
      const admit = vi.fn(async (_input, _context) => {});
      const handler = vi.fn(
        async (input: Record<string, unknown>) => input.amount,
      );
      const base = {
        ...definition(handler),
        admit,
        annotations: { title: "Review test amount" },
      };
      const confirmed = withConfirmation(base, "Review", provider);
      expect(confirmed.admit).toBe(admit);
      const config = {
        rateLimit: { maxInvocations: 1 },
        audit: true,
        onAudit: audit,
      };
      const wrapped =
        order === "security inside"
          ? withConfirmation(withSecurity(base, config), "Review", provider)
          : withSecurity(confirmed, config);
      expect(wrapped.annotations).toEqual({
        title: "Review test amount",
        destructiveHint: true,
        confirmationHint: true,
      });
      const kit = createKit();
      kit.register(wrapped);
      await expect(kit.invoke("secure", { amount: 1 })).resolves.toBe(1);
      await expect(kit.invoke("secure", { amount: 1 })).rejects.toThrow(
        /Rate limit/i,
      );
      expect(provider).toHaveBeenCalledOnce();
      expect(admit).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledOnce();
      expect(audit.mock.calls.map(([event]) => event.outcome)).toEqual([
        "succeeded",
        "rejected",
      ]);
    },
  );
  it("executes the immutable reviewed snapshot when the caller mutates pending input", async () => {
    let approve!: (answer: boolean) => void;
    const handler = vi.fn(async (value: Record<string, unknown>) => value);
    const provider = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          approve = resolve;
        }),
    );
    const wrapped = withConfirmation(
      definition(handler),
      "Review amount 1",
      provider,
    );
    const input = {
      amount: 1,
      detail: { recipient: "reviewed" },
      legs: [{ amount: 1 }],
    };
    const pending = wrapped.handler(input);
    expect(provider).toHaveBeenCalledOnce();
    expect(handler).not.toHaveBeenCalled();
    input.amount = 100;
    input.detail.recipient = "changed";
    input.legs[0].amount = 100;
    approve(true);
    const result = (await pending) as typeof input;
    expect(result).toEqual({
      amount: 1,
      detail: { recipient: "reviewed" },
      legs: [{ amount: 1 }],
    });
    expect(result).not.toBe(input);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.detail)).toBe(true);
    expect(Object.isFrozen(result.legs)).toBe(true);
    expect(Object.isFrozen(result.legs[0])).toBe(true);
  });
  it.each([
    { label: "wrong schema type", input: { amount: "1" } },
    { label: "missing required value", input: {} },
    {
      label: "forbidden prototype key",
      input: JSON.parse('{"amount":1,"nested":{"__proto__":{"admin":true}}}'),
    },
    {
      label: "arbitrary prototype",
      input: Object.assign(Object.create({ inherited: true }), { amount: 1 }),
    },
    { label: "nonfinite value", input: { amount: Infinity } },
    {
      label: "excessive byte budget",
      input: { amount: 1, payload: "a".repeat(65537) },
    },
  ])(
    "rejects $label before requesting confirmation or running effects",
    async ({ input }) => {
      const provider = vi.fn(async () => true),
        handler = vi.fn(async () => "harmless result");
      const wrapped = withConfirmation(
        {
          ...definition(handler),
          inputSchema: {
            type: "object",
            properties: { amount: { type: "number" } },
            required: ["amount"],
          },
        },
        "Review",
        provider,
      );
      await expect(wrapped.handler(input)).rejects.toThrow();
      expect(provider).not.toHaveBeenCalled();
      expect(handler).not.toHaveBeenCalled();
    },
  );
  it("rejects getter inputs without executing accessors or asking for approval", async () => {
    const getter = vi.fn(() => 1),
      provider = vi.fn(async () => true),
      handler = vi.fn(async () => "ok");
    const input = Object.defineProperty({}, "amount", {
      enumerable: true,
      get: getter,
    });
    await expect(
      withConfirmation(definition(handler), "Review", provider).handler(input),
    ).rejects.toThrow(/accessor|property/i);
    expect(getter).not.toHaveBeenCalled();
    expect(provider).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });
  it("rejects when no provider exists", async () => {
    const handler = vi.fn(async () => "ok");
    await expect(
      withConfirmation(definition(handler), "Review this action").handler({}),
    ).rejects.toThrow(/confirmation|provider/i);
    expect(handler).not.toHaveBeenCalled();
  });
  it.each([false, undefined, "true", 1])(
    "requires literal true from provider (%s)",
    async (answer) => {
      const handler = vi.fn(async () => "ok");
      await expect(
        withConfirmation(
          definition(handler),
          "Review",
          async () => answer as boolean,
        ).handler({}),
      ).rejects.toThrow(/confirmation|declined/i);
      expect(handler).not.toHaveBeenCalled();
    },
  );
  it("forwards reason, input and execution context after explicit approval", async () => {
    const handler = vi.fn(async () => "ok"),
      provider = vi.fn(async () => true);
    const context = { signal: new AbortController().signal };
    await expect(
      withConfirmation(definition(handler), "Review", provider).handler(
        { id: 1 },
        context,
      ),
    ).resolves.toBe("ok");
    expect(provider).toHaveBeenCalledWith("Review");
    expect(handler).toHaveBeenCalledWith({ id: 1 }, context);
  });
  it("checks cancellation again after asynchronous confirmation", async () => {
    const controller = new AbortController(),
      handler = vi.fn(async () => "ok");
    const wrapped = withConfirmation(
      definition(handler),
      "Review",
      async () => {
        controller.abort();
        return true;
      },
    );
    await expect(
      wrapped.handler({}, { signal: controller.signal }),
    ).rejects.toThrow(/abort/i);
    expect(handler).not.toHaveBeenCalled();
  });
});
describe("security admission and audit", () => {
  it("treats regex metacharacters as case-insensitive literal substrings", async () => {
    const wrapped = withSecurity(definition(), { blockedPatterns: ["(a+)+$"] });
    await expect(wrapped.handler({ value: "aaaa" })).resolves.toEqual({
      value: "aaaa",
    });
    await expect(
      wrapped.handler({ value: "contains (A+)+$ literal" }),
    ).rejects.toThrow(/blocked/i);
  });
  it("never compiles catastrophic-style patterns into RegExp", async () => {
    const original = globalThis.RegExp,
      pattern = "(a+)+$";
    vi.stubGlobal(
      "RegExp",
      new Proxy(original, {
        construct(target, args, receiver) {
          if (args[0] === pattern)
            throw new Error(
              "Security must not compile attacker-input regex policies",
            );
          return Reflect.construct(target, args, receiver);
        },
      }),
    );
    try {
      const wrapped = withSecurity(definition(), {
        blockedPatterns: [pattern],
      });
      await expect(
        wrapped.handler({ value: "a".repeat(9000) + "!" }),
      ).resolves.toHaveProperty("value");
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it.each(
    [[""], [123], ["x".repeat(257)], Array(33).fill("x"), Array(1)].map(
      (patterns) => ({ patterns }),
    ),
  )(
    "rejects invalid or excessive literal policies $patterns",
    ({ patterns }) => {
      expect(() =>
        withSecurity(definition(), { blockedPatterns: patterns as string[] }),
      ).toThrow(/pattern|policy|limit/i);
    },
  );
  it.each([0, -1, NaN, Infinity, 1.5])(
    "rejects invalid rate limit %s",
    (limit) => {
      expect(() => new RateLimiter({ maxInvocations: limit })).toThrow();
      expect(
        () => new RateLimiter({ maxInvocations: 1, windowMs: limit }),
      ).toThrow();
    },
  );
  it("expires the rate window and supports reset", () => {
    vi.useFakeTimers();
    const limiter = new RateLimiter({ maxInvocations: 1, windowMs: 10 });
    expect(limiter.check().allowed).toBe(true);
    expect(limiter.check().allowed).toBe(false);
    vi.advanceTimersByTime(10);
    expect(limiter.check().allowed).toBe(true);
    limiter.reset();
    expect(limiter.check().allowed).toBe(true);
  });
  it("rejects audit without a sink", () => {
    expect(() => withSecurity(definition(), { audit: true })).toThrow(
      /audit|sink/i,
    );
  });
  it("audits direct success and rate rejection without full inputs", async () => {
    const audit = vi.fn();
    const wrapped = withSecurity(definition(), {
      rateLimit: { maxInvocations: 1 },
      audit: true,
      onAudit: audit,
    });
    await wrapped.handler({ token: "private-token", message: "personal text" });
    await expect(
      wrapped.handler({ password: "private-password" }),
    ).rejects.toThrow(/Rate limit/i);
    expect(audit.mock.calls.map(([event]) => event.outcome)).toEqual([
      "succeeded",
      "rejected",
    ]);
    expect(audit.mock.calls[1][0]).toMatchObject({
      blocked: true,
      errorCode: "rate_limit",
    });
    expect(JSON.stringify(audit.mock.calls)).not.toMatch(
      /private-token|private-password|personal text/,
    );
  });
  it("audits handler failure without credentials, result or raw error text", async () => {
    const audit = vi.fn();
    const wrapped = withSecurity(
      definition(
        vi.fn(async () => {
          throw new Error("signature=private-signature");
        }),
      ),
      { audit: true, onAudit: audit },
    );
    await expect(
      wrapped.handler({ privateKey: "private-key" }),
    ).rejects.toThrow("private-signature");
    expect(audit).toHaveBeenCalledOnce();
    expect(audit.mock.calls[0][0]).toMatchObject({
      outcome: "failed",
      errorCode: "handler_error",
    });
    expect(JSON.stringify(audit.mock.calls)).not.toMatch(
      /private-signature|private-key/,
    );
  });
  it("optionally logs only explicitly allowed nonsensitive input fields", async () => {
    const audit = vi.fn();
    const wrapped = withSecurity(definition(), {
      audit: true,
      onAudit: audit,
      auditInputFields: ["action", "nested", "signature", "apiKey"],
    });
    await wrapped.handler({
      action: "test",
      nested: { password: "secret", count: 1 },
      signature: "sig",
      apiKey: "key",
    });
    expect(audit.mock.calls[0][0].input).toEqual({
      action: "test",
      nested: { password: "[REDACTED]", count: 1 },
      signature: "[REDACTED]",
      apiKey: "[REDACTED]",
    });
  });
  it("audits dangerous input and policy rejection", async () => {
    const audit = vi.fn();
    const wrapped = withSecurity(definition(), {
      sanitize: {},
      blockedPatterns: ["javascript:"],
      audit: true,
      onAudit: audit,
    });
    await expect(
      wrapped.handler(JSON.parse('{"__proto__": {"x": 1}}')),
    ).rejects.toThrow();
    await expect(
      wrapped.handler({ value: "javascript:alert(1)" }),
    ).rejects.toThrow(/blocked/i);
    expect(audit.mock.calls.map(([event]) => event.outcome)).toEqual([
      "rejected",
      "rejected",
    ]);
  });
  it("revalidates the sanitized input against the original schema", async () => {
    const handler = vi.fn(async () => "ok");
    const wrapped = withSecurity(
      {
        ...definition(handler),
        inputSchema: {
          type: "object",
          properties: { value: { type: "string", minLength: 3 } },
          required: ["value"],
        },
      },
      { sanitize: {} },
    );
    await expect(wrapped.handler({ value: "<b></b>" })).rejects.toThrow(
      /schema|length|valid/i,
    );
    expect(handler).not.toHaveBeenCalled();
  });
  it("rate limits before the core queue and charges admitted calls once", async () => {
    let release!: () => void;
    const handler = vi.fn(
        async () =>
          new Promise<string>((resolve) => {
            release = () => resolve("ok");
          }),
      ),
      audit = vi.fn();
    const kit = createKit({ maxConcurrent: 1, maxQueued: 1, timeoutMs: 1000 });
    kit.register(
      withSecurity(definition(handler), {
        rateLimit: { maxInvocations: 1 },
        audit: true,
        onAudit: audit,
      }),
    );
    const first = kit.invoke("secure", {});
    await vi.waitFor(() => expect(handler).toHaveBeenCalledOnce());
    await expect(kit.invoke("secure", {})).rejects.toThrow(/Rate limit/i);
    release();
    await expect(first).resolves.toBe("ok");
    expect(audit.mock.calls.map(([event]) => event.outcome)).toEqual([
      "rejected",
      "succeeded",
    ]);
  });
  it("audits core rejection before admission for malformed input and lifecycle denial", async () => {
    const audit = vi.fn(),
      wrapped = withSecurity(definition(), { audit: true, onAudit: audit });
    const kit = createKit({ onBeforeInvoke: () => false });
    kit.register(wrapped);
    await expect(kit.invoke("secure", { nested: Infinity })).rejects.toThrow();
    await expect(
      kit.invoke("secure", { signature: "never-log-this" }),
    ).rejects.toThrow(/blocked/i);
    expect(audit.mock.calls.map(([event]) => event.outcome)).toEqual([
      "rejected",
      "rejected",
    ]);
    expect(JSON.stringify(audit.mock.calls)).not.toContain("never-log-this");
  });
  it("audits queue capacity denial and cancellation exactly once", async () => {
    const audit = vi.fn(),
      controller = new AbortController();
    let release!: () => void;
    const handler = vi.fn(
      async () =>
        new Promise<string>((resolve) => {
          release = () => resolve("ok");
        }),
    );
    const kit = createKit({ maxConcurrent: 1, maxQueued: 1, timeoutMs: 1000 });
    kit.register(
      withSecurity(definition(handler), { audit: true, onAudit: audit }),
    );
    const first = kit.invoke("secure", {});
    await vi.waitFor(() => expect(handler).toHaveBeenCalledOnce());
    const queued = kit.invoke("secure", {}, { signal: controller.signal }),
      canceled = expect(queued).rejects.toThrow(/cancel|abort/i);
    await expect(kit.invoke("secure", {})).rejects.toThrow(/queue/i);
    controller.abort(new Error("Invocation canceled"));
    await canceled;
    release();
    await first;
    expect(audit.mock.calls.map(([event]) => event.outcome)).toEqual([
      "rejected",
      "rejected",
      "succeeded",
    ]);
    expect(handler).toHaveBeenCalledOnce();
  });
  it("audits timeout and suppresses late handler success", async () => {
    const audit = vi.fn();
    let release!: () => void;
    const handler = vi.fn(
      async () =>
        new Promise<string>((resolve) => {
          release = () => resolve("late");
        }),
    );
    const kit = createKit({ timeoutMs: 30 });
    kit.register(
      withSecurity(definition(handler), { audit: true, onAudit: audit }),
    );
    await expect(kit.invoke("secure", {})).rejects.toThrow(/timeout/i);
    release();
    await Promise.resolve();
    await Promise.resolve();
    expect(audit).toHaveBeenCalledOnce();
    expect(audit.mock.calls[0][0]).toMatchObject({
      outcome: "failed",
      errorCode: "aborted",
    });
  });
});
