/** Test-only deterministic provider. Dynamically imported solely in Vite test mode. */
import {
  decodeFunctionData,
  encodeFunctionResult,
  encodeEventTopics,
  encodeAbiParameters,
  parseAbiParameters,
  toHex,
} from "viem";
import { PRACTICE_ACCOUNT, TOKENS, ROUTER, type Address } from "./domain";
import {
  erc20ABI,
  quoterABI,
  routerABI,
  QUOTER,
  type Provider,
} from "./wallet";
export class FixtureProvider implements Provider {
  account: Address = PRACTICE_ACCOUNT;
  chain = 8453;
  rejectNext = false;
  revertNext = false;
  failSimulation = false;
  pending = false;
  sent: Record<string, unknown>[] = [];
  private txs = new Map<string, Record<string, unknown>>();
  private allowances = 0n;
  private listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  on(e: string, fn: (...args: unknown[]) => void) {
    if (!this.listeners.has(e)) this.listeners.set(e, new Set());
    this.listeners.get(e)!.add(fn);
  }
  removeListener(e: string, fn: (...args: unknown[]) => void) {
    this.listeners.get(e)?.delete(fn);
  }
  changeAccount(a: Address) {
    this.account = a;
    for (const f of this.listeners.get("accountsChanged") ?? []) f([a]);
  }
  changeChain(chain: number) {
    this.chain = chain;
    for (const f of this.listeners.get("chainChanged") ?? []) f(toHex(chain));
  }
  async request({
    method,
    params = [],
  }: {
    method: string;
    params?: unknown[];
  }): Promise<unknown> {
    if (method === "eth_requestAccounts" || method === "eth_accounts")
      return [this.account];
    if (method === "eth_chainId") return toHex(this.chain);
    if (method === "eth_getBalance") return toHex(2n * 10n ** 18n);
    if (method === "eth_gasPrice") return "0xf4240";
    if (method === "eth_estimateGas") return "0x30d40";
    if (method === "eth_blockNumber") return "0x64";
    if (method === "eth_call") {
      if (this.failSimulation) throw Error("Fixture simulation failed");
      const tx = params[0] as { to: Address; data: Address };
      if (tx.to.toLowerCase() === QUOTER.toLowerCase()) {
        const d = decodeFunctionData({ abi: quoterABI, data: tx.data });
        const p = d.args[0];
        const out =
          p.tokenIn.toLowerCase() === TOKENS.USDC.toLowerCase()
            ? (p.amountIn * 10n ** 12n) / 2500n
            : (p.amountIn * 2500n) / 10n ** 12n;
        return encodeFunctionResult({
          abi: quoterABI,
          functionName: "quoteExactInputSingle",
          result: [out, 0n, 0, 150000n],
        });
      }
      if (tx.to.toLowerCase() === ROUTER.toLowerCase() || tx.data === "0x")
        return "0x";
      const d = decodeFunctionData({ abi: erc20ABI, data: tx.data });
      if (d.functionName === "balanceOf")
        return encodeFunctionResult({
          abi: erc20ABI,
          functionName: "balanceOf",
          result:
            tx.to.toLowerCase() === TOKENS.USDC.toLowerCase()
              ? 2500n * 10n ** 6n
              : 10n ** 18n,
        });
      if (d.functionName === "allowance")
        return encodeFunctionResult({
          abi: erc20ABI,
          functionName: "allowance",
          result: this.allowances,
        });
      return encodeFunctionResult({
        abi: erc20ABI,
        functionName: d.functionName,
        result: true,
      });
    }
    if (method === "eth_sendTransaction") {
      if (this.rejectNext) {
        this.rejectNext = false;
        throw Object.assign(Error("Fixture wallet rejected authorization."), {
          code: 4001,
        });
      }
      const tx = params[0] as Record<string, unknown>;
      if (tx.chainId !== toHex(this.chain)) {
        throw Object.assign(
          Error("Fixture send chain does not match the current wallet chain."),
          { code: 4901 },
        );
      }
      const hash = `0x${(this.sent.length + 1).toString(16).padStart(64, "0")}`;
      this.sent.push(tx);
      this.txs.set(hash, {
        ...tx,
        hash,
        input: tx.data,
        chainId: toHex(this.chain),
        reverted: this.revertNext,
      });
      this.revertNext = false;
      return hash;
    }
    if (method === "eth_getTransactionByHash")
      return this.txs.get(String(params[0])) ?? null;
    if (method === "eth_getTransactionReceipt") {
      if (this.pending) return null;
      const hash = String(params[0]),
        tx = this.txs.get(hash);
      if (!tx) return null;
      const logs: unknown[] = [];
      const log = (
        token: Address,
        event: "Transfer" | "Approval",
        args: Record<string, Address>,
        value: bigint,
      ) =>
        logs.push({
          address: token,
          topics: encodeEventTopics({ abi: erc20ABI, eventName: event, args }),
          data: encodeAbiParameters(parseAbiParameters("uint256"), [value]),
        });
      if (tx.data !== "0x") {
        if (String(tx.to).toLowerCase() === ROUTER.toLowerCase()) {
          const m = decodeFunctionData({
            abi: routerABI,
            data: tx.data as Address,
          });
          if (m.functionName === "multicall") {
            const inner = decodeFunctionData({
              abi: routerABI,
              data: m.args[1][0],
            });
            if (inner.functionName === "exactInputSingle") {
              const p = inner.args[0];
              log(
                p.tokenIn,
                "Transfer",
                { from: tx.from as Address, to: ROUTER },
                p.amountIn,
              );
              log(
                p.tokenOut,
                "Transfer",
                { from: ROUTER, to: p.recipient },
                p.amountOutMinimum,
              );
              this.allowances = 0n;
            }
          }
        } else {
          const d = decodeFunctionData({
            abi: erc20ABI,
            data: tx.data as Address,
          });
          if (d.functionName === "approve") {
            log(
              tx.to as Address,
              "Approval",
              { owner: tx.from as Address, spender: d.args[0] },
              d.args[1],
            );
            if (!tx.reverted) this.allowances = d.args[1];
          } else if (d.functionName === "transfer")
            log(
              tx.to as Address,
              "Transfer",
              { from: tx.from as Address, to: d.args[0] },
              d.args[1],
            );
        }
      }
      return {
        transactionHash: hash,
        from: tx.from,
        to: tx.to,
        status: tx.reverted ? "0x0" : "0x1",
        blockNumber: "0x64",
        logs,
      };
    }
    throw Error(`Unsupported fixture method: ${method}`);
  }
}
