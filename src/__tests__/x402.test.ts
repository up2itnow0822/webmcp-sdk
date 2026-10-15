import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createPaymentTool,
  createX402PaymentPayload,
  parseX402Header,
  x402Fetch,
  x402Middleware,
  type X402Config,
} from "../x402.js";

const url = "https://resource.example/data";
const asset = "0x" + "a".repeat(40);
const payTo = "0x" + "b".repeat(40);
const payer = "0x" + "c".repeat(40);
const transaction = "0x" + "d".repeat(64);
const required = (overrides: Record<string, unknown> = {}) => ({
  x402Version: 2,
  resource: { url },
  accepts: [
    {
      scheme: "exact",
      network: "eip155:84532",
      amount: "10000",
      asset,
      payTo,
      maxTimeoutSeconds: 60,
      extra: { name: "USD Coin", version: "2" },
      ...overrides,
    },
  ],
});
const encode = (value: unknown) =>
  Buffer.from(JSON.stringify(value)).toString("base64");
const quote = (overrides = {}) =>
  new Response("", {
    status: 402,
    headers: { "payment-required": encode(required(overrides)) },
  });
const settled = () =>
  new Response("paid content", {
    headers: {
      "payment-response": encode({
        success: true,
        transaction,
        network: "eip155:84532",
        payer,
      }),
    },
  });
function fixture(overrides: Record<string, unknown> = {}) {
  const approve = vi.fn(() => true);
  const authorize = vi.fn(async (details: any) => ({
    x402Version: 2,
    resource: { url: details.resource },
    accepted: details.requirements,
    payload: {
      signature: "0x" + "1".repeat(130),
      authorization: {
        from: payer,
        to: payTo,
        value: details.amountAtomic,
        validAfter: "0",
        validBefore: String(Math.floor(details.expiresAt / 1000)),
        nonce: "0x" + "2".repeat(64),
      },
    },
  }));
  const verify = vi.fn(async ({ details }: any) => ({
    status: "verified",
    transaction,
    network: details.network,
    asset: details.asset,
    payTo: details.payTo,
    amountAtomic: details.amountAtomic,
    resource: details.resource,
    payer,
  }));
  const config = {
    adapter: {
      protocol: "x402-v2-exact",
      getWalletContext: async () => ({
        account: payer,
        network: "eip155:84532",
      }),
      authorize,
    },
    verificationProvider: verify,
    supportedNetworks: ["eip155:84532"],
    allowedOrigins: ["https://resource.example"],
    routes: [
      {
        network: "eip155:84532",
        asset,
        payTo,
        decimals: 6,
        maxAmountAtomic: "10000",
      },
    ],
    onPaymentRequired: approve,
    ...overrides,
  } as unknown as X402Config;
  return { config, authorize, approve, verify };
}
function mockFetch(first = quote(), second = settled()) {
  const fn = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second);
  vi.stubGlobal("fetch", fn);
  return fn;
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("truthful payment migration", () => {
  it("rejects private-key and legacy signer configuration", () => {
    expect(() => x402Middleware({ signer: "secret" } as any)).toThrow(
      /migrat|private|adapter/i,
    );
    expect(() =>
      createPaymentTool({ signer: async () => "signature" } as any),
    ).toThrow(/migrat|adapter/i);
  });
  it("does not fabricate success for middleware 402", async () => {
    const { config } = fixture({ verificationProvider: undefined });
    await expect(async () =>
      x402Middleware(config)(async () => {
        throw Object.assign(new Error("pay"), {
          status: 402,
          paymentDetails: {
            network: "eip155:84532",
            payTo,
            maxAmountRequired: "0.01",
            asset,
            resource: url,
            scheme: "exact",
          },
        });
      })({}),
    ).rejects.toThrow(/verif/i);
  });
  it("rejects a transaction hash as payment authorization", () => {
    expect(() =>
      createX402PaymentPayload(
        {
          network: "eip155:84532",
          payTo,
          maxAmountRequired: "10000",
          asset,
          resource: url,
          scheme: "exact",
        } as any,
        transaction as any,
      ),
    ).toThrow(/authorization|payload/i);
  });
});

describe("bounded strict protocol parsing", () => {
  it.each([
    "NaN",
    "Infinity",
    "1junk",
    "1e3",
    "-1",
    "0",
    "01",
    "1.0",
    " 1",
    10,
  ])("rejects noncanonical atomic amount %s", (amount) => {
    expect(parseX402Header(encode(required({ amount })))).toBeNull();
    expect(
      parseX402Header(
        JSON.stringify({
          network: "base",
          payTo,
          maxAmountRequired: amount,
          asset,
          resource: url,
          scheme: "exact",
        }),
      ),
    ).toBeNull();
  });
  it("parses v2 amount as atomic units without inventing USD or network defaults", () => {
    expect(parseX402Header(encode(required()))).toMatchObject({
      network: "eip155:84532",
      maxAmountRequired: "10000",
      amountAtomic: "10000",
      amountUnit: "atomic",
      resource: url,
    });
    expect(
      parseX402Header(JSON.stringify({ payTo, maxAmountRequired: "1" })),
    ).toBeNull();
  });
  it("rejects unsupported schemes, versions, ambiguous options and oversized headers", () => {
    expect(parseX402Header(encode(required({ scheme: "upto" })))).toBeNull();
    expect(
      parseX402Header(encode({ ...required(), x402Version: 1 })),
    ).toBeNull();
    expect(
      parseX402Header(
        encode({
          ...required(),
          accepts: [required().accepts[0], required().accepts[0]],
        }),
      ),
    ).toBeNull();
    expect(parseX402Header("x".repeat(17000))).toBeNull();
  });
  it("rejects dangerous nested fields", () => {
    const data = JSON.stringify(required()).replace(
      '"name":"USD Coin"',
      '"__proto__":{"polluted":true}',
    );
    expect(parseX402Header(Buffer.from(data).toString("base64"))).toBeNull();
  });
});

describe("payment authorization, route binding and exact limits", () => {
  it("runs rejecting human policy even for very small payments", async () => {
    const { config, authorize } = fixture({ onPaymentRequired: () => false });
    mockFetch(quote({ amount: "1" }));
    await expect(x402Fetch(url, {}, config)).rejects.toThrow(/reject/i);
    expect(authorize).not.toHaveBeenCalled();
  });
  it("requires explicit confirmation provider", async () => {
    const { config } = fixture({ onPaymentRequired: undefined });
    mockFetch();
    await expect(x402Fetch(url, {}, config)).rejects.toThrow(
      /confirmation|approval/i,
    );
  });
  it.each([
    { network: "eip155:1" },
    { asset: "0x" + "e".repeat(40) },
    { payTo: "0x" + "e".repeat(40) },
    { amount: "10001" },
  ])(
    "rejects unallowlisted or excessive quote %j before wallet signing",
    async (overrides) => {
      const { config, authorize } = fixture();
      mockFetch(quote(overrides));
      await expect(x402Fetch(url, {}, config)).rejects.toThrow(
        /network|route|limit/i,
      );
      expect(authorize).not.toHaveBeenCalled();
    },
  );
  it("binds advertised resource without overwriting it with caller URL", async () => {
    const { config, authorize } = fixture();
    mockFetch(
      new Response("", {
        status: 402,
        headers: {
          "payment-required": encode({
            ...required(),
            resource: { url: "https://resource.example/other" },
          }),
        },
      }),
    );
    await expect(x402Fetch(url, {}, config)).rejects.toThrow(/resource/i);
    expect(authorize).not.toHaveBeenCalled();
  });
  it.each([
    "http://resource.example/data",
    "https://evil.example/data",
    "https://user:pass@resource.example/data",
    "https://resource.example/data#fragment",
  ])("rejects unsafe target %s before fetching", async (target) => {
    const { config } = fixture();
    const fetcher = mockFetch();
    await expect(x402Fetch(target, {}, config)).rejects.toThrow(
      /URL|origin|HTTPS/i,
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("does not interpret token amounts as USD without valuation provider", async () => {
    const { config } = fixture({ maxAutoApproveUsd: 0.1 });
    const fetcher = mockFetch();
    await expect(x402Fetch(url, {}, config)).rejects.toThrow(/valuation/i);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("compares supplied USD valuation exactly, while always asking confirmation", async () => {
    const { config, approve } = fixture({
      maxAutoApproveUsd: 0.1,
      valuationProvider: async () => "0.100000000000000001",
    });
    mockFetch();
    await expect(x402Fetch(url, {}, config)).rejects.toThrow(/USD|limit/i);
    expect(approve).not.toHaveBeenCalled();
  });
  it("compares atomic values beyond Number precision exactly", async () => {
    const { config, authorize } = fixture({
      routes: [
        {
          network: "eip155:84532",
          asset,
          payTo,
          decimals: 18,
          maxAmountAtomic: "9007199254740992",
        },
      ],
    });
    mockFetch(quote({ amount: "9007199254740993" }));
    await expect(x402Fetch(url, {}, config)).rejects.toThrow(/limit/i);
    expect(authorize).not.toHaveBeenCalled();
  });
});

describe("single-retry execution and external evidence", () => {
  it("returns unlocked response only after matching external settlement verification", async () => {
    const { config, authorize, approve, verify } = fixture();
    const fetcher = mockFetch();
    const response = await x402Fetch(url, {}, config);
    expect(await response.text()).toBe("paid content");
    expect(authorize).toHaveBeenCalledOnce();
    expect(approve).toHaveBeenCalledOnce();
    expect(verify).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledTimes(2);
    const init = fetcher.mock.calls[1][1];
    expect(init.redirect).toBe("manual");
    const payload = JSON.parse(
      Buffer.from(
        new Headers(init.headers).get("payment-signature")!,
        "base64",
      ).toString(),
    );
    expect(payload.accepted.amount).toBe("10000");
    expect(payload.resource.url).toBe(url);
  });
  it.each(["pending", "failed"])(
    "reports %s evidence without success or settled callback",
    async (status) => {
      const onPaymentSettled = vi.fn();
      const { config } = fixture({
        verificationProvider: async () => ({ status }),
        onPaymentSettled,
      });
      mockFetch();
      await expect(x402Fetch(url, {}, config)).rejects.toMatchObject({
        status,
        success: false,
      });
      expect(onPaymentSettled).not.toHaveBeenCalled();
    },
  );
  it.each([
    { network: "eip155:1" },
    { payTo: payer },
    { asset: payTo },
    { amountAtomic: "9999" },
    { resource: "https://resource.example/other" },
    { transaction: "fake" },
    { payer: payTo },
  ])("rejects mismatched verified evidence %j", async (wrong) => {
    const { config, verify } = fixture();
    (config as any).verificationProvider = async (args: any) => ({
      ...(await verify(args)),
      ...wrong,
    });
    mockFetch();
    await expect(x402Fetch(url, {}, config)).rejects.toThrow(
      /evidence|settlement/i,
    );
  });
  it("rejects a self-declared settlement header without successful verification", async () => {
    const { config } = fixture({ verificationProvider: async () => undefined });
    mockFetch();
    await expect(x402Fetch(url, {}, config)).rejects.toThrow(/verif|evidence/i);
  });
  it("never pays a second time after repeated 402", async () => {
    const { config, authorize } = fixture();
    const fetcher = mockFetch(quote(), quote());
    await expect(x402Fetch(url, {}, config)).rejects.toThrow(/retry|resource/i);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(authorize).toHaveBeenCalledOnce();
  });
  it("rejects redirects before sending or following signed payment", async () => {
    const { config, authorize } = fixture();
    mockFetch(
      new Response("", {
        status: 302,
        headers: { location: "https://evil.example" },
      }),
    );
    await expect(x402Fetch(url, {}, config)).rejects.toThrow(/redirect/i);
    expect(authorize).not.toHaveBeenCalled();
  });
  it("does not sign after cancellation during approval", async () => {
    const controller = new AbortController();
    const { config, authorize } = fixture({
      onPaymentRequired: () => {
        controller.abort();
        return true;
      },
    });
    mockFetch();
    await expect(
      x402Fetch(url, { signal: controller.signal }, config),
    ).rejects.toThrow(/abort|cancel/i);
    expect(authorize).not.toHaveBeenCalled();
  });
  it("does not submit after quote expiry during wallet authorization", async () => {
    vi.useFakeTimers();
    const { config, authorize } = fixture();
    authorize.mockImplementation(async (details: any) => {
      vi.setSystemTime(Date.now() + 61000);
      return {
        x402Version: 2,
        resource: { url: details.resource },
        accepted: details.requirements,
        payload: {
          signature: "0x" + "1".repeat(130),
          authorization: {
            from: payer,
            to: payTo,
            value: details.amountAtomic,
            validAfter: "0",
            validBefore: String(Math.floor(details.expiresAt / 1000)),
            nonce: "0x" + "2".repeat(64),
          },
        },
      };
    });
    const fetcher = mockFetch();
    await expect(x402Fetch(url, {}, config)).rejects.toThrow(/expir/i);
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("manual payment tool executes real transport and enforces canonical token limit", async () => {
    const { config } = fixture();
    mockFetch();
    const result = await createPaymentTool(config).handler({
      url,
      paymentHeader: encode(required()),
      maxAmount: "0.01",
    });
    expect(result).toMatchObject({
      success: true,
      status: "verified",
      txHash: transaction,
      amountPaid: "10000",
    });
  });
  it("manual tool refuses stale supplied quote and malformed limits", async () => {
    const { config, authorize } = fixture();
    mockFetch(quote({ amount: "9999" }));
    await expect(
      createPaymentTool(config).handler({
        url,
        paymentHeader: encode(required()),
      }),
    ).rejects.toThrow(/quote|requirements/i);
    expect(authorize).not.toHaveBeenCalled();
    await expect(
      createPaymentTool(config).handler({
        url,
        paymentHeader: encode(required()),
        maxAmount: "1junk",
      }),
    ).rejects.toThrow(/amount/i);
  });
});

describe("wallet and authorization binding", () => {
  it("rejects account changes during human approval", async () => {
    const { config, authorize } = fixture();
    let account = payer;
    (config as any).adapter.getWalletContext = async () => ({
      account,
      network: "eip155:84532",
    });
    (config as any).onPaymentRequired = () => {
      account = payTo;
      return true;
    };
    mockFetch();
    await expect(x402Fetch(url, {}, config)).rejects.toThrow(/wallet|account/i);
    expect(authorize).not.toHaveBeenCalled();
  });
  it("rejects mutated returned authorization before submitting", async () => {
    const { config, authorize } = fixture();
    const original = authorize.getMockImplementation()!;
    authorize.mockImplementation(async (details: any) => {
      const payload = await original(details);
      payload.payload.authorization.value = "10001";
      return payload;
    });
    const fetcher = mockFetch();
    await expect(x402Fetch(url, {}, config)).rejects.toThrow(
      /authorization|amount/i,
    );
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("rejects signed redirects and non-success resource outcomes", async () => {
    const { config, verify } = fixture();
    mockFetch(quote(), new Response("", { status: 302 }));
    await expect(x402Fetch(url, {}, config)).rejects.toThrow(
      /redirect|resource/i,
    );
    expect(verify).not.toHaveBeenCalled();
  });
  it("rejects caller-supplied payment headers and nonreplayable operations", async () => {
    const { config, authorize } = fixture();
    const fetcher = mockFetch();
    await expect(
      x402Fetch(
        url,
        { headers: { "payment-signature": "already-signed" } },
        config,
      ),
    ).rejects.toThrow(/header/i);
    await expect(
      x402Fetch(url, { method: "POST", body: "data" }, config),
    ).rejects.toThrow(/GET|method/i);
    expect(fetcher).not.toHaveBeenCalled();
    expect(authorize).not.toHaveBeenCalled();
  });
  it("requires settlement header from resource before asking external verification", async () => {
    const { config, verify } = fixture();
    mockFetch(quote(), new Response("paid"));
    await expect(x402Fetch(url, {}, config)).rejects.toThrow(/settlement/i);
    expect(verify).not.toHaveBeenCalled();
  });
  it("preserves pending network submission when resource reports settlement_pending", async () => {
    const { config } = fixture();
    mockFetch(
      quote(),
      new Response("", {
        status: 402,
        headers: {
          "payment-response": encode({
            success: false,
            errorReason: "settlement_pending",
            transaction,
            network: "eip155:84532",
          }),
        },
      }),
    );
    await expect(x402Fetch(url, {}, config)).rejects.toMatchObject({
      status: "pending",
      success: false,
      txHash: transaction,
    });
  });
  it("bounds stuck approval and cancels operation before signing", async () => {
    const { config, authorize } = fixture({
      timeoutMs: 10,
      onPaymentRequired: () => new Promise(() => {}),
    });
    mockFetch();
    await expect(x402Fetch(url, {}, config)).rejects.toThrow(/timeout|abort/i);
    expect(authorize).not.toHaveBeenCalled();
  });
});

describe("ambiguous post-submission outcomes and immutable configuration", () => {
  it("reports an uncertain submitted retry as pending instead of losing payment state", async () => {
    const { config } = fixture();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(quote())
        .mockRejectedValueOnce(new Error("network disconnected")),
    );
    await expect(x402Fetch(url, {}, config)).rejects.toMatchObject({
      status: "pending",
      success: false,
    });
  });
  it("reports verifier failure as pending without leaking error data", async () => {
    const { config } = fixture({
      verificationProvider: async () => {
        throw new Error("secret RPC auth token");
      },
    });
    mockFetch();
    await expect(x402Fetch(url, {}, config)).rejects.toMatchObject({
      status: "pending",
      success: false,
      txHash: transaction,
    });
  });
  it("supports wallet adapters with class methods", async () => {
    const { config, authorize } = fixture();
    class Wallet {
      protocol = "x402-v2-exact";
      async getWalletContext() {
        return { account: payer, network: "eip155:84532" };
      }
      authorize = authorize;
    }
    (config as any).adapter = new Wallet();
    mockFetch();
    expect(await (await x402Fetch(url, {}, config)).text()).toBe(
      "paid content",
    );
  });
  it("does not report failed settlement when the settled observer throws", async () => {
    const { config } = fixture({
      onPaymentSettled: () => {
        throw new Error("observer error");
      },
    });
    mockFetch();
    expect(await (await x402Fetch(url, {}, config)).text()).toBe(
      "paid content",
    );
  });
  it("freezes reviewed intent so callbacks cannot change amount or recipient", async () => {
    const { config, authorize } = fixture({
      onPaymentRequired: (details: any) => {
        try {
          details.requirements.amount = "1";
          details.payTo = payer;
        } catch {}
        return true;
      },
    });
    mockFetch();
    await x402Fetch(url, {}, config);
    expect(authorize.mock.calls[0][0]).toMatchObject({
      amountAtomic: "10000",
      payTo,
      requirements: { amount: "10000" },
    });
  });
  it("rejects true-like approval before wallet authorization", async () => {
    const { config, authorize } = fixture({ onPaymentRequired: () => "true" });
    mockFetch();
    await expect(x402Fetch(url, {}, config)).rejects.toThrow(/reject/i);
    expect(authorize).not.toHaveBeenCalled();
  });
  it("manual token cap handles trailing fractional zero format deliberately", async () => {
    const { config } = fixture();
    await expect(
      createPaymentTool(config).handler({
        url,
        paymentHeader: encode(required()),
        maxAmount: "0.010",
      }),
    ).rejects.toThrow(/canonical/i);
  });
});

describe("authorization replay and cancellation after submission", () => {
  it("does not resend the same signed nonce when caller repeats payment", async () => {
    const { config } = fixture();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(quote())
      .mockResolvedValueOnce(settled())
      .mockResolvedValueOnce(quote())
      .mockResolvedValueOnce(settled());
    vi.stubGlobal("fetch", fetcher);
    await x402Fetch(url, {}, config);
    await expect(x402Fetch(url, {}, config)).rejects.toThrow(/replay|nonce/i);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("reports timeout after signed submission as pending", async () => {
    const { config } = fixture({ timeoutMs: 15 });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(quote())
        .mockImplementationOnce(() => new Promise(() => {})),
    );
    await expect(x402Fetch(url, {}, config)).rejects.toMatchObject({
      status: "pending",
      success: false,
    });
  });
  it("provides AbortSignal to the original middleware handler", async () => {
    const { config } = fixture();
    const controller = new AbortController();
    const handler = vi.fn(async () => "value");
    const wrapped = x402Middleware(config)(handler);
    expect(await wrapped({}, { signal: controller.signal })).toBe("value");
    expect(handler.mock.calls[0][1]).toEqual({ signal: controller.signal });
  });
  it("middleware executes payment only for the quoted resource and current header", async () => {
    const { config } = fixture();
    mockFetch();
    const wrapped = x402Middleware(config)(async () => {
      throw Object.assign(new Error("pay"), {
        status: 402,
        headers: { "payment-required": encode(required()) },
      });
    });
    expect(await wrapped({})).toMatchObject({
      success: true,
      status: "verified",
      txHash: transaction,
    });
  });
});

describe("registered payment execution lifetime", () => {
  it("accepts strict core input snapshots through a registered kit tool", async () => {
    const { createKit } = await import("../core.js");
    const kit = createKit();
    const { config } = fixture();
    mockFetch();
    kit.register(createPaymentTool(config));
    const result = await kit.invoke("x402-pay", {
      url,
      paymentHeader: encode(required()),
      maxAmount: "0.01",
    });
    expect(result).toMatchObject({
      success: true,
      status: "verified",
      txHash: transaction,
    });
    kit.unregisterAll();
  });
  it("quarantines the adapter until timed-out wallet signing actually quiesces", async () => {
    const { createKit } = await import("../core.js");
    const kit = createKit({ execution: { maxConcurrent: 1, timeoutMs: 1000 } });
    const { config, authorize } = fixture({ timeoutMs: 20 });
    authorize.mockImplementation(() => new Promise(() => {}));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => Promise.resolve(quote())),
    );
    kit.register(createPaymentTool(config));
    await expect(
      kit.invoke("x402-pay", { url, paymentHeader: encode(required()) }),
    ).rejects.toThrow(/timeout/i);
    await expect(
      kit.invoke("x402-pay", { url, paymentHeader: encode(required()) }),
    ).rejects.toThrow(/busy|quarantin|unfinished/i);
    expect(authorize).toHaveBeenCalledOnce();
    kit.unregisterAll();
  });
});

describe("post-submission uncertainty is never failed without authoritative verification", () => {
  it.each([
    () => new Response("", { status: 500 }),
    () => new Response("content"),
    () =>
      new Response("", {
        headers: {
          "payment-response": encode({
            success: false,
            transaction,
            network: "eip155:84532",
            errorReason: "server_claim",
          }),
        },
      }),
  ])(
    "preserves uncertain signed submission for malformed/unsuccessful resource response %#",
    async (response) => {
      const { config } = fixture();
      mockFetch(quote(), response());
      await expect(x402Fetch(url, {}, config)).rejects.toMatchObject({
        success: false,
        status: "pending",
      });
    },
  );
  it("keeps invalid externally supplied evidence pending rather than claiming no payment", async () => {
    const { config } = fixture({
      verificationProvider: async () => ({
        status: "verified",
        transaction: "wrong",
      }),
    });
    mockFetch();
    await expect(x402Fetch(url, {}, config)).rejects.toMatchObject({
      success: false,
      status: "pending",
      txHash: transaction,
    });
  });
});

describe("reconciliation and adapter failures", () => {
  it("attaches immutable payment intent to uncertain submitted outcomes", async () => {
    const { config } = fixture();
    mockFetch(quote(), new Response("", { status: 500 }));
    await expect(x402Fetch(url, {}, config)).rejects.toMatchObject({
      status: "pending",
      paymentDetails: { resource: url, amountAtomic: "10000", payTo, asset },
    });
  });
  it("redacts wallet signer errors before financial submission", async () => {
    const { config, authorize } = fixture();
    authorize.mockRejectedValue(
      new Error("wallet-signature secret credential"),
    );
    const fetcher = mockFetch();
    await expect(x402Fetch(url, {}, config)).rejects.toMatchObject({
      status: "failed",
      message: "Wallet authorization failed or rejected",
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("releases quarantine only once cancelled signing actually finishes", async () => {
    const { config, authorize } = fixture({ timeoutMs: 15 });
    let release!: (value: any) => void;
    const original = authorize.getMockImplementation()!;
    authorize.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(quote()));
    vi.stubGlobal("fetch", fetcher);
    await expect(x402Fetch(url, {}, config)).rejects.toThrow(/timeout/i);
    await expect(x402Fetch(url, {}, config)).rejects.toThrow(/busy|quarantin/i);
    release(await original(parseX402Header(encode(required()))));
    await new Promise((resolve) => setTimeout(resolve, 0));
    fetcher
      .mockReset()
      .mockResolvedValueOnce(quote())
      .mockResolvedValueOnce(settled());
    expect(await (await x402Fetch(url, {}, config)).text()).toBe(
      "paid content",
    );
    expect(authorize).toHaveBeenCalledTimes(2);
  });
});

describe("strict v2 string wire fields", () => {
  it.each(["validAfter", "validBefore"])(
    "rejects numeric authorization %s before serializing or retrying",
    async (field) => {
      const { config, authorize } = fixture();
      const original = authorize.getMockImplementation()!;
      authorize.mockImplementation(async (details: any) => {
        const payload = await original(details);
        (payload.payload.authorization as any)[field] = Number(
          (payload.payload.authorization as any)[field],
        );
        return payload;
      });
      const fetcher = mockFetch();
      await expect(x402Fetch(url, {}, config)).rejects.toThrow(
        /authorization.*validity/i,
      );
      expect(fetcher).toHaveBeenCalledOnce();
    },
  );
  it.each(["asset", "payTo"])(
    "rejects array-coerced requirement %s",
    (field) => {
      expect(
        parseX402Header(
          encode(required({ [field]: [field === "asset" ? asset : payTo] })),
        ),
      ).toBeNull();
    },
  );
  it.each(["from", "nonce"])(
    "rejects array-coerced authorization %s at public serialization boundary",
    async (field) => {
      const { authorize } = fixture();
      const details = parseX402Header(encode(required()))!;
      const payload = await authorize(details);
      (payload.payload.authorization as any)[field] = [
        (payload.payload.authorization as any)[field],
      ];
      expect(() => createX402PaymentPayload(details, payload as any)).toThrow(
        /authorization/i,
      );
    },
  );
});

describe("string-only wallet and settlement context", () => {
  it("rejects array-coerced route asset at configuration", () => {
    const { config } = fixture({
      routes: [
        {
          network: "eip155:84532",
          asset: [asset],
          payTo,
          decimals: 6,
          maxAmountAtomic: "10000",
        },
      ],
    });
    expect(() => createPaymentTool(config)).toThrow(/route/i);
  });
  it("rejects array-coerced wallet account before requesting approval", async () => {
    const { config, approve } = fixture();
    (config as any).adapter.getWalletContext = async () => ({
      account: [payer],
      network: "eip155:84532",
    });
    mockFetch();
    await expect(x402Fetch(url, {}, config)).rejects.toThrow(/wallet|account/i);
    expect(approve).not.toHaveBeenCalled();
  });
  it("keeps a malformed array-coerced settlement payer pending with a stable error", async () => {
    const { config, verify } = fixture();
    mockFetch(
      quote(),
      new Response("", {
        headers: {
          "payment-response": encode({
            success: true,
            transaction,
            network: "eip155:84532",
            payer: [payer],
          }),
        },
      }),
    );
    await expect(x402Fetch(url, {}, config)).rejects.toMatchObject({
      status: "pending",
      message: expect.stringMatching(/invalid successful settlement evidence/i),
    });
    expect(verify).not.toHaveBeenCalled();
  });
});
