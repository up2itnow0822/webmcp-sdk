import { describe, it, expect, vi } from "vitest";
import { webmcpAutoSetup, webmcpDiscovery } from "../middleware/express.js";
function response() {
  return {
    statusCode: 200,
    headersSent: false,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    setHeader(k: string, v: string) {
      this.headers[k.toLowerCase()] = v;
    },
    getHeader(k: string) {
      return this.headers[k.toLowerCase()];
    },
    json(v: unknown) {
      this.body = v;
      this.headersSent = true;
    },
    end() {
      this.headersSent = true;
    },
  };
}
describe("private discovery boundary", () => {
  it("denies private catalogs by default", async () => {
    for (const url of ["/mcp", "/mcp/tools", "/mcp/resources"]) {
      const r = response();
      await webmcpAutoSetup({
        tools: [{ name: "secret", description: "private" }],
      })({ method: "GET", url }, r, vi.fn());
      expect(r.statusCode).toBe(401);
      expect(JSON.stringify(r.body)).not.toContain("secret");
      expect(r.headers["cache-control"]).toBe("private, no-store");
    }
  });
  it("requires literal positive authorization even in public mode", async () => {
    for (const result of [false, undefined, "true", 1]) {
      const r = response();
      await webmcpAutoSetup({
        publicManifest: true,
        authorize: async () => result,
      } as any)({ method: "GET", url: "/mcp" }, r, vi.fn());
      expect(r.statusCode).toBe(403);
    }
  });
  it("allows explicit public metadata", async () => {
    const r = response();
    await webmcpAutoSetup({
      publicManifest: true,
      tools: [{ name: "public", description: "safe" }],
    } as any)({ method: "GET", url: "/mcp/tools" }, r, vi.fn());
    expect((r.body as any).tools[0].name).toBe("public");
  });
  it("supports async policy without disclosure on errors", async () => {
    const r = response();
    const next = vi.fn();
    await webmcpAutoSetup({
      authorize: async () => {
        throw Error("private policy detail");
      },
    } as any)({ method: "GET", url: "/mcp" }, r, next);
    expect(r.body).toBeUndefined();
    expect(next).toHaveBeenCalledOnce();
  });
  it("serves only authorized HEAD metadata without a body", async () => {
    const r = response();
    await webmcpAutoSetup({ authorize: () => true } as any)(
      { method: "HEAD", url: "/mcp" },
      r,
      vi.fn(),
    );
    expect(r.body).toBeUndefined();
    expect(r.headersSent).toBe(true);
  });
  it("rejects ambiguous security settings", () => {
    expect(() => webmcpAutoSetup({ publicManifest: "false" } as any)).toThrow();
    expect(() => webmcpAutoSetup({ authorize: true } as any)).toThrow();
  });
  it("validates bounded local paths, header values and capabilities", () => {
    for (const path of [
      "//evil",
      "/a/../mcp",
      "https://evil/mcp",
      "/mcp\r\nX:1",
    ])
      expect(() => webmcpDiscovery({ manifestPath: path })).toThrow();
    for (const value of ["a\r\nX:1", "\u0000", "é"])
      expect(() => webmcpDiscovery({ serverName: value })).toThrow();
    expect(() =>
      webmcpDiscovery({ capabilities: ["unknown"] } as any),
    ).toThrow();
  });
});
