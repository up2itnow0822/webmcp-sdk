import { h as WebMCPToolDefinition } from './types-CFF4VVYT.mjs';

/** Strict x402 v2 exact EVM transport. Applications provide noncustodial wallet
 * authorization and independent chain verification; this SDK never holds keys.
 * https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md */

interface X402Requirements {
    scheme: "exact";
    network: string;
    amount: string;
    asset: string;
    payTo: string;
    maxTimeoutSeconds: number;
    extra?: Record<string, unknown>;
}
interface X402PaymentDetails {
    readonly x402Version: 2;
    readonly network: string;
    readonly payTo: string;
    /** Atomic token units, never USD or a human token decimal. */
    readonly maxAmountRequired: string;
    readonly amountAtomic: string;
    readonly amountUnit: "atomic";
    readonly asset: string;
    readonly resource: string;
    readonly scheme: "exact";
    readonly description?: string;
    readonly mimeType?: string;
    readonly extra?: Record<string, unknown>;
    readonly requirements: Readonly<X402Requirements>;
    /** Local quote deadline in epoch milliseconds, also enforced on authorization. */
    readonly expiresAt: number;
}
interface X402PaymentPayload {
    x402Version: 2;
    resource: {
        url: string;
    };
    accepted: X402Requirements;
    payload: {
        signature: string;
        authorization: {
            from: string;
            to: string;
            value: string;
            validAfter: string;
            validBefore: string;
            nonce: string;
        };
    };
}
interface X402WalletContext {
    account: string;
    network: string;
}
interface X402OperationContext {
    readonly signal: AbortSignal;
}
interface X402WalletAdapter {
    protocol: "x402-v2-exact";
    /** Read the live external wallet; do not cache disconnected or switched state. */
    getWalletContext(context: X402OperationContext): Promise<X402WalletContext>;
    /** Request wallet authorization only. Do not broadcast from this callback. */
    authorize(details: X402PaymentDetails, context: X402OperationContext): Promise<X402PaymentPayload>;
}
interface X402Route {
    network: string;
    asset: string;
    payTo: string;
    /** Application-verified asset decimals; only for manual token limits. */
    decimals: number;
    maxAmountAtomic: string;
}
interface X402Settlement {
    success: boolean;
    transaction: string;
    network: string;
    payer?: string;
    errorReason?: string;
}
type X402Verification = {
    status: "verified";
    transaction: string;
    network: string;
    asset: string;
    payTo: string;
    amountAtomic: string;
    resource: string;
    payer: string;
} | {
    status: "pending" | "failed";
};
interface X402PaymentResult {
    success: boolean;
    status: "verified" | "pending" | "failed";
    txHash?: string;
    /** Atomic token units. */
    amountPaid?: string;
    amountUnit?: "atomic";
    network?: string;
    responseBody?: unknown;
    error?: string;
}
interface X402Config {
    adapter: X402WalletAdapter;
    /** Independently verify receipt success/finality and exact transfer logs, chain,
     * token, recipient, payer, authorization nonce, amount and resource binding.
     * Neither a submitted hash nor a resource server header is sufficient. */
    verificationProvider(request: {
        details: X402PaymentDetails;
        paymentPayload: X402PaymentPayload;
        settlement: Readonly<X402Settlement>;
        response: Response;
        signal: AbortSignal;
    }): Promise<X402Verification>;
    supportedNetworks: readonly string[];
    allowedOrigins: readonly string[];
    routes: readonly X402Route[];
    /** Required for every payment, even below an optional USD cap. */
    onPaymentRequired(details: X402PaymentDetails, context: X402OperationContext): Promise<boolean> | boolean;
    /** Legacy name: additional USD cap only; never bypasses explicit approval. */
    maxAutoApproveUsd?: number | string;
    /** Exact positive USD decimal for this entire payment. No assumed peg. */
    valuationProvider?: (details: X402PaymentDetails, context: X402OperationContext) => Promise<string>;
    onPaymentSettled?: (result: Readonly<X402PaymentResult>) => void;
    /** Whole-operation deadline: default 30000, maximum 120000 milliseconds. */
    timeoutMs?: number;
}
declare class X402PaymentError extends Error {
    readonly status: "pending" | "failed";
    readonly txHash?: string | undefined;
    readonly paymentDetails?: X402PaymentDetails | undefined;
    readonly success = false;
    constructor(message: string, status?: "pending" | "failed", txHash?: string | undefined, paymentDetails?: X402PaymentDetails | undefined);
}
/** Current PAYMENT-REQUIRED Base64 JSON, one exact EVM offer; legacy and
 * ambiguous offers reject rather than inventing networks, units or resources. */
declare function parseX402Header(header: string): X402PaymentDetails | null;
/** Serialize an actual wallet authorization, never proof fabricated from a hash. */
declare function createX402PaymentPayload(details: X402PaymentDetails, authorization: X402PaymentPayload): string;
/** One signed GET retry. Paid responses return only after independent settlement
 * verification. Pending and failed outcomes throw X402PaymentError. */
declare function x402Fetch(url: string, init: RequestInit | undefined, config: X402Config): Promise<Response>;
/** An Error with status=402 must expose the v2 header and exact resource.
 * Refresh that GET quote before approval; forward execution cancellation. */
declare function x402Middleware(config: X402Config): <TInput, TOutput>(originalHandler: (input: TInput, context?: X402OperationContext) => Promise<TOutput> | TOutput) => (input: TInput, context?: X402OperationContext) => Promise<TOutput | X402PaymentResult>;
/** Executing payment tool: readiness is never reported as payment success. */
declare function createPaymentTool(config: X402Config): WebMCPToolDefinition;

export { type X402Config, type X402OperationContext, type X402PaymentDetails, X402PaymentError, type X402PaymentPayload, type X402PaymentResult, type X402Requirements, type X402Route, type X402Settlement, type X402Verification, type X402WalletAdapter, type X402WalletContext, createPaymentTool, createX402PaymentPayload, parseX402Header, x402Fetch, x402Middleware };
