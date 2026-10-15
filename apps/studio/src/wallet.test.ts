import { describe, it, expect, vi } from "vitest";
import { decodeFunctionData, encodeFunctionResult } from "viem";
import {
  WalletGateway,
  routerABI,
  erc20ABI,
  transactionFor,
  type Provider,
} from "./wallet";
import {
  ROUTER,
  TOKENS,
  PRACTICE_ACCOUNT,
  Studio,
  type Intent,
} from "./domain";
import { FixtureProvider } from "./fixture";
const intent: Intent = {
  id: "P-1",
  account: PRACTICE_ACCOUNT,
  chain: 8453,
  kind: "swap",
  asset: "USDC",
  output: "WETH",
  amount: 1000000n,
  recipient: PRACTICE_ACCOUNT,
  quote: 500n,
  minimum: 495n,
  slippageBps: 100,
  expires: Date.now() + 120000,
  policyVersion: 1,
};
describe("wallet boundary", () => {
  it("wraps swaps in deadline multicall", () => {
    const tx = transactionFor(intent, "execute");
    expect(tx.to).toBe(ROUTER);
    const d = decodeFunctionData({ abi: routerABI, data: tx.data });
    expect(d.functionName).toBe("multicall");
    expect(d.args[0]).toBe(BigInt(Math.floor(intent.expires / 1000)));
  });
  it("approves exact amount to fixed router", () => {
    const tx = transactionFor(intent, "approval");
    expect(tx.to).toBe(TOKENS.USDC);
    const d = decodeFunctionData({ abi: erc20ABI, data: tx.data });
    expect(d.functionName).toBe("approve");
    expect(d.args).toEqual([ROUTER, intent.amount]);
  });
  it("propagates connection rejection", async () => {
    const p: Provider = {
      request: async () => {
        throw Error("User rejected");
      },
    };
    await expect(new WalletGateway(p).connect()).rejects.toThrow(
      "User rejected",
    );
  });
  it("rejects ERC20 false simulation", async () => {
    const p: Provider = {
      request: async () =>
        encodeFunctionResult({
          abi: erc20ABI,
          functionName: "transfer",
          result: false,
        }),
    };
    await expect(
      new WalletGateway(p).prepare({ ...intent, kind: "transfer" }, "execute"),
    ).rejects.toThrow(/returned false/i);
  });
  it("checks account after simulation before submit", async () => {
    let account = PRACTICE_ACCOUNT,
      sends = 0;
    const p: Provider = {
      request: async ({ method }) => {
        if (method === "eth_accounts") return [account];
        if (method === "eth_chainId") return "0x2105";
        if (method === "eth_call") {
          account = "0x2222222222222222222222222222222222222222";
          return "0x";
        }
        if (method === "eth_sendTransaction") sends++;
        return "0x1";
      },
    };
    await expect(
      new WalletGateway(p).send(intent, {
        ...transactionFor(intent, "execute"),
        gas: 1n,
        maxFeePerGas: 1n,
        maxPriorityFeePerGas: 0n,
      }),
    ).rejects.toThrow(/changed/);
    expect(sends).toBe(0);
  });
  async function setup() {
    const p = new FixtureProvider(),
      g = new WalletGateway(p),
      s = new Studio(g);
    await g.connect();
    await s.connect();
    return { p, g, s };
  }
  it("confirms exact native and allowlisted token transfers", async () => {
    for (const asset of ["ETH", "USDC", "WETH"] as const) {
      const { s } = await setup();
      const p = await s.propose({
        kind: "transfer",
        asset,
        amount: asset === "USDC" ? "1" : "0.001",
        recipient: "0x2222222222222222222222222222222222222222",
      });
      await s.prepare(p.id);
      await s.execute(p.id);
      expect(s.get(p.id).status).toBe("confirmed");
    }
  });
  it("requires separate exact approval and swap sends", async () => {
    const { s, p } = await setup();
    const proposal = await s.propose({
      kind: "swap",
      asset: "USDC",
      amount: "25",
    });
    expect((await s.prepare(proposal.id)).step).toBe("approval");
    await s.execute(proposal.id);
    expect(s.get(proposal.id).status).toBe("proposed");
    expect(p.sent).toHaveLength(1);
    expect((await s.prepare(proposal.id)).step).toBe("execute");
    await s.execute(proposal.id);
    expect(s.get(proposal.id).status).toBe("confirmed");
    expect(p.sent).toHaveLength(2);
  });
  it("labels explicit rejection and verified revert failed", async () => {
    for (const flag of ["rejectNext", "revertNext"] as const) {
      const { s, p } = await setup();
      const proposal = await s.propose({
        kind: "transfer",
        asset: "ETH",
        amount: "0.001",
        recipient: "0x2222222222222222222222222222222222222222",
      });
      await s.prepare(proposal.id);
      p[flag] = true;
      await expect(s.execute(proposal.id)).rejects.toThrow();
      expect(s.get(proposal.id).status).toBe("failed");
    }
  });
  it("keeps absent receipt pending then reconciles", async () => {
    const { s, p } = await setup();
    const proposal = await s.propose({
      kind: "transfer",
      asset: "ETH",
      amount: "0.001",
      recipient: "0x2222222222222222222222222222222222222222",
    });
    await s.prepare(proposal.id);
    p.pending = true;
    await s.execute(proposal.id);
    expect(s.get(proposal.id).status).toBe("pending");
    p.pending = false;
    await s.checkReceipt(proposal.id);
    expect(s.get(proposal.id).status).toBe("confirmed");
  });
  it("does not confirm wallet modified transactions", async () => {
    const { s, p } = await setup();
    const proposal = await s.propose({
      kind: "transfer",
      asset: "ETH",
      amount: "0.001",
      recipient: "0x2222222222222222222222222222222222222222",
    });
    await s.prepare(proposal.id);
    const original = p.request.bind(p);
    p.request = async (args) => {
      const result = await original(args);
      return args.method === "eth_getTransactionByHash"
        ? { ...(result as object), value: "0x1" }
        : result;
    };
    await s.execute(proposal.id);
    expect(s.get(proposal.id).status).toBe("pending");
  });
  it("holds one provider signer lease across gateway instances", async () => {
    const provider = new FixtureProvider();
    const original = provider.request.bind(provider);
    let resolve!: (v: unknown) => void,
      sends = 0;
    provider.request = async (args) => {
      if (args.method === "eth_sendTransaction") {
        sends++;
        return new Promise((r) => {
          resolve = r;
        });
      }
      return original(args);
    };
    const first = new WalletGateway(provider),
      second = new WalletGateway(provider);
    const tx = await first.prepare(intent, "approval");
    const pending = first.send(intent, tx);
    await vi.waitFor(() => expect(sends).toBe(1));
    await expect(second.send(intent, tx)).rejects.toThrow(/pending/i);
    resolve("0x" + "a".repeat(64));
    await pending;
    expect(sends).toBe(1);
  });
});

it("binds the reviewed Base chain to the wallet send payload only", async () => {
  const provider = new FixtureProvider();
  const original = provider.request.bind(provider);
  const requests: { method: string; params?: unknown[] }[] = [];
  provider.request = async (args) => {
    requests.push(args);
    return original(args);
  };
  const gateway = new WalletGateway(provider);
  const tx = await gateway.prepare(intent, "approval");
  await gateway.send(intent, tx);
  expect(provider.sent[0].chainId).toBe("0x2105");
  for (const request of requests.filter(({ method }) =>
    ["eth_call", "eth_estimateGas"].includes(method),
  )) {
    expect(request.params?.[0]).not.toHaveProperty("chainId");
  }
});

it("the fixture rejects a missing or wrong send chain before accepting a request", async () => {
  const provider = new FixtureProvider();
  for (const chainId of [undefined, "0x1"]) {
    await expect(
      provider.request({
        method: "eth_sendTransaction",
        params: [
          {
            from: PRACTICE_ACCOUNT,
            to: PRACTICE_ACCOUNT,
            data: "0x",
            value: "0x1",
            gas: "0x5208",
            gasPrice: "0x1",
            ...(chainId === undefined ? {} : { chainId }),
          },
        ],
      }),
    ).rejects.toThrow(/chain/i);
  }
  expect(provider.sent).toHaveLength(0);
});
