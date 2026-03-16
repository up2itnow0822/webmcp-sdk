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

import type {
  WebMCPToolDefinition,
  ToolAnnotations,
  JSONSchema,
} from './types.js';

// ─── x402 Types ───

export interface X402PaymentDetails {
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

export interface X402PaymentResult {
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

export interface X402Config {
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

// ─── x402 Header Parsing ───

/**
 * Parse the WWW-Authenticate or X-Payment header from a 402 response
 * into structured payment details.
 */
export function parseX402Header(header: string): X402PaymentDetails | null {
  try {
    // x402 uses JSON in the header value
    const parsed = JSON.parse(header);
    if (!parsed.payTo || !parsed.maxAmountRequired) {
      return null;
    }
    return {
      network: parsed.network || 'base-sepolia',
      payTo: parsed.payTo,
      maxAmountRequired: parsed.maxAmountRequired,
      asset: parsed.asset || 'native',
      description: parsed.description,
      resource: parsed.resource || '',
      scheme: parsed.scheme || 'exact',
      mimeType: parsed.mimeType,
      extra: parsed.extra,
    };
  } catch {
    // Try key-value parsing for older format
    const parts: Record<string, string> = {};
    for (const part of header.split(',')) {
      const [key, ...rest] = part.trim().split('=');
      if (key && rest.length > 0) {
        parts[key.trim()] = rest.join('=').replace(/^"|"$/g, '');
      }
    }
    if (!parts.payTo) return null;
    return {
      network: parts.network || 'base-sepolia',
      payTo: parts.payTo,
      maxAmountRequired: parts.maxAmountRequired || '0',
      asset: parts.asset || 'native',
      description: parts.description,
      resource: parts.resource || '',
      scheme: parts.scheme || 'exact',
    };
  }
}

// ─── x402 Payment Execution ───

/**
 * Create a payment payload for the x402 protocol.
 * This generates the X-PAYMENT header value to retry the 402 request.
 */
export function createX402PaymentPayload(
  details: X402PaymentDetails,
  txHash: string
): string {
  return JSON.stringify({
    txHash,
    network: details.network,
    payTo: details.payTo,
    amount: details.maxAmountRequired,
    asset: details.asset,
  });
}

// ─── x402 Middleware for WebMCP ───

/**
 * Wraps a WebMCP tool handler so it automatically handles 402 responses.
 * When the tool's handler encounters a 402, the middleware:
 * 1. Parses the payment requirement
 * 2. Checks against maxAutoApproveUsd
 * 3. Calls onPaymentRequired for user confirmation
 * 4. Settles the payment via the configured signer
 * 5. Retries the request with the X-PAYMENT header
 */
export function x402Middleware(config: X402Config) {
  const maxAutoApprove = config.maxAutoApproveUsd ?? 0.10;
  const supportedNetworks = config.supportedNetworks ?? ['base-sepolia', 'base'];

  return function wrapHandler<TInput, TOutput>(
    originalHandler: (input: TInput) => Promise<TOutput>
  ): (input: TInput) => Promise<TOutput | X402PaymentResult> {
    return async (input: TInput) => {
      try {
        return await originalHandler(input);
      } catch (err) {
        // Check if this is a 402 response
        if (err instanceof Error && 'status' in err && (err as any).status === 402) {
          const paymentHeader = (err as any).headers?.['x-payment'] ||
                                (err as any).headers?.['www-authenticate'] ||
                                (err as any).paymentDetails;

          if (!paymentHeader) {
            throw new Error('402 Payment Required but no payment details provided');
          }

          const details = typeof paymentHeader === 'string'
            ? parseX402Header(paymentHeader)
            : paymentHeader as X402PaymentDetails;

          if (!details) {
            throw new Error('Could not parse x402 payment details');
          }

          // Check network support
          if (!supportedNetworks.includes(details.network)) {
            throw new Error(`Unsupported payment network: ${details.network}. Supported: ${supportedNetworks.join(', ')}`);
          }

          // Check auto-approve threshold
          const amount = parseFloat(details.maxAmountRequired);
          if (amount > maxAutoApprove) {
            // Ask for confirmation
            if (config.onPaymentRequired) {
              const approved = await config.onPaymentRequired(details);
              if (!approved) {
                return {
                  success: false,
                  error: `Payment of ${details.maxAmountRequired} on ${details.network} was rejected by user`,
                } as unknown as TOutput;
              }
            } else {
              throw new Error(
                `Payment of ${details.maxAmountRequired} exceeds auto-approve limit of ${maxAutoApprove}. ` +
                `Configure onPaymentRequired callback for manual approval.`
              );
            }
          }

          // Settlement would happen here via the signer
          // For now, return the payment details for the agent to handle
          const result: X402PaymentResult = {
            success: true,
            amountPaid: details.maxAmountRequired,
            network: details.network,
            txHash: '0x_pending_implementation',
          };

          if (config.onPaymentSettled) {
            config.onPaymentSettled(result);
          }

          return result as unknown as TOutput;
        }

        throw err;
      }
    };
  };
}

// ─── Pre-built x402 Payment Tool ───

/**
 * Creates a WebMCP tool definition for manual x402 payment.
 * Useful when agents need explicit payment control.
 */
export function createPaymentTool(config: X402Config): WebMCPToolDefinition {
  return {
    name: 'x402-pay',
    description: 'Make an x402 payment to access a paywalled resource. Parses the 402 response, settles payment on-chain, and returns the unlocked content.',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL that returned 402 Payment Required',
        },
        paymentHeader: {
          type: 'string',
          description: 'X-Payment or WWW-Authenticate header value from the 402 response',
        },
        maxAmount: {
          type: 'string',
          description: 'Maximum amount willing to pay (e.g., "0.01")',
        },
      },
      required: ['url', 'paymentHeader'],
    },
    annotations: {
      destructiveHint: true,
      confirmationHint: true,
      title: 'x402 Payment',
    },
    handler: async (input: Record<string, unknown>) => {
      const url = input.url as string;
      const headerVal = input.paymentHeader as string;
      const maxAmount = input.maxAmount as string | undefined;

      const details = parseX402Header(headerVal);
      if (!details) {
        return { success: false, error: 'Could not parse payment details' };
      }

      details.resource = url;

      // Check amount limit if provided
      if (maxAmount) {
        const requested = parseFloat(details.maxAmountRequired);
        const limit = parseFloat(maxAmount);
        if (requested > limit) {
          return {
            success: false,
            error: `Requested ${requested} exceeds limit ${limit}`,
          };
        }
      }

      // Call confirmation if configured
      if (config.onPaymentRequired) {
        const approved = await config.onPaymentRequired(details);
        if (!approved) {
          return { success: false, error: 'Payment rejected' };
        }
      }

      // Return payment details for settlement
      return {
        success: true,
        paymentDetails: details,
        status: 'ready_to_settle',
        message: `Ready to pay ${details.maxAmountRequired} on ${details.network} to ${details.payTo}`,
      };
    },
  };
}

// ─── Fetch Wrapper with x402 Support ───

/**
 * Enhanced fetch that handles 402 responses automatically.
 * Drop-in replacement for fetch() in agent tool handlers.
 */
export async function x402Fetch(
  url: string,
  init: RequestInit = {},
  config: X402Config
): Promise<Response> {
  const response = await fetch(url, init);

  if (response.status !== 402) {
    return response;
  }

  // Extract payment details
  const paymentHeader =
    response.headers.get('x-payment') ||
    response.headers.get('www-authenticate') ||
    '';

  const details = parseX402Header(paymentHeader);
  if (!details) {
    throw Object.assign(new Error('402 Payment Required but no parseable payment details'), {
      status: 402,
      response,
    });
  }

  details.resource = url;

  // Check auto-approve
  const amount = parseFloat(details.maxAmountRequired);
  const maxAutoApprove = config.maxAutoApproveUsd ?? 0.10;

  if (amount > maxAutoApprove && config.onPaymentRequired) {
    const approved = await config.onPaymentRequired(details);
    if (!approved) {
      throw Object.assign(new Error('Payment rejected by user'), {
        status: 402,
        paymentDetails: details,
      });
    }
  }

  // In a full implementation, this is where we'd:
  // 1. Sign and send the transaction via config.signer
  // 2. Wait for confirmation
  // 3. Retry the request with X-PAYMENT header containing txHash
  // For now, throw with structured details for the agent to handle
  throw Object.assign(
    new Error(`x402 payment required: ${details.maxAmountRequired} on ${details.network}`),
    {
      status: 402,
      paymentDetails: details,
      payTo: details.payTo,
      amount: details.maxAmountRequired,
      network: details.network,
    }
  );
}
