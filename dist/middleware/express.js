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

// src/middleware/express.ts
var express_exports = {};
__export(express_exports, {
  webmcpAutoSetup: () => webmcpAutoSetup,
  webmcpDiscovery: () => webmcpDiscovery
});
module.exports = __toCommonJS(express_exports);
function validateOptions(options) {
  const path = options.manifestPath ?? "/mcp";
  if (typeof path !== "string" || path.length > 256 || !/^\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(path) || path.split("/").some((p) => p === "." || p === ".."))
    throw new Error(
      "Invalid discovery configuration: canonical local path required"
    );
  for (const v of [options.version, options.serverName])
    if (v !== void 0 && (typeof v !== "string" || v.length < 1 || v.length > 256 || /[^\x20-\x7e]/.test(v)))
      throw new Error("Invalid discovery configuration: unsafe header");
  const caps = options.capabilities;
  const allowed = /* @__PURE__ */ new Set([
    "tools",
    "resources",
    "prompts",
    "sampling",
    "logging"
  ]);
  if (caps !== void 0 && (!Array.isArray(caps) || caps.length > 5 || Array.from(caps).some((v) => !allowed.has(v)) || new Set(caps).size !== caps.length))
    throw new Error("Invalid discovery configuration: capabilities");
  if (options.onlyOnSuccess !== void 0 && typeof options.onlyOnSuccess !== "boolean")
    throw new Error("Invalid discovery configuration: boolean required");
}
function buildLinkHeader(manifestPath, capabilities) {
  const parts = [`<${manifestPath}>; rel="mcp-manifest"`];
  if (capabilities.includes("tools")) {
    parts.push(`<${manifestPath}/tools>; rel="mcp-tools"`);
  }
  if (capabilities.includes("resources")) {
    parts.push(`<${manifestPath}/resources>; rel="mcp-resources"`);
  }
  if (capabilities.includes("prompts")) {
    parts.push(`<${manifestPath}/prompts>; rel="mcp-prompts"`);
  }
  return parts.join(", ");
}
function injectHeaders(res, opts) {
  res.setHeader("Link", buildLinkHeader(opts.manifestPath, opts.capabilities));
  res.setHeader("MCP-Version", opts.version);
  res.setHeader("MCP-Capabilities", opts.capabilities.join(","));
  if (opts.serverName) {
    res.setHeader("MCP-Server", opts.serverName);
  }
}
function webmcpDiscovery(options = {}) {
  validateOptions(options);
  const opts = {
    manifestPath: options.manifestPath ?? "/mcp",
    capabilities: options.capabilities ?? ["tools"],
    version: options.version ?? "1.0",
    serverName: options.serverName,
    onlyOnSuccess: options.onlyOnSuccess ?? true
  };
  return function webmcpDiscoveryMiddleware(_req, res, next) {
    const originalEnd = res.end.bind(res);
    res.end = function(...args) {
      if (!res.headersSent) {
        const statusCode = res.statusCode;
        const shouldInject = opts.onlyOnSuccess ? statusCode >= 200 && statusCode < 300 : true;
        if (shouldInject) {
          injectHeaders(res, opts);
        }
      }
      return originalEnd(...args);
    };
    next();
  };
}
function webmcpAutoSetup(options = {}) {
  validateOptions(options);
  if (options.publicManifest !== void 0 && typeof options.publicManifest !== "boolean")
    throw new Error(
      "Invalid discovery configuration: publicManifest boolean required"
    );
  if (options.authorize !== void 0 && typeof options.authorize !== "function")
    throw new Error(
      "Invalid discovery configuration: authorize function required"
    );
  const {
    tools = [],
    resources = [],
    serverName,
    manifestPath = "/mcp",
    capabilities,
    version = "1.0",
    onlyOnSuccess = true
  } = options;
  const inferredCapabilities = capabilities ?? [
    ...tools.length > 0 ? ["tools"] : [],
    ...resources.length > 0 ? ["resources"] : []
  ];
  if (inferredCapabilities.length === 0) inferredCapabilities.push("tools");
  const discoveryMiddleware = webmcpDiscovery({
    manifestPath,
    capabilities: inferredCapabilities,
    version,
    serverName,
    onlyOnSuccess
  });
  const manifest = {
    schema_version: version,
    server: serverName ? { name: serverName } : void 0,
    capabilities: inferredCapabilities,
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema ?? { type: "object", properties: {} },
      annotations: t.annotations
    })),
    resources: resources.map((r) => ({
      uri: r.uri,
      name: r.name,
      description: r.description,
      mimeType: r.mimeType
    })),
    endpoints: {
      manifest: manifestPath,
      tools: `${manifestPath}/tools`,
      resources: `${manifestPath}/resources`
    }
  };
  return async function webmcpAutoSetupMiddleware(req, res, next) {
    const url = req.url ?? "";
    const urlWithoutQuery = url.split("?")[0];
    const isCatalog = [
      manifestPath,
      `${manifestPath}/tools`,
      `${manifestPath}/resources`
    ].includes(urlWithoutQuery);
    if (isCatalog && (req.method === "GET" || req.method === "HEAD")) {
      res.setHeader("Cache-Control", "private, no-store");
      if (!options.publicManifest && !options.authorize) {
        res.statusCode = 401;
        if (req.method === "HEAD") res.end();
        else res.json({ error: "Discovery authorization required" });
        return;
      }
      if (options.authorize) {
        try {
          if (await options.authorize(req) !== true) {
            res.statusCode = 403;
            if (req.method === "HEAD") res.end();
            else res.json({ error: "Discovery access denied" });
            return;
          }
        } catch (error) {
          next(error);
          return;
        }
      }
      if (req.method === "HEAD") {
        res.setHeader("Content-Type", "application/json");
        res.end();
        return;
      }
    }
    if (req.method === "GET" && urlWithoutQuery === manifestPath) {
      res.setHeader("Content-Type", "application/json");
      res.setHeader("MCP-Version", version);
      injectHeaders(res, {
        manifestPath,
        capabilities: inferredCapabilities,
        version,
        serverName,
        onlyOnSuccess: false
      });
      res.json(manifest);
      return;
    }
    if (req.method === "GET" && urlWithoutQuery === `${manifestPath}/tools`) {
      res.setHeader("Content-Type", "application/json");
      res.json({ tools: manifest.tools });
      return;
    }
    if (req.method === "GET" && urlWithoutQuery === `${manifestPath}/resources`) {
      res.setHeader("Content-Type", "application/json");
      res.json({ resources: manifest.resources });
      return;
    }
    discoveryMiddleware(req, res, next);
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  webmcpAutoSetup,
  webmcpDiscovery
});
//# sourceMappingURL=express.js.map