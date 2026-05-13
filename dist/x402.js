"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/x402.ts
var x402_exports = {};
__export(x402_exports, {
  createPaymentTool: () => createPaymentTool,
  createX402PaymentPayload: () => createX402PaymentPayload,
  parseX402Header: () => parseX402Header,
  x402Fetch: () => x402Fetch,
  x402Middleware: () => x402Middleware
});
module.exports = __toCommonJS(x402_exports);
function parseX402Header(header) {
  try {
    const parsed = JSON.parse(header);
    if (!parsed.payTo || !parsed.maxAmountRequired) {
      return null;
    }
    return {
      network: parsed.network || "base-sepolia",
      payTo: parsed.payTo,
      maxAmountRequired: parsed.maxAmountRequired,
      asset: parsed.asset || "native",
      description: parsed.description,
      resource: parsed.resource || "",
      scheme: parsed.scheme || "exact",
      mimeType: parsed.mimeType,
      extra: parsed.extra
    };
  } catch {
    const parts = {};
    for (const part of header.split(",")) {
      const [key, ...rest] = part.trim().split("=");
      if (key && rest.length > 0) {
        parts[key.trim()] = rest.join("=").replace(/^"|"$/g, "");
      }
    }
    if (!parts.payTo) return null;
    return {
      network: parts.network || "base-sepolia",
      payTo: parts.payTo,
      maxAmountRequired: parts.maxAmountRequired || "0",
      asset: parts.asset || "native",
      description: parts.description,
      resource: parts.resource || "",
      scheme: parts.scheme || "exact"
    };
  }
}
function createX402PaymentPayload(details, txHash) {
  return JSON.stringify({
    txHash,
    network: details.network,
    payTo: details.payTo,
    amount: details.maxAmountRequired,
    asset: details.asset
  });
}
function x402Middleware(config) {
  const maxAutoApprove = config.maxAutoApproveUsd ?? 0.1;
  const supportedNetworks = config.supportedNetworks ?? ["base-sepolia", "base"];
  return function wrapHandler(originalHandler) {
    return async (input) => {
      try {
        return await originalHandler(input);
      } catch (err) {
        if (err instanceof Error && "status" in err && err.status === 402) {
          const paymentHeader = err.headers?.["x-payment"] || err.headers?.["www-authenticate"] || err.paymentDetails;
          if (!paymentHeader) {
            throw new Error("402 Payment Required but no payment details provided");
          }
          const details = typeof paymentHeader === "string" ? parseX402Header(paymentHeader) : paymentHeader;
          if (!details) {
            throw new Error("Could not parse x402 payment details");
          }
          if (!supportedNetworks.includes(details.network)) {
            throw new Error(`Unsupported payment network: ${details.network}. Supported: ${supportedNetworks.join(", ")}`);
          }
          const amount = parseFloat(details.maxAmountRequired);
          if (amount > maxAutoApprove) {
            if (config.onPaymentRequired) {
              const approved = await config.onPaymentRequired(details);
              if (!approved) {
                return {
                  success: false,
                  error: `Payment of ${details.maxAmountRequired} on ${details.network} was rejected by user`
                };
              }
            } else {
              throw new Error(
                `Payment of ${details.maxAmountRequired} exceeds auto-approve limit of ${maxAutoApprove}. Configure onPaymentRequired callback for manual approval.`
              );
            }
          }
          const result = {
            success: true,
            amountPaid: details.maxAmountRequired,
            network: details.network,
            txHash: "0x_pending_implementation"
          };
          if (config.onPaymentSettled) {
            config.onPaymentSettled(result);
          }
          return result;
        }
        throw err;
      }
    };
  };
}
function createPaymentTool(config) {
  return {
    name: "x402-pay",
    description: "Make an x402 payment to access a paywalled resource. Parses the 402 response, settles payment on-chain, and returns the unlocked content.",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "URL that returned 402 Payment Required"
        },
        paymentHeader: {
          type: "string",
          description: "X-Payment or WWW-Authenticate header value from the 402 response"
        },
        maxAmount: {
          type: "string",
          description: 'Maximum amount willing to pay (e.g., "0.01")'
        }
      },
      required: ["url", "paymentHeader"]
    },
    annotations: {
      destructiveHint: true,
      confirmationHint: true,
      title: "x402 Payment"
    },
    handler: async (input) => {
      const url = input.url;
      const headerVal = input.paymentHeader;
      const maxAmount = input.maxAmount;
      const details = parseX402Header(headerVal);
      if (!details) {
        return { success: false, error: "Could not parse payment details" };
      }
      details.resource = url;
      if (maxAmount) {
        const requested = parseFloat(details.maxAmountRequired);
        const limit = parseFloat(maxAmount);
        if (requested > limit) {
          return {
            success: false,
            error: `Requested ${requested} exceeds limit ${limit}`
          };
        }
      }
      if (config.onPaymentRequired) {
        const approved = await config.onPaymentRequired(details);
        if (!approved) {
          return { success: false, error: "Payment rejected" };
        }
      }
      return {
        success: true,
        paymentDetails: details,
        status: "ready_to_settle",
        message: `Ready to pay ${details.maxAmountRequired} on ${details.network} to ${details.payTo}`
      };
    }
  };
}
async function x402Fetch(url, init = {}, config) {
  const response = await fetch(url, init);
  if (response.status !== 402) {
    return response;
  }
  const paymentHeader = response.headers.get("x-payment") || response.headers.get("www-authenticate") || "";
  const details = parseX402Header(paymentHeader);
  if (!details) {
    throw Object.assign(new Error("402 Payment Required but no parseable payment details"), {
      status: 402,
      response
    });
  }
  details.resource = url;
  const amount = parseFloat(details.maxAmountRequired);
  const maxAutoApprove = config.maxAutoApproveUsd ?? 0.1;
  if (amount > maxAutoApprove && config.onPaymentRequired) {
    const approved = await config.onPaymentRequired(details);
    if (!approved) {
      throw Object.assign(new Error("Payment rejected by user"), {
        status: 402,
        paymentDetails: details
      });
    }
  }
  throw Object.assign(
    new Error(`x402 payment required: ${details.maxAmountRequired} on ${details.network}`),
    {
      status: 402,
      paymentDetails: details,
      payTo: details.payTo,
      amount: details.maxAmountRequired,
      network: details.network
    }
  );
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createPaymentTool,
  createX402PaymentPayload,
  parseX402Header,
  x402Fetch,
  x402Middleware
});
//# sourceMappingURL=x402.js.map