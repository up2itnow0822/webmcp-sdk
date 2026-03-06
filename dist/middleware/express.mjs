// src/middleware/express.ts
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
  return function webmcpAutoSetupMiddleware(req, res, next) {
    const url = req.url ?? "";
    const urlWithoutQuery = url.split("?")[0];
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
export {
  webmcpAutoSetup,
  webmcpDiscovery
};
//# sourceMappingURL=express.mjs.map