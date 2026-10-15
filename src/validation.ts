import {Validator, type Schema, type SchemaDraft} from '@cfworker/json-schema';
import type {JSONSchema} from './types.js';
import {snapshotInput} from './input.js';
export interface InputValidation {valid: boolean; errors: string[];}
// Structural contracts of supported assertions/applicators; unknown annotations remain permitted.
const schemaRef: Schema = {$ref: '#'};
const schemaMap: Schema = {type: 'object', additionalProperties: schemaRef};
const nonnegativeInteger: Schema = {type: 'integer', minimum: 0};
const strings: Schema = {type: 'array', items: {type: 'string'}, uniqueItems: true};
const schemaArray: Schema = {type: 'array', minItems: 1, items: schemaRef};
const metaSchema: Schema = {
  anyOf: [{type: 'boolean'}, {type: 'object', properties: {
    type: {anyOf: [{enum: ['object','array','string','number','integer','boolean','null']}, {type:'array', minItems:1, uniqueItems:true, items:{enum:['object','array','string','number','integer','boolean','null']}}]},
    properties: schemaMap, patternProperties: schemaMap, $defs: schemaMap, definitions: schemaMap,
    required: strings, enum: {type:'array', minItems:1, uniqueItems:true},
    $ref: {type:'string'}, $id: {type:'string'}, $schema: {type:'string'}, $anchor: {type:'string'},
    additionalProperties: schemaRef, unevaluatedProperties: schemaRef,
    not: schemaRef, if: schemaRef, then: schemaRef, else: schemaRef,
    anyOf: schemaArray, oneOf: schemaArray, allOf: schemaArray,
    items: {anyOf:[schemaRef, {type:'array', items:schemaRef}]}, prefixItems: schemaArray,
    additionalItems: schemaRef, unevaluatedItems: schemaRef, contains: schemaRef, propertyNames: schemaRef,
    minItems: nonnegativeInteger, maxItems: nonnegativeInteger, minContains: nonnegativeInteger, maxContains: nonnegativeInteger,
    minProperties: nonnegativeInteger, maxProperties: nonnegativeInteger, minLength: nonnegativeInteger, maxLength: nonnegativeInteger,
    uniqueItems: {type:'boolean'}, minimum: {type:'number'}, maximum: {type:'number'}, multipleOf: {type:'number', exclusiveMinimum:0},
    exclusiveMinimum: {type:['number','boolean']}, exclusiveMaximum: {type:['number','boolean']},
    pattern: {type:'string'}, format: {type:'string'},
    dependentRequired: {type:'object', additionalProperties:strings}, dependentSchemas:schemaMap,
    dependencies: {type:'object', additionalProperties:{anyOf:[schemaRef, strings]}},
  }}],
};
const metaValidator = new Validator(metaSchema, '2020-12');
/**
 * A bounded linear grammar for native RegExp: no groups, branching, backreferences,
 * lookaround, ranged/lazy repeats, or repeated consuming suffixes. A variable repeat
 * can occur only on the final single atom of a fully anchored expression.
 */
function checkSafePattern(pattern: string): void {
  const unsupported = () => {throw new Error('Unsupported JSON Schema pattern: use the bounded linear regular-expression subset');};
  if (pattern.length > 512) unsupported();
  let i = 0; let width = 0;
  const escaped = () => {
    i++; const token = pattern[i++];
    if (!token) unsupported();
    if ('dDsSwWnrtfv'.includes(token)) return;
    if ('^$\\.*+?()[]{}|/-'.includes(token)) return;
    const digits = token === 'x' ? 2 : token === 'u' ? 4 : 0;
    if (digits && /^[0-9a-fA-F]+$/.test(pattern.slice(i, i + digits)) && i + digits <= pattern.length) {i += digits; return;}
    unsupported();
  };
  while (i < pattern.length) {
    const token = pattern[i];
    if (token === '^' && i === 0) {i++; continue;}
    if (token === '$' && i === pattern.length - 1) {i++; continue;}
    if (token === '\\') escaped();
    else if (token === '[') {
      i++; if (pattern[i] === '^') i++;
      let closed = false;
      while (i < pattern.length) {
        if (pattern[i] === '\\') escaped();
        else if (pattern[i++] === ']') {closed = true; break;}
      }
      if (!closed) unsupported();
    } else {
      if ('^$()|*+?{}'.includes(token)) unsupported();
      i++;
    }
    let repetitions = 1;
    if (pattern[i] === '{') {
      const match = /^\{([1-9][0-9]{0,2})\}/.exec(pattern.slice(i));
      if (!match) unsupported();
      repetitions = Number(match![1]); i += match![0].length;
    } else if (pattern[i] === '*' || pattern[i] === '+') {
      if (pattern[0] !== '^' || pattern.slice(i + 1) !== '$') unsupported();
      i++;
    }
    width += repetitions; if (width > 256) unsupported();
  }
  new RegExp(pattern, 'u');
}
function checkSubschemas(schema: unknown, draft: SchemaDraft): void {
  if (!schema || typeof schema !== 'object') return;
  const obj = schema as Record<string, unknown>;
  for (const keyword of ['$dynamicRef', '$dynamicAnchor', '__absolute_ref__', '__absolute_recursive_ref__', '__absolute_uri__']) {
    if (Object.prototype.hasOwnProperty.call(obj, keyword)) throw new Error(`Unsupported or internal JSON Schema keyword: ${keyword}`);
  }
  for (const keyword of ['exclusiveMinimum', 'exclusiveMaximum']) {
    if (obj[keyword] !== undefined && typeof obj[keyword] !== (draft === '4' ? 'boolean' : 'number')) throw new Error(`Invalid JSON Schema ${keyword} for draft ${draft}`);
  }
  if (draft === '2020-12' && Array.isArray(obj.items)) throw new Error('Invalid JSON Schema: 2020-12 uses prefixItems for tuple schemas');
  if (typeof obj.format === 'string' && ['url', 'uri', 'uri-reference'].includes(obj.format)) throw new Error(`Unsupported JSON Schema format with complex upstream regular expressions: ${obj.format}`);
  if (typeof obj.pattern === 'string') checkSafePattern(obj.pattern);
  for (const keyword of ['properties','patternProperties','$defs','definitions','dependentSchemas','dependencies']) {
    const map = obj[keyword];
    if (map && typeof map === 'object') for (const [key,value] of Object.entries(map)) {
      if (keyword === 'patternProperties') checkSafePattern(key);
      checkSubschemas(value, draft);
    }
  }
  for (const keyword of ['anyOf','oneOf','allOf','prefixItems']) {
    const values = obj[keyword]; if (Array.isArray(values)) values.forEach(value => checkSubschemas(value, draft));
  }
  for (const keyword of ['not','if','then','else','items','additionalItems','additionalProperties','unevaluatedItems','unevaluatedProperties','contains','propertyNames']) {
    const value = obj[keyword]; if (Array.isArray(value)) value.forEach(item => checkSubschemas(item, draft)); else checkSubschemas(value, draft);
  }
}
/** CSP-safe schema compilation; no eval or Function constructor. */
export function compileSchema(schema: JSONSchema): (input: unknown) => InputValidation {
  const copied = snapshotInput(schema, {maxInputBytes:262144, maxInputNodes:10000, maxInputDepth:64}) as JSONSchema;
  const shape = metaValidator.validate(copied);
  if (!shape.valid) throw new Error(`Invalid JSON Schema: ${shape.errors.map(error => error.error).join('; ')}`);
  if (copied.type !== 'object') throw new Error('WebMCP Kit: inputSchema must have type "object"');
  const draftByUri: Record<string, SchemaDraft> = {
    'http://json-schema.org/draft-04/schema#':'4', 'http://json-schema.org/draft-07/schema#':'7',
    'https://json-schema.org/draft/2019-09/schema':'2019-09', 'https://json-schema.org/draft/2020-12/schema':'2020-12',
  };
  const uri = copied.$schema;
  if (uri !== undefined && (typeof uri !== 'string' || !draftByUri[uri])) throw new Error('Unsupported JSON Schema draft');
  const draft = uri ? draftByUri[uri as string] : '2020-12';
  checkSubschemas(copied, draft);
  const validator = new Validator(copied as Schema, draft);
  return input => {
    const result = validator.validate(input);
    return {valid:result.valid, errors:result.errors.map(error => `${error.instanceLocation || '/'}: ${error.error}${error.keyword === 'enum' ? ' (must be one of enum values)' : ''}`)};
  };
}
export function validateInput(input: unknown, schema: JSONSchema): InputValidation {return compileSchema(schema)(input);}
