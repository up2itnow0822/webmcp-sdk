import { defineTool } from "./core.js";
import type { WebMCPKit } from "./core.js";
import type {
  JSONSchema,
  ToolExecutionContext,
  WebMCPToolDefinition,
} from "./types.js";
export interface DeclarativeToolOptions {
  handlers: Record<
    string,
    (
      input: Record<string, unknown>,
      context?: ToolExecutionContext,
    ) => unknown | Promise<unknown>
  >;
}
const forbidden = new Set(["__proto__", "prototype", "constructor"]);
function name(value: string | null, label: string) {
  if (!value || !/^[a-z][a-z0-9_.-]{0,63}$/.test(value) || forbidden.has(value))
    throw Error("Invalid declarative " + label);
  return value;
}
function bound(element: Element, attribute: string, maximum?: number) {
  const raw = element.getAttribute(attribute);
  if (raw === null) return undefined;
  const value = Number(raw);
  if (
    !raw.trim() ||
    !Number.isFinite(value) ||
    (maximum !== undefined &&
      (!Number.isSafeInteger(value) || value < 0 || value > maximum))
  )
    throw Error("Invalid declarative field bound");
  return value;
}
/** Bind form metadata to explicit trusted code; HTML never supplies an executable handler. */
export function registerDeclarativeTools(
  kit: WebMCPKit,
  root: ParentNode,
  options: DeclarativeToolOptions,
): () => void {
  const forms = Array.from(root.querySelectorAll("form[data-webmcp-tool]"));
  if (
    "matches" in root &&
    typeof root.matches === "function" &&
    root.matches("form[data-webmcp-tool]")
  )
    forms.unshift(root as unknown as Element);
  const definitions: WebMCPToolDefinition[] = [];
  const names = new Set<string>();
  for (const form of forms) {
    const toolName = name(form.getAttribute("data-webmcp-tool"), "tool name");
    if (names.has(toolName) || kit.getTool(toolName))
      throw Error("Duplicate declarative tool");
    names.add(toolName);
    const description = form.getAttribute("data-webmcp-description")?.trim();
    if (!description || description.length > 500)
      throw Error("Declarative description required, maximum 500 characters");
    if (
      !options?.handlers ||
      !Object.prototype.hasOwnProperty.call(options.handlers, toolName) ||
      typeof options.handlers[toolName] !== "function"
    )
      throw Error("Declarative own trusted handler required");
    const properties: Record<string, JSONSchema> = Object.create(null);
    const required: string[] = [];
    for (const field of form.querySelectorAll("input,textarea,select")) {
      const fieldName = name(field.getAttribute("name"), "field name");
      if (Object.prototype.hasOwnProperty.call(properties, fieldName))
        throw Error("Duplicate declarative field");
      const type = (field.getAttribute("type") ?? "text").toLowerCase();
      if (
        [
          "file",
          "password",
          "hidden",
          "submit",
          "button",
          "reset",
          "image",
        ].includes(type)
      )
        throw Error("Unsupported declarative field type");
      const schema: JSONSchema =
        type === "checkbox"
          ? { type: "boolean" }
          : type === "number" || type === "range"
            ? { type: "number" }
            : { type: "string", maxLength: 10000 };
      if (schema.type === "string") {
        const minimum = bound(field, "minlength", 10000),
          maximum = bound(field, "maxlength", 10000);
        if (minimum !== undefined) schema.minLength = minimum;
        if (maximum !== undefined) schema.maxLength = maximum;
        if (minimum !== undefined && maximum !== undefined && minimum > maximum)
          throw Error("Invalid declarative field bound");
      }
      if (schema.type === "number") {
        const minimum = bound(field, "min"),
          maximum = bound(field, "max");
        if (minimum !== undefined) schema.minimum = minimum;
        if (maximum !== undefined) schema.maximum = maximum;
        if (minimum !== undefined && maximum !== undefined && minimum > maximum)
          throw Error("Invalid declarative field bound");
      }
      properties[fieldName] = schema;
      if (field.hasAttribute("required")) required.push(fieldName);
    }
    definitions.push(
      defineTool(
        toolName,
        description,
        { type: "object", properties, required, additionalProperties: false },
        options.handlers[toolName],
      ),
    );
  }
  const owned: Array<{ name: string; definition: WebMCPToolDefinition }> = [];
  const cleanup = () => {
    for (const entry of owned)
      if (kit.getTool(entry.name) === entry.definition)
        kit.unregister(entry.name);
  };
  try {
    for (const definition of definitions) {
      kit.register(definition);
      owned.push({
        name: definition.name,
        definition: kit.getTool(definition.name)!,
      });
    }
  } catch (error) {
    cleanup();
    throw error;
  }
  return cleanup;
}
