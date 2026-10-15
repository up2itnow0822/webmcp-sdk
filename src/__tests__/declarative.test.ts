import { describe, it, expect } from "vitest";
import { JSDOM } from "jsdom";
import { createKit, registerDeclarativeTools, defineTool } from "../index.js";
const form =
  '<form data-webmcp-tool="lookup" data-webmcp-description="Look up an item"><input name="item" required maxlength="80"><input type="number" name="qty" min="1" max="4" required></form>';
describe("trusted declarative forms", () => {
  it("registers actual bounded schema/handler and cleans up idempotently", async () => {
    const kit = createKit({ prefix: "catalog", browserAdapter: "none" });
    const document = new JSDOM(form).window.document;
    const clean = registerDeclarativeTools(kit, document, {
      handlers: { lookup: ({ item, qty }) => ({ item, qty }) },
    });
    expect(
      await kit.invoke("catalog.lookup", { item: "test", qty: 2 }),
    ).toEqual({ item: "test", qty: 2 });
    await expect(
      kit.invoke("catalog.lookup", { item: "test", qty: "2" }),
    ).rejects.toThrow();
    await expect(
      kit.invoke("catalog.lookup", { item: "test", qty: 2, extra: 1 }),
    ).rejects.toThrow();
    clean();
    clean();
    expect(kit.getTools()).toEqual([]);
  });
  it("rejects dangerous and duplicate fields", () => {
    for (const fields of [
      '<input name="constructor">',
      '<input name="x"><input name="x">',
    ]) {
      const kit = createKit({ browserAdapter: "none" });
      const document = new JSDOM(
        '<form data-webmcp-tool="lookup" data-webmcp-description="test">' +
          fields +
          "</form>",
      ).window.document;
      expect(() =>
        registerDeclarativeTools(kit, document, {
          handlers: { lookup: () => null },
        }),
      ).toThrow(/Invalid declarative|Duplicate declarative/);
      expect(kit.getTools()).toEqual([]);
    }
  });
  it("requires an explicit own trusted function", () => {
    const kit = createKit({ browserAdapter: "none" });
    const document = new JSDOM(form).window.document;
    expect(() =>
      registerDeclarativeTools(kit, document, {
        handlers: Object.create({ lookup: () => null }),
      }),
    ).toThrow(/own trusted handler/);
  });
  it("preflights all forms before registration and preserves external replacement on cleanup", async () => {
    const kit = createKit({ browserAdapter: "none" });
    const document = new JSDOM(
      form +
        '<form data-webmcp-tool="bad" data-webmcp-description="bad"><input type="hidden" name="secret"></form>',
    ).window.document;
    expect(() =>
      registerDeclarativeTools(kit, document, {
        handlers: { lookup: () => null, bad: () => null },
      }),
    ).toThrow(/Unsupported declarative/);
    expect(kit.getTools()).toEqual([]);
    const clean = registerDeclarativeTools(
      kit,
      new JSDOM(form).window.document,
      { handlers: { lookup: () => null } },
    );
    kit.register(
      defineTool(
        "lookup",
        "External replacement",
        { type: "object" },
        () => "replacement",
      ),
      { replace: true },
    );
    clean();
    expect(await kit.invoke("lookup", {})).toBe("replacement");
  });
});
