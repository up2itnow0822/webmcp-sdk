import {
  PRACTICE_ACCOUNT,
  type Gateway,
  type Asset,
  type Address,
  type Intent,
  type Review,
  type Tx,
} from "./domain";
import { transactionFor } from "./wallet";
/** Invented educational rate. Never used in live mode. */
export class PracticeGateway implements Gateway {
  private funds: Record<Asset, bigint> = {
    ETH: 2n * 10n ** 18n,
    USDC: 2500n * 10n ** 6n,
    WETH: 10n ** 18n,
  };
  private allowed = 0n;
  private serial = 0;
  async context() {
    return { account: PRACTICE_ACCOUNT, chain: 8453 };
  }
  async balances() {
    return { ...this.funds };
  }
  async quote(asset: "USDC" | "WETH", amount: bigint) {
    return asset === "USDC"
      ? (amount * 10n ** 12n) / 2500n
      : (amount * 2500n) / 10n ** 12n;
  }
  async allowance() {
    return this.allowed;
  }
  async prepare(i: Intent, step: Review["step"]): Promise<Tx> {
    if (this.funds[i.asset] < i.amount)
      throw Error("Insufficient practice balance.");
    return {
      ...transactionFor(i, step),
      gas: step === "approval" ? 50000n : i.kind === "swap" ? 220000n : 65000n,
      maxFeePerGas: 1000000n,
      maxPriorityFeePerGas: 0n,
    };
  }
  async send(
    _i: Intent,
    _tx: Tx,
    guard?: () => Promise<void>,
  ): Promise<Address> {
    await guard?.();
    return `0x${(++this.serial).toString(16).padStart(64, "0")}`;
  }
  async verify(i: Intent, r: Review) {
    if (r.step === "approval") {
      this.allowed = i.amount;
      return "confirmed" as const;
    }
    this.funds[i.asset] -= i.amount;
    if (i.output) {
      this.funds[i.output] += i.quote!;
      this.allowed = 0n;
    }
    return "confirmed" as const;
  }
}
