import { afterEach, describe, expect, it, vi } from 'vitest';
import { createKit } from '../core.js';
import type { WebMCPToolDefinition } from '../types.js';
const tick = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const echo = (schema: any = { type: 'object' }, handler: any = (input: any) => input): WebMCPToolDefinition => ({ name: 'echo', description: 'Echo valid input', inputSchema: schema, handler });
afterEach(() => vi.useRealTimers());
describe('bounded validated execution', () => {
  it.each([
    [{ type: 'object', properties: { n: { type: 'integer' } } }, { n: 1.5 }],
    [{ type: 'object', properties: { n: { type: 'number' } } }, { n: null }],
    [{ type: 'object', properties: { rows: { type: 'array', items: { type: 'integer' } } } }, { rows: [1, 'bad'] }],
    [{ type: 'object', properties: { nested: { type: 'object', required: ['id'] } } }, { nested: {} }],
    [{ type: 'object', additionalProperties: false }, { extra: true }],
    [{ type: 'object', oneOf: [{ required: ['a'] }, { required: ['b'] }] }, {}],
    [{ type: 'object', properties: { n: { const: 2 } } }, { n: 3 }],
  ])('enforces complete schema %j', async (schema, input) => {
    const kit = createKit(); kit.register(echo(schema));
    await expect(kit.invoke('echo', input)).rejects.toThrow(/validation/i);
  });
  it.each([NaN, Infinity, undefined, () => 1, new Date(), Object.create({ inherited: true })])('rejects non-JSON value %j', async (value) => {
    const kit = createKit(); kit.register(echo());
    await expect(kit.invoke('echo', { value })).rejects.toThrow();
  });
  it('rejects cycles and forbidden nested keys without evaluating getters', async () => {
    const kit = createKit(); kit.register(echo()); const cycle: any = {}; cycle.self = cycle;
    await expect(kit.invoke('echo', cycle)).rejects.toThrow(/cyc/i);
    await expect(kit.invoke('echo', JSON.parse('{"safe":{"__proto__":{}}}'))).rejects.toThrow(/forbidden|dangerous/i);
    let read = false; const input = Object.defineProperty({}, 'x', { enumerable: true, get() { read = true; return 1; } });
    await expect(kit.invoke('echo', input)).rejects.toThrow(); expect(read).toBe(false);
  });
  it.each([{maxInputBytes: 8}, {maxInputNodes: 2}, {maxInputDepth: 1}])('enforces input budget %j', async (config) => {
    const kit = createKit(config as any); kit.register(echo());
    await expect(kit.invoke('echo', { a: { b: 'long string' } })).rejects.toThrow(/limit|exceed|depth|bytes|nodes/i);
  });
  it.each(['maxConcurrent', 'maxQueued', 'timeoutMs', 'maxInputBytes', 'maxInputNodes', 'maxInputDepth'])('rejects invalid %s', (key) => {
    for (const value of [-1, NaN, Infinity, 1.5]) expect(() => createKit({[key]: value} as any)).toThrow();
  });
  it('supports full prefixed lookup and unregister without double prefix', async () => {
    const kit = createKit({prefix: 'app'}); kit.register(echo());
    expect(await kit.invoke('app.echo', {})).toEqual({}); kit.unregister(kit.getTools()[0].name); expect(kit.getTools()).toHaveLength(0);
  });
  it('requires explicit confirmation and respects provider false', async () => {
    await expect(createKit().requestUserInteraction('delete')).rejects.toThrow(/confirmation|provider/i);
    expect(await createKit({confirmationProvider: () => false} as any).requestUserInteraction('delete')).toBe(false);
  });
  it('snapshots inputs before asynchronous policy hooks', async () => {
    let resume!: () => void; const kit = createKit({onBeforeInvoke: () => new Promise(resolve => {resume = () => resolve(true);})}); kit.register(echo());
    const input = { value: 'before' }; const invocation = kit.invoke('echo', input); input.value = 'after'; resume();
    expect(await invocation).toEqual({value: 'before'});
  });
  it('bounds queue and cancelled queued invocations never execute', async () => {
    let finish!: () => void; const calls: unknown[] = []; const kit = createKit({maxConcurrent: 1, maxQueued: 1} as any);
    kit.register(echo(undefined, (input: any) => { calls.push(input.id); return new Promise(resolve => { finish = () => resolve(input.id); }); }));
    const first = kit.invoke('echo', {id: 1}); await tick(); const controller = new AbortController();
    const queued = kit.invoke('echo', {id: 2}, {signal: controller.signal}); await tick();
    await expect(kit.invoke('echo', {id: 3})).rejects.toThrow(/queue/i); controller.abort(); await expect(queued).rejects.toThrow(/abort/i);
    finish(); await first; await tick(); expect(calls).toEqual([1]);
  });
  it('times out callers and signals running handlers without releasing occupied slots', async () => {
    vi.useFakeTimers(); let finish!: () => void; let signal!: AbortSignal; let calls = 0;
    const kit = createKit({maxConcurrent: 1, maxQueued: 1, timeoutMs: 20} as any);
    kit.register(echo(undefined, (_: any, context: any) => { calls++; signal = context.signal; return new Promise(resolve => {finish = () => resolve(1);}); }));
    const first = kit.invoke('echo', {}); const firstCheck = expect(first).rejects.toThrow(/timeout/i); await tick();
    await vi.advanceTimersByTimeAsync(20); await firstCheck; expect(signal.aborted).toBe(true);
    const queued = kit.invoke('echo', {}); const check = expect(queued).rejects.toThrow(/timeout/i); await tick(); await vi.advanceTimersByTimeAsync(20); await check;
    finish(); await tick(); expect(calls).toBe(1);
  });
  it('runs tool admission before queue without repeating it at execution', async () => {
    let finish!: () => void; const admitted: any[] = []; const contexts: any[] = [];
    const kit = createKit({maxConcurrent: 1, maxQueued: 2} as any);
    const definition: any = echo(undefined, (_: any, context: any) => {contexts.push(context); return new Promise(resolve => { finish = () => resolve(1); }); });
    definition.admit = (_: any, context: any) => {admitted.push(context);}; kit.register(definition);
    const first = kit.invoke('echo', {}); await tick(); const controller = new AbortController(); const queued = kit.invoke('echo', {}, {signal: controller.signal}); await tick();
    expect(admitted).toHaveLength(2); expect(contexts[0]).toBe(admitted[0]); controller.abort(); await expect(queued).rejects.toThrow(); finish(); await first;
  });
  it('revokes running, queued, and captured handlers on unregister', async () => {
    let finish!: () => void; let signal!: AbortSignal; let calls = 0;
    const kit = createKit({maxConcurrent: 1});
    kit.register(echo(undefined, (_: any, context: any) => {calls++; signal = context.signal; return new Promise(resolve => {finish = () => resolve(1);});}));
    const captured = kit.getTool('echo')!;
    const running = kit.invoke('echo', {}); const runningCheck = expect(running).rejects.toThrow(/unregistered|abort/i); await tick();
    const queued = kit.invoke('echo', {}); const queuedCheck = expect(queued).rejects.toThrow(/unregistered|abort/i); await tick();
    kit.unregister('echo'); await Promise.all([runningCheck, queuedCheck]); expect(signal.aborted).toBe(true);
    await expect(captured.handler({})).rejects.toThrow(/unregistered|abort/i); finish(); await tick(); expect(calls).toBe(1);
  });
});
describe('admission capacity covers unresolved policy work', () => {
  it.each(['onBeforeInvoke', 'admit'])('bounds %s work and retains its lease after caller timeout', async (kind) => {
    vi.useFakeTimers(); const resumes: Array<() => void> = []; let policyCalls = 0; let handlerCalls = 0;
    const stuck = () => {policyCalls++; return new Promise<boolean>(resolve => {resumes.push(() => resolve(true));});};
    const kit = createKit({maxConcurrent: 1, maxQueued: 1, timeoutMs: 20, ...(kind === 'onBeforeInvoke' ? {onBeforeInvoke: stuck} : {})});
    kit.register({...echo(undefined, () => {handlerCalls++;}), ...(kind === 'admit' ? {admit: async () => {await stuck();}} : {})});
    const first = kit.invoke('echo', {}); const second = kit.invoke('echo', {});
    const errors = [expect(first).rejects.toThrow(/timeout/), expect(second).rejects.toThrow(/timeout/)];
    await tick(); const extra = kit.invoke('echo', {}); const extraOutcome = extra.then(() => 'ran', error => error.message); await tick();
    expect(policyCalls).toBe(2);
    expect(await Promise.race([extraOutcome, Promise.resolve('still waiting')])).toMatch(/capacity|queue|admission/i);
    await vi.advanceTimersByTimeAsync(20); await Promise.all(errors);
    await expect(kit.invoke('echo', {})).rejects.toThrow(/capacity|queue|admission/i);
    resumes[0](); resumes[1](); await tick(); expect(handlerCalls).toBe(0);
    const recovered = kit.invoke('echo', {}); await tick(); expect(policyCalls).toBe(3); resumes[2](); await recovered; expect(handlerCalls).toBe(1);
  });
});
