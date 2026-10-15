"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
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
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// src/react.ts
var react_exports = {};
__export(react_exports, {
  WebMCPProvider: () => WebMCPProvider,
  useWebMCPAvailable: () => useWebMCPAvailable,
  useWebMCPKit: () => useWebMCPKit,
  useWebMCPLog: () => useWebMCPLog,
  useWebMCPTool: () => useWebMCPTool,
  useWebMCPTools: () => useWebMCPTools
});
module.exports = __toCommonJS(react_exports);
var import_react = require("react");

// src/input.ts
var DEFAULT_INPUT_LIMITS = Object.freeze({
  maxInputBytes: 65536,
  maxInputNodes: 1e3,
  maxInputDepth: 10
});
var forbidden = /* @__PURE__ */ new Set(["__proto__", "prototype", "constructor"]);
function validateLimit(name, value, allowZero = false) {
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1))
    throw new Error(
      `WebMCP Kit: ${name} must be a ${allowZero ? "nonnegative" : "positive"} safe integer`
    );
}
function snapshotInput(input, limits = {}) {
  const budget = {
    maxInputBytes: limits.maxInputBytes ?? DEFAULT_INPUT_LIMITS.maxInputBytes,
    maxInputNodes: limits.maxInputNodes ?? DEFAULT_INPUT_LIMITS.maxInputNodes,
    maxInputDepth: limits.maxInputDepth ?? DEFAULT_INPUT_LIMITS.maxInputDepth
  };
  for (const [name, value] of Object.entries(budget))
    validateLimit(name, value);
  let nodes = 0;
  let bytes = 0;
  const ancestors = /* @__PURE__ */ new Set();
  const charge = (amount) => {
    bytes += amount;
    if (bytes > budget.maxInputBytes)
      throw new Error("Input exceeds maxInputBytes limit");
  };
  const stringBytes = (value) => {
    charge(2);
    for (let i = 0; i < value.length; i++) {
      const n = value.charCodeAt(i);
      if (n === 34 || n === 92 || n === 8 || n === 9 || n === 10 || n === 12 || n === 13)
        charge(2);
      else if (n < 32) charge(6);
      else if (n < 128) charge(1);
      else if (n < 2048) charge(2);
      else if (n >= 55296 && n <= 56319 && i + 1 < value.length && value.charCodeAt(i + 1) >= 56320 && value.charCodeAt(i + 1) <= 57343) {
        charge(4);
        i++;
      } else if (n >= 55296 && n <= 57343) charge(6);
      else charge(3);
    }
  };
  const clone = (value, depth) => {
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
    const object = value;
    const array = Array.isArray(object);
    const proto = Object.getPrototypeOf(object);
    if (array ? proto !== Array.prototype : proto !== Object.prototype && proto !== null)
      throw new Error("Input contains an arbitrary prototype");
    for (const key of forbidden)
      if (Object.prototype.hasOwnProperty.call(object, key))
        throw new Error(`Input contains forbidden key: ${key}`);
    if (ancestors.has(object)) throw new Error("Input contains a cycle");
    ancestors.add(object);
    charge(2);
    const result = array ? [] : /* @__PURE__ */ Object.create(null);
    let count = 0;
    for (const key in object) {
      if (!Object.prototype.hasOwnProperty.call(object, key)) continue;
      if (forbidden.has(key))
        throw new Error(`Input contains forbidden key: ${key}`);
      count++;
      if (nodes >= budget.maxInputNodes)
        throw new Error("Input exceeds maxInputNodes limit");
      const desc = Object.getOwnPropertyDescriptor(object, key);
      if (!("value" in desc)) throw new Error("Input contains an accessor");
      if (array && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= object.length))
        throw new Error("Input array contains non-index fields");
      if (count > 1) charge(1);
      if (!array) {
        stringBytes(key);
        charge(1);
      }
      result[key] = clone(desc.value, depth + 1);
    }
    if (array && count !== object.length)
      throw new Error("Input arrays must not contain holes");
    if (Object.getOwnPropertySymbols(object).length)
      throw new Error("Input contains symbol fields");
    ancestors.delete(object);
    return result;
  };
  if (typeof input !== "object" || input === null || Array.isArray(input))
    throw new Error("Input must be an object");
  return clone(input, 0);
}
function freezeInput(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freezeInput(child);
    Object.freeze(value);
  }
}

// node_modules/@cfworker/json-schema/dist/esm/deep-compare-strict.js
function deepCompareStrict(a, b) {
  const typeofa = typeof a;
  if (typeofa !== typeof b) {
    return false;
  }
  if (Array.isArray(a)) {
    if (!Array.isArray(b)) {
      return false;
    }
    const length = a.length;
    if (length !== b.length) {
      return false;
    }
    for (let i = 0; i < length; i++) {
      if (!deepCompareStrict(a[i], b[i])) {
        return false;
      }
    }
    return true;
  }
  if (typeofa === "object") {
    if (!a || !b) {
      return a === b;
    }
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    const length = aKeys.length;
    if (length !== bKeys.length) {
      return false;
    }
    for (const k of aKeys) {
      if (!deepCompareStrict(a[k], b[k])) {
        return false;
      }
    }
    return true;
  }
  return a === b;
}

// node_modules/@cfworker/json-schema/dist/esm/pointer.js
function encodePointer(p) {
  return encodeURI(escapePointer(p));
}
function escapePointer(p) {
  return p.replace(/~/g, "~0").replace(/\//g, "~1");
}

// node_modules/@cfworker/json-schema/dist/esm/dereference.js
var schemaArrayKeyword = {
  prefixItems: true,
  items: true,
  allOf: true,
  anyOf: true,
  oneOf: true
};
var schemaMapKeyword = {
  $defs: true,
  definitions: true,
  properties: true,
  patternProperties: true,
  dependentSchemas: true
};
var ignoredKeyword = {
  id: true,
  $id: true,
  $ref: true,
  $schema: true,
  $anchor: true,
  $vocabulary: true,
  $comment: true,
  default: true,
  enum: true,
  const: true,
  required: true,
  type: true,
  maximum: true,
  minimum: true,
  exclusiveMaximum: true,
  exclusiveMinimum: true,
  multipleOf: true,
  maxLength: true,
  minLength: true,
  pattern: true,
  format: true,
  maxItems: true,
  minItems: true,
  uniqueItems: true,
  maxProperties: true,
  minProperties: true
};
var initialBaseURI = typeof self !== "undefined" && self.location && self.location.origin !== "null" ? new URL(self.location.origin + self.location.pathname + location.search) : new URL("https://github.com/cfworker");
function dereference(schema, lookup = /* @__PURE__ */ Object.create(null), baseURI = initialBaseURI, basePointer = "") {
  if (schema && typeof schema === "object" && !Array.isArray(schema)) {
    const id = schema.$id || schema.id;
    if (id) {
      const url = new URL(id, baseURI.href);
      if (url.hash.length > 1) {
        lookup[url.href] = schema;
      } else {
        url.hash = "";
        if (basePointer === "") {
          baseURI = url;
        } else {
          dereference(schema, lookup, baseURI);
        }
      }
    }
  } else if (schema !== true && schema !== false) {
    return lookup;
  }
  const schemaURI = baseURI.href + (basePointer ? "#" + basePointer : "");
  if (lookup[schemaURI] !== void 0) {
    throw new Error(`Duplicate schema URI "${schemaURI}".`);
  }
  lookup[schemaURI] = schema;
  if (schema === true || schema === false) {
    return lookup;
  }
  if (schema.__absolute_uri__ === void 0) {
    Object.defineProperty(schema, "__absolute_uri__", {
      enumerable: false,
      value: schemaURI
    });
  }
  if (schema.$ref && schema.__absolute_ref__ === void 0) {
    const url = new URL(schema.$ref, baseURI.href);
    url.hash = url.hash;
    Object.defineProperty(schema, "__absolute_ref__", {
      enumerable: false,
      value: url.href
    });
  }
  if (schema.$recursiveRef && schema.__absolute_recursive_ref__ === void 0) {
    const url = new URL(schema.$recursiveRef, baseURI.href);
    url.hash = url.hash;
    Object.defineProperty(schema, "__absolute_recursive_ref__", {
      enumerable: false,
      value: url.href
    });
  }
  if (schema.$anchor) {
    const url = new URL("#" + schema.$anchor, baseURI.href);
    lookup[url.href] = schema;
  }
  for (let key in schema) {
    if (ignoredKeyword[key]) {
      continue;
    }
    const keyBase = `${basePointer}/${encodePointer(key)}`;
    const subSchema = schema[key];
    if (Array.isArray(subSchema)) {
      if (schemaArrayKeyword[key]) {
        const length = subSchema.length;
        for (let i = 0; i < length; i++) {
          dereference(subSchema[i], lookup, baseURI, `${keyBase}/${i}`);
        }
      }
    } else if (schemaMapKeyword[key]) {
      for (let subKey in subSchema) {
        dereference(subSchema[subKey], lookup, baseURI, `${keyBase}/${encodePointer(subKey)}`);
      }
    } else {
      dereference(subSchema, lookup, baseURI, keyBase);
    }
  }
  return lookup;
}

// node_modules/@cfworker/json-schema/dist/esm/format.js
var DATE = /^(\d\d\d\d)-(\d\d)-(\d\d)$/;
var DAYS = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
var TIME = /^(\d\d):(\d\d):(\d\d)(\.\d+)?(z|[+-]\d\d(?::?\d\d)?)?$/i;
var HOSTNAME = /^(?=.{1,253}\.?$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[-0-9a-z]{0,61}[0-9a-z])?)*\.?$/i;
var URIREF = /^(?:[a-z][a-z0-9+\-.]*:)?(?:\/?\/(?:(?:[a-z0-9\-._~!$&'()*+,;=:]|%[0-9a-f]{2})*@)?(?:\[(?:(?:(?:(?:[0-9a-f]{1,4}:){6}|::(?:[0-9a-f]{1,4}:){5}|(?:[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){4}|(?:(?:[0-9a-f]{1,4}:){0,1}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){3}|(?:(?:[0-9a-f]{1,4}:){0,2}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){2}|(?:(?:[0-9a-f]{1,4}:){0,3}[0-9a-f]{1,4})?::[0-9a-f]{1,4}:|(?:(?:[0-9a-f]{1,4}:){0,4}[0-9a-f]{1,4})?::)(?:[0-9a-f]{1,4}:[0-9a-f]{1,4}|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?))|(?:(?:[0-9a-f]{1,4}:){0,5}[0-9a-f]{1,4})?::[0-9a-f]{1,4}|(?:(?:[0-9a-f]{1,4}:){0,6}[0-9a-f]{1,4})?::)|[Vv][0-9a-f]+\.[a-z0-9\-._~!$&'()*+,;=:]+)\]|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)|(?:[a-z0-9\-._~!$&'"()*+,;=]|%[0-9a-f]{2})*)(?::\d*)?(?:\/(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})*)*|\/(?:(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})*)*)?|(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})*)*)?(?:\?(?:[a-z0-9\-._~!$&'"()*+,;=:@/?]|%[0-9a-f]{2})*)?(?:#(?:[a-z0-9\-._~!$&'"()*+,;=:@/?]|%[0-9a-f]{2})*)?$/i;
var URITEMPLATE = /^(?:(?:[^\x00-\x20"'<>%\\^`{|}]|%[0-9a-f]{2})|\{[+#./;?&=,!@|]?(?:[a-z0-9_]|%[0-9a-f]{2})+(?::[1-9][0-9]{0,3}|\*)?(?:,(?:[a-z0-9_]|%[0-9a-f]{2})+(?::[1-9][0-9]{0,3}|\*)?)*\})*$/i;
var URL_ = /^(?:(?:https?|ftp):\/\/)(?:\S+(?::\S*)?@)?(?:(?!10(?:\.\d{1,3}){3})(?!127(?:\.\d{1,3}){3})(?!169\.254(?:\.\d{1,3}){2})(?!192\.168(?:\.\d{1,3}){2})(?!172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z\u{00a1}-\u{ffff}0-9]+-?)*[a-z\u{00a1}-\u{ffff}0-9]+)(?:\.(?:[a-z\u{00a1}-\u{ffff}0-9]+-?)*[a-z\u{00a1}-\u{ffff}0-9]+)*(?:\.(?:[a-z\u{00a1}-\u{ffff}]{2,})))(?::\d{2,5})?(?:\/[^\s]*)?$/iu;
var UUID = /^(?:urn:uuid:)?[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
var JSON_POINTER = /^(?:\/(?:[^~/]|~0|~1)*)*$/;
var JSON_POINTER_URI_FRAGMENT = /^#(?:\/(?:[a-z0-9_\-.!$&'()*+,;:=@]|%[0-9a-f]{2}|~0|~1)*)*$/i;
var RELATIVE_JSON_POINTER = /^(?:0|[1-9][0-9]*)(?:#|(?:\/(?:[^~/]|~0|~1)*)*)$/;
var EMAIL = (input) => {
  if (input[0] === '"')
    return false;
  const [name, host, ...rest] = input.split("@");
  if (!name || !host || rest.length !== 0 || name.length > 64 || host.length > 253)
    return false;
  if (name[0] === "." || name.endsWith(".") || name.includes(".."))
    return false;
  if (!/^[a-z0-9.-]+$/i.test(host) || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(name))
    return false;
  return host.split(".").every((part) => /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/i.test(part));
};
var IPV4 = /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/;
var IPV6 = /^((([0-9a-f]{1,4}:){7}([0-9a-f]{1,4}|:))|(([0-9a-f]{1,4}:){6}(:[0-9a-f]{1,4}|((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9a-f]{1,4}:){5}(((:[0-9a-f]{1,4}){1,2})|:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9a-f]{1,4}:){4}(((:[0-9a-f]{1,4}){1,3})|((:[0-9a-f]{1,4})?:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-f]{1,4}:){3}(((:[0-9a-f]{1,4}){1,4})|((:[0-9a-f]{1,4}){0,2}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-f]{1,4}:){2}(((:[0-9a-f]{1,4}){1,5})|((:[0-9a-f]{1,4}){0,3}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-f]{1,4}:){1}(((:[0-9a-f]{1,4}){1,6})|((:[0-9a-f]{1,4}){0,4}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(:(((:[0-9a-f]{1,4}){1,7})|((:[0-9a-f]{1,4}){0,5}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:)))$/i;
var DURATION = (input) => input.length > 1 && input.length < 80 && (/^P\d+([.,]\d+)?W$/.test(input) || /^P[\dYMDTHS]*(\d[.,]\d+)?[YMDHS]$/.test(input) && /^P([.,\d]+Y)?([.,\d]+M)?([.,\d]+D)?(T([.,\d]+H)?([.,\d]+M)?([.,\d]+S)?)?$/.test(input));
function bind(r) {
  return r.test.bind(r);
}
var format = {
  date,
  time: time.bind(void 0, false),
  "date-time": date_time,
  duration: DURATION,
  uri,
  "uri-reference": bind(URIREF),
  "uri-template": bind(URITEMPLATE),
  url: bind(URL_),
  email: EMAIL,
  hostname: bind(HOSTNAME),
  ipv4: bind(IPV4),
  ipv6: bind(IPV6),
  regex,
  uuid: bind(UUID),
  "json-pointer": bind(JSON_POINTER),
  "json-pointer-uri-fragment": bind(JSON_POINTER_URI_FRAGMENT),
  "relative-json-pointer": bind(RELATIVE_JSON_POINTER)
};
function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}
function date(str) {
  const matches = str.match(DATE);
  if (!matches)
    return false;
  const year = +matches[1];
  const month = +matches[2];
  const day = +matches[3];
  return month >= 1 && month <= 12 && day >= 1 && day <= (month == 2 && isLeapYear(year) ? 29 : DAYS[month]);
}
function time(full, str) {
  const matches = str.match(TIME);
  if (!matches)
    return false;
  const hour = +matches[1];
  const minute = +matches[2];
  const second = +matches[3];
  const timeZone = !!matches[5];
  return (hour <= 23 && minute <= 59 && second <= 59 || hour == 23 && minute == 59 && second == 60) && (!full || timeZone);
}
var DATE_TIME_SEPARATOR = /t|\s/i;
function date_time(str) {
  const dateTime = str.split(DATE_TIME_SEPARATOR);
  return dateTime.length == 2 && date(dateTime[0]) && time(true, dateTime[1]);
}
var NOT_URI_FRAGMENT = /\/|:/;
var URI_PATTERN = /^(?:[a-z][a-z0-9+\-.]*:)(?:\/?\/(?:(?:[a-z0-9\-._~!$&'()*+,;=:]|%[0-9a-f]{2})*@)?(?:\[(?:(?:(?:(?:[0-9a-f]{1,4}:){6}|::(?:[0-9a-f]{1,4}:){5}|(?:[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){4}|(?:(?:[0-9a-f]{1,4}:){0,1}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){3}|(?:(?:[0-9a-f]{1,4}:){0,2}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){2}|(?:(?:[0-9a-f]{1,4}:){0,3}[0-9a-f]{1,4})?::[0-9a-f]{1,4}:|(?:(?:[0-9a-f]{1,4}:){0,4}[0-9a-f]{1,4})?::)(?:[0-9a-f]{1,4}:[0-9a-f]{1,4}|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?))|(?:(?:[0-9a-f]{1,4}:){0,5}[0-9a-f]{1,4})?::[0-9a-f]{1,4}|(?:(?:[0-9a-f]{1,4}:){0,6}[0-9a-f]{1,4})?::)|[Vv][0-9a-f]+\.[a-z0-9\-._~!$&'()*+,;=:]+)\]|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)|(?:[a-z0-9\-._~!$&'()*+,;=]|%[0-9a-f]{2})*)(?::\d*)?(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*|\/(?:(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*)?|(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*)(?:\?(?:[a-z0-9\-._~!$&'()*+,;=:@/?]|%[0-9a-f]{2})*)?(?:#(?:[a-z0-9\-._~!$&'()*+,;=:@/?]|%[0-9a-f]{2})*)?$/i;
function uri(str) {
  return NOT_URI_FRAGMENT.test(str) && URI_PATTERN.test(str);
}
var Z_ANCHOR = /[^\\]\\Z/;
function regex(str) {
  if (Z_ANCHOR.test(str))
    return false;
  try {
    new RegExp(str, "u");
    return true;
  } catch (e) {
    return false;
  }
}

// node_modules/@cfworker/json-schema/dist/esm/types.js
var OutputFormat;
(function(OutputFormat2) {
  OutputFormat2[OutputFormat2["Flag"] = 1] = "Flag";
  OutputFormat2[OutputFormat2["Basic"] = 2] = "Basic";
  OutputFormat2[OutputFormat2["Detailed"] = 4] = "Detailed";
})(OutputFormat || (OutputFormat = {}));

// node_modules/@cfworker/json-schema/dist/esm/ucs2-length.js
function ucs2length(s) {
  let result = 0;
  let length = s.length;
  let index = 0;
  let charCode;
  while (index < length) {
    result++;
    charCode = s.charCodeAt(index++);
    if (charCode >= 55296 && charCode <= 56319 && index < length) {
      charCode = s.charCodeAt(index);
      if ((charCode & 64512) == 56320) {
        index++;
      }
    }
  }
  return result;
}

// node_modules/@cfworker/json-schema/dist/esm/validate.js
function validate(instance, schema, draft = "2019-09", lookup = dereference(schema), shortCircuit = true, recursiveAnchor = null, instanceLocation = "#", schemaLocation = "#", evaluated = /* @__PURE__ */ Object.create(null)) {
  if (schema === true) {
    return { valid: true, errors: [] };
  }
  if (schema === false) {
    return {
      valid: false,
      errors: [
        {
          instanceLocation,
          keyword: "false",
          keywordLocation: instanceLocation,
          error: "False boolean schema."
        }
      ]
    };
  }
  const rawInstanceType = typeof instance;
  let instanceType;
  switch (rawInstanceType) {
    case "boolean":
    case "number":
    case "string":
      instanceType = rawInstanceType;
      break;
    case "object":
      if (instance === null) {
        instanceType = "null";
      } else if (Array.isArray(instance)) {
        instanceType = "array";
      } else {
        instanceType = "object";
      }
      break;
    default:
      throw new Error(`Instances of "${rawInstanceType}" type are not supported.`);
  }
  const { $ref, $recursiveRef, $recursiveAnchor, type: $type, const: $const, enum: $enum, required: $required, not: $not, anyOf: $anyOf, allOf: $allOf, oneOf: $oneOf, if: $if, then: $then, else: $else, format: $format, properties: $properties, patternProperties: $patternProperties, additionalProperties: $additionalProperties, unevaluatedProperties: $unevaluatedProperties, minProperties: $minProperties, maxProperties: $maxProperties, propertyNames: $propertyNames, dependentRequired: $dependentRequired, dependentSchemas: $dependentSchemas, dependencies: $dependencies, prefixItems: $prefixItems, items: $items, additionalItems: $additionalItems, unevaluatedItems: $unevaluatedItems, contains: $contains, minContains: $minContains, maxContains: $maxContains, minItems: $minItems, maxItems: $maxItems, uniqueItems: $uniqueItems, minimum: $minimum, maximum: $maximum, exclusiveMinimum: $exclusiveMinimum, exclusiveMaximum: $exclusiveMaximum, multipleOf: $multipleOf, minLength: $minLength, maxLength: $maxLength, pattern: $pattern, __absolute_ref__, __absolute_recursive_ref__ } = schema;
  const errors = [];
  if ($recursiveAnchor === true && recursiveAnchor === null) {
    recursiveAnchor = schema;
  }
  if ($recursiveRef === "#") {
    const refSchema = recursiveAnchor === null ? lookup[__absolute_recursive_ref__] : recursiveAnchor;
    const keywordLocation = `${schemaLocation}/$recursiveRef`;
    const result = validate(instance, recursiveAnchor === null ? schema : recursiveAnchor, draft, lookup, shortCircuit, refSchema, instanceLocation, keywordLocation, evaluated);
    if (!result.valid) {
      errors.push({
        instanceLocation,
        keyword: "$recursiveRef",
        keywordLocation,
        error: "A subschema had errors."
      }, ...result.errors);
    }
  }
  if ($ref !== void 0) {
    const uri2 = __absolute_ref__ || $ref;
    const refSchema = lookup[uri2];
    if (refSchema === void 0) {
      let message = `Unresolved $ref "${$ref}".`;
      if (__absolute_ref__ && __absolute_ref__ !== $ref) {
        message += `  Absolute URI "${__absolute_ref__}".`;
      }
      message += `
Known schemas:
- ${Object.keys(lookup).join("\n- ")}`;
      throw new Error(message);
    }
    const keywordLocation = `${schemaLocation}/$ref`;
    const result = validate(instance, refSchema, draft, lookup, shortCircuit, recursiveAnchor, instanceLocation, keywordLocation, evaluated);
    if (!result.valid) {
      errors.push({
        instanceLocation,
        keyword: "$ref",
        keywordLocation,
        error: "A subschema had errors."
      }, ...result.errors);
    }
    if (draft === "4" || draft === "7") {
      return { valid: errors.length === 0, errors };
    }
  }
  if (Array.isArray($type)) {
    let length = $type.length;
    let valid = false;
    for (let i = 0; i < length; i++) {
      if (instanceType === $type[i] || $type[i] === "integer" && instanceType === "number" && instance % 1 === 0 && instance === instance) {
        valid = true;
        break;
      }
    }
    if (!valid) {
      errors.push({
        instanceLocation,
        keyword: "type",
        keywordLocation: `${schemaLocation}/type`,
        error: `Instance type "${instanceType}" is invalid. Expected "${$type.join('", "')}".`
      });
    }
  } else if ($type === "integer") {
    if (instanceType !== "number" || instance % 1 || instance !== instance) {
      errors.push({
        instanceLocation,
        keyword: "type",
        keywordLocation: `${schemaLocation}/type`,
        error: `Instance type "${instanceType}" is invalid. Expected "${$type}".`
      });
    }
  } else if ($type !== void 0 && instanceType !== $type) {
    errors.push({
      instanceLocation,
      keyword: "type",
      keywordLocation: `${schemaLocation}/type`,
      error: `Instance type "${instanceType}" is invalid. Expected "${$type}".`
    });
  }
  if ($const !== void 0) {
    if (instanceType === "object" || instanceType === "array") {
      if (!deepCompareStrict(instance, $const)) {
        errors.push({
          instanceLocation,
          keyword: "const",
          keywordLocation: `${schemaLocation}/const`,
          error: `Instance does not match ${JSON.stringify($const)}.`
        });
      }
    } else if (instance !== $const) {
      errors.push({
        instanceLocation,
        keyword: "const",
        keywordLocation: `${schemaLocation}/const`,
        error: `Instance does not match ${JSON.stringify($const)}.`
      });
    }
  }
  if ($enum !== void 0) {
    if (instanceType === "object" || instanceType === "array") {
      if (!$enum.some((value) => deepCompareStrict(instance, value))) {
        errors.push({
          instanceLocation,
          keyword: "enum",
          keywordLocation: `${schemaLocation}/enum`,
          error: `Instance does not match any of ${JSON.stringify($enum)}.`
        });
      }
    } else if (!$enum.some((value) => instance === value)) {
      errors.push({
        instanceLocation,
        keyword: "enum",
        keywordLocation: `${schemaLocation}/enum`,
        error: `Instance does not match any of ${JSON.stringify($enum)}.`
      });
    }
  }
  if ($not !== void 0) {
    const keywordLocation = `${schemaLocation}/not`;
    const result = validate(instance, $not, draft, lookup, shortCircuit, recursiveAnchor, instanceLocation, keywordLocation);
    if (result.valid) {
      errors.push({
        instanceLocation,
        keyword: "not",
        keywordLocation,
        error: 'Instance matched "not" schema.'
      });
    }
  }
  let subEvaluateds = [];
  if ($anyOf !== void 0) {
    const keywordLocation = `${schemaLocation}/anyOf`;
    const errorsLength = errors.length;
    let anyValid = false;
    for (let i = 0; i < $anyOf.length; i++) {
      const subSchema = $anyOf[i];
      const subEvaluated = Object.create(evaluated);
      const result = validate(instance, subSchema, draft, lookup, shortCircuit, $recursiveAnchor === true ? recursiveAnchor : null, instanceLocation, `${keywordLocation}/${i}`, subEvaluated);
      errors.push(...result.errors);
      anyValid = anyValid || result.valid;
      if (result.valid) {
        subEvaluateds.push(subEvaluated);
      }
    }
    if (anyValid) {
      errors.length = errorsLength;
    } else {
      errors.splice(errorsLength, 0, {
        instanceLocation,
        keyword: "anyOf",
        keywordLocation,
        error: "Instance does not match any subschemas."
      });
    }
  }
  if ($allOf !== void 0) {
    const keywordLocation = `${schemaLocation}/allOf`;
    const errorsLength = errors.length;
    let allValid = true;
    for (let i = 0; i < $allOf.length; i++) {
      const subSchema = $allOf[i];
      const subEvaluated = Object.create(evaluated);
      const result = validate(instance, subSchema, draft, lookup, shortCircuit, $recursiveAnchor === true ? recursiveAnchor : null, instanceLocation, `${keywordLocation}/${i}`, subEvaluated);
      errors.push(...result.errors);
      allValid = allValid && result.valid;
      if (result.valid) {
        subEvaluateds.push(subEvaluated);
      }
    }
    if (allValid) {
      errors.length = errorsLength;
    } else {
      errors.splice(errorsLength, 0, {
        instanceLocation,
        keyword: "allOf",
        keywordLocation,
        error: `Instance does not match every subschema.`
      });
    }
  }
  if ($oneOf !== void 0) {
    const keywordLocation = `${schemaLocation}/oneOf`;
    const errorsLength = errors.length;
    const matches = $oneOf.filter((subSchema, i) => {
      const subEvaluated = Object.create(evaluated);
      const result = validate(instance, subSchema, draft, lookup, shortCircuit, $recursiveAnchor === true ? recursiveAnchor : null, instanceLocation, `${keywordLocation}/${i}`, subEvaluated);
      errors.push(...result.errors);
      if (result.valid) {
        subEvaluateds.push(subEvaluated);
      }
      return result.valid;
    }).length;
    if (matches === 1) {
      errors.length = errorsLength;
    } else {
      errors.splice(errorsLength, 0, {
        instanceLocation,
        keyword: "oneOf",
        keywordLocation,
        error: `Instance does not match exactly one subschema (${matches} matches).`
      });
    }
  }
  if (instanceType === "object" || instanceType === "array") {
    Object.assign(evaluated, ...subEvaluateds);
  }
  if ($if !== void 0) {
    const keywordLocation = `${schemaLocation}/if`;
    const conditionResult = validate(instance, $if, draft, lookup, shortCircuit, recursiveAnchor, instanceLocation, keywordLocation, evaluated).valid;
    if (conditionResult) {
      if ($then !== void 0) {
        const thenResult = validate(instance, $then, draft, lookup, shortCircuit, recursiveAnchor, instanceLocation, `${schemaLocation}/then`, evaluated);
        if (!thenResult.valid) {
          errors.push({
            instanceLocation,
            keyword: "if",
            keywordLocation,
            error: `Instance does not match "then" schema.`
          }, ...thenResult.errors);
        }
      }
    } else if ($else !== void 0) {
      const elseResult = validate(instance, $else, draft, lookup, shortCircuit, recursiveAnchor, instanceLocation, `${schemaLocation}/else`, evaluated);
      if (!elseResult.valid) {
        errors.push({
          instanceLocation,
          keyword: "if",
          keywordLocation,
          error: `Instance does not match "else" schema.`
        }, ...elseResult.errors);
      }
    }
  }
  if (instanceType === "object") {
    if ($required !== void 0) {
      for (const key of $required) {
        if (!(key in instance)) {
          errors.push({
            instanceLocation,
            keyword: "required",
            keywordLocation: `${schemaLocation}/required`,
            error: `Instance does not have required property "${key}".`
          });
        }
      }
    }
    const keys = Object.keys(instance);
    if ($minProperties !== void 0 && keys.length < $minProperties) {
      errors.push({
        instanceLocation,
        keyword: "minProperties",
        keywordLocation: `${schemaLocation}/minProperties`,
        error: `Instance does not have at least ${$minProperties} properties.`
      });
    }
    if ($maxProperties !== void 0 && keys.length > $maxProperties) {
      errors.push({
        instanceLocation,
        keyword: "maxProperties",
        keywordLocation: `${schemaLocation}/maxProperties`,
        error: `Instance does not have at least ${$maxProperties} properties.`
      });
    }
    if ($propertyNames !== void 0) {
      const keywordLocation = `${schemaLocation}/propertyNames`;
      for (const key in instance) {
        const subInstancePointer = `${instanceLocation}/${encodePointer(key)}`;
        const result = validate(key, $propertyNames, draft, lookup, shortCircuit, recursiveAnchor, subInstancePointer, keywordLocation);
        if (!result.valid) {
          errors.push({
            instanceLocation,
            keyword: "propertyNames",
            keywordLocation,
            error: `Property name "${key}" does not match schema.`
          }, ...result.errors);
        }
      }
    }
    if ($dependentRequired !== void 0) {
      const keywordLocation = `${schemaLocation}/dependantRequired`;
      for (const key in $dependentRequired) {
        if (key in instance) {
          const required = $dependentRequired[key];
          for (const dependantKey of required) {
            if (!(dependantKey in instance)) {
              errors.push({
                instanceLocation,
                keyword: "dependentRequired",
                keywordLocation,
                error: `Instance has "${key}" but does not have "${dependantKey}".`
              });
            }
          }
        }
      }
    }
    if ($dependentSchemas !== void 0) {
      for (const key in $dependentSchemas) {
        const keywordLocation = `${schemaLocation}/dependentSchemas`;
        if (key in instance) {
          const result = validate(instance, $dependentSchemas[key], draft, lookup, shortCircuit, recursiveAnchor, instanceLocation, `${keywordLocation}/${encodePointer(key)}`, evaluated);
          if (!result.valid) {
            errors.push({
              instanceLocation,
              keyword: "dependentSchemas",
              keywordLocation,
              error: `Instance has "${key}" but does not match dependant schema.`
            }, ...result.errors);
          }
        }
      }
    }
    if ($dependencies !== void 0) {
      const keywordLocation = `${schemaLocation}/dependencies`;
      for (const key in $dependencies) {
        if (key in instance) {
          const propsOrSchema = $dependencies[key];
          if (Array.isArray(propsOrSchema)) {
            for (const dependantKey of propsOrSchema) {
              if (!(dependantKey in instance)) {
                errors.push({
                  instanceLocation,
                  keyword: "dependencies",
                  keywordLocation,
                  error: `Instance has "${key}" but does not have "${dependantKey}".`
                });
              }
            }
          } else {
            const result = validate(instance, propsOrSchema, draft, lookup, shortCircuit, recursiveAnchor, instanceLocation, `${keywordLocation}/${encodePointer(key)}`);
            if (!result.valid) {
              errors.push({
                instanceLocation,
                keyword: "dependencies",
                keywordLocation,
                error: `Instance has "${key}" but does not match dependant schema.`
              }, ...result.errors);
            }
          }
        }
      }
    }
    const thisEvaluated = /* @__PURE__ */ Object.create(null);
    let stop = false;
    if ($properties !== void 0) {
      const keywordLocation = `${schemaLocation}/properties`;
      for (const key in $properties) {
        if (!(key in instance)) {
          continue;
        }
        const subInstancePointer = `${instanceLocation}/${encodePointer(key)}`;
        const result = validate(instance[key], $properties[key], draft, lookup, shortCircuit, recursiveAnchor, subInstancePointer, `${keywordLocation}/${encodePointer(key)}`);
        if (result.valid) {
          evaluated[key] = thisEvaluated[key] = true;
        } else {
          stop = shortCircuit;
          errors.push({
            instanceLocation,
            keyword: "properties",
            keywordLocation,
            error: `Property "${key}" does not match schema.`
          }, ...result.errors);
          if (stop)
            break;
        }
      }
    }
    if (!stop && $patternProperties !== void 0) {
      const keywordLocation = `${schemaLocation}/patternProperties`;
      for (const pattern in $patternProperties) {
        const regex2 = new RegExp(pattern, "u");
        const subSchema = $patternProperties[pattern];
        for (const key in instance) {
          if (!regex2.test(key)) {
            continue;
          }
          const subInstancePointer = `${instanceLocation}/${encodePointer(key)}`;
          const result = validate(instance[key], subSchema, draft, lookup, shortCircuit, recursiveAnchor, subInstancePointer, `${keywordLocation}/${encodePointer(pattern)}`);
          if (result.valid) {
            evaluated[key] = thisEvaluated[key] = true;
          } else {
            stop = shortCircuit;
            errors.push({
              instanceLocation,
              keyword: "patternProperties",
              keywordLocation,
              error: `Property "${key}" matches pattern "${pattern}" but does not match associated schema.`
            }, ...result.errors);
          }
        }
      }
    }
    if (!stop && $additionalProperties !== void 0) {
      const keywordLocation = `${schemaLocation}/additionalProperties`;
      for (const key in instance) {
        if (thisEvaluated[key]) {
          continue;
        }
        const subInstancePointer = `${instanceLocation}/${encodePointer(key)}`;
        const result = validate(instance[key], $additionalProperties, draft, lookup, shortCircuit, recursiveAnchor, subInstancePointer, keywordLocation);
        if (result.valid) {
          evaluated[key] = true;
        } else {
          stop = shortCircuit;
          errors.push({
            instanceLocation,
            keyword: "additionalProperties",
            keywordLocation,
            error: `Property "${key}" does not match additional properties schema.`
          }, ...result.errors);
        }
      }
    } else if (!stop && $unevaluatedProperties !== void 0) {
      const keywordLocation = `${schemaLocation}/unevaluatedProperties`;
      for (const key in instance) {
        if (!evaluated[key]) {
          const subInstancePointer = `${instanceLocation}/${encodePointer(key)}`;
          const result = validate(instance[key], $unevaluatedProperties, draft, lookup, shortCircuit, recursiveAnchor, subInstancePointer, keywordLocation);
          if (result.valid) {
            evaluated[key] = true;
          } else {
            errors.push({
              instanceLocation,
              keyword: "unevaluatedProperties",
              keywordLocation,
              error: `Property "${key}" does not match unevaluated properties schema.`
            }, ...result.errors);
          }
        }
      }
    }
  } else if (instanceType === "array") {
    if ($maxItems !== void 0 && instance.length > $maxItems) {
      errors.push({
        instanceLocation,
        keyword: "maxItems",
        keywordLocation: `${schemaLocation}/maxItems`,
        error: `Array has too many items (${instance.length} > ${$maxItems}).`
      });
    }
    if ($minItems !== void 0 && instance.length < $minItems) {
      errors.push({
        instanceLocation,
        keyword: "minItems",
        keywordLocation: `${schemaLocation}/minItems`,
        error: `Array has too few items (${instance.length} < ${$minItems}).`
      });
    }
    const length = instance.length;
    let i = 0;
    let stop = false;
    if ($prefixItems !== void 0) {
      const keywordLocation = `${schemaLocation}/prefixItems`;
      const length2 = Math.min($prefixItems.length, length);
      for (; i < length2; i++) {
        const result = validate(instance[i], $prefixItems[i], draft, lookup, shortCircuit, recursiveAnchor, `${instanceLocation}/${i}`, `${keywordLocation}/${i}`);
        evaluated[i] = true;
        if (!result.valid) {
          stop = shortCircuit;
          errors.push({
            instanceLocation,
            keyword: "prefixItems",
            keywordLocation,
            error: `Items did not match schema.`
          }, ...result.errors);
          if (stop)
            break;
        }
      }
    }
    if ($items !== void 0) {
      const keywordLocation = `${schemaLocation}/items`;
      if (Array.isArray($items)) {
        const length2 = Math.min($items.length, length);
        for (; i < length2; i++) {
          const result = validate(instance[i], $items[i], draft, lookup, shortCircuit, recursiveAnchor, `${instanceLocation}/${i}`, `${keywordLocation}/${i}`);
          evaluated[i] = true;
          if (!result.valid) {
            stop = shortCircuit;
            errors.push({
              instanceLocation,
              keyword: "items",
              keywordLocation,
              error: `Items did not match schema.`
            }, ...result.errors);
            if (stop)
              break;
          }
        }
      } else {
        for (; i < length; i++) {
          const result = validate(instance[i], $items, draft, lookup, shortCircuit, recursiveAnchor, `${instanceLocation}/${i}`, keywordLocation);
          evaluated[i] = true;
          if (!result.valid) {
            stop = shortCircuit;
            errors.push({
              instanceLocation,
              keyword: "items",
              keywordLocation,
              error: `Items did not match schema.`
            }, ...result.errors);
            if (stop)
              break;
          }
        }
      }
      if (!stop && $additionalItems !== void 0) {
        const keywordLocation2 = `${schemaLocation}/additionalItems`;
        for (; i < length; i++) {
          const result = validate(instance[i], $additionalItems, draft, lookup, shortCircuit, recursiveAnchor, `${instanceLocation}/${i}`, keywordLocation2);
          evaluated[i] = true;
          if (!result.valid) {
            stop = shortCircuit;
            errors.push({
              instanceLocation,
              keyword: "additionalItems",
              keywordLocation: keywordLocation2,
              error: `Items did not match additional items schema.`
            }, ...result.errors);
          }
        }
      }
    }
    if ($contains !== void 0) {
      if (length === 0 && $minContains === void 0) {
        errors.push({
          instanceLocation,
          keyword: "contains",
          keywordLocation: `${schemaLocation}/contains`,
          error: `Array is empty. It must contain at least one item matching the schema.`
        });
      } else if ($minContains !== void 0 && length < $minContains) {
        errors.push({
          instanceLocation,
          keyword: "minContains",
          keywordLocation: `${schemaLocation}/minContains`,
          error: `Array has less items (${length}) than minContains (${$minContains}).`
        });
      } else {
        const keywordLocation = `${schemaLocation}/contains`;
        const errorsLength = errors.length;
        let contained = 0;
        for (let j = 0; j < length; j++) {
          const result = validate(instance[j], $contains, draft, lookup, shortCircuit, recursiveAnchor, `${instanceLocation}/${j}`, keywordLocation);
          if (result.valid) {
            evaluated[j] = true;
            contained++;
          } else {
            errors.push(...result.errors);
          }
        }
        if (contained >= ($minContains || 0)) {
          errors.length = errorsLength;
        }
        if ($minContains === void 0 && $maxContains === void 0 && contained === 0) {
          errors.splice(errorsLength, 0, {
            instanceLocation,
            keyword: "contains",
            keywordLocation,
            error: `Array does not contain item matching schema.`
          });
        } else if ($minContains !== void 0 && contained < $minContains) {
          errors.push({
            instanceLocation,
            keyword: "minContains",
            keywordLocation: `${schemaLocation}/minContains`,
            error: `Array must contain at least ${$minContains} items matching schema. Only ${contained} items were found.`
          });
        } else if ($maxContains !== void 0 && contained > $maxContains) {
          errors.push({
            instanceLocation,
            keyword: "maxContains",
            keywordLocation: `${schemaLocation}/maxContains`,
            error: `Array may contain at most ${$maxContains} items matching schema. ${contained} items were found.`
          });
        }
      }
    }
    if (!stop && $unevaluatedItems !== void 0) {
      const keywordLocation = `${schemaLocation}/unevaluatedItems`;
      for (i; i < length; i++) {
        if (evaluated[i]) {
          continue;
        }
        const result = validate(instance[i], $unevaluatedItems, draft, lookup, shortCircuit, recursiveAnchor, `${instanceLocation}/${i}`, keywordLocation);
        evaluated[i] = true;
        if (!result.valid) {
          errors.push({
            instanceLocation,
            keyword: "unevaluatedItems",
            keywordLocation,
            error: `Items did not match unevaluated items schema.`
          }, ...result.errors);
        }
      }
    }
    if ($uniqueItems) {
      for (let j = 0; j < length; j++) {
        const a = instance[j];
        const ao = typeof a === "object" && a !== null;
        for (let k = 0; k < length; k++) {
          if (j === k) {
            continue;
          }
          const b = instance[k];
          const bo = typeof b === "object" && b !== null;
          if (a === b || ao && bo && deepCompareStrict(a, b)) {
            errors.push({
              instanceLocation,
              keyword: "uniqueItems",
              keywordLocation: `${schemaLocation}/uniqueItems`,
              error: `Duplicate items at indexes ${j} and ${k}.`
            });
            j = Number.MAX_SAFE_INTEGER;
            k = Number.MAX_SAFE_INTEGER;
          }
        }
      }
    }
  } else if (instanceType === "number") {
    if (draft === "4") {
      if ($minimum !== void 0 && ($exclusiveMinimum === true && instance <= $minimum || instance < $minimum)) {
        errors.push({
          instanceLocation,
          keyword: "minimum",
          keywordLocation: `${schemaLocation}/minimum`,
          error: `${instance} is less than ${$exclusiveMinimum ? "or equal to " : ""} ${$minimum}.`
        });
      }
      if ($maximum !== void 0 && ($exclusiveMaximum === true && instance >= $maximum || instance > $maximum)) {
        errors.push({
          instanceLocation,
          keyword: "maximum",
          keywordLocation: `${schemaLocation}/maximum`,
          error: `${instance} is greater than ${$exclusiveMaximum ? "or equal to " : ""} ${$maximum}.`
        });
      }
    } else {
      if ($minimum !== void 0 && instance < $minimum) {
        errors.push({
          instanceLocation,
          keyword: "minimum",
          keywordLocation: `${schemaLocation}/minimum`,
          error: `${instance} is less than ${$minimum}.`
        });
      }
      if ($maximum !== void 0 && instance > $maximum) {
        errors.push({
          instanceLocation,
          keyword: "maximum",
          keywordLocation: `${schemaLocation}/maximum`,
          error: `${instance} is greater than ${$maximum}.`
        });
      }
      if ($exclusiveMinimum !== void 0 && instance <= $exclusiveMinimum) {
        errors.push({
          instanceLocation,
          keyword: "exclusiveMinimum",
          keywordLocation: `${schemaLocation}/exclusiveMinimum`,
          error: `${instance} is less than ${$exclusiveMinimum}.`
        });
      }
      if ($exclusiveMaximum !== void 0 && instance >= $exclusiveMaximum) {
        errors.push({
          instanceLocation,
          keyword: "exclusiveMaximum",
          keywordLocation: `${schemaLocation}/exclusiveMaximum`,
          error: `${instance} is greater than or equal to ${$exclusiveMaximum}.`
        });
      }
    }
    if ($multipleOf !== void 0) {
      const remainder = instance % $multipleOf;
      if (Math.abs(0 - remainder) >= 11920929e-14 && Math.abs($multipleOf - remainder) >= 11920929e-14) {
        errors.push({
          instanceLocation,
          keyword: "multipleOf",
          keywordLocation: `${schemaLocation}/multipleOf`,
          error: `${instance} is not a multiple of ${$multipleOf}.`
        });
      }
    }
  } else if (instanceType === "string") {
    const length = $minLength === void 0 && $maxLength === void 0 ? 0 : ucs2length(instance);
    if ($minLength !== void 0 && length < $minLength) {
      errors.push({
        instanceLocation,
        keyword: "minLength",
        keywordLocation: `${schemaLocation}/minLength`,
        error: `String is too short (${length} < ${$minLength}).`
      });
    }
    if ($maxLength !== void 0 && length > $maxLength) {
      errors.push({
        instanceLocation,
        keyword: "maxLength",
        keywordLocation: `${schemaLocation}/maxLength`,
        error: `String is too long (${length} > ${$maxLength}).`
      });
    }
    if ($pattern !== void 0 && !new RegExp($pattern, "u").test(instance)) {
      errors.push({
        instanceLocation,
        keyword: "pattern",
        keywordLocation: `${schemaLocation}/pattern`,
        error: `String does not match pattern.`
      });
    }
    if ($format !== void 0 && format[$format] && !format[$format](instance)) {
      errors.push({
        instanceLocation,
        keyword: "format",
        keywordLocation: `${schemaLocation}/format`,
        error: `String does not match format "${$format}".`
      });
    }
  }
  return { valid: errors.length === 0, errors };
}

// node_modules/@cfworker/json-schema/dist/esm/validator.js
var Validator = class {
  constructor(schema, draft = "2019-09", shortCircuit = true) {
    __publicField(this, "schema");
    __publicField(this, "draft");
    __publicField(this, "shortCircuit");
    __publicField(this, "lookup");
    this.schema = schema;
    this.draft = draft;
    this.shortCircuit = shortCircuit;
    this.lookup = dereference(schema);
  }
  validate(instance) {
    return validate(instance, this.schema, this.draft, this.lookup, this.shortCircuit);
  }
  addSchema(schema, id) {
    if (id) {
      schema = { ...schema, $id: id };
    }
    dereference(schema, this.lookup);
  }
};

// src/validation.ts
var schemaRef = { $ref: "#" };
var schemaMap = { type: "object", additionalProperties: schemaRef };
var nonnegativeInteger = { type: "integer", minimum: 0 };
var strings = {
  type: "array",
  items: { type: "string" },
  uniqueItems: true
};
var schemaArray = { type: "array", minItems: 1, items: schemaRef };
var metaSchema = {
  anyOf: [
    { type: "boolean" },
    {
      type: "object",
      properties: {
        type: {
          anyOf: [
            {
              enum: [
                "object",
                "array",
                "string",
                "number",
                "integer",
                "boolean",
                "null"
              ]
            },
            {
              type: "array",
              minItems: 1,
              uniqueItems: true,
              items: {
                enum: [
                  "object",
                  "array",
                  "string",
                  "number",
                  "integer",
                  "boolean",
                  "null"
                ]
              }
            }
          ]
        },
        properties: schemaMap,
        patternProperties: schemaMap,
        $defs: schemaMap,
        definitions: schemaMap,
        required: strings,
        enum: { type: "array", minItems: 1, uniqueItems: true },
        $ref: { type: "string" },
        $id: { type: "string" },
        $schema: { type: "string" },
        $anchor: { type: "string" },
        additionalProperties: schemaRef,
        unevaluatedProperties: schemaRef,
        not: schemaRef,
        if: schemaRef,
        then: schemaRef,
        else: schemaRef,
        anyOf: schemaArray,
        oneOf: schemaArray,
        allOf: schemaArray,
        items: { anyOf: [schemaRef, { type: "array", items: schemaRef }] },
        prefixItems: schemaArray,
        additionalItems: schemaRef,
        unevaluatedItems: schemaRef,
        contains: schemaRef,
        propertyNames: schemaRef,
        minItems: nonnegativeInteger,
        maxItems: nonnegativeInteger,
        minContains: nonnegativeInteger,
        maxContains: nonnegativeInteger,
        minProperties: nonnegativeInteger,
        maxProperties: nonnegativeInteger,
        minLength: nonnegativeInteger,
        maxLength: nonnegativeInteger,
        uniqueItems: { type: "boolean" },
        minimum: { type: "number" },
        maximum: { type: "number" },
        multipleOf: { type: "number", exclusiveMinimum: 0 },
        exclusiveMinimum: { type: ["number", "boolean"] },
        exclusiveMaximum: { type: ["number", "boolean"] },
        pattern: { type: "string" },
        format: { type: "string" },
        dependentRequired: { type: "object", additionalProperties: strings },
        dependentSchemas: schemaMap,
        dependencies: {
          type: "object",
          additionalProperties: { anyOf: [schemaRef, strings] }
        }
      }
    }
  ]
};
var metaValidator = new Validator(metaSchema, "2020-12");
function checkSafePattern(pattern) {
  const unsupported = () => {
    throw new Error(
      "Unsupported JSON Schema pattern: use the bounded linear regular-expression subset"
    );
  };
  if (pattern.length > 512) unsupported();
  let i = 0;
  let width = 0;
  const escaped = () => {
    i++;
    const token = pattern[i++];
    if (!token) unsupported();
    if ("dDsSwWnrtfv".includes(token)) return;
    if ("^$\\.*+?()[]{}|/-".includes(token)) return;
    const digits = token === "x" ? 2 : token === "u" ? 4 : 0;
    if (digits && /^[0-9a-fA-F]+$/.test(pattern.slice(i, i + digits)) && i + digits <= pattern.length) {
      i += digits;
      return;
    }
    unsupported();
  };
  while (i < pattern.length) {
    const token = pattern[i];
    if (token === "^" && i === 0) {
      i++;
      continue;
    }
    if (token === "$" && i === pattern.length - 1) {
      i++;
      continue;
    }
    if (token === "\\") escaped();
    else if (token === "[") {
      i++;
      if (pattern[i] === "^") i++;
      let closed = false;
      while (i < pattern.length) {
        if (pattern[i] === "\\") escaped();
        else if (pattern[i++] === "]") {
          closed = true;
          break;
        }
      }
      if (!closed) unsupported();
    } else {
      if ("^$()|*+?{}".includes(token)) unsupported();
      i++;
    }
    let repetitions = 1;
    if (pattern[i] === "{") {
      const match = /^\{([1-9][0-9]{0,2})\}/.exec(pattern.slice(i));
      if (!match) unsupported();
      repetitions = Number(match[1]);
      i += match[0].length;
    } else if (pattern[i] === "*" || pattern[i] === "+") {
      if (pattern[0] !== "^" || pattern.slice(i + 1) !== "$") unsupported();
      i++;
    }
    width += repetitions;
    if (width > 256) unsupported();
  }
  new RegExp(pattern, "u");
}
function checkSubschemas(schema, draft) {
  if (!schema || typeof schema !== "object") return;
  const obj = schema;
  for (const keyword of [
    "$dynamicRef",
    "$dynamicAnchor",
    "__absolute_ref__",
    "__absolute_recursive_ref__",
    "__absolute_uri__"
  ]) {
    if (Object.prototype.hasOwnProperty.call(obj, keyword))
      throw new Error(
        `Unsupported or internal JSON Schema keyword: ${keyword}`
      );
  }
  for (const keyword of ["exclusiveMinimum", "exclusiveMaximum"]) {
    if (obj[keyword] !== void 0 && typeof obj[keyword] !== (draft === "4" ? "boolean" : "number"))
      throw new Error(`Invalid JSON Schema ${keyword} for draft ${draft}`);
  }
  if (draft === "2020-12" && Array.isArray(obj.items))
    throw new Error(
      "Invalid JSON Schema: 2020-12 uses prefixItems for tuple schemas"
    );
  if (typeof obj.format === "string" && ["url", "uri", "uri-reference"].includes(obj.format))
    throw new Error(
      `Unsupported JSON Schema format with complex upstream regular expressions: ${obj.format}`
    );
  if (typeof obj.pattern === "string") checkSafePattern(obj.pattern);
  for (const keyword of [
    "properties",
    "patternProperties",
    "$defs",
    "definitions",
    "dependentSchemas",
    "dependencies"
  ]) {
    const map = obj[keyword];
    if (map && typeof map === "object")
      for (const [key, value] of Object.entries(map)) {
        if (keyword === "patternProperties") checkSafePattern(key);
        checkSubschemas(value, draft);
      }
  }
  for (const keyword of ["anyOf", "oneOf", "allOf", "prefixItems"]) {
    const values = obj[keyword];
    if (Array.isArray(values))
      values.forEach((value) => checkSubschemas(value, draft));
  }
  for (const keyword of [
    "not",
    "if",
    "then",
    "else",
    "items",
    "additionalItems",
    "additionalProperties",
    "unevaluatedItems",
    "unevaluatedProperties",
    "contains",
    "propertyNames"
  ]) {
    const value = obj[keyword];
    if (Array.isArray(value))
      value.forEach((item) => checkSubschemas(item, draft));
    else checkSubschemas(value, draft);
  }
}
function compileSchema(schema) {
  const copied = snapshotInput(schema, {
    maxInputBytes: 262144,
    maxInputNodes: 1e4,
    maxInputDepth: 64
  });
  const shape = metaValidator.validate(copied);
  if (!shape.valid)
    throw new Error(
      `Invalid JSON Schema: ${shape.errors.map((error) => error.error).join("; ")}`
    );
  if (copied.type !== "object")
    throw new Error('WebMCP Kit: inputSchema must have type "object"');
  const draftByUri = {
    "http://json-schema.org/draft-04/schema#": "4",
    "http://json-schema.org/draft-07/schema#": "7",
    "https://json-schema.org/draft/2019-09/schema": "2019-09",
    "https://json-schema.org/draft/2020-12/schema": "2020-12"
  };
  const uri2 = copied.$schema;
  if (uri2 !== void 0 && (typeof uri2 !== "string" || !draftByUri[uri2]))
    throw new Error("Unsupported JSON Schema draft");
  const draft = uri2 ? draftByUri[uri2] : "2020-12";
  checkSubschemas(copied, draft);
  const validator = new Validator(copied, draft);
  return (input) => {
    const result = validator.validate(input);
    return {
      valid: result.valid,
      errors: result.errors.map(
        (error) => `${error.instanceLocation || "/"}: ${error.error}${error.keyword === "enum" ? " (must be one of enum values)" : ""}`
      )
    };
  };
}

// src/browser.ts
function modernContext() {
  const context = typeof document !== "undefined" ? document.modelContext : void 0;
  return context && typeof context.registerTool === "function" ? context : void 0;
}
function legacyContext() {
  const context = typeof navigator !== "undefined" ? navigator.modelContext : void 0;
  return context && typeof context.registerTool === "function" && typeof context.unregisterTool === "function" ? context : void 0;
}
function registerBrowserTool(tool, mode) {
  if (mode === "none") return void 0;
  if (mode === "legacy") {
    const context2 = legacyContext();
    if (!context2) return void 0;
    let ready2;
    try {
      context2.registerTool(tool);
      ready2 = Promise.resolve();
    } catch (error) {
      ready2 = Promise.reject(error);
    }
    return { ready: ready2, abort: () => context2.unregisterTool(tool.name) };
  }
  const context = modernContext();
  if (!context) return void 0;
  const controller = new AbortController();
  let ready;
  const annotations = tool.annotations;
  const consequential = annotations?.consequentialHint === true || annotations?.destructiveHint === true || annotations?.confirmationHint === true ? true : annotations?.consequentialHint ?? annotations?.destructiveHint ?? annotations?.confirmationHint;
  const nativeAnnotations = annotations ? {
    ...annotations.readOnlyHint !== void 0 ? { readOnlyHint: annotations.readOnlyHint } : {},
    ...consequential !== void 0 ? { consequentialHint: consequential } : {},
    ...annotations.untrustedContentHint !== void 0 ? { untrustedContentHint: annotations.untrustedContentHint } : {},
    ...annotations.debugging !== void 0 ? { debugging: annotations.debugging } : {}
  } : void 0;
  try {
    ready = Promise.resolve(
      context.registerTool(
        {
          name: tool.name,
          title: tool.title ?? annotations?.title,
          description: tool.description,
          inputSchema: tool.inputSchema,
          annotations: nativeAnnotations,
          execute: async (input, options) => tool.handler(
            input,
            options?.signal ? { signal: options.signal } : void 0
          )
        },
        { signal: controller.signal }
      )
    );
  } catch (error) {
    ready = Promise.reject(error);
  }
  return { ready, abort: () => controller.abort() };
}

// src/core.ts
var TOOL_NAME_REGEX = /^[a-z][a-z0-9_.-]*$/;
function validateToolName(name) {
  if (typeof name !== "string" || !name)
    throw new Error("WebMCP Kit: Tool name cannot be empty");
  if (name.length > 64)
    throw new Error("WebMCP Kit: Tool name exceeds 64 characters");
  if (!TOOL_NAME_REGEX.test(name))
    throw new Error(
      "WebMCP Kit: Tool name must be lowercase alphanumeric with hyphens/dots/underscores"
    );
}
function asError(error) {
  return error instanceof Error ? error : new Error(String(error));
}
function abortError(signal) {
  return signal.reason instanceof Error ? signal.reason : new Error("Tool invocation aborted");
}
var ConcurrencyLimiter = class {
  constructor(max, maxQueued) {
    this.max = max;
    this.maxQueued = maxQueued;
    this.running = 0;
    this.queue = [];
  }
  acquire(signal) {
    if (signal.aborted) return Promise.reject(abortError(signal));
    if (this.running < this.max) {
      this.running++;
      return Promise.resolve(() => this.release());
    }
    if (this.queue.length >= this.maxQueued)
      return Promise.reject(new Error("WebMCP Kit: Invocation queue is full"));
    return new Promise((resolve, reject) => {
      const entry = {
        signal,
        reject,
        start: () => {
          signal.removeEventListener("abort", entry.cancel);
          this.running++;
          resolve(() => this.release());
        },
        cancel: () => {
          const index = this.queue.indexOf(entry);
          if (index >= 0) this.queue.splice(index, 1);
          reject(abortError(signal));
        }
      };
      this.queue.push(entry);
      signal.addEventListener("abort", entry.cancel, { once: true });
    });
  }
  release() {
    this.running--;
    const next = this.queue.shift();
    if (next) next.start();
  }
};
var WebMCPKit = class {
  constructor(config = {}) {
    this.tools = /* @__PURE__ */ new Map();
    this.admitted = 0;
    this.registrations = /* @__PURE__ */ new Map();
    this.listeners = /* @__PURE__ */ new Set();
    this.lifetimes = /* @__PURE__ */ new Map();
    this.config = {
      ...config,
      maxConcurrent: config.maxConcurrent ?? 10,
      maxQueued: config.maxQueued ?? 100,
      timeoutMs: config.timeoutMs ?? 3e4,
      maxInputBytes: config.maxInputBytes ?? 65536,
      maxInputNodes: config.maxInputNodes ?? 1e3,
      maxInputDepth: config.maxInputDepth ?? 10,
      browserAdapter: config.browserAdapter ?? "modern"
    };
    for (const key of [
      "maxConcurrent",
      "maxQueued",
      "timeoutMs",
      "maxInputBytes",
      "maxInputNodes",
      "maxInputDepth"
    ])
      validateLimit(key, this.config[key], key === "maxQueued");
    validateLimit(
      "total invocation capacity",
      this.config.maxConcurrent + this.config.maxQueued
    );
    if (this.config.timeoutMs > 2147483647)
      throw new Error("WebMCP Kit: timeoutMs exceeds supported timer limit");
    if (!["modern", "legacy", "none"].includes(this.config.browserAdapter))
      throw new Error("Invalid browserAdapter");
    if (this.config.prefix) validateToolName(this.config.prefix);
    if (this.config.confirmationProvider !== void 0 && typeof this.config.confirmationProvider !== "function")
      throw new Error("confirmationProvider must be a function");
    this.limiter = new ConcurrencyLimiter(
      this.config.maxConcurrent,
      this.config.maxQueued
    );
  }
  static isAvailable() {
    return !!modernContext();
  }
  getFullName(name) {
    return this.config.prefix && !name.startsWith(`${this.config.prefix}.`) ? `${this.config.prefix}.${name}` : name;
  }
  subscribe(listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  register(tool, options = {}) {
    const fullName = this.getFullName(tool.name);
    validateToolName(fullName);
    const schema = snapshotInput(tool.inputSchema, {
      maxInputBytes: 262144,
      maxInputNodes: 1e4,
      maxInputDepth: 64
    });
    const validate2 = compileSchema(schema);
    if (typeof tool.handler !== "function")
      throw new Error("WebMCP Kit: handler must be a function");
    if (this.tools.has(fullName) && !options.replace)
      throw new Error(
        `WebMCP Kit: Tool "${fullName}" is already registered. Use { replace: true } to override.`
      );
    this.lifetimes.get(fullName)?.abort(new Error("Tool registration revoked: replaced"));
    const lifetime = new AbortController();
    this.lifetimes.set(fullName, lifetime);
    this.registrations.get(fullName)?.abort();
    this.registrations.delete(fullName);
    const wrapped = {
      ...tool,
      name: fullName,
      inputSchema: schema,
      handler: (input, context) => this.execute(
        fullName,
        tool,
        validate2,
        input,
        context,
        lifetime.signal
      )
    };
    this.tools.set(fullName, wrapped);
    const registration = registerBrowserTool(
      wrapped,
      this.config.browserAdapter
    );
    if (registration) {
      registration.ready = registration.ready.catch((error) => {
        this.reportError(asError(error), fullName, void 0);
        throw error;
      });
      void registration.ready.catch(() => {
      });
      this.registrations.set(fullName, registration);
    }
  }
  async ready() {
    await Promise.all(
      [...this.registrations.values()].map((value) => value.ready)
    );
  }
  unregister(name) {
    const fullName = this.getFullName(name);
    this.tools.delete(fullName);
    this.lifetimes.get(fullName)?.abort(new Error("Tool registration revoked: unregistered"));
    this.lifetimes.delete(fullName);
    this.registrations.get(fullName)?.abort();
    this.registrations.delete(fullName);
  }
  unregisterAll() {
    for (const controller of this.lifetimes.values())
      controller.abort(new Error("Tool registration revoked: unregistered"));
    this.lifetimes.clear();
    for (const registration of this.registrations.values())
      registration.abort();
    this.tools.clear();
    this.registrations.clear();
  }
  getTools() {
    return [...this.tools.values()];
  }
  getTool(name) {
    return this.tools.get(this.getFullName(name));
  }
  async invoke(name, input, options = {}) {
    const tool = this.getTool(name);
    if (!tool)
      throw new Error(`WebMCP Kit: Tool "${this.getFullName(name)}" not found`);
    return tool.handler(
      input,
      options.signal ? { signal: options.signal } : void 0
    );
  }
  async requestUserInteraction(reason) {
    if (!this.config.confirmationProvider)
      throw new Error("WebMCP Kit: Explicit confirmationProvider is required");
    return await this.config.confirmationProvider(reason) === true;
  }
  reportError(error, name, input) {
    try {
      this.config.onError?.(error, name, input);
    } catch {
    }
  }
  complete(event, result) {
    try {
      this.config.onAfterInvoke?.(event, result);
    } catch (error) {
      this.reportError(asError(error), event.toolName, event.input);
    }
    for (const listener of this.listeners) {
      try {
        listener(event, result);
      } catch (error) {
        this.reportError(asError(error), event.toolName, event.input);
      }
    }
  }
  /** Retain total admission until asynchronous policy/operation work actually quiesces. */
  acquireAdmission() {
    if (this.admitted >= this.config.maxConcurrent + this.config.maxQueued)
      throw new Error(
        "WebMCP Kit: Invocation admission capacity and queue are full"
      );
    this.admitted++;
    return () => {
      this.admitted--;
    };
  }
  async execute(name, tool, validate2, raw, external, lifetime) {
    const start = Date.now();
    const controller = new AbortController();
    const context = Object.freeze({
      signal: controller.signal
    });
    const externalAbort = () => controller.abort(
      external?.signal.reason ?? new Error("Tool invocation aborted")
    );
    external?.signal.addEventListener("abort", externalAbort, { once: true });
    if (external?.signal.aborted) externalAbort();
    const lifetimeAbort = () => controller.abort(
      lifetime?.reason ?? new Error("Tool registration revoked: unregistered")
    );
    lifetime?.addEventListener("abort", lifetimeAbort, { once: true });
    if (lifetime?.aborted) lifetimeAbort();
    const timer = setTimeout(
      () => controller.abort(
        new Error(`Tool invocation timeout after ${this.config.timeoutMs}ms`)
      ),
      this.config.timeoutMs
    );
    let event = {
      toolName: name,
      input: {},
      timestamp: start
    };
    let rejectAbort;
    const aborted = new Promise((_, reject) => {
      rejectAbort = reject;
    });
    const onAbort = () => rejectAbort(abortError(controller.signal));
    controller.signal.addEventListener("abort", onAbort, { once: true });
    if (controller.signal.aborted) onAbort();
    const operation = async () => {
      if (controller.signal.aborted) throw abortError(controller.signal);
      const releaseAdmission = this.acquireAdmission();
      try {
        const input = snapshotInput(raw, this.config);
        freezeInput(input);
        event = { ...event, input };
        const result = validate2(input);
        if (!result.valid)
          throw new Error(
            `Input validation failed: ${result.errors.join("; ")}`
          );
        if (this.config.onBeforeInvoke && !await this.config.onBeforeInvoke(event))
          throw new Error("Tool invocation blocked by onBeforeInvoke hook");
        if (controller.signal.aborted) throw abortError(controller.signal);
        await tool.admit?.(input, context);
        if (controller.signal.aborted) throw abortError(controller.signal);
        const release = await this.limiter.acquire(controller.signal);
        try {
          if (controller.signal.aborted) throw abortError(controller.signal);
          return await tool.handler(input, context);
        } finally {
          release();
        }
      } finally {
        releaseAdmission();
      }
    };
    try {
      const data = await Promise.race([operation(), aborted]);
      this.complete(event, {
        success: true,
        data,
        metadata: {
          executionMs: Date.now() - start,
          toolName: name,
          timestamp: start
        }
      });
      return data;
    } catch (caught) {
      const error = asError(caught);
      controller.abort(error);
      try {
        tool.onExecutionRejected?.(context, error);
      } catch (hookError) {
        this.reportError(asError(hookError), name, event.input);
      }
      this.reportError(error, name, event.input);
      this.complete(event, {
        success: false,
        error: error.message,
        metadata: {
          executionMs: Date.now() - start,
          toolName: name,
          timestamp: start
        }
      });
      throw error;
    } finally {
      clearTimeout(timer);
      external?.signal.removeEventListener("abort", externalAbort);
      lifetime?.removeEventListener("abort", lifetimeAbort);
      controller.signal.removeEventListener("abort", onAbort);
    }
  }
};
function createKit(config) {
  return new WebMCPKit(config);
}

// src/react.ts
var KitContext = (0, import_react.createContext)(null);
var sharedScope;
var owners = /* @__PURE__ */ new WeakMap();
function snapshotConfig(config = {}) {
  return Object.fromEntries(
    Object.entries(config).filter(([, value]) => value !== void 0)
  );
}
function sameConfig(left, right) {
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((key) => Object.is(left[key], right[key]));
}
function assertConfig(scope, config) {
  if (!config) return;
  const requested = snapshotConfig(config);
  if (Object.keys(requested).length === 0) return;
  if (!scope.config) {
    throw new Error(
      "WebMCP React: hook configuration belongs on the provider; a supplied kit already has its own configuration"
    );
  }
  if (!sameConfig(scope.config, requested)) {
    throw new Error(
      "WebMCP React: conflicting configuration; use an explicit WebMCPProvider with its own kit or config"
    );
  }
}
function useKitScope(config) {
  const provided = (0, import_react.useContext)(KitContext);
  if (provided) {
    assertConfig(provided, config);
    return provided;
  }
  if (!sharedScope) {
    const initial = snapshotConfig(config);
    sharedScope = { kit: createKit(initial), config: initial, enabled: true };
  }
  assertConfig(sharedScope, config);
  return sharedScope;
}
function WebMCPProvider({
  children,
  enabled = true,
  kit,
  config
}) {
  if (kit && config)
    throw new Error("WebMCP React: provide either kit or config, not both");
  const [initial] = (0, import_react.useState)(() => {
    const snapshot = snapshotConfig(config);
    return {
      supplied: kit !== void 0,
      kit: kit ?? createKit(snapshot),
      config: snapshot
    };
  });
  if (initial.supplied !== (kit !== void 0)) {
    throw new Error(
      "WebMCP React: provider kit/config mode changed; remount the provider with a new key"
    );
  }
  if (!initial.supplied && !sameConfig(initial.config, snapshotConfig(config))) {
    throw new Error(
      "WebMCP React: provider configuration changed; remount the provider with a new key"
    );
  }
  const activeKit = kit ?? initial.kit;
  const value = (0, import_react.useMemo)(
    () => ({
      kit: activeKit,
      enabled,
      config: initial.supplied ? void 0 : initial.config
    }),
    [activeKit, enabled, initial]
  );
  return (0, import_react.createElement)(KitContext.Provider, { value }, children);
}
function useOwnedTools(tools, config, options) {
  const scope = useKitScope(config);
  const kit = scope.kit;
  const enabled = scope.enabled && (options?.enabled ?? true);
  const latest = (0, import_react.useRef)(tools);
  const owner = (0, import_react.useRef)(/* @__PURE__ */ Symbol("WebMCP hook owner"));
  const callbacks = tools.map(({ handler, admit }) => ({ handler, admit }));
  const committed = (0, import_react.useRef)(void 0);
  const unchanged = committed.current?.callbacks.length === callbacks.length && callbacks.every(
    (callback, index) => callback.handler === committed.current.callbacks[index].handler && callback.admit === committed.current.callbacks[index].admit
  );
  const callbackIdentity = unchanged ? committed.current.identity : {};
  (0, import_react.useLayoutEffect)(() => {
    latest.current = tools;
    committed.current = { callbacks, identity: callbackIdentity };
  });
  const definitions = JSON.stringify(
    tools.map(({ name, title, description, inputSchema, annotations }) => ({
      name,
      title,
      description,
      inputSchema,
      annotations
    }))
  );
  (0, import_react.useLayoutEffect)(() => {
    if (!enabled) return;
    let owned = owners.get(kit);
    if (!owned) {
      owned = /* @__PURE__ */ new Map();
      owners.set(kit, owned);
    }
    const names = /* @__PURE__ */ new Set();
    for (const tool of latest.current) {
      if (names.has(tool.name) || owned.has(tool.name) || kit.getTool(tool.name)) {
        throw new Error(
          `WebMCP React: tool "${tool.name}" is already owned or registered`
        );
      }
      names.add(tool.name);
    }
    const registrations = [];
    let active = true;
    const admitted = /* @__PURE__ */ new WeakMap();
    const currentTool = (name) => {
      const current = latest.current.find(
        (candidate) => candidate.name === name
      );
      if (!active || !current)
        throw new Error(`WebMCP React: tool "${name}" has been revoked`);
      return current;
    };
    const release = () => {
      active = false;
      for (const { name, registered } of registrations) {
        if (owned.get(name) !== owner.current) continue;
        if (kit.getTool(name) === registered) kit.unregister(name);
        owned.delete(name);
      }
    };
    try {
      for (const tool of latest.current) {
        const name = tool.name;
        kit.register({
          ...tool,
          admit: (input, context) => {
            const current = currentTool(name);
            if (current.admit) admitted.set(context, current);
            return current.admit?.(input, context);
          },
          handler: (input, context) => {
            const current = currentTool(name);
            const captured = context && admitted.get(context);
            if (captured && (captured.admit !== current.admit || captured.handler !== current.handler)) {
              throw new Error(
                `WebMCP React: tool "${name}" state changed during admission; retry with current state`
              );
            }
            return (captured ?? current).handler(input, context);
          },
          onExecutionRejected: (context, error) => {
            const captured = admitted.get(context);
            const current = latest.current.find(
              (candidate) => candidate.name === name
            );
            (captured ?? current ?? tool).onExecutionRejected?.(context, error);
          }
        });
        owned.set(name, owner.current);
        registrations.push({ name, registered: kit.getTool(name) });
      }
    } catch (error) {
      release();
      throw error;
    }
    return release;
  }, [kit, enabled, definitions, callbackIdentity]);
}
function useWebMCPTool(tool, config, options) {
  useOwnedTools([tool], config, options);
}
function useWebMCPTools(tools, config, options) {
  useOwnedTools(tools, config, options);
}
function useWebMCPAvailable() {
  const [available, setAvailable] = (0, import_react.useState)(false);
  (0, import_react.useEffect)(() => {
    setAvailable(WebMCPKit.isAvailable());
  }, []);
  return available;
}
function useWebMCPLog(maxEntries = 100) {
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 1) {
    throw new Error("WebMCP React: maxEntries must be a positive safe integer");
  }
  const { kit } = useKitScope();
  const [invocations, setInvocations] = (0, import_react.useState)([]);
  const limit = (0, import_react.useRef)(maxEntries);
  (0, import_react.useLayoutEffect)(() => {
    setInvocations([]);
    return kit.subscribe((event, result) => {
      setInvocations(
        (previous) => [{ ...event, result }, ...previous].slice(0, limit.current)
      );
    });
  }, [kit]);
  (0, import_react.useLayoutEffect)(() => {
    limit.current = maxEntries;
    setInvocations((previous) => previous.slice(0, maxEntries));
  }, [maxEntries]);
  const clearLog = (0, import_react.useCallback)(() => setInvocations([]), []);
  return { invocations, clearLog };
}
function useWebMCPKit(config) {
  return useKitScope(config).kit;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  WebMCPProvider,
  useWebMCPAvailable,
  useWebMCPKit,
  useWebMCPLog,
  useWebMCPTool,
  useWebMCPTools
});
//# sourceMappingURL=react.js.map