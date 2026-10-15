// @vitest-environment jsdom
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { App } from "./App";
import "./fixture";
let rendered: ReactTestRenderer;
beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(async () => {
  if (rendered) await act(async () => rendered.unmount());
  delete window.__STUDIO_TEST__;
});
const button = (name: string) =>
  rendered.root
    .findAllByType("button")
    .find((b) => b.children.join("") === name)!;
async function mount() {
  await act(async () => {
    rendered = create(createElement(App));
  });
  await vi.waitFor(async () => {
    await act(async () => {
      await Promise.resolve();
    });
    expect(window.__STUDIO_TEST__).toBeDefined();
  });
}
async function saveLimit() {
  await act(async () =>
    rendered.root
      .findByProps({ id: "limit-USDC" })
      .props.onChange({ target: { value: "20" } }),
  );
  await act(async () =>
    rendered.root
      .findAllByType("form")[1]
      .props.onSubmit({ preventDefault() {} }),
  );
}
const request = {
  kind: "transfer",
  asset: "USDC",
  amount: "25",
  recipient: "0x2222222222222222222222222222222222222222",
} as const;
it("preserves visible and enforced saved limits across modes", async () => {
  await mount();
  await saveLimit();
  await act(async () => button("Live wallet").props.onClick());
  await act(async () =>
    rendered.root
      .findAllByType("button")
      .find((b) => b.props.className === "wallet-button")!
      .props.onClick(),
  );
  expect(rendered.root.findByProps({ id: "limit-USDC" }).props.value).toBe(
    "20",
  );
  await expect(window.__STUDIO_TEST__!.propose(request)).rejects.toThrow(
    /policy limit/,
  );
  expect(window.__STUDIO_TEST__!.provider.sent).toHaveLength(0);
});
it("selected-mode clicks retain saved policy", async () => {
  await mount();
  await saveLimit();
  await act(async () => button("Practice").props.onClick());
  expect(rendered.root.findByProps({ id: "limit-USDC" }).props.value).toBe(
    "20",
  );
  await expect(window.__STUDIO_TEST__!.propose(request)).rejects.toThrow(
    /policy limit/,
  );
});
