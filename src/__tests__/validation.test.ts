import { describe, expect, it, vi } from 'vitest';
import { createKit } from '../core.js';
import { compileSchema } from '../validation.js';
import { validateToolDefinition } from '../testing.js';
import { snapshotInput } from '../input.js';
describe('schema validation', () => {
  it.each([
    {type: 'object', properties: {n: {type: 'nonsense'}}},
    {type: 'object', required: 'name'},
    {type: 'object', properties: {n: {minimum: 'wrong'}}},
    {type: 'object', properties: {n: {pattern: '['}}},
    {type: 'object', properties: {n: {multipleOf: 0}}},
    {type: 'object', anyOf: []},
  ])('rejects malformed schema %j at registration', (schema) => {
    expect(() => compileSchema(schema as any)).toThrow(/schema|pattern|invalid/i);
  });
  it('validates booleans, references, unions, conditionals, and arrays under CSP', () => {
    vi.stubGlobal('Function', function () {throw new Error('unsafe-eval blocked');});
    try {
      const validate = compileSchema({type:'object', $defs: {n: {type: 'integer', minimum: 1}}, properties: {n: {$ref:'#/$defs/n'}, either: {type:['string','null']}, forbidden: false}, if: {required:['n']}, then: {required:['either']}} as any);
      expect(validate({n: 2, either: null}).valid).toBe(true); expect(validate({n: 0, either: null}).valid).toBe(false);
      expect(validate({n: 2}).valid).toBe(false); expect(validate({forbidden: true}).valid).toBe(false);
    } finally {vi.unstubAllGlobals();}
  });
  it('takes finite plain-object snapshots with exact UTF8/JSON byte accounting', () => {
    expect(snapshotInput({s: '🙂'}, {maxInputBytes: 12})).toEqual({s: '🙂'});
    expect(() => snapshotInput({s: '🙂'}, {maxInputBytes: 11})).toThrow(/Bytes/);
    expect(snapshotInput(Object.assign(Object.create(null), {x: 1}))).toEqual({x: 1});
  });
  it('protects validated input from hook mutation', async () => {
    const kit = createKit({onBeforeInvoke: event => {event.input.n = 'bypass'; return true;}});
    kit.register({name:'strict',description:'Strict input',inputSchema:{type:'object',properties:{n:{type:'integer'}}},handler: input=>input});
    await expect(kit.invoke('strict', {n: 1})).rejects.toThrow();
  });
  it('rejects sparse arrays and own non-index array fields', () => {
    const list: any = [1]; list.bad = 2;
    expect(() => snapshotInput({list})).toThrow(); expect(() => snapshotInput({list: new Array(2)})).toThrow();
  });
  it('testing helper accepts composed property schemas and rejects malformed assertion keywords', () => {
    const base = {name:'valid',description:'Valid tool schema',handler: () => 1};
    expect(validateToolDefinition({...base,inputSchema:{type:'object',properties:{n:{oneOf:[{type:'string'},{type:'integer'}]}}}}).valid).toBe(true);
    expect(validateToolDefinition({...base,inputSchema:{type:'object',properties:{n:{minimum:'bad'}}} as any}).valid).toBe(false);
  });
  it('rejects hidden dangerous own keys', () => {
    const input = Object.defineProperty({}, 'constructor', {value: {evil: true}, enumerable: false});
    expect(() => snapshotInput(input)).toThrow(/forbidden/);
  });
  it('rejects dynamic reference keywords the validator cannot enforce', () => {
    expect(() => compileSchema({type:'object',properties:{n:{$dynamicRef:'#positive'}},$defs:{positive:{$dynamicAnchor:'positive',type:'integer',minimum:1}}})).toThrow(/unsupported|dynamic/i);
  });
  it('rejects draft-incompatible exclusive bounds', () => {
    expect(() => compileSchema({type:'object',properties:{n:{type:'number',exclusiveMinimum:true}}})).toThrow(/schema|exclusive/i);
    expect(() => compileSchema({type:'object',$schema:'http://json-schema.org/draft-04/schema#',properties:{n:{type:'number',minimum:0,exclusiveMinimum:true}}})).not.toThrow();
  });
  it('rejects validator-internal reference overrides in schemas', () => {
    expect(() => compileSchema({type:'object',properties:{n:{$ref:'#/$defs/positive',__absolute_ref__:'https://github.com/cfworker#/$defs/anything'}},$defs:{positive:{type:'integer',minimum:1},anything:true}})).toThrow(/internal|unsupported/i);
  });
});
describe('schema regular expressions cannot request expensive backtracking', () => {
  it.each(['^(a+)+$', '(a|aa)+$', '^(a)\\1+$', '^a*a*a*$', 'a+$', '^a+b$', '^a{1,256}$', '^(?=a)a+$'])('rejects unsafe or unsupported pattern %s at registration', pattern => {
    expect(() => compileSchema({type:'object',properties:{value:{type:'string',pattern}}})).toThrow(/pattern|regular expression|unsupported/i);
  });
  it('rejects the same dangerous grammar in patternProperties', () => {
    expect(() => compileSchema({type:'object',patternProperties:{'^(a+)+$':{type:'string'}}})).toThrow(/pattern|regular expression|unsupported/i);
  });
  it('preserves fixed addresses, simple prefixes, and terminal character repetitions', () => {
    const validate = compileSchema({type:'object',properties:{address:{type:'string',pattern:'^0x[a-fA-F0-9]{40}$'},name:{type:'string',pattern:'^[a-z][a-z0-9_.-]*$'}},patternProperties:{'^custom_':{type:'integer'}}});
    expect(validate({address:'0x'+'a'.repeat(40),name:'tool_1',custom_n:2}).valid).toBe(true);
    expect(validate({address:'0xwrong',name:'tool_1'}).valid).toBe(false);
  });
  it.each(['url','uri','uri-reference'])('rejects complex upstream format %s', format => {
    expect(() => compileSchema({type:'object',properties:{value:{type:'string',format}}})).toThrow(/format|unsupported/i);
  });
});
