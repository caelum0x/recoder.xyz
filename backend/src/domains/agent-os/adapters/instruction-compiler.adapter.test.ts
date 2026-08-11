/**
 * `instruction-compiler.adapter` — the ONLY reference to the concrete
 * `@recoder/agent-instructions` compiler. The compiler module is MOCKED so the
 * test never reads on-disk instruction sources.
 *
 * Proves the degrade-safe contract (never a partial/faked bundle):
 *  - a successful compile returns the bundle verbatim and keeps `health(): up`,
 *  - a compiler THROW maps to a `SERVICE_UNAVAILABLE` AppError whose message
 *    carries the underlying reason (no partial bundle escapes),
 *  - a failing compile flips `health()` to `down` (truthful health),
 *  - a subsequent success recovers `health()` back to `up`,
 *  - a non-Error throw still degrades with a generic reason.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const compileMock = vi.fn();
vi.mock('@recoder/agent-instructions/agent-os-compiler', () => ({
  compileAgentOsInstructionBundle: (input: unknown) => compileMock(input),
}));

import { createInstructionCompilerAdapter } from './instruction-compiler.adapter.js';
import { AppError, ErrorCode } from '../../../shared/errors.js';
import type { Logger } from '../../../shared/logger.js';
import type { CompileAgentOsInstructionBundleInput } from '../ports/instruction-compiler.port.js';

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as Logger;

// A minimal, well-typed input — the compiler is mocked, so only `task.taskId`
// (read for the error log) needs to be meaningful.
const input = { task: { taskId: 'task-1' } } as unknown as CompileAgentOsInstructionBundleInput;

beforeEach(() => {
  compileMock.mockReset();
});

describe('createInstructionCompilerAdapter', () => {
  it('returns the compiled bundle verbatim and stays healthy on success', async () => {
    const bundle = { runtime: { text: 'r' }, audit: { text: 'a' } };
    compileMock.mockReturnValue(bundle);
    const adapter = createInstructionCompilerAdapter(logger);

    const result = await adapter.compile(input);

    expect(result).toBe(bundle);
    expect(compileMock).toHaveBeenCalledWith(input);
    expect(adapter.health()).toBe('up');
  });

  it('maps a compiler throw to a SERVICE_UNAVAILABLE AppError carrying the reason', async () => {
    compileMock.mockImplementation(() => {
      throw new Error('instruction sources unreadable');
    });
    const adapter = createInstructionCompilerAdapter(logger);

    await expect(adapter.compile(input)).rejects.toSatisfy((err: unknown) => {
      return (
        err instanceof AppError &&
        err.code === ErrorCode.SERVICE_UNAVAILABLE &&
        err.message.includes('instruction sources unreadable')
      );
    });
  });

  it('flips health() to down after a failed compile (truthful health)', async () => {
    compileMock.mockImplementation(() => {
      throw new Error('boom');
    });
    const adapter = createInstructionCompilerAdapter(logger);

    await expect(adapter.compile(input)).rejects.toBeDefined();
    expect(adapter.health()).toBe('down');
  });

  it('recovers health() to up once a later compile succeeds', async () => {
    const adapter = createInstructionCompilerAdapter(logger);

    compileMock.mockImplementationOnce(() => {
      throw new Error('transient disk error');
    });
    await expect(adapter.compile(input)).rejects.toBeDefined();
    expect(adapter.health()).toBe('down');

    compileMock.mockReturnValueOnce({ runtime: {}, audit: {} });
    await adapter.compile(input);
    expect(adapter.health()).toBe('up');
  });

  it('degrades with a generic reason when a non-Error value is thrown', async () => {
    compileMock.mockImplementation(() => {
      throw 'string failure';
    });
    const adapter = createInstructionCompilerAdapter(logger);

    await expect(adapter.compile(input)).rejects.toSatisfy((err: unknown) => {
      return (
        err instanceof AppError &&
        err.code === ErrorCode.SERVICE_UNAVAILABLE &&
        err.message.includes('instruction compile failed')
      );
    });
    expect(adapter.health()).toBe('down');
  });
});
