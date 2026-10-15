import { afterEach, describe, expect, it, vi } from "vitest";
import { createKit, WebMCPKit } from "../core.js";
const tool = {
  name: "hello",
  description: "Hello tool",
  inputSchema: { type: "object" as const },
  handler: (_: any, context?: any) => context?.signal,
};
afterEach(() => vi.unstubAllGlobals());
describe("current document modelContext adapter", () => {
  it("registers execute with abort cleanup and propagates execution cancellation", async () => {
    let registered: any;
    let signal!: AbortSignal;
    vi.stubGlobal("document", {
      modelContext: {
        registerTool: async (definition: any, options: any) => {
          registered = definition;
          signal = options.signal;
        },
      },
    });
    const kit = createKit({ prefix: "demo" });
    expect(WebMCPKit.isAvailable()).toBe(true);
    kit.register(tool);
    await kit.ready();
    expect(registered.name).toBe("demo.hello");
    expect(registered.handler).toBeUndefined();
    expect(signal.aborted).toBe(false);
    const controller = new AbortController();
    const executionSignal = await registered.execute(
      {},
      { signal: controller.signal },
    );
    expect(executionSignal).toBeInstanceOf(AbortSignal);
    kit.unregister("demo.hello");
    expect(signal.aborted).toBe(true);
  });
  it("exposes registration failure through ready and error hook", async () => {
    const onError = vi.fn();
    vi.stubGlobal("document", {
      modelContext: {
        registerTool: async () => {
          throw new Error("registration denied");
        },
      },
    });
    const kit = createKit({ onError });
    kit.register(tool);
    await expect(kit.ready()).rejects.toThrow("registration denied");
    expect(onError).toHaveBeenCalledOnce();
  });
  it("aborts replaced and pending registrations", async () => {
    const signals: AbortSignal[] = [];
    vi.stubGlobal("document", {
      modelContext: {
        registerTool: async (_: any, options: any) => {
          signals.push(options.signal);
        },
      },
    });
    const kit = createKit();
    kit.register(tool);
    kit.register(tool, { replace: true });
    await kit.ready();
    expect(signals[0].aborted).toBe(true);
    kit.unregisterAll();
    expect(signals[1].aborted).toBe(true);
  });
  it("ignores navigator API unless explicit legacy adapter selected", async () => {
    const registerTool = vi.fn();
    const unregisterTool = vi.fn();
    vi.stubGlobal("navigator", {
      modelContext: { registerTool, unregisterTool },
    });
    expect(WebMCPKit.isAvailable()).toBe(false);
    const kit = createKit({ browserAdapter: "legacy" } as any);
    kit.register(tool);
    await kit.ready();
    expect(registerTool).toHaveBeenCalledOnce();
    kit.unregister("hello");
    expect(unregisterTool).toHaveBeenCalledWith("hello");
  });
});
describe("current native annotations", () => {
  it("maps consequential hints and moves title to native top level", async () => {
    let native: any;
    vi.stubGlobal("document", {
      modelContext: {
        registerTool: async (definition: any) => {
          native = definition;
        },
      },
    });
    const kit = createKit();
    kit.register({
      ...tool,
      title: "Current title",
      annotations: {
        destructiveHint: true,
        confirmationHint: true,
        readOnlyHint: false,
        untrustedContentHint: true,
        debugging: true,
        title: "Legacy title",
      },
    });
    await kit.ready();
    expect(native.title).toBe("Current title");
    expect(native.annotations).toEqual({
      readOnlyHint: false,
      consequentialHint: true,
      untrustedContentHint: true,
      debugging: true,
    });
  });
  it("conservatively preserves consequential legacy hints despite false modern hint", async () => {
    let native: any;
    vi.stubGlobal("document", {
      modelContext: {
        registerTool: async (definition: any) => {
          native = definition;
        },
      },
    });
    const kit = createKit();
    kit.register({
      ...tool,
      annotations: {
        confirmationHint: true,
        consequentialHint: false,
        title: "Legacy title",
      },
    });
    await kit.ready();
    expect(native.title).toBe("Legacy title");
    expect(native.annotations.consequentialHint).toBe(true);
  });
});
