import { WebMCPKit, createKit, defineTool } from '../../dist/index.mjs';

const statusEl = document.getElementById('status');
const resultEl = document.getElementById('result');
const nameInput = document.getElementById('name');
const invokeButton = document.getElementById('invoke');

const kit = createKit({ prefix: 'demo' });

kit.register(
  defineTool(
    'hello',
    'Return a greeting for the supplied name.',
    {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name to greet' },
      },
      required: ['name'],
    },
    async ({ name }) => ({
      message: `Hello, ${name}!`,
      registeredInBrowser: WebMCPKit.isAvailable(),
    })
  )
);

const registeredTools = kit.getTools().map((tool) => tool.name);
const browserTools = WebMCPKit.isAvailable()
  ? navigator.modelContext.getRegisteredTools().map((tool) => tool.name)
  : [];

statusEl.textContent = WebMCPKit.isAvailable()
  ? `navigator.modelContext detected. Auto-registered tools: ${browserTools.join(', ')}`
  : `navigator.modelContext not detected. Direct invoke still works. Registered in kit: ${registeredTools.join(', ')}`;

async function runDemo() {
  const name = nameInput.value.trim() || 'friend';
  const result = await kit.invoke('demo.hello', { name });
  resultEl.textContent = JSON.stringify(result, null, 2);
}

invokeButton.addEventListener('click', () => {
  runDemo().catch((error) => {
    resultEl.textContent = JSON.stringify({ error: error.message }, null, 2);
  });
});

runDemo().catch((error) => {
  resultEl.textContent = JSON.stringify({ error: error.message }, null, 2);
});
