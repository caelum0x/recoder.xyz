/**
 * openfang-workflow driver — degrade-safe contract over the native
 * `register_workflow` / `run_workflow` subsystem:
 *  - engine absent ⇒ every method is a truthful `{ available:false }` (no throw),
 *  - a present stub engine ⇒ register/run FIRE the native calls and parse JSON,
 *  - `registerAndRun` chains register → run and short-circuits on a register error,
 *  - a value-level engine error and a napi throw both fold into `{ ok:false }`.
 */
import { describe, it, expect, vi } from 'vitest';
import type { OpenfangEngineInstance } from './openfang-native.js';
import { createOpenfangWorkflowDriver } from './openfang-workflow.js';

/** A stub engine: every method returns `{ok:true}` unless overridden. */
function stubEngine(
  overrides: Partial<Record<keyof OpenfangEngineInstance, unknown>> = {},
): OpenfangEngineInstance {
  const jsonOk = (): string => JSON.stringify({ ok: true });
  return new Proxy({ ...(overrides as Record<string, unknown>) } as OpenfangEngineInstance, {
    get(target, prop: string) {
      return (target as Record<string, unknown>)[prop] ?? jsonOk;
    },
  });
}

describe('openfang-workflow driver (degrade-safe native subsystem)', () => {
  it('returns { available:false } for every method when the engine is absent', () => {
    const driver = createOpenfangWorkflowDriver({ engine: () => undefined });
    expect(driver.available()).toBe(false);
    expect(driver.register('{}')).toMatchObject({ available: false });
    expect(driver.run('wf_1', '{}')).toMatchObject({ available: false });
    expect(driver.registerAndRun('{}', '{}')).toMatchObject({ available: false });
  });

  it('FIRES register_workflow + run_workflow through the native engine', () => {
    const registerWorkflow = vi.fn(
      () => JSON.stringify({ ok: true, workflow_id: 'wf_abc' }),
    );
    const runWorkflow = vi.fn(
      () => JSON.stringify({ ok: true, run_id: 'run_xyz', output: 'done' }),
    );
    const engine = stubEngine({ registerWorkflow, runWorkflow });
    const driver = createOpenfangWorkflowDriver({ engine: () => engine });

    const reg = driver.register('{"name":"wf"}');
    expect(reg).toEqual({ available: true, ok: true, workflowId: 'wf_abc' });
    expect(registerWorkflow).toHaveBeenCalledWith('{"name":"wf"}');

    const ran = driver.run('wf_abc', '{"seed":1}');
    expect(ran).toEqual({ available: true, ok: true, runId: 'run_xyz', output: 'done' });
    expect(runWorkflow).toHaveBeenCalledWith('wf_abc', '{"seed":1}');
  });

  it('registerAndRun chains register → run in one call', () => {
    const registerWorkflow = vi.fn(() => JSON.stringify({ ok: true, workflow_id: 'wf_1' }));
    const runWorkflow = vi.fn(() => JSON.stringify({ ok: true, run_id: 'run_1', output: 'ok' }));
    const engine = stubEngine({ registerWorkflow, runWorkflow });
    const driver = createOpenfangWorkflowDriver({ engine: () => engine });

    const result = driver.registerAndRun('{"name":"wf"}', '{}');
    expect(result).toEqual({ available: true, ok: true, runId: 'run_1', output: 'ok' });
    expect(registerWorkflow).toHaveBeenCalledTimes(1);
    expect(runWorkflow).toHaveBeenCalledWith('wf_1', '{}');
  });

  it('registerAndRun short-circuits (no run) when register fails', () => {
    const registerWorkflow = vi.fn(() => JSON.stringify({ ok: false, error: 'bad workflow json' }));
    const runWorkflow = vi.fn(() => JSON.stringify({ ok: true, run_id: 'run_1', output: '' }));
    const engine = stubEngine({ registerWorkflow, runWorkflow });
    const driver = createOpenfangWorkflowDriver({ engine: () => engine });

    const result = driver.registerAndRun('{bad}', '{}');
    expect(result).toEqual({ available: true, ok: false, error: 'bad workflow json' });
    expect(runWorkflow).not.toHaveBeenCalled();
  });

  it('folds a napi throw into a truthful { ok:false } (never propagates)', () => {
    const engine = stubEngine({
      runWorkflow: () => {
        throw new Error('block_on panic');
      },
    });
    const driver = createOpenfangWorkflowDriver({ engine: () => engine });
    const result = driver.run('wf_1', '{}');
    expect(result).toMatchObject({ available: true, ok: false });
    if (result.available && !result.ok) expect(result.error).toMatch(/threw/);
  });
});
