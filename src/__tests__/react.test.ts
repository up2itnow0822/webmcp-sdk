import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createKit, type WebMCPKit } from "../core.js";
import { withConfirmation, withSecurity } from "../security.js";
import * as bindings from "../react.js";
import { installMockContext } from "../testing.js";
import type { WebMCPKitConfig } from "../types.js";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const roots: ReactTestRenderer[] = [];
async function mount(element: ReturnType<typeof createElement>) {
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(element);
  });
  roots.push(root);
  return root;
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(async () => {
  await act(async () => {
    for (const root of roots.splice(0)) root.unmount();
  });
  vi.restoreAllMocks();
});

describe("React mounted regressions", () => {
  it("invokes the current authentication closure after rerender", async () => {
    let kit!: WebMCPKit;
    function Tool({ account }: { account: string }) {
      kit = bindings.useWebMCPKit();
      bindings.useWebMCPTool({
        name: "react-auth",
        description: "Account",
        inputSchema: { type: "object" },
        handler: () => account,
      });
      return null;
    }
    const root = await mount(createElement(Tool, { account: "alice" }));
    await act(async () => {
      root.update(createElement(Tool, { account: "bob" }));
    });
    await expect(kit.invoke("react-auth", {})).resolves.toBe("bob");
  });

  it("rejects conflicting policy instead of silently dropping it", async () => {
    function ReadDefault() {
      bindings.useWebMCPKit();
      return null;
    }
    function SecureTool() {
      bindings.useWebMCPTool(
        {
          name: "react-secure",
          description: "Secure",
          inputSchema: { type: "object" },
          handler: () => true,
        },
        { onBeforeInvoke: () => false },
      );
      return null;
    }
    await mount(createElement(ReadDefault));
    await expect(mount(createElement(SecureTool))).rejects.toThrow(
      /conflicting.*config|configuration.*conflict/i,
    );
  });
});

describe("provider-owned React lifecycle", () => {
  function Provider(props: {
    kit?: WebMCPKit;
    config?: WebMCPKitConfig;
    children?: ReturnType<typeof createElement>;
  }) {
    expect(
      bindings.WebMCPProvider,
      "WebMCPProvider is a public React export",
    ).toBeTypeOf("function");
    return createElement(bindings.WebMCPProvider, props);
  }
  function Tool({
    name = "owned",
    value = "current",
    enabled = true,
  }: {
    name?: string;
    value?: string;
    enabled?: boolean;
  }) {
    bindings.useWebMCPTool(
      {
        name,
        description: "Owned",
        inputSchema: { type: "object" },
        handler: () => value,
      },
      undefined,
      { enabled },
    );
    return null;
  }

  it("scopes the same tool name to independent provider kits", async () => {
    const left = createKit();
    const right = createKit();
    await mount(
      createElement(
        Provider,
        { kit: left },
        createElement(Tool, { value: "left" }),
      ),
    );
    await mount(
      createElement(
        Provider,
        { kit: right },
        createElement(Tool, { value: "right" }),
      ),
    );
    await expect(left.invoke("owned", {})).resolves.toBe("left");
    await expect(right.invoke("owned", {})).resolves.toBe("right");
  });

  it("applies provider configuration before the first tool executes", async () => {
    let kit!: WebMCPKit;
    function Secure() {
      kit = bindings.useWebMCPKit();
      bindings.useWebMCPTool({
        name: "secure",
        description: "Secure",
        inputSchema: { type: "object" },
        handler: () => "executed",
      });
      return null;
    }
    await mount(
      createElement(
        Provider,
        { config: { prefix: "tenant", onBeforeInvoke: () => false } },
        createElement(Secure),
      ),
    );
    expect(kit.getTool("secure")?.name).toBe("tenant.secure");
    await expect(kit.invoke("secure", {})).rejects.toThrow(/blocked/);
  });

  it("rejects policy replacement on an existing provider", async () => {
    const root = await mount(
      createElement(
        Provider,
        { config: { prefix: "initial" } },
        createElement(Tool),
      ),
    );
    await expect(
      act(async () => {
        root.update(
          createElement(
            Provider,
            { config: { prefix: "changed" } },
            createElement(Tool),
          ),
        );
      }),
    ).rejects.toThrow(/configuration.*chang|config.*chang/i);
  });

  it("revokes an account tool when disabled and restores it with current state", async () => {
    const kit = createKit();
    const render = (enabled: boolean, value: string) =>
      createElement(Provider, { kit }, createElement(Tool, { enabled, value }));
    const root = await mount(render(true, "alice"));
    await act(async () => {
      root.update(render(false, "logged out"));
    });
    expect(kit.getTool("owned")).toBeUndefined();
    await act(async () => {
      root.update(render(true, "bob"));
    });
    await expect(kit.invoke("owned", {})).resolves.toBe("bob");
    await act(async () => {
      root.unmount();
    });
    expect(kit.getTools()).toEqual([]);
  });

  it("rejects duplicate component ownership without replacing the first tool", async () => {
    const kit = createKit();
    await mount(
      createElement(Provider, { kit }, createElement(Tool, { value: "first" })),
    );
    await expect(
      mount(
        createElement(
          Provider,
          { kit },
          createElement(Tool, { value: "second" }),
        ),
      ),
    ).rejects.toThrow(/already.*owned|already.*registered/i);
    await expect(kit.invoke("owned", {})).resolves.toBe("first");
  });

  it("updates schema, annotations and multiple current handlers on rerender", async () => {
    const kit = createKit();
    function Many({ minimum }: { minimum: number }) {
      bindings.useWebMCPTools([
        {
          name: "first",
          description: `Minimum ${minimum}`,
          inputSchema: {
            type: "object",
            properties: { count: { type: "integer", minimum } },
            required: ["count"],
          },
          annotations: { destructiveHint: minimum > 1 },
          handler: () => minimum,
        },
        {
          name: "second",
          description: "Second",
          inputSchema: { type: "object" },
          handler: () => minimum + 1,
        },
      ]);
      return null;
    }
    const render = (minimum: number) =>
      createElement(Provider, { kit }, createElement(Many, { minimum }));
    const root = await mount(render(1));
    await act(async () => {
      root.update(render(3));
    });
    expect(kit.getTool("first")?.description).toBe("Minimum 3");
    expect(kit.getTool("first")?.annotations?.destructiveHint).toBe(true);
    await expect(kit.invoke("first", { count: 2 })).rejects.toThrow(
      /minimum|>=|3/,
    );
    await expect(kit.invoke("first", { count: 3 })).resolves.toBe(3);
    await expect(kit.invoke("second", {})).resolves.toBe(4);
  });

  it("subscribes logging after kit creation while preserving configured callbacks", async () => {
    const completed = vi.fn();
    const kit = createKit({ onAfterInvoke: completed });
    let log!: ReturnType<typeof bindings.useWebMCPLog>;
    function Logger({ limit }: { limit: number }) {
      log = bindings.useWebMCPLog(limit);
      return null;
    }
    const render = (limit: number) =>
      createElement(Provider, { kit }, createElement(Logger, { limit }));
    const root = await mount(render(2));
    kit.register({
      name: "log",
      description: "Log",
      inputSchema: { type: "object" },
      handler: () => "done",
    });
    await act(async () => {
      await kit.invoke("log", {});
      await kit.invoke("log", {});
    });
    expect(log.invocations).toHaveLength(2);
    expect(completed).toHaveBeenCalledTimes(2);
    await act(async () => {
      root.update(render(1));
    });
    expect(log.invocations).toHaveLength(1);
    await act(async () => {
      log.clearLog();
    });
    expect(log.invocations).toEqual([]);
    await act(async () => {
      root.unmount();
      await kit.invoke("log", {});
    });
    expect(completed).toHaveBeenCalledTimes(3);
  });

  it("forwards execution cancellation context to the current handler", async () => {
    const kit = createKit();
    let signal: AbortSignal | undefined;
    function AbortTool() {
      bindings.useWebMCPTool({
        name: "signal",
        description: "Signal",
        inputSchema: { type: "object" },
        handler: (_input, context) => {
          signal = context?.signal;
          return true;
        },
      });
      return null;
    }
    await mount(createElement(Provider, { kit }, createElement(AbortTool)));
    await kit.invoke("signal", {});
    expect(signal).toBeInstanceOf(AbortSignal);
  });

  it("does not remove an externally replaced tool during component cleanup", async () => {
    const kit = createKit();
    const root = await mount(
      createElement(Provider, { kit }, createElement(Tool)),
    );
    kit.register(
      {
        name: "owned",
        description: "External",
        inputSchema: { type: "object" },
        handler: () => "external",
      },
      { replace: true },
    );
    await act(async () => {
      root.unmount();
    });
    await expect(kit.invoke("owned", {})).resolves.toBe("external");
  });
});

describe("provider revocation and conflicts", () => {
  it("revokes all descendant hooks when the provider is disabled", async () => {
    const kit = createKit();
    function Tools() {
      bindings.useWebMCPTools([
        {
          name: "session",
          description: "Session",
          inputSchema: { type: "object" },
          handler: () => true,
        },
      ]);
      return null;
    }
    const render = (enabled: boolean) =>
      createElement(
        bindings.WebMCPProvider,
        { kit, enabled },
        createElement(Tools),
      );
    const root = await mount(render(true));
    expect(kit.getTools()).toHaveLength(1);
    await act(async () => {
      root.update(render(false));
    });
    expect(kit.getTools()).toEqual([]);
  });

  it("rejects hook config under an externally configured kit", async () => {
    const kit = createKit();
    function Configured() {
      bindings.useWebMCPKit({ prefix: "ignored" });
      return null;
    }
    await expect(
      mount(
        createElement(
          bindings.WebMCPProvider,
          { kit },
          createElement(Configured),
        ),
      ),
    ).rejects.toThrow(/config.*provider|provider.*config/i);
  });

  it("cleans up old names when tools are renamed", async () => {
    const kit = createKit();
    function Named({ name }: { name: string }) {
      bindings.useWebMCPTool({
        name,
        description: "Named",
        inputSchema: { type: "object" },
        handler: () => name,
      });
      return null;
    }
    const render = (name: string) =>
      createElement(
        bindings.WebMCPProvider,
        { kit },
        createElement(Named, { name }),
      );
    const root = await mount(render("old"));
    await act(async () => {
      root.update(render("new"));
    });
    expect(kit.getTool("old")).toBeUndefined();
    await expect(kit.invoke("new", {})).resolves.toBe("new");
  });
});

describe("revoked execution and live admission", () => {
  it("rejects a captured tool callback after component revocation", async () => {
    const kit = createKit();
    function Tool() {
      bindings.useWebMCPTool({
        name: "revoked",
        description: "Revoked",
        inputSchema: { type: "object" },
        handler: () => "unauthorized",
      });
      return null;
    }
    const root = await mount(
      createElement(bindings.WebMCPProvider, { kit }, createElement(Tool)),
    );
    const captured = kit.getTool("revoked")!;
    await act(async () => {
      root.unmount();
    });
    await expect(captured.handler({})).rejects.toThrow(/revoked|unregistered/);
  });

  it("uses the latest admission policy on rerender", async () => {
    const kit = createKit();
    function Tool({ allowed }: { allowed: boolean }) {
      bindings.useWebMCPTool({
        name: "admission",
        description: "Admission",
        inputSchema: { type: "object" },
        admit: () => {
          if (!allowed) throw new Error("new policy denies");
        },
        handler: () => "authorized",
      });
      return null;
    }
    const render = (allowed: boolean) =>
      createElement(
        bindings.WebMCPProvider,
        { kit },
        createElement(Tool, { allowed }),
      );
    const root = await mount(render(true));
    await expect(kit.invoke("admission", {})).resolves.toBe("authorized");
    await act(async () => {
      root.update(render(false));
    });
    await expect(kit.invoke("admission", {})).rejects.toThrow(
      /new policy denies/,
    );
  });

  it("honors a reduced logging capacity on later invocations", async () => {
    const kit = createKit();
    let log!: ReturnType<typeof bindings.useWebMCPLog>;
    function Logger({ limit }: { limit: number }) {
      log = bindings.useWebMCPLog(limit);
      return null;
    }
    const render = (limit: number) =>
      createElement(
        bindings.WebMCPProvider,
        { kit },
        createElement(Logger, { limit }),
      );
    kit.register({
      name: "logs",
      description: "Logs",
      inputSchema: { type: "object" },
      handler: () => true,
    });
    const root = await mount(render(3));
    await act(async () => {
      await kit.invoke("logs", {});
    });
    await act(async () => {
      root.update(render(1));
    });
    await act(async () => {
      await kit.invoke("logs", {});
      await kit.invoke("logs", {});
    });
    expect(log.invocations).toHaveLength(1);
  });
});

describe("running React revocation", () => {
  it("aborts a running handler when its account component unmounts", async () => {
    const kit = createKit();
    let started!: () => void;
    const running = new Promise<void>((resolve) => {
      started = resolve;
    });
    let signal!: AbortSignal;
    function Tool() {
      bindings.useWebMCPTool({
        name: "running",
        description: "Running",
        inputSchema: { type: "object" },
        handler: (_input, context) => {
          signal = context!.signal;
          started();
          return new Promise((_resolve, reject) => {
            signal.addEventListener("abort", () => reject(signal.reason), {
              once: true,
            });
          });
        },
      });
      return null;
    }
    const root = await mount(
      createElement(bindings.WebMCPProvider, { kit }, createElement(Tool)),
    );
    const controller = new AbortController();
    const invocation = kit
      .invoke("running", {}, { signal: controller.signal })
      .catch((error: unknown) => error);
    await running;
    await act(async () => {
      root.unmount();
    });
    const revoked = signal.aborted;
    if (!revoked) controller.abort(new Error("test cleanup aborted"));
    const error = await invocation;
    expect(revoked).toBe(true);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/revoked|unregistered|abort/i);
  });
});

describe("React security wrapper integration", () => {
  it("uses the current rejection audit sink for failures before admission", async () => {
    const kit = createKit({ onBeforeInvoke: () => false });
    const firstAudit = vi.fn();
    const currentAudit = vi.fn();
    function Tool({ audit }: { audit: typeof firstAudit }) {
      bindings.useWebMCPTool(
        withSecurity(
          {
            name: "audited",
            description: "Audited",
            inputSchema: { type: "object" },
            handler: () => true,
          },
          { audit: true, onAudit: audit },
        ),
      );
      return null;
    }
    const render = (audit: typeof firstAudit) =>
      createElement(
        bindings.WebMCPProvider,
        { kit },
        createElement(Tool, { audit }),
      );
    const root = await mount(render(firstAudit));
    await act(async () => {
      root.update(render(currentAudit));
    });
    await expect(kit.invoke("audited", {})).rejects.toThrow(/blocked/);
    expect(currentAudit).toHaveBeenCalledOnce();
    expect(firstAudit).not.toHaveBeenCalled();
  });

  it("rejects queued stale security state and audits through the originally admitted wrapper", async () => {
    const kit = createKit({ maxConcurrent: 1 });
    let release!: () => void;
    let blocked!: () => void;
    const blockerStarted = new Promise<void>((resolve) => {
      blocked = resolve;
    });
    kit.register({
      name: "blocker",
      description: "Blocker",
      inputSchema: { type: "object" },
      handler: () => {
        blocked();
        return new Promise<void>((resolve) => {
          release = resolve;
        });
      },
    });
    const blocker = kit.invoke("blocker", {});
    await blockerStarted;
    let admitted!: () => void;
    const admittedState = new Promise<void>((resolve) => {
      admitted = resolve;
    });
    const oldAudit = vi.fn();
    const newAudit = vi.fn();
    const executed = vi.fn();
    function Tool({
      account,
      audit,
    }: {
      account: string;
      audit: typeof oldAudit;
    }) {
      bindings.useWebMCPTool(
        withSecurity(
          {
            name: "queued",
            description: "Queued",
            inputSchema: { type: "object" },
            admit: () => {
              admitted();
            },
            handler: () => {
              executed(account);
              return account;
            },
          },
          { audit: true, onAudit: audit },
        ),
      );
      return null;
    }
    const render = (account: string, audit: typeof oldAudit) =>
      createElement(
        bindings.WebMCPProvider,
        { kit },
        createElement(Tool, { account, audit }),
      );
    const root = await mount(render("alice", oldAudit));
    const invocation = kit
      .invoke("queued", {})
      .catch((error: unknown) => error);
    await admittedState;
    await act(async () => {
      root.update(render("bob", newAudit));
    });
    release();
    await blocker;
    const error = await invocation;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(
      /state.*chang|policy.*chang|revoked|unregistered|abort/i,
    );
    expect(executed).not.toHaveBeenCalled();
    expect(oldAudit).toHaveBeenCalledOnce();
    expect(newAudit).not.toHaveBeenCalled();
  });
});

describe("in-flight authorization state changes", () => {
  it.each(["single", "multiple"] as const)(
    "revokes pending confirmation when %s hook account handler changes",
    async (kind) => {
      const kit = createKit();
      const executed = vi.fn();
      let approve!: (approved: boolean) => void;
      const approval = new Promise<boolean>((resolve) => {
        approve = resolve;
      });
      let requested!: () => void;
      const confirmationStarted = new Promise<void>((resolve) => {
        requested = resolve;
      });
      const provider = () => {
        requested();
        return approval;
      };
      function Tool({ account }: { account: string }) {
        const definition = withConfirmation(
          {
            name: "confirm-account",
            description: "Confirm",
            inputSchema: { type: "object" },
            handler: () => {
              executed(account);
              return account;
            },
          },
          "Review account action",
          provider,
        );
        if (kind === "single") bindings.useWebMCPTool(definition);
        else bindings.useWebMCPTools([definition]);
        return null;
      }
      const render = (account: string) =>
        createElement(
          bindings.WebMCPProvider,
          { kit },
          createElement(Tool, { account }),
        );
      const root = await mount(render("alice"));
      const pending = kit
        .invoke("confirm-account", {})
        .catch((error: unknown) => error);
      await confirmationStarted;
      await act(async () => {
        root.update(render("bob"));
      });
      approve(true);
      const outcome = await pending;
      // Flush the approval continuation even if core cancellation wins its race.
      await act(async () => {
        await Promise.resolve();
      });
      expect(executed).not.toHaveBeenCalled();
      expect(outcome).toBeInstanceOf(Error);
      expect((outcome as Error).message).toMatch(/abort|revoked|unregistered/i);
      await expect(kit.invoke("confirm-account", {})).resolves.toBe("bob");
      expect(executed).toHaveBeenCalledExactlyOnceWith("bob");
    },
  );

  it("keeps pending authorization when committed callback identities remain unchanged", async () => {
    const kit = createKit();
    let approve!: (approved: boolean) => void;
    const approval = new Promise<boolean>((resolve) => {
      approve = resolve;
    });
    let requested!: () => void;
    const started = new Promise<void>((resolve) => {
      requested = resolve;
    });
    const definition = withConfirmation(
      {
        name: "stable-confirm",
        description: "Stable",
        inputSchema: { type: "object" },
        handler: () => "current",
      },
      "Review stable action",
      () => {
        requested();
        return approval;
      },
    );
    function Tool({ label }: { label: string }) {
      bindings.useWebMCPTool(definition);
      return createElement("span", null, label);
    }
    const render = (label: string) =>
      createElement(
        bindings.WebMCPProvider,
        { kit },
        createElement(Tool, { label }),
      );
    const root = await mount(render("before"));
    const registered = kit.getTool("stable-confirm");
    const pending = kit.invoke("stable-confirm", {});
    await started;
    await act(async () => {
      root.update(render("after"));
    });
    expect(kit.getTool("stable-confirm")).toBe(registered);
    approve(true);
    await expect(pending).resolves.toBe("current");
  });
});

describe("current top-level tool title", () => {
  it.each(["Updated title", undefined])(
    "refreshes local and native titles to %s with stable callbacks",
    async (title) => {
      const native = installMockContext();
      const kit = createKit();
      const handler = () => "unchanged";
      function Tool({ title }: { title?: string }) {
        bindings.useWebMCPTool({
          name: "display",
          title,
          description: "Display title",
          inputSchema: { type: "object" },
          handler,
        });
        return null;
      }
      const render = (title?: string) =>
        createElement(
          bindings.WebMCPProvider,
          { kit },
          createElement(Tool, { title }),
        );
      try {
        const root = await mount(render("First title"));
        await kit.ready();
        expect(kit.getTool("display")?.title).toBe("First title");
        expect(native.getTool("display")?.title).toBe("First title");
        await act(async () => {
          root.update(render(title));
        });
        await kit.ready();
        expect(kit.getTool("display")?.title).toBe(title);
        expect(native.getTool("display")?.title).toBe(title);
        await act(async () => {
          root.unmount();
        });
        expect(native.getTools()).toEqual([]);
      } finally {
        kit.unregisterAll();
        native.cleanup();
      }
    },
  );
});
