export type Address = `0x${string}`;
export type Asset = "ETH" | "USDC" | "WETH";
export const DECIMALS = { ETH: 18, USDC: 6, WETH: 18 } as const;
export const ROUTER: Address = "0x2626664c2603336E57B271c5C0b26F421741e481";
export const TOKENS = {
  USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  WETH: "0x4200000000000000000000000000000000000006",
} as const;
export const PRACTICE_ACCOUNT: Address =
  "0x1111111111111111111111111111111111111111";
export type Context = { account: Address; chain: number };
export type Request = {
  kind: "transfer" | "swap";
  asset: Asset;
  amount: string;
  recipient?: string;
  slippageBps?: number;
};
export type Intent = Readonly<
  Context & {
    id: string;
    kind: "transfer" | "swap";
    asset: Asset;
    amount: bigint;
    recipient: Address;
    output?: "USDC" | "WETH";
    quote?: bigint;
    minimum?: bigint;
    slippageBps: number;
    expires: number;
    policyVersion: number;
  }
>;
export type Tx = Readonly<{
  to: Address;
  data: Address;
  value: bigint;
  gas: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}>;
export type Review = Readonly<{
  generation: number;
  step: "approval" | "execute";
  tx: Tx;
  feeCap: bigint;
}>;
export type Status =
  | "proposed"
  | "review"
  | "signing"
  | "pending"
  | "confirmed"
  | "failed"
  | "cancelled"
  | "expired"
  | "invalidated";
export type Proposal = {
  readonly id: string;
  readonly intent: Intent;
  status: Status;
  review?: Review;
  hash?: Address;
  error?: string;
  approvalHash?: Address;
};
export type Policy = {
  enabled: boolean;
  maxETH: string;
  maxUSDC: string;
  maxWETH: string;
};
export type Gateway = {
  context(): Promise<Context>;
  balances(account: Address): Promise<Record<Asset, bigint>>;
  quote(asset: "USDC" | "WETH", amount: bigint): Promise<bigint>;
  allowance(intent: Intent): Promise<bigint>;
  prepare(intent: Intent, step: Review["step"]): Promise<Tx>;
  send(intent: Intent, tx: Tx, guard?: () => Promise<void>): Promise<Address>;
  verify(
    intent: Intent,
    review: Review,
    hash: Address,
  ): Promise<"confirmed" | "reverted" | "unknown">;
};
export function parseAmount(value: string, decimals: number): bigint {
  if (
    typeof value !== "string" ||
    value.length > 80 ||
    !/^(0|[1-9]\d*)(\.\d+)?$/.test(value)
  )
    throw Error("Enter a positive decimal amount without spaces or exponents.");
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > decimals)
    throw Error(`This asset supports at most ${decimals} decimal places.`);
  const n =
    BigInt(whole) * 10n ** BigInt(decimals) +
    BigInt(fraction.padEnd(decimals, "0"));
  if (n <= 0n || n >= 2n ** 256n)
    throw Error("Amount is outside the supported range.");
  return n;
}
export function formatAmount(value: bigint, asset: Asset) {
  const s = value.toString().padStart(DECIMALS[asset] + 1, "0");
  return (
    `${s.slice(0, -DECIMALS[asset])}.${s.slice(-DECIMALS[asset])}`.replace(
      /\.?0+$/,
      "",
    ) || "0"
  );
}
export function address(value: unknown): Address {
  if (
    typeof value !== "string" ||
    !/^0x[a-fA-F0-9]{40}$/.test(value) ||
    /^0x0{40}$/i.test(value)
  )
    throw Error(
      "Enter a nonzero 0x wallet address (40 hexadecimal characters).",
    );
  return value as Address;
}
const same = (a: Context, b: Context) =>
  a.account.toLowerCase() === b.account.toLowerCase() && a.chain === b.chain;
export async function bounded<T>(promise: Promise<T>, ms = 20000): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              Error(
                "Request timed out. Check your wallet and activity before retrying.",
              ),
            ),
          ms,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer!);
  }
}
export class WalletActionError extends Error {
  constructor(
    message: string,
    readonly outcome: "preflight" | "rejected" | "unknown",
  ) {
    super(message);
  }
}
export class Studio {
  private proposals = new Map<string, Proposal>();
  private listeners = new Set<() => void>();
  private revision = 0;
  private serial = 0;
  private reviewSerial = 0;
  private busy = false;
  private signingLease = false;
  policy: Readonly<Policy> = Object.freeze({
    enabled: true,
    maxETH: "0.1",
    maxUSDC: "100",
    maxWETH: "0.1",
  });
  policyVersion = 1;
  context?: Context;
  balance?: Record<Asset, bigint>;
  constructor(
    readonly gateway: Gateway,
    private now = () => Date.now(),
    readonly practice = false,
  ) {}
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  snapshot = () => this.revision;
  private emit() {
    this.revision++;
    for (const fn of this.listeners) fn();
  }
  list() {
    return [...this.proposals.values()].reverse().map((p) => ({ ...p }));
  }
  get(id: string) {
    return { ...this.mutable(id) };
  }
  private mutable(id: string) {
    const p = this.proposals.get(id);
    if (!p) throw Error("Proposal not found.");
    return p;
  }
  async connect() {
    const c = await bounded(this.gateway.context());
    if (c.chain !== 8453)
      throw Error(
        "Select Base (chain 8453) in your wallet, then connect again.",
      );
    if (this.context && !same(c, this.context)) this.invalidate();
    this.context = Object.freeze(c);
    await this.refresh();
    this.emit();
  }
  async refresh() {
    if (this.context) {
      const c = this.context;
      const b = await bounded(this.gateway.balances(c.account));
      const next = await bounded(this.gateway.context());
      if (!same(c, next)) {
        this.invalidate();
        throw Error("Wallet changed. Reconnect to load balances.");
      }
      this.balance = Object.freeze(b);
      this.emit();
    }
  }
  invalidate() {
    for (const p of this.proposals.values())
      if (["proposed", "review"].includes(p.status)) {
        p.status = "invalidated";
        p.review = undefined;
      }
    this.context = undefined;
    this.balance = undefined;
    this.emit();
  }
  setPolicy(policy: Policy) {
    for (const asset of ["ETH", "USDC", "WETH"] as const)
      parseAmount(policy[`max${asset}`], DECIMALS[asset]);
    this.policy = Object.freeze({ ...policy });
    this.policyVersion++;
    for (const p of this.proposals.values())
      if (["proposed", "review"].includes(p.status)) p.status = "invalidated";
    this.emit();
  }
  tick() {
    let changed = false;
    for (const p of this.proposals.values())
      if (
        ["proposed", "review"].includes(p.status) &&
        this.now() >= p.intent.expires
      ) {
        p.status = "expired";
        p.review = undefined;
        changed = true;
      }
    if (changed) this.emit();
  }
  private validate(p: Proposal, allowed: Status[]) {
    if (this.now() >= p.intent.expires) {
      if (allowed.includes(p.status)) p.status = "expired";
      throw Error("Proposal expired. Create a new quote and review.");
    }
    if (!allowed.includes(p.status))
      throw Error(`Proposal is ${p.status}; it cannot execute.`);
    if (!this.policy.enabled || p.intent.policyVersion !== this.policyVersion)
      throw Error("Policy changed. Create a new proposal.");
    if (!this.context || !same(this.context, p.intent))
      throw Error("Wallet context changed. Reconnect and propose again.");
  }
  private async current(p: Proposal, allowed: Status[]) {
    this.validate(p, allowed);
    const c = await bounded(this.gateway.context());
    this.validate(p, allowed);
    if (!same(c, p.intent)) {
      this.invalidate();
      throw Error("Wallet account or network changed.");
    }
  }
  async propose(input: Request, signal?: AbortSignal): Promise<Proposal> {
    signal?.throwIfAborted();
    if (
      !input ||
      typeof input !== "object" ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(input)) ||
      Object.keys(input).some(
        (k) =>
          !["kind", "asset", "amount", "recipient", "slippageBps"].includes(k),
      )
    )
      throw Error("Unsupported proposal fields.");
    input = Object.freeze({ ...input });
    if (
      !["transfer", "swap"].includes(input.kind) ||
      !Object.hasOwn(DECIMALS, input.asset)
    )
      throw Error("Unsupported action or asset.");
    if (!this.policy.enabled)
      throw Error("New proposals are paused by your policy.");
    if (!this.context) throw Error("Connect your wallet first.");
    if (this.proposals.size >= 100)
      throw Error("Session proposal limit reached.");
    const c = { ...this.context },
      version = this.policyVersion;
    const amount = parseAmount(input.amount, DECIMALS[input.asset]);
    if (
      amount >
      parseAmount(this.policy[`max${input.asset}`], DECIMALS[input.asset])
    )
      throw Error("Amount exceeds your per-proposal policy limit.");
    const slip = input.slippageBps ?? 50;
    if (!Number.isInteger(slip) || slip < 0 || slip > 100)
      throw Error("Slippage must be between 0 and 1% (0–100 basis points).");
    if (input.kind === "swap" && input.asset === "ETH")
      throw Error("Swaps support USDC and WETH only.");
    if (input.kind === "swap" && input.recipient !== undefined)
      throw Error("Swap output always goes to the connected wallet.");
    const recipient =
      input.kind === "transfer" ? address(input.recipient) : c.account;
    const quote =
      input.kind === "swap"
        ? await bounded(
            this.gateway.quote(input.asset as "USDC" | "WETH", amount),
          )
        : undefined;
    if (quote !== undefined && quote <= 0n)
      throw Error("No usable liquidity or quote.");
    const minimum =
      quote === undefined ? undefined : (quote * BigInt(10000 - slip)) / 10000n;
    if (minimum === 0n) throw Error("Quoted output is too small.");
    const next = await bounded(this.gateway.context());
    if (
      !this.context ||
      !same(c, next) ||
      !same(c, this.context) ||
      version !== this.policyVersion
    ) {
      this.invalidate();
      throw Error("Wallet or policy changed while creating proposal.");
    }
    signal?.throwIfAborted();
    if (this.proposals.size >= 100)
      throw Error("Session proposal limit reached.");
    const id = `P-${++this.serial}`;
    const intent: Intent = Object.freeze({
      ...c,
      id,
      kind: input.kind,
      asset: input.asset,
      amount,
      recipient,
      output:
        input.kind === "swap"
          ? input.asset === "USDC"
            ? "WETH"
            : "USDC"
          : undefined,
      quote,
      minimum,
      slippageBps: slip,
      expires: this.now() + 120000,
      policyVersion: version,
    });
    const p: Proposal = { id, intent, status: "proposed" };
    this.proposals.set(id, p);
    this.emit();
    return { ...p };
  }
  cancel(id: string) {
    const p = this.mutable(id);
    this.validate(p, ["proposed", "review"]);
    p.status = "cancelled";
    p.review = undefined;
    this.emit();
  }
  async prepare(id: string): Promise<Review> {
    if (this.busy || this.signingLease)
      throw Error("Finish the current wallet action first.");
    const p = this.mutable(id);
    this.busy = true;
    try {
      await this.current(p, ["proposed", "review"]);
      p.review = undefined;
      const allowance =
        p.intent.kind === "swap"
          ? await bounded(this.gateway.allowance(p.intent))
          : p.intent.amount;
      await this.current(p, ["proposed", "review"]);
      const step = allowance < p.intent.amount ? "approval" : "execute";
      const tx = Object.freeze(
        await bounded(this.gateway.prepare(p.intent, step)),
      );
      await this.current(p, ["proposed", "review"]);
      const review = Object.freeze({
        generation: ++this.reviewSerial,
        step,
        tx,
        feeCap: tx.gas * tx.maxFeePerGas,
      });
      p.review = review;
      p.status = "review";
      this.emit();
      return review;
    } finally {
      this.busy = false;
    }
  }
  async execute(id: string) {
    if (this.busy || this.signingLease)
      throw Error("Finish the current wallet action first.");
    const p = this.mutable(id);
    this.validate(p, ["review"]);
    if (!p.review) throw Error("Review this proposal before authorizing.");
    this.busy = true;
    const review = p.review;
    try {
      await this.current(p, ["review"]);
      p.status = "signing";
      this.emit();
      this.signingLease = true;
      const sending = this.gateway
        .send(p.intent, review.tx, () => this.current(p, ["signing"]))
        .then((hash) => {
          p.hash = hash;
          if (p.status === "signing") p.status = "pending";
          this.emit();
          return hash;
        })
        .finally(() => {
          this.signingLease = false;
        });
      const hash = await bounded(sending, 60000);
      p.hash = hash;
      p.status = "pending";
      this.emit();
      const c = await bounded(this.gateway.context());
      if (!same(c, p.intent)) {
        p.error =
          "Wallet changed after submission. Track the transaction hash; do not resubmit.";
        this.invalidate();
        return;
      }
      const outcome = await bounded(
        this.gateway.verify(p.intent, review, hash),
        60000,
      );
      if (outcome === "reverted") {
        p.status = "failed";
        throw new WalletActionError(
          "Transaction reverted onchain.",
          "rejected",
        );
      }
      if (outcome !== "confirmed") {
        p.error =
          "Receipt evidence is incomplete. Keep tracking this hash; do not resubmit.";
        this.emit();
        return;
      }
      if (review.step === "approval") {
        p.approvalHash = hash;
        p.hash = undefined;
        p.review = undefined;
        p.status = "proposed";
        if (
          !this.context ||
          !same(this.context, p.intent) ||
          p.intent.policyVersion !== this.policyVersion
        )
          p.status = "invalidated";
        else if (this.now() >= p.intent.expires) p.status = "expired";
      } else p.status = "confirmed";
      this.emit();
      await this.refresh().catch(() => undefined);
    } catch (e) {
      p.error =
        e instanceof Error ? e.message : "Wallet action could not be verified.";
      if (p.status === "signing" || p.status === "pending") {
        if (
          e instanceof WalletActionError &&
          e.outcome !== "unknown" &&
          !p.hash
        )
          p.status = "failed";
        else p.status = "pending";
      } else if (p.status === "review") p.status = "failed";
      this.emit();
      throw e;
    } finally {
      this.busy = false;
    }
  }
  async checkReceipt(id: string) {
    const p = this.mutable(id);
    if (p.status !== "pending" || !p.hash || !p.review)
      throw Error(
        "No known pending hash. Check your wallet activity before any new action.",
      );
    try {
      const outcome = await bounded(
        this.gateway.verify(p.intent, p.review, p.hash),
        60000,
      );
      if (outcome === "reverted") {
        p.status = "failed";
        p.error = "Transaction reverted onchain.";
      } else if (outcome === "unknown") {
        p.error =
          "Receipt evidence is incomplete. Keep tracking this hash; do not resubmit.";
      } else if (p.review.step === "approval") {
        p.approvalHash = p.hash;
        p.hash = undefined;
        p.review = undefined;
        p.status = "invalidated";
        p.error =
          "Approval confirmed. Create a fresh proposal to review the trade.";
      } else {
        p.status = "confirmed";
        p.error = undefined;
      }
    } catch (e) {
      p.error = e instanceof Error ? e.message : "Unable to retrieve receipt.";
      throw e;
    } finally {
      this.emit();
    }
  }
}
