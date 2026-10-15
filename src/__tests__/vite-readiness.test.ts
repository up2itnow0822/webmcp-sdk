import { describe, it, expect } from "vitest";
import { isViteReadyOutput } from "../../scripts/vite-readiness.mjs";
describe("fixture server readiness across CI output modes", () => {
  it("recognizes GitHub Actions ANSI-colored Vite readiness without weakening the banner requirement", () => {
    const output =
      "\n  \u001b[32m\u001b[1mVITE\u001b[22m v8.3.4\u001b[39m  \u001b[42m \u001b[1mtest\u001b[22m \u001b[49m  \u001b[2mready in \u001b[0m\u001b[1m129\u001b[22m\u001b[2m\u001b[0m ms\u001b[22m\n";
    expect(isViteReadyOutput(output)).toBe(true);
  });
  it("recognizes an uncolored successful banner", () => {
    expect(isViteReadyOutput("VITE v8.3.4 test ready in 129 ms")).toBe(true);
  });
  it("does not reuse a foreign server when its own child reports an occupied port", () => {
    expect(
      isViteReadyOutput(
        "Error: Port 4188 is already in use\nLocal: http://127.0.0.1:4188/",
      ),
    ).toBe(false);
    expect(isViteReadyOutput("Starting VITE v8.3.4")).toBe(false);
  });
});
