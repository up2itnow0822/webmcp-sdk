/** Strict x402 v2 exact EVM transport. Applications provide noncustodial wallet
 * authorization and independent chain verification; this SDK never holds keys.
 * https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md */
import type { WebMCPToolDefinition } from "./types.js";

export interface X402Requirements {
  scheme: "exact";
  network: string;
  amount: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra?: Record<string, unknown>;
}
export interface X402PaymentDetails {
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
export interface X402PaymentPayload {
  x402Version: 2;
  resource: { url: string };
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
export interface X402WalletContext {
  account: string;
  network: string;
}
export interface X402OperationContext {
  readonly signal: AbortSignal;
}
export interface X402WalletAdapter {
  protocol: "x402-v2-exact";
  /** Read the live external wallet; do not cache disconnected or switched state. */
  getWalletContext(context: X402OperationContext): Promise<X402WalletContext>;
  /** Request wallet authorization only. Do not broadcast from this callback. */
  authorize(
    details: X402PaymentDetails,
    context: X402OperationContext,
  ): Promise<X402PaymentPayload>;
}
export interface X402Route {
  network: string;
  asset: string;
  payTo: string;
  /** Application-verified asset decimals; only for manual token limits. */
  decimals: number;
  maxAmountAtomic: string;
}
export interface X402Settlement {
  success: boolean;
  transaction: string;
  network: string;
  payer?: string;
  errorReason?: string;
}
export type X402Verification =
  | {
      status: "verified";
      transaction: string;
      network: string;
      asset: string;
      payTo: string;
      amountAtomic: string;
      resource: string;
      payer: string;
    }
  | { status: "pending" | "failed" };
export interface X402PaymentResult {
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
export interface X402Config {
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
  onPaymentRequired(
    details: X402PaymentDetails,
    context: X402OperationContext,
  ): Promise<boolean> | boolean;
  /** Legacy name: additional USD cap only; never bypasses explicit approval. */
  maxAutoApproveUsd?: number | string;
  /** Exact positive USD decimal for this entire payment. No assumed peg. */
  valuationProvider?: (
    details: X402PaymentDetails,
    context: X402OperationContext,
  ) => Promise<string>;
  onPaymentSettled?: (result: Readonly<X402PaymentResult>) => void;
  /** Whole-operation deadline: default 30000, maximum 120000 milliseconds. */
  timeoutMs?: number;
}
export class X402PaymentError extends Error {
  readonly success = false;
  constructor(
    message: string,
    readonly status: "pending" | "failed" = "failed",
    readonly txHash?: string,
    readonly paymentDetails?: X402PaymentDetails,
  ) {
    super(message);
    this.name = "X402PaymentError";
  }
}
const MAX_HEADER = 16384;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HASH = /^0x[0-9a-fA-F]{64}$/;
const NETWORK = /^eip155:[1-9][0-9]{0,15}$/;
function validAddress(value: unknown): value is string {
  return typeof value === "string" && ADDRESS.test(value);
}
function validHash(value: unknown): value is string {
  return typeof value === "string" && HASH.test(value);
}
const FORBIDDEN = new Set(["__proto__", "prototype", "constructor"]);
// Shared by source-adapter identity across configuration snapshots.
const replayPools = new WeakMap<X402WalletAdapter, Map<string, number>>();
const executionLeases = new WeakMap<X402WalletAdapter, { active: boolean }>();
function fail(message: string): never {
  throw new X402PaymentError(message);
}
function atomic(value: unknown): bigint {
  if (typeof value !== "string" || !/^[1-9][0-9]{0,77}$/.test(value))
    fail("Invalid canonical positive atomic amount");
  const result = BigInt(value);
  if (result >= 2n ** 256n) fail("Atomic amount exceeds uint256");
  return result;
}
function decimal(value: unknown, places: number): bigint {
  if (
    typeof value !== "string" ||
    value.length > 100 ||
    !/^(?:0|[1-9][0-9]*)(?:\.[0-9]*[1-9])?$/.test(value)
  )
    fail("Invalid canonical positive decimal amount");
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > places) fail("Amount exceeds known decimal precision");
  const result = BigInt(whole + fraction.padEnd(places, "0"));
  if (result <= 0n || result >= 2n ** 256n)
    fail("Invalid positive decimal amount");
  return result;
}
function record(value: unknown): Record<string, any> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  )
    fail("Invalid payment object");
  return value as Record<string, any>;
}
/** Bounded own JSON data, accepting core null-prototype snapshots and never
 * invoking accessors, toJSON, inherited fields or custom prototypes. */
function safeClone(value: unknown): any {
  let nodes = 0;
  function visit(item: unknown, depth: number): any {
    if (++nodes > 1000 || depth > 10)
      fail("Payment data exceeds processing limit");
    if (item === null || typeof item === "boolean") return item;
    if (typeof item === "number" && Number.isFinite(item)) return item;
    if (typeof item === "string" && item.length <= MAX_HEADER) return item;
    if (!item || typeof item !== "object") fail("Invalid JSON payment data");
    const array = Array.isArray(item);
    if (!array) record(item);
    const output: any = array ? [] : {};
    const keys = Object.getOwnPropertyNames(item);
    if (Object.getOwnPropertySymbols(item).length || keys.length > 1000)
      fail("Invalid payment keys");
    for (const key of keys) {
      if (array && key === "length") continue;
      if (FORBIDDEN.has(key)) fail("Forbidden payment key");
      const descriptor = Object.getOwnPropertyDescriptor(item, key)!;
      if (!("value" in descriptor) || !descriptor.enumerable)
        fail("Invalid payment descriptor");
      if (array && !/^(?:0|[1-9][0-9]*)$/.test(key))
        fail("Invalid payment array");
      output[key] = visit(descriptor.value, depth + 1);
    }
    return output;
  }
  const cloned = visit(value, 0);
  if (new TextEncoder().encode(JSON.stringify(cloned)).length > MAX_HEADER)
    fail("Payment data exceeds header limit");
  return cloned;
}
function frozen<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) frozen(child);
    Object.freeze(value);
  }
  return value;
}
function decode(header: string): any {
  if (
    typeof header !== "string" ||
    !header ||
    header.length > MAX_HEADER ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      header,
    )
  )
    fail("Invalid bounded Base64 payment header");
  const bytes = Uint8Array.from(atob(header), (c) => c.charCodeAt(0));
  return safeClone(
    JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
  );
}
function validateUrl(value: unknown): string {
  if (typeof value !== "string" || value.length > 2048)
    fail("Invalid payment URL");
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    fail("Invalid payment URL");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.hash ||
    parsed.href !== value
  )
    fail("Payment URL must be canonical HTTPS without credentials or fragment");
  return parsed.href;
}
function requirements(value: unknown): X402Requirements {
  const data = record(value);
  if (
    data.scheme !== "exact" ||
    typeof data.network !== "string" ||
    !NETWORK.test(data.network)
  )
    fail("Unsupported payment network or scheme");
  atomic(data.amount);
  if (!validAddress(data.asset) || !validAddress(data.payTo))
    fail("Unsupported EVM token or recipient");
  if (
    !Number.isSafeInteger(data.maxTimeoutSeconds) ||
    data.maxTimeoutSeconds < 1 ||
    data.maxTimeoutSeconds > 120
  )
    fail("Invalid payment expiry");
  if (data.extra !== undefined) {
    const extra = record(data.extra);
    if (
      extra.paymentFlow !== undefined ||
      extra.assetTransferMethod !== undefined
    )
      fail("Unsupported payment flow or transfer method");
  }
  for (const key of Object.keys(data))
    if (
      ![
        "scheme",
        "network",
        "amount",
        "asset",
        "payTo",
        "maxTimeoutSeconds",
        "extra",
      ].includes(key)
    )
      fail("Unsupported payment requirements field");
  return data as X402Requirements;
}
/** Current PAYMENT-REQUIRED Base64 JSON, one exact EVM offer; legacy and
 * ambiguous offers reject rather than inventing networks, units or resources. */
export function parseX402Header(header: string): X402PaymentDetails | null {
  try {
    const data = record(decode(header));
    if (
      data.x402Version !== 2 ||
      !Array.isArray(data.accepts) ||
      data.accepts.length !== 1
    )
      return null;
    if (
      data.extensions !== undefined &&
      Object.keys(record(data.extensions)).length
    )
      return null;
    const resource = record(data.resource);
    const resourceUrl = validateUrl(resource.url);
    for (const key of ["description", "mimeType"])
      if (
        resource[key] !== undefined &&
        (typeof resource[key] !== "string" || resource[key].length > 1024)
      )
        return null;
    const offer = requirements(data.accepts[0]);
    return frozen({
      x402Version: 2,
      network: offer.network,
      payTo: offer.payTo,
      maxAmountRequired: offer.amount,
      amountAtomic: offer.amount,
      amountUnit: "atomic",
      asset: offer.asset,
      resource: resourceUrl,
      scheme: "exact",
      description: resource.description,
      mimeType: resource.mimeType,
      extra: offer.extra,
      requirements: offer,
      expiresAt: Date.now() + offer.maxTimeoutSeconds * 1000,
    });
  } catch {
    return null;
  }
}
function equalJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  const aa = Object.keys(a);
  const bb = Object.keys(b);
  return (
    aa.length === bb.length &&
    aa.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(b, key) &&
        equalJson((a as any)[key], (b as any)[key]),
    )
  );
}
function validatePayload(
  details: X402PaymentDetails,
  value: unknown,
  account?: string,
): X402PaymentPayload {
  if (typeof value === "string")
    fail("Migration: transaction hashes are not x402 authorization payloads");
  const data = record(safeClone(value));
  if (
    data.x402Version !== 2 ||
    !equalJson(data.accepted, details.requirements) ||
    record(data.resource).url !== details.resource
  )
    fail("Authorization payload does not match immutable payment requirements");
  if (
    data.extensions !== undefined &&
    Object.keys(record(data.extensions)).length
  )
    fail("Unsupported authorization extensions");
  const payload = record(data.payload);
  const auth = record(payload.authorization);
  if (
    typeof payload.signature !== "string" ||
    !/^0x[0-9a-fA-F]{130}$/.test(payload.signature)
  )
    fail("Invalid EVM authorization signature");
  if (
    !validAddress(auth.from) ||
    (account && auth.from.toLowerCase() !== account.toLowerCase()) ||
    auth.to !== details.payTo ||
    auth.value !== details.amountAtomic ||
    !validHash(auth.nonce)
  )
    fail("Authorization payer, recipient or amount mismatch");
  if (
    typeof auth.validAfter !== "string" ||
    typeof auth.validBefore !== "string" ||
    !/^(?:0|[1-9][0-9]{0,15})$/.test(auth.validAfter) ||
    !/^[1-9][0-9]{0,15}$/.test(auth.validBefore)
  )
    fail("Invalid authorization validity");
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (
    BigInt(auth.validAfter) >= now ||
    BigInt(auth.validBefore) <= now ||
    BigInt(auth.validBefore) * 1000n > BigInt(Math.floor(details.expiresAt))
  )
    fail("Invalid or expired authorization validity");
  return frozen(data as X402PaymentPayload);
}
/** Serialize an actual wallet authorization, never proof fabricated from a hash. */
export function createX402PaymentPayload(
  details: X402PaymentDetails,
  authorization: X402PaymentPayload,
): string {
  const bytes = new TextEncoder().encode(
    JSON.stringify(validatePayload(details, authorization)),
  );
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const encoded = btoa(binary);
  if (encoded.length > MAX_HEADER)
    fail("Authorization payload exceeds header limit");
  return encoded;
}
function configure(config: X402Config): X402Config {
  if (!config || typeof config !== "object")
    fail("Payment adapter configuration required");
  if ("signer" in config || "rpcUrl" in config)
    fail(
      "Migration: remove private-key/signer configuration; provide a noncustodial wallet adapter",
    );
  if (
    config.adapter?.protocol !== "x402-v2-exact" ||
    typeof config.adapter.authorize !== "function" ||
    typeof config.adapter.getWalletContext !== "function"
  )
    fail("Supported noncustodial x402-v2-exact adapter required");
  if (typeof config.verificationProvider !== "function")
    fail("Independent settlement verification provider required");
  if (typeof config.onPaymentRequired !== "function")
    fail("Explicit human confirmation provider required");
  if (
    !Array.isArray(config.supportedNetworks) ||
    !config.supportedNetworks.length ||
    config.supportedNetworks.length > 100 ||
    config.supportedNetworks.some((n) => !NETWORK.test(n))
  )
    fail("Explicit supported payment networks required");
  if (
    !Array.isArray(config.allowedOrigins) ||
    !config.allowedOrigins.length ||
    config.allowedOrigins.length > 100
  )
    fail("Explicit payment origin allowlist required");
  for (const origin of config.allowedOrigins)
    if (new URL(validateUrl(origin + "/")).origin !== origin)
      fail("Invalid payment origin");
  if (
    !Array.isArray(config.routes) ||
    !config.routes.length ||
    config.routes.length > 100
  )
    fail("Explicit supported payment routes required");
  const routes = config.routes.map((route) => {
    if (
      !route ||
      !config.supportedNetworks.includes(route.network) ||
      !validAddress(route.asset) ||
      !validAddress(route.payTo) ||
      !Number.isSafeInteger(route.decimals) ||
      route.decimals < 0 ||
      route.decimals > 36
    )
      fail("Invalid supported payment route or decimals");
    atomic(route.maxAmountAtomic);
    return Object.freeze({ ...route });
  });
  if (
    new Set(
      routes.map((r) =>
        [r.network, r.asset.toLowerCase(), r.payTo.toLowerCase()].join("/"),
      ),
    ).size !== routes.length
  )
    fail("Ambiguous duplicate payment routes");
  if (config.maxAutoApproveUsd !== undefined) {
    if (
      typeof config.maxAutoApproveUsd === "number" &&
      !Number.isFinite(config.maxAutoApproveUsd)
    )
      fail("Invalid USD limit");
    decimal(String(config.maxAutoApproveUsd), 36);
    if (typeof config.valuationProvider !== "function")
      fail("USD limit requires explicit valuation provider");
  }
  const timeoutMs = config.timeoutMs ?? 30000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000)
    fail("Invalid payment timeout");
  // Bind class prototype methods and retain original adapter identity state.
  const adapter = Object.freeze({
    protocol: config.adapter.protocol,
    authorize: config.adapter.authorize.bind(config.adapter),
    getWalletContext: config.adapter.getWalletContext.bind(config.adapter),
  });
  const pool = replayPools.get(config.adapter) ?? new Map<string, number>();
  replayPools.set(config.adapter, pool);
  replayPools.set(adapter, pool);
  const lease = executionLeases.get(config.adapter) ?? { active: false };
  executionLeases.set(config.adapter, lease);
  executionLeases.set(adapter, lease);
  return Object.freeze({
    ...config,
    adapter,
    routes: Object.freeze(routes),
    supportedNetworks: Object.freeze([...config.supportedNetworks]),
    allowedOrigins: Object.freeze([...config.allowedOrigins]),
    timeoutMs,
  });
}
function check(signal: AbortSignal, details?: X402PaymentDetails): void {
  if (signal.aborted) fail("Payment aborted or timeout");
  if (details && Date.now() >= details.expiresAt) fail("Payment quote expired");
}
async function bounded<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  parent: AbortSignal | null | undefined,
  timeoutMs: number,
  state: { submitted: boolean; transaction?: string },
  lease: { active: boolean },
): Promise<T> {
  if (lease.active)
    fail("Payment wallet adapter busy or quarantined: unfinished operation");
  lease.active = true;
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (parent?.aborted) controller.abort();
  else parent?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, timeoutMs);
  let started = false;
  let listener: () => void = () => {};
  const cancelled = new Promise<never>((_, reject) => {
    listener = () =>
      reject(
        new X402PaymentError(
          "Payment aborted or timeout" +
            (state.submitted
              ? "; settlement may be pending; do not resubmit"
              : ""),
          state.submitted ? "pending" : "failed",
          state.transaction,
        ),
      );
    controller.signal.addEventListener("abort", listener, { once: true });
  });
  try {
    check(controller.signal);
    started = true;
    // Caller timeout must not release a signing lifetime that ignores abort.
    const work = operation(controller.signal).finally(() => {
      lease.active = false;
    });
    return await Promise.race([work, cancelled]);
  } finally {
    if (!started) lease.active = false;
    clearTimeout(timer);
    parent?.removeEventListener("abort", abort);
    controller.signal.removeEventListener("abort", listener);
  }
}
function bindRoute(
  details: X402PaymentDetails,
  url: string,
  config: X402Config,
): X402Route {
  if (details.resource !== url) fail("Payment resource binding mismatch");
  if (!config.supportedNetworks.includes(details.network))
    fail("Unsupported payment network");
  const route = config.routes.find(
    (r) =>
      r.network === details.network &&
      r.asset.toLowerCase() === details.asset.toLowerCase() &&
      r.payTo.toLowerCase() === details.payTo.toLowerCase(),
  );
  if (!route) fail("Unsupported payment route: network, asset or recipient");
  if (atomic(details.amountAtomic) > atomic(route.maxAmountAtomic))
    fail("Payment exceeds atomic route limit");
  return route;
}
function inspectResponse(response: Response, url: string): void {
  if (
    response.redirected ||
    response.type === "opaqueredirect" ||
    (response.status >= 300 && response.status < 400)
  )
    fail("Payment redirects are forbidden");
  if (response.url && response.url !== url)
    fail("Unexpected resource response URL");
}
async function wallet(
  config: X402Config,
  signal: AbortSignal,
  network: string,
  prior?: X402WalletContext,
): Promise<X402WalletContext> {
  check(signal);
  const current = safeClone(await config.adapter.getWalletContext({ signal }));
  check(signal);
  if (
    !validAddress(current.account) ||
    current.network !== network ||
    (prior &&
      (current.account.toLowerCase() !== prior.account.toLowerCase() ||
        current.network !== prior.network))
  )
    fail("Wallet account or network changed; review again");
  return frozen(current);
}
function settlementHeader(
  response: Response,
  details: X402PaymentDetails,
): Readonly<X402Settlement> {
  let data: Record<string, any>;
  try {
    data = record(decode(response.headers.get("payment-response") ?? ""));
  } catch {
    fail("Missing or malformed settlement evidence header");
  }
  if (
    typeof data.success !== "boolean" ||
    data.network !== details.network ||
    typeof data.transaction !== "string" ||
    (data.transaction !== "" && !validHash(data.transaction))
  )
    fail("Invalid settlement evidence");
  if (data.success !== true) {
    if (
      data.errorReason === "settlement_pending" &&
      validHash(data.transaction)
    )
      throw new X402PaymentError(
        "Settlement pending; do not resubmit payment",
        "pending",
        data.transaction,
      );
    throw new X402PaymentError(
      "Settlement failed; resource not unlocked",
      "failed",
      data.transaction || undefined,
    );
  }
  if (
    !validHash(data.transaction) ||
    !validAddress(data.payer) ||
    data.errorReason !== undefined
  )
    fail("Invalid successful settlement evidence");
  return frozen(data as X402Settlement);
}
function result(
  details: X402PaymentDetails,
  evidence: X402Verification,
  response: Response,
): X402PaymentResult {
  if (evidence.status !== "verified") fail("Unverified settlement evidence");
  return Object.freeze({
    success: true,
    status: "verified",
    txHash: evidence.transaction,
    amountPaid: details.amountAtomic,
    amountUnit: "atomic",
    network: details.network,
    responseBody: response,
  });
}
interface FetchOutcome {
  response: Response;
  result?: X402PaymentResult;
}
async function fetchPayment(
  url: string,
  init: RequestInit,
  config: X402Config,
  expected?: X402PaymentDetails,
  maxTokens?: string,
): Promise<FetchOutcome> {
  const target = validateUrl(url);
  if (!config.allowedOrigins.includes(new URL(target).origin))
    fail("Payment URL origin is not allowed");
  if ((init.method ?? "GET").toUpperCase() !== "GET" || init.body != null)
    fail("Only replayable GET resource requests are supported");
  const headers = new Headers(init.headers);
  let headerSize = 0;
  headers.forEach((value, name) => {
    headerSize += name.length + value.length;
    if (/^(?:payment-|x-payment|www-authenticate)/i.test(name))
      fail("Caller-supplied payment headers are forbidden");
  });
  if (headerSize > MAX_HEADER) fail("Request headers exceed payment limit");
  const submission = {
    submitted: false,
    authoritativeFailure: false,
    transaction: undefined as string | undefined,
    details: undefined as X402PaymentDetails | undefined,
  };
  return bounded(
    async (signal) => {
      const base: RequestInit = {
        ...init,
        method: "GET",
        headers,
        redirect: "manual",
        signal,
      };
      check(signal);
      const response = await fetch(target, base);
      check(signal);
      inspectResponse(response, target);
      if (response.status !== 402) {
        if (expected) fail("Supplied payment quote is no longer required");
        return { response };
      }
      const details = parseX402Header(
        response.headers.get("payment-required") ?? "",
      );
      if (!details)
        fail("402 response has no supported v2 payment requirements");
      const route = bindRoute(details, target, config);
      submission.details = details;
      if (
        expected &&
        (!equalJson(expected.requirements, details.requirements) ||
          expected.resource !== details.resource)
      )
        fail("Supplied quote differs from current payment requirements");
      if (
        maxTokens &&
        atomic(details.amountAtomic) > decimal(maxTokens, route.decimals)
      )
        fail("Payment exceeds exact token amount limit");
      if (config.maxAutoApproveUsd !== undefined) {
        const usd = await config.valuationProvider!(details, { signal });
        check(signal, details);
        if (decimal(usd, 36) > decimal(String(config.maxAutoApproveUsd), 36))
          fail("Payment exceeds exact USD limit");
      }
      const account = await wallet(config, signal, details.network);
      check(signal, details);
      const approved = await config.onPaymentRequired(details, { signal });
      check(signal, details);
      if (approved !== true)
        fail("Payment rejected by human confirmation policy");
      await wallet(config, signal, details.network, account);
      check(signal, details);
      let authorization: X402PaymentPayload;
      try {
        authorization = await config.adapter.authorize(details, { signal });
      } catch {
        fail("Wallet authorization failed or rejected");
      }
      const payload = validatePayload(details, authorization, account.account);
      check(signal, details);
      await wallet(config, signal, details.network, account);
      check(signal, details);
      const retryHeaders = new Headers(headers);
      retryHeaders.set(
        "payment-signature",
        createX402PaymentPayload(details, payload),
      );
      const nonce = [
        details.network,
        details.asset.toLowerCase(),
        account.account.toLowerCase(),
        payload.payload.authorization.nonce.toLowerCase(),
      ].join("/");
      const pool = replayPools.get(config.adapter)!;
      for (const [key, expiry] of pool)
        if (expiry <= Date.now()) pool.delete(key);
      if (pool.has(nonce))
        fail("Authorization nonce replay rejected; review a fresh payment");
      if (pool.size >= 1000)
        fail("Authorization replay cache capacity exceeded");
      pool.set(nonce, Number(payload.payload.authorization.validBefore) * 1000);
      submission.submitted = true;
      let unlocked: Response;
      try {
        unlocked = await fetch(target, { ...base, headers: retryHeaders });
      } catch {
        throw new X402PaymentError(
          "Signed retry outcome unknown; do not resubmit payment",
          "pending",
        );
      }
      check(signal);
      inspectResponse(unlocked, target);
      if (!unlocked.ok) {
        if (unlocked.headers.has("payment-response"))
          settlementHeader(unlocked, details);
        fail(
          "Paid resource retry failed; payment may have been submitted; do not automatically resubmit",
        );
      }
      const settlement = settlementHeader(unlocked, details);
      submission.transaction = settlement.transaction;
      if (settlement.payer?.toLowerCase() !== account.account.toLowerCase())
        fail("Settlement payer does not match authorized wallet");
      let evidence: X402Verification;
      try {
        evidence = await config.verificationProvider({
          details,
          paymentPayload: payload,
          settlement,
          response: unlocked.clone(),
          signal,
        });
      } catch {
        throw new X402PaymentError(
          "External settlement verification unavailable; do not resubmit payment",
          "pending",
          settlement.transaction,
        );
      }
      check(signal);
      if (!evidence || typeof evidence !== "object")
        fail("Missing external settlement verification evidence");
      if (evidence.status === "failed") submission.authoritativeFailure = true;
      if (evidence.status === "pending" || evidence.status === "failed")
        throw new X402PaymentError(
          "External settlement verification " + evidence.status,
          evidence.status,
          settlement.transaction,
          details,
        );
      if (
        evidence.status !== "verified" ||
        evidence.transaction !== settlement.transaction ||
        evidence.network !== details.network ||
        evidence.asset?.toLowerCase() !== details.asset.toLowerCase() ||
        evidence.payTo?.toLowerCase() !== details.payTo.toLowerCase() ||
        evidence.amountAtomic !== details.amountAtomic ||
        evidence.resource !== target ||
        evidence.payer?.toLowerCase() !== account.account.toLowerCase()
      )
        fail("External settlement evidence does not match immutable intent");
      const paid = result(details, evidence, unlocked);
      // Observer errors do not rewrite an externally verified financial outcome.
      try {
        Promise.resolve(config.onPaymentSettled?.(paid)).catch(() => {});
      } catch {
        /* observer only */
      }
      return { response: unlocked, result: paid };
    },
    init.signal,
    config.timeoutMs!,
    submission,
    executionLeases.get(config.adapter)!,
  ).catch((error) => {
    if (submission.submitted && !submission.authoritativeFailure) {
      const message =
        error instanceof X402PaymentError
          ? error.message
          : "Submitted payment outcome unknown";
      throw new X402PaymentError(
        message + "; do not resubmit pending payment",
        "pending",
        error instanceof X402PaymentError
          ? (error.txHash ?? submission.transaction)
          : submission.transaction,
        submission.details,
      );
    }
    throw error;
  });
}
/** One signed GET retry. Paid responses return only after independent settlement
 * verification. Pending and failed outcomes throw X402PaymentError. */
export async function x402Fetch(
  url: string,
  init: RequestInit = {},
  config: X402Config,
): Promise<Response> {
  return (await fetchPayment(url, init, configure(config))).response;
}
/** An Error with status=402 must expose the v2 header and exact resource.
 * Refresh that GET quote before approval; forward execution cancellation. */
export function x402Middleware(config: X402Config) {
  const validated = configure(config);
  return function wrapHandler<TInput, TOutput>(
    originalHandler: (
      input: TInput,
      context?: X402OperationContext,
    ) => Promise<TOutput> | TOutput,
  ) {
    return async (
      input: TInput,
      context?: X402OperationContext,
    ): Promise<TOutput | X402PaymentResult> => {
      try {
        return await originalHandler(input, context);
      } catch (error) {
        if (!(error instanceof Error) || (error as any).status !== 402)
          throw error;
        const e = error as Error & {
          response?: Response;
          headers?: Headers | Record<string, string>;
          paymentHeader?: string;
        };
        const header =
          e.response?.headers.get("payment-required") ??
          (e.headers instanceof Headers
            ? e.headers.get("payment-required")
            : e.headers?.["payment-required"]) ??
          e.paymentHeader;
        const details = header ? parseX402Header(header) : null;
        if (!details)
          fail(
            "402 middleware requires supported v2 payment header and explicit resource",
          );
        const outcome = await fetchPayment(
          details.resource,
          { signal: context?.signal },
          validated,
          details,
        );
        if (!outcome.result) fail("No verified payment execution result");
        return outcome.result;
      }
    };
  };
}
/** Executing payment tool: readiness is never reported as payment success. */
export function createPaymentTool(config: X402Config): WebMCPToolDefinition {
  const validated = configure(config);
  return {
    name: "x402-pay",
    description:
      "Request explicit wallet authorization for a supported x402 v2 exact EVM payment and return independently verified settlement with the unlocked resource response.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", maxLength: 2048 },
        paymentHeader: { type: "string", maxLength: MAX_HEADER },
        maxAmount: {
          type: "string",
          description:
            "Canonical positive token decimal cap, using configured asset decimals.",
        },
      },
      required: ["url", "paymentHeader"],
      additionalProperties: false,
    },
    annotations: {
      destructiveHint: true,
      confirmationHint: true,
      title: "x402 Payment",
    },
    handler: async (
      input: Record<string, unknown>,
      context?: X402OperationContext,
    ) => {
      const safe = record(safeClone(input));
      if (
        Object.keys(safe).some(
          (key) => !["url", "paymentHeader", "maxAmount"].includes(key),
        )
      )
        fail("Unexpected payment input field");
      const url = validateUrl(safe.url);
      const details = parseX402Header(safe.paymentHeader);
      if (!details) fail("Invalid or unsupported payment header");
      const route = bindRoute(details, url, validated);
      if (safe.maxAmount !== undefined) decimal(safe.maxAmount, route.decimals);
      const outcome = await fetchPayment(
        url,
        { signal: context?.signal },
        validated,
        details,
        safe.maxAmount,
      );
      if (!outcome.result) fail("No verified payment execution result");
      return outcome.result;
    },
  };
}
