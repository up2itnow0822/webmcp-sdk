/** Bounded own-data JSON snapshots; accessors and non-JSON objects reject. */
export interface InputLimits {
  maxInputBytes: number;
  maxInputNodes: number;
  maxInputDepth: number;
}
export const DEFAULT_INPUT_LIMITS: Readonly<InputLimits> = Object.freeze({
  maxInputBytes: 65536,
  maxInputNodes: 1000,
  maxInputDepth: 10,
});
const forbidden = new Set(["__proto__", "prototype", "constructor"]);
export function validateLimit(
  name: string,
  value: number,
  allowZero = false,
): void {
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1))
    throw new Error(
      `WebMCP Kit: ${name} must be a ${allowZero ? "nonnegative" : "positive"} safe integer`,
    );
}
export function snapshotInput(
  input: unknown,
  limits: Partial<InputLimits> = {},
): Record<string, unknown> {
  const budget = {
    maxInputBytes: limits.maxInputBytes ?? DEFAULT_INPUT_LIMITS.maxInputBytes,
    maxInputNodes: limits.maxInputNodes ?? DEFAULT_INPUT_LIMITS.maxInputNodes,
    maxInputDepth: limits.maxInputDepth ?? DEFAULT_INPUT_LIMITS.maxInputDepth,
  };
  for (const [name, value] of Object.entries(budget))
    validateLimit(name, value);
  let nodes = 0;
  let bytes = 0;
  const ancestors = new Set<object>();
  const charge = (amount: number) => {
    bytes += amount;
    if (bytes > budget.maxInputBytes)
      throw new Error("Input exceeds maxInputBytes limit");
  };
  const stringBytes = (value: string) => {
    // Count UTF-8 JSON incrementally, without allocating a giant encoded string.
    charge(2);
    for (let i = 0; i < value.length; i++) {
      const n = value.charCodeAt(i);
      if (
        n === 34 ||
        n === 92 ||
        n === 8 ||
        n === 9 ||
        n === 10 ||
        n === 12 ||
        n === 13
      )
        charge(2);
      else if (n < 32) charge(6);
      else if (n < 128) charge(1);
      else if (n < 2048) charge(2);
      else if (
        n >= 0xd800 &&
        n <= 0xdbff &&
        i + 1 < value.length &&
        value.charCodeAt(i + 1) >= 0xdc00 &&
        value.charCodeAt(i + 1) <= 0xdfff
      ) {
        charge(4);
        i++;
      } else if (n >= 0xd800 && n <= 0xdfff) charge(6);
      else charge(3);
    }
  };
  const clone = (value: unknown, depth: number): unknown => {
    if (++nodes > budget.maxInputNodes)
      throw new Error("Input exceeds maxInputNodes limit");
    if (depth > budget.maxInputDepth)
      throw new Error("Input exceeds maxInputDepth limit");
    if (value === null) {
      charge(4);
      return null;
    }
    if (typeof value === "string") {
      stringBytes(value);
      return value;
    }
    if (typeof value === "boolean") {
      charge(value ? 4 : 5);
      return value;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      charge(String(value).length);
      return value;
    }
    if (typeof value !== "object")
      throw new Error("Input must contain finite JSON-compatible data");
    const object = value as object;
    const array = Array.isArray(object);
    const proto = Object.getPrototypeOf(object);
    if (
      array
        ? proto !== Array.prototype
        : proto !== Object.prototype && proto !== null
    )
      throw new Error("Input contains an arbitrary prototype");
    for (const key of forbidden)
      if (Object.prototype.hasOwnProperty.call(object, key))
        throw new Error(`Input contains forbidden key: ${key}`);
    if (ancestors.has(object)) throw new Error("Input contains a cycle");
    ancestors.add(object);
    charge(2);
    const result: any = array ? [] : Object.create(null);
    let count = 0;
    // Do not allocate a complete field list before the budget can reject.
    for (const key in object) {
      if (!Object.prototype.hasOwnProperty.call(object, key)) continue;
      if (forbidden.has(key))
        throw new Error(`Input contains forbidden key: ${key}`);
      count++;
      if (nodes >= budget.maxInputNodes)
        throw new Error("Input exceeds maxInputNodes limit");
      const desc = Object.getOwnPropertyDescriptor(object, key)!;
      if (!("value" in desc)) throw new Error("Input contains an accessor");
      if (
        array &&
        (!/^(0|[1-9][0-9]*)$/.test(key) ||
          Number(key) >= (object as unknown[]).length)
      )
        throw new Error("Input array contains non-index fields");
      if (count > 1) charge(1);
      if (!array) {
        stringBytes(key);
        charge(1);
      }
      result[key] = clone(desc.value, depth + 1);
    }
    if (array && count !== (object as unknown[]).length)
      throw new Error("Input arrays must not contain holes");
    if (Object.getOwnPropertySymbols(object).length)
      throw new Error("Input contains symbol fields");
    ancestors.delete(object);
    return result;
  };
  if (typeof input !== "object" || input === null || Array.isArray(input))
    throw new Error("Input must be an object");
  return clone(input, 0) as Record<string, unknown>;
}

/** Freeze an already bounded JSON snapshot before asynchronous policy/approval work. */
export function freezeInput(value: unknown): void {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freezeInput(child);
    Object.freeze(value);
  }
}
