import { createKit } from "webmcp-sdk";
import { Studio, formatAmount, type Request, type Asset } from "./domain";
export function registerStudio(studio: Studio) {
  const kit = createKit({
    prefix: "studio",
    maxConcurrent: 2,
    maxQueued: 10,
    timeoutMs: 30000,
  });
  kit.register({
    name: "studio_state",
    description:
      "Read mode, balances, policy and proposal statuses. Cannot sign or execute transactions.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    handler: async () => ({
      mode: studio.practice ? "practice" : "live",
      network: "Base 8453",
      wallet: studio.context?.account ?? null,
      balances: studio.balance
        ? Object.fromEntries(
            Object.entries(studio.balance).map(([asset, n]) => [
              asset,
              formatAmount(n, asset as Asset),
            ]),
          )
        : null,
      policy: studio.policy,
      proposals: studio.list().map((p) => ({
        id: p.id,
        status: p.status,
        kind: p.intent.kind,
        asset: p.intent.asset,
        amount: formatAmount(p.intent.amount, p.intent.asset),
      })),
    }),
  });
  kit.register({
    name: "studio_propose",
    description:
      "Create a transfer or USDC/WETH swap proposal for human review only. No signing, approval or execution. Base only; max 1% slippage; 120-second expiry.",
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["transfer", "swap"] },
        asset: { type: "string", enum: ["ETH", "USDC", "WETH"] },
        amount: { type: "string", maxLength: 80 },
        recipient: { type: "string", maxLength: 42 },
        slippageBps: { type: "integer", minimum: 0, maximum: 100 },
      },
      required: ["kind", "asset", "amount"],
      additionalProperties: false,
    },
    handler: async (args, context) => {
      const p = await studio.propose(args as Request, context?.signal);
      return {
        id: p.id,
        status: p.status,
        message: "Awaiting human review in Studio. No transaction was signed.",
      };
    },
  });
  return kit;
}
