import { b as WebMCPToolDefinition } from './types-XNU26brb.mjs';

/**
 * WebMCP SDK - x402 Payment Integration
 *
 * Adds HTTP 402 (Payment Required) protocol support to WebMCP tools.
 * When a website returns 402, the agent can automatically negotiate
 * and settle payment using the x402 protocol (Coinbase standard).
 *
 * Usage:
 *   import { x402Middleware, createPaymentTool } from 'webmcp-sdk/x402';
 *
 * @see https://github.com/coinbase/x402
 */

interface X402PaymentDetails {
    /** Payment network (e.g., "base-sepolia", "base") */
    network: string;
    /** Recipient address */
    payTo: string;
    /** Amount in token units (e.g., "0.001") */
    maxAmountRequired: string;
    /** Token contract address or "native" for ETH */
    asset: string;
    /** Human-readable description of what the payment is for */
    description?: string;
    /** Payment resource URL */
    resource: string;
    /** Payment scheme version */
    scheme: string;
    /** MIME type of the x402 payment header */
    mimeType?: string;
    /** Extra fields from the server */
    extra?: Record<string, unknown>;
}
interface X402PaymentResult {
    /** Whether payment was successful */
    success: boolean;
    /** Transaction hash if payment was made */
    txHash?: string;
    /** The response body after payment */
    responseBody?: unknown;
    /** Error message if payment failed */
    error?: string;
    /** Amount paid */
    amountPaid?: string;
    /** Network used */
    network?: string;
}
interface X402Config {
    /** Agent wallet private key or signer function */
    signer: string | ((message: string) => Promise<string>);
    /** RPC URL for the payment network */
    rpcUrl?: string;
    /** Maximum payment amount the agent will auto-approve (in USD) */
    maxAutoApproveUsd?: number;
    /** Networks the agent supports for payment */
    supportedNetworks?: string[];
    /** Callback before payment is made (return false to reject) */
    onPaymentRequired?: (details: X402PaymentDetails) => Promise<boolean> | boolean;
    /** Callback after payment is settled */
    onPaymentSettled?: (result: X402PaymentResult) => void;
}
/**
 * Parse the WWW-Authenticate or X-Payment header from a 402 response
 * into structured payment details.
 */
declare function parseX402Header(header: string): X402PaymentDetails | null;
/**
 * Create a payment payload for the x402 protocol.
 * This generates the X-PAYMENT header value to retry the 402 request.
 */
declare function createX402PaymentPayload(details: X402PaymentDetails, txHash: string): string;
/**
 * Wraps a WebMCP tool handler so it automatically handles 402 responses.
 * When the tool's handler encounters a 402, the middleware:
 * 1. Parses the payment requirement
 * 2. Checks against maxAutoApproveUsd
 * 3. Calls onPaymentRequired for user confirmation
 * 4. Settles the payment via the configured signer
 * 5. Retries the request with the X-PAYMENT header
 */
declare function x402Middleware(config: X402Config): <TInput, TOutput>(originalHandler: (input: TInput) => Promise<TOutput>) => (input: TInput) => Promise<TOutput | X402PaymentResult>;
/**
 * Creates a WebMCP tool definition for manual x402 payment.
 * Useful when agents need explicit payment control.
 */
declare function createPaymentTool(config: X402Config): WebMCPToolDefinition;
/**
 * Enhanced fetch that handles 402 responses automatically.
 * Drop-in replacement for fetch() in agent tool handlers.
 */
declare function x402Fetch(url: string, init: RequestInit | undefined, config: X402Config): Promise<Response>;

export { type X402Config, type X402PaymentDetails, type X402PaymentResult, createPaymentTool, createX402PaymentPayload, parseX402Header, x402Fetch, x402Middleware };
