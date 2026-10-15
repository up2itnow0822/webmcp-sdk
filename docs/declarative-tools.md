# Declarative form tools

`registerDeclarativeTools(kit, root, { handlers })` registers forms annotated with `data-webmcp-tool` and `data-webmcp-description`. Handlers come from an explicit own-property application allowlist; HTML never supplies executable code.

```html
<form data-webmcp-tool="search" data-webmcp-description="Search the catalog">
  <label>Query <input name="query" required maxlength="100" /></label>
</form>
```

```ts
import { createKit, registerDeclarativeTools } from "webmcp-sdk";
const kit = createKit();
const cleanup = registerDeclarativeTools(kit, document, {
  handlers: {
    search: ({ query }, context) => searchCatalog(query, context?.signal),
  },
});
await kit.ready();
// Later: cleanup();
```

`searchCatalog` is application-owned. Supported ordinary text-like fields, textarea/select, numbers and checkboxes become schema properties. Required, length and numeric min/max constraints are mapped; strings default to a 10,000-character maximum. Additional properties reject. Unsupported file/password/hidden/action fields, dangerous/duplicate fields, invalid/existing tool names, missing descriptions and absent own handlers reject. Registration failure cleans up partial work.

This helper registers tools, not form submissions or an execution transport. Disabled UI controls and ordinary form semantics are not authorization. Wrap trusted handlers with explicit application policy and human review when consequences warrant it. Avoid secrets in form metadata and do not assume arbitrary HTML expresses every business rule.
