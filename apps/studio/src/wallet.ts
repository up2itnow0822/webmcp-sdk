import {
  parseAbi,
  encodeFunctionData,
  decodeFunctionResult,
  decodeEventLog,
  toHex,
} from "viem";
import {
  WalletActionError,
  address,
  bounded,
  ROUTER,
  TOKENS,
  type Address,
  type Asset,
  type Context,
  type Gateway,
  type Intent,
  type Review,
  type Tx,
} from "./domain";
export interface Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
}
export const erc20ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function transfer(address,uint256) returns (bool)",
  "event Transfer(address indexed from,address indexed to,uint256 value)",
  "event Approval(address indexed owner,address indexed spender,uint256 value)",
]);
export const routerABI = parseAbi([
  "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountOut)",
  "function multicall(uint256 deadline,bytes[] data) payable returns (bytes[] results)",
]);
export const quoterABI = parseAbi([
  "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96) params) returns (uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)",
]);
export const QUOTER: Address = "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a";
export const POOL_FEE = 500;
export function transactionFor(
  i: Intent,
  step: Review["step"],
): Pick<Tx, "to" | "data" | "value"> {
  if (step === "approval") {
    if (i.asset === "ETH" || i.kind !== "swap")
      throw Error("Approval unsupported.");
    return {
      to: TOKENS[i.asset],
      data: encodeFunctionData({
        abi: erc20ABI,
        functionName: "approve",
        args: [ROUTER, i.amount],
      }),
      value: 0n,
    };
  }
  if (i.kind === "transfer")
    return i.asset === "ETH"
      ? { to: i.recipient, data: "0x", value: i.amount }
      : {
          to: TOKENS[i.asset],
          data: encodeFunctionData({
            abi: erc20ABI,
            functionName: "transfer",
            args: [i.recipient, i.amount],
          }),
          value: 0n,
        };
  if (i.asset === "ETH" || !i.output || !i.minimum)
    throw Error("Unsupported swap.");
  const data = encodeFunctionData({
    abi: routerABI,
    functionName: "exactInputSingle",
    args: [
      {
        tokenIn: TOKENS[i.asset],
        tokenOut: TOKENS[i.output],
        fee: POOL_FEE,
        recipient: i.account,
        amountIn: i.amount,
        amountOutMinimum: i.minimum,
        sqrtPriceLimitX96: 0n,
      },
    ],
  });
  return {
    to: ROUTER,
    data: encodeFunctionData({
      abi: routerABI,
      functionName: "multicall",
      args: [BigInt(Math.floor(i.expires / 1000)), [data]],
    }),
    value: 0n,
  };
}
const eq = (a: unknown, b: string) =>
  typeof a === "string" && a.toLowerCase() === b.toLowerCase();
function hex(value: unknown): Address {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]*$/.test(value))
    throw Error("Invalid RPC hexadecimal response.");
  return value as Address;
}
function quantity(value: unknown) {
  const h = hex(value);
  if (h === "0x") throw Error("Invalid RPC quantity.");
  return BigInt(h);
}
function rpcTx(i: Intent, t: Pick<Tx, "to" | "data" | "value"> & Partial<Tx>) {
  return {
    from: i.account,
    to: t.to,
    data: t.data,
    value: toHex(t.value),
    ...(t.gas ? { gas: toHex(t.gas), gasPrice: toHex(t.maxFeePerGas!) } : {}),
  };
}
const signingProviders = new WeakSet<Provider>();
export class WalletGateway implements Gateway {
  constructor(readonly provider: Provider) {}
  private request(method: string, params?: unknown[]) {
    return method === "eth_sendTransaction"
      ? this.provider.request({ method, params })
      : bounded(
          this.provider.request({ method, params }),
          method === "eth_requestAccounts" ? 60000 : 20000,
        );
  }
  async connect() {
    await this.request("eth_requestAccounts");
    return this.context();
  }
  async context(): Promise<Context> {
    const accounts = await this.request("eth_accounts"),
      chain = quantity(await this.request("eth_chainId"));
    if (!Array.isArray(accounts) || !accounts.length)
      throw Error("Connect an external wallet to continue.");
    return { account: address(accounts[0]), chain: Number(chain) };
  }
  private async check(i: Intent) {
    const c = await this.context();
    if (c.chain !== 8453 || !eq(c.account, i.account))
      throw Error("Wallet account or network changed.");
    if (Date.now() >= i.expires) throw Error("Proposal expired.");
  }
  async balances(account: Address): Promise<Record<Asset, bigint>> {
    const [ETH, USDC, WETH] = await Promise.all([
      this.request("eth_getBalance", [account, "latest"]).then(quantity),
      ...(["USDC", "WETH"] as const).map(async (asset) =>
        decodeFunctionResult({
          abi: erc20ABI,
          functionName: "balanceOf",
          data: hex(
            await this.request("eth_call", [
              {
                to: TOKENS[asset],
                data: encodeFunctionData({
                  abi: erc20ABI,
                  functionName: "balanceOf",
                  args: [account],
                }),
              },
              "latest",
            ]),
          ),
        }),
      ),
    ]);
    return { ETH, USDC, WETH };
  }
  async quote(asset: "USDC" | "WETH", amount: bigint) {
    const data = encodeFunctionData({
      abi: quoterABI,
      functionName: "quoteExactInputSingle",
      args: [
        {
          tokenIn: TOKENS[asset],
          tokenOut: TOKENS[asset === "USDC" ? "WETH" : "USDC"],
          amountIn: amount,
          fee: POOL_FEE,
          sqrtPriceLimitX96: 0n,
        },
      ],
    });
    return decodeFunctionResult({
      abi: quoterABI,
      functionName: "quoteExactInputSingle",
      data: hex(
        await this.request("eth_call", [{ to: QUOTER, data }, "latest"]),
      ),
    })[0];
  }
  async allowance(i: Intent) {
    if (i.asset === "ETH") return 0n;
    return decodeFunctionResult({
      abi: erc20ABI,
      functionName: "allowance",
      data: hex(
        await this.request("eth_call", [
          {
            to: TOKENS[i.asset],
            data: encodeFunctionData({
              abi: erc20ABI,
              functionName: "allowance",
              args: [i.account, ROUTER],
            }),
          },
          "latest",
        ]),
      ),
    });
  }
  private async simulate(i: Intent, t: Pick<Tx, "to" | "data" | "value">) {
    const result = hex(await this.request("eth_call", [rpcTx(i, t), "latest"]));
    if (i.asset !== "ETH" && !eq(t.to, ROUTER)) {
      const ok = decodeFunctionResult({
        abi: erc20ABI,
        functionName: t.data.startsWith("0x095ea7b3") ? "approve" : "transfer",
        data: result,
      });
      if (ok !== true) throw Error("Token simulation returned false.");
    }
  }
  async prepare(i: Intent, step: Review["step"]): Promise<Tx> {
    const tx = transactionFor(i, step);
    await this.simulate(i, tx);
    const gas =
      (quantity(await this.request("eth_estimateGas", [rpcTx(i, tx)])) * 120n) /
      100n;
    const price = quantity(await this.request("eth_gasPrice"));
    if (gas <= 0n || price <= 0n) throw Error("Invalid fee estimate.");
    return { ...tx, gas, maxFeePerGas: price, maxPriorityFeePerGas: 0n };
  }
  async send(i: Intent, tx: Tx, guard?: () => Promise<void>): Promise<Address> {
    try {
      await this.check(i);
      await this.simulate(i, tx);
      await this.check(i);
      await guard?.();
    } catch (e) {
      throw new WalletActionError(
        e instanceof Error ? e.message : "Preflight failed.",
        "preflight",
      );
    }
    if (signingProviders.has(this.provider))
      throw new WalletActionError(
        "A wallet authorization is still pending. Resolve it before another transaction.",
        "preflight",
      );
    signingProviders.add(this.provider);
    try {
      const hash = hex(
        await this.request("eth_sendTransaction", [
          { ...rpcTx(i, tx), chainId: toHex(i.chain) },
        ]),
      );
      if (hash.length !== 66)
        throw Error("Wallet returned an invalid transaction hash.");
      return hash;
    } catch (e) {
      throw new WalletActionError(
        e instanceof Error ? e.message : "Wallet outcome unknown.",
        typeof e === "object" && e !== null && "code" in e && e.code === 4001
          ? "rejected"
          : "unknown",
      );
    } finally {
      signingProviders.delete(this.provider);
    }
  }
  async verify(
    i: Intent,
    r: Review,
    hash: Address,
  ): Promise<"confirmed" | "reverted" | "unknown"> {
    if (quantity(await this.request("eth_chainId")) !== 8453n)
      throw Error("Switch back to Base to check this receipt.");
    const receipt = (await this.request("eth_getTransactionReceipt", [
      hash,
    ])) as null | Record<string, unknown>;
    if (!receipt) return "unknown";
    if (
      !eq(receipt.transactionHash, hash) ||
      !eq(receipt.from, i.account) ||
      !eq(receipt.to, r.tx.to)
    )
      return "unknown";
    const tx = (await this.request("eth_getTransactionByHash", [
      hash,
    ])) as Record<string, unknown> | null;
    if (
      !tx ||
      !eq(tx.hash, hash) ||
      !eq(tx.from, i.account) ||
      !eq(tx.to, r.tx.to) ||
      !eq(tx.input, r.tx.data) ||
      quantity(tx.value) !== r.tx.value ||
      quantity(tx.gas) > r.tx.gas ||
      quantity(tx.gasPrice) > r.tx.maxFeePerGas
    )
      return "unknown";
    if (tx.chainId !== undefined && quantity(tx.chainId) !== 8453n)
      return "unknown";
    if (
      quantity(await this.request("eth_blockNumber")) <
      quantity(receipt.blockNumber)
    )
      return "unknown";
    if (receipt.status === "0x0") return "reverted";
    if (receipt.status !== "0x1") return "unknown";
    if (i.asset === "ETH")
      return r.step === "execute" && i.kind === "transfer"
        ? "confirmed"
        : "unknown";
    const logs = Array.isArray(receipt.logs) ? receipt.logs : [];
    let input = 0n,
      output = 0n,
      approved = false;
    for (const log of logs) {
      try {
        const event = decodeEventLog({
          abi: erc20ABI,
          data: log.data,
          topics: log.topics,
        });
        if (
          event.eventName === "Approval" &&
          eq(log.address, TOKENS[i.asset]) &&
          eq(event.args.owner, i.account) &&
          eq(event.args.spender, ROUTER) &&
          event.args.value === i.amount
        )
          approved = true;
        if (event.eventName === "Transfer") {
          if (
            eq(log.address, TOKENS[i.asset]) &&
            eq(event.args.from, i.account) &&
            (i.kind === "swap" || eq(event.args.to, i.recipient))
          )
            input += event.args.value;
          if (
            i.output &&
            eq(log.address, TOKENS[i.output]) &&
            eq(event.args.to, i.account)
          )
            output += event.args.value;
        }
      } catch {
        /* unrelated or malformed event cannot establish settlement */
      }
    }
    if (r.step === "approval")
      return approved && (await this.allowance(i)) === i.amount
        ? "confirmed"
        : "unknown";
    return input === i.amount && (i.kind === "transfer" || output >= i.minimum!)
      ? "confirmed"
      : "unknown";
  }
}
