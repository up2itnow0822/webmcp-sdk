import { describe, it, expect, vi } from "vitest";
import { Studio, parseAmount, WalletActionError, type Gateway } from "./domain";
const A = "0x1111111111111111111111111111111111111111",
  B = "0x2222222222222222222222222222222222222222";
const gateway = (): Gateway => ({
  context: async () => ({ account: A, chain: 8453 }),
  balances: async () => ({
    ETH: 10n ** 18n,
    USDC: 1000000000n,
    WETH: 10n ** 18n,
  }),
  quote: async () => 1000000000000000n,
  prepare: async () => ({
    to: B,
    data: "0x",
    value: 1n,
    gas: 21000n,
    maxFeePerGas: 2n,
    maxPriorityFeePerGas: 0n,
  }),
  send: async () => ("0x" + "a".repeat(64)) as `0x${string}`,
  verify: async () => "confirmed",
  allowance: async () => 0n,
});
async function setup() {
  const g = gateway(),
    s = new Studio(g);
  await s.connect();
  return { s, g };
}
const request = {
  kind: "transfer",
  asset: "USDC",
  amount: "1",
  recipient: B,
} as const;
describe("exact immutable authority", () => {
  it("parses exact amounts and rejects rounding/exponents/zero", () => {
    for (const a of ["1.0000001", "1e3", "-1", "0", " 1", "01"])
      expect(() => parseAmount(a, 6)).toThrow();
    expect(parseAmount("123.456789", 6)).toBe(123456789n);
  });
  it("freezes intent and invalidates policy revisions", async () => {
    const { s } = await setup();
    const p = await s.propose(request);
    expect(Object.isFrozen(p.intent)).toBe(true);
    s.setPolicy({ ...s.policy, enabled: false });
    await expect(s.prepare(p.id)).rejects.toThrow();
  });
  it("rejects cancelled proposals", async () => {
    const { s } = await setup();
    const p = await s.propose(request);
    s.cancel(p.id);
    await expect(s.prepare(p.id)).rejects.toThrow();
  });
  it("expires at120seconds", async () => {
    let now = 100;
    const s = new Studio(gateway(), () => now);
    await s.connect();
    const p = await s.propose(request);
    now += 120000;
    await expect(s.prepare(p.id)).rejects.toThrow(/expired/i);
  });
  it("invalidates changed accounts", async () => {
    const { s, g } = await setup();
    const p = await s.propose(request);
    await s.prepare(p.id);
    g.context = async () => ({ account: B, chain: 8453 });
    await expect(s.execute(p.id)).rejects.toThrow();
    expect(s.get(p.id).status).not.toBe("confirmed");
  });
  it("rejects changed networks", async () => {
    const { s, g } = await setup();
    const p = await s.propose(request);
    g.context = async () => ({ account: A, chain: 1 });
    await expect(s.prepare(p.id)).rejects.toThrow();
  });
  it("fails explicit rejection and verified revert, prevents replay", async () => {
    for (const stage of ["send", "verify"]) {
      const { s, g } = await setup();
      const p = await s.propose(request);
      await s.prepare(p.id);
      if (stage === "send")
        g.send = async () => {
          throw new WalletActionError("Rejected", "rejected");
        };
      else g.verify = async () => "reverted";
      await expect(s.execute(p.id)).rejects.toThrow();
      expect(s.get(p.id).status).toBe("failed");
      await expect(s.execute(p.id)).rejects.toThrow();
    }
  });
  it("separates exact approval and caps slippage", async () => {
    const { s } = await setup();
    await expect(
      s.propose({ kind: "swap", asset: "USDC", amount: "1", slippageBps: 101 }),
    ).rejects.toThrow();
    const p = await s.propose({ kind: "swap", asset: "USDC", amount: "1" });
    expect((await s.prepare(p.id)).step).toBe("approval");
    await s.execute(p.id);
    expect(s.get(p.id).status).toBe("proposed");
  });
  it("does not sign after simulation failure", async () => {
    const { s, g } = await setup();
    g.prepare = async () => {
      throw Error("Simulation failed");
    };
    const p = await s.propose(request);
    await expect(s.prepare(p.id)).rejects.toThrow();
    await expect(s.execute(p.id)).rejects.toThrow();
  });
  it("checks context after async prepare", async () => {
    const { s, g } = await setup();
    const p = await s.propose(request);
    const prepare = g.prepare;
    g.prepare = async (i, step) => {
      g.context = async () => ({ account: B, chain: 8453 });
      return prepare(i, step);
    };
    await expect(s.prepare(p.id)).rejects.toThrow();
  });
  it("rejects arbitrary assets and calldata", async () => {
    const { s } = await setup();
    await expect(
      s.propose({ ...request, asset: "BAD" } as never),
    ).rejects.toThrow();
    await expect(
      s.propose({ ...request, data: "0x1234" } as never),
    ).rejects.toThrow();
  });
  it("retains unknown receipts as pending", async () => {
    const { s, g } = await setup();
    g.verify = async () => "unknown";
    const p = await s.propose(request);
    await s.prepare(p.id);
    await s.execute(p.id);
    expect(s.get(p.id).status).toBe("pending");
  });
  it("checks policy immediately before send", async () => {
    const { s, g } = await setup();
    let signed = false;
    g.send = async (_i, _t, guard) => {
      s.setPolicy({ ...s.policy, enabled: false });
      await guard?.();
      signed = true;
      return ("0x" + "b".repeat(64)) as `0x${string}`;
    };
    const p = await s.propose(request);
    await s.prepare(p.id);
    await expect(s.execute(p.id)).rejects.toThrow();
    expect(signed).toBe(false);
  });
  it("honors aborted proposals", async () => {
    const { s } = await setup();
    const c = new AbortController();
    c.abort();
    await expect(s.propose(request, c.signal)).rejects.toThrow();
    expect(s.list()).toHaveLength(0);
  });
  it("rejects inherited inputs", async () => {
    const { s } = await setup();
    await expect(s.propose(Object.create(request))).rejects.toThrow();
  });
  it("keeps hash and pending on receipt transport errors", async () => {
    const { s, g } = await setup();
    g.verify = async () => {
      throw Error("HTTP503");
    };
    const p = await s.propose(request);
    await s.prepare(p.id);
    await expect(s.execute(p.id)).rejects.toThrow();
    expect(s.get(p.id).status).toBe("pending");
    expect(s.get(p.id).hash).toBeDefined();
  });
  it("keeps ambiguous submission pending without replay", async () => {
    const { s, g } = await setup();
    g.send = async () => {
      throw Error("Disconnected after broadcast");
    };
    const p = await s.propose(request);
    await s.prepare(p.id);
    await expect(s.execute(p.id)).rejects.toThrow();
    expect(s.get(p.id).status).toBe("pending");
    await expect(s.execute(p.id)).rejects.toThrow();
  });
  it("retains signer lease and late hash after UI timeout", async () => {
    vi.useFakeTimers();
    try {
      const { s, g } = await setup();
      let resolve!: (h: `0x${string}`) => void;
      g.send = async () =>
        new Promise((r) => {
          resolve = r;
        });
      const p = await s.propose(request);
      await s.prepare(p.id);
      const action = s.execute(p.id);
      const rejected = expect(action).rejects.toThrow(/timed out/);
      await vi.advanceTimersByTimeAsync(60001);
      await rejected;
      expect(s.get(p.id).status).toBe("pending");
      const p2 = await s.propose(request);
      await expect(s.prepare(p2.id)).rejects.toThrow(/current wallet action/);
      resolve(("0x" + "c".repeat(64)) as `0x${string}`);
      await vi.advanceTimersByTimeAsync(1);
      expect(s.get(p.id).hash).toBe("0x" + "c".repeat(64));
      expect(s.get(p.id).status).toBe("pending");
    } finally {
      vi.useRealTimers();
    }
  });
  it("missing lookup does not strand the busy lease", async () => {
    const { s } = await setup();
    await expect(s.prepare("missing")).rejects.toThrow();
    const p = await s.propose(request);
    await expect(s.prepare(p.id)).resolves.toMatchObject({ step: "execute" });
  });
});
