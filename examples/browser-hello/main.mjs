import { WebMCPKit, createKit, defineTool } from "../../dist/index.mjs";

const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");
const nameInput = document.getElementById("name");
const invokeButton = document.getElementById("invoke");
export const kit = createKit({ prefix: "demo" });
window.__HELLO = kit;

kit.register(
  defineTool(
    "hello",
    "Return a greeting for the supplied name.",
    {
      type: "object",
      properties: { name: { type: "string", maxLength: 100 } },
      required: ["name"],
      additionalProperties: false,
    },
    ({ name }) => ({ message: `Hello, ${name}!` }),
  ),
);

async function runDemo() {
  const name = nameInput.value.trim() || "friend";
  resultEl.textContent = JSON.stringify(
    await kit.invoke("demo.hello", { name }),
    null,
    2,
  );
}
function showError(error) {
  resultEl.textContent = JSON.stringify(
    { error: error instanceof Error ? error.message : String(error) },
    null,
    2,
  );
}
invokeButton.addEventListener("click", () => {
  void runDemo().catch(showError);
});
window.addEventListener("pagehide", () => kit.unregisterAll(), { once: true });

try {
  await kit.ready();
  statusEl.textContent = WebMCPKit.isAvailable()
    ? "document.modelContext ready. Registered: demo.hello"
    : "document.modelContext unavailable. Local tools ready: demo.hello";
} catch (error) {
  statusEl.textContent = `Native registration failed: ${error instanceof Error ? error.message : String(error)}. Direct invocation remains available.`;
}
await runDemo().catch(showError);
