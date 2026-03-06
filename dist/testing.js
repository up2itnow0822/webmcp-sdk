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

// src/testing.ts
var testing_exports = {};
__export(testing_exports, {
  createMockContext: () => createMockContext,
  formatTestResults: () => formatTestResults,
  installMockContext: () => installMockContext,
  scoreToolQuality: () => scoreToolQuality,
  testTool: () => testTool,
  validateToolDefinition: () => validateToolDefinition
});
module.exports = __toCommonJS(testing_exports);
function createMockContext() {
  const tools = /* @__PURE__ */ new Map();
  const context = {
    registerTool(tool) {
      tools.set(tool.name, tool);
    },
    unregisterTool(name) {
      tools.delete(name);
    },
    getRegisteredTools() {
      return Array.from(tools.values());
    },
    async requestUserInteraction() {
      return true;
    }
  };
  return {
    context,
    getTools: () => Array.from(tools.values()),
    getTool: (name) => tools.get(name),
    invoke: async (name, input) => {
      const tool = tools.get(name);
      if (!tool) throw new Error(`Tool "${name}" not registered`);
      return tool.handler(input);
    }
  };
}
function installMockContext() {
  const mock = createMockContext();
  const originalModelContext = globalThis.navigator?.modelContext;
  if (typeof globalThis.navigator === "undefined") {
    globalThis.navigator = {};
  }
  globalThis.navigator.modelContext = mock.context;
  return {
    ...mock,
    cleanup: () => {
      if (originalModelContext !== void 0) {
        globalThis.navigator.modelContext = originalModelContext;
      } else {
        delete globalThis.navigator.modelContext;
      }
    }
  };
}
function validateToolDefinition(tool) {
  const errors = [];
  const warnings = [];
  if (!tool.name) errors.push("Tool name is required");
  if (tool.name && !/^[a-z][a-z0-9_.-]*$/.test(tool.name)) {
    errors.push("Tool name must be lowercase alphanumeric with hyphens/dots/underscores");
  }
  if (tool.name && tool.name.length > 64) {
    errors.push("Tool name must be 64 characters or fewer");
  }
  if (!tool.description) errors.push("Tool description is required");
  if (tool.description && tool.description.length < 10) {
    warnings.push("Tool description is very short \u2014 LLMs need clear descriptions to select the right tool");
  }
  if (tool.description && tool.description.length > 500) {
    warnings.push("Tool description is very long \u2014 consider being more concise for token efficiency");
  }
  if (!tool.inputSchema) errors.push("inputSchema is required");
  if (tool.inputSchema && tool.inputSchema.type !== "object") {
    errors.push('inputSchema.type must be "object"');
  }
  if (tool.inputSchema?.properties) {
    for (const [key, prop] of Object.entries(tool.inputSchema.properties)) {
      if (!prop.type) errors.push(`Property "${key}" is missing type`);
      if (!prop.description) {
        warnings.push(`Property "${key}" has no description \u2014 this helps LLMs fill it correctly`);
      }
    }
  }
  if (!tool.handler) errors.push("handler function is required");
  if (tool.handler && typeof tool.handler !== "function") {
    errors.push("handler must be a function");
  }
  return { valid: errors.length === 0, errors, warnings };
}
async function testTool(tool, cases) {
  const results = [];
  for (const tc of cases) {
    const start = Date.now();
    let passed = false;
    let error;
    let result;
    try {
      const timeoutPromise = tc.timeoutMs ? new Promise(
        (_, reject) => setTimeout(() => reject(new Error(`Timeout after ${tc.timeoutMs}ms`)), tc.timeoutMs)
      ) : null;
      const handlerPromise = tool.handler(tc.input);
      result = timeoutPromise ? await Promise.race([handlerPromise, timeoutPromise]) : await handlerPromise;
      if (tc.expectError) {
        error = `Expected error but succeeded with: ${JSON.stringify(result)}`;
      } else if (tc.expectSuccess !== false) {
        if (tc.validate) {
          const validation = tc.validate(result);
          if (validation === true) {
            passed = true;
          } else {
            error = typeof validation === "string" ? validation : "Validation failed";
          }
        } else {
          passed = true;
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (tc.expectError) {
        if (typeof tc.expectError === "string") {
          passed = errMsg.includes(tc.expectError);
        } else {
          passed = tc.expectError.test(errMsg);
        }
        if (!passed) {
          error = `Expected error matching ${tc.expectError}, got: ${errMsg}`;
        }
      } else {
        error = errMsg;
      }
    }
    results.push({
      name: tc.name,
      passed,
      durationMs: Date.now() - start,
      error,
      result
    });
  }
  return results;
}
function formatTestResults(results) {
  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;
  const lines = results.map((r) => {
    const icon = r.passed ? "\u2705" : "\u274C";
    const duration = `${r.durationMs}ms`;
    const err = r.error ? `
   \u2514\u2500 ${r.error}` : "";
    return `${icon} ${r.name} (${duration})${err}`;
  });
  lines.push("");
  lines.push(`${passed}/${results.length} passed${failed > 0 ? ` (${failed} failed)` : ""}`);
  return lines.join("\n");
}
function scoreToolQuality(tool) {
  const breakdown = {};
  let nameScore = 0;
  if (tool.name) nameScore += 3;
  if (tool.name && tool.name.length >= 3 && tool.name.length <= 30) nameScore += 3;
  if (tool.name && tool.name.includes("_") || tool.name?.includes(".")) nameScore += 2;
  if (tool.name && !tool.name.includes("tool") && !tool.name.includes("function")) nameScore += 2;
  breakdown.name = {
    score: nameScore,
    max: 10,
    tip: nameScore < 7 ? 'Use descriptive verb_noun names like "search_products" or "get_user"' : void 0
  };
  let descScore = 0;
  if (tool.description) descScore += 5;
  if (tool.description && tool.description.length >= 20) descScore += 5;
  if (tool.description && tool.description.length <= 200) descScore += 3;
  if (tool.description && /\b(returns?|provides?|gets?|searches?|creates?|updates?|deletes?)\b/i.test(tool.description)) descScore += 4;
  if (tool.description && !tool.description.includes("TODO") && !tool.description.includes("...")) descScore += 3;
  breakdown.description = {
    score: descScore,
    max: 20,
    tip: descScore < 15 ? "Write clear descriptions that tell the LLM WHEN and WHY to use this tool" : void 0
  };
  let schemaScore = 0;
  if (tool.inputSchema) schemaScore += 5;
  if (tool.inputSchema?.properties && Object.keys(tool.inputSchema.properties).length > 0) schemaScore += 5;
  if (tool.inputSchema?.required && tool.inputSchema.required.length > 0) schemaScore += 3;
  const hasDescriptions = tool.inputSchema?.properties ? Object.values(tool.inputSchema.properties).every((p) => p.description) : false;
  if (hasDescriptions) schemaScore += 5;
  if (tool.inputSchema?.properties) {
    const hasConstraints = Object.values(tool.inputSchema.properties).some(
      (p) => p.enum || p.minimum !== void 0 || p.maximum !== void 0 || p.pattern
    );
    if (hasConstraints) schemaScore += 2;
  }
  breakdown.schema = {
    score: schemaScore,
    max: 20,
    tip: schemaScore < 15 ? "Add descriptions to all properties and use enums/constraints where possible" : void 0
  };
  let annotScore = 0;
  if (tool.annotations) annotScore += 5;
  if (tool.annotations?.readOnlyHint !== void 0 || tool.annotations?.destructiveHint !== void 0) annotScore += 5;
  breakdown.annotations = {
    score: annotScore,
    max: 10,
    tip: annotScore < 5 ? "Add annotations like readOnlyHint or destructiveHint to help agents make safer decisions" : void 0
  };
  const totalScore = Object.values(breakdown).reduce((sum, b) => sum + b.score, 0);
  const maxScore = Object.values(breakdown).reduce((sum, b) => sum + b.max, 0);
  return { score: totalScore, maxScore, breakdown };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createMockContext,
  formatTestResults,
  installMockContext,
  scoreToolQuality,
  testTool,
  validateToolDefinition
});
//# sourceMappingURL=testing.js.map