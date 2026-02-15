import { describe, it, expect, vi, beforeEach } from 'vitest';

// Stub pino-pretty so we don't need the real transport in tests
vi.mock('pino-pretty', () => ({ default: () => new (require('stream').PassThrough)() }));

describe('logger', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('createLogger returns an object with info/warn/error/debug methods', async () => {
    const { createLogger } = await import('../logger.js');
    const log = createLogger('test');

    expect(typeof log.info).toBe('function');
    expect(typeof log.warn).toBe('function');
    expect(typeof log.error).toBe('function');
    expect(typeof log.debug).toBe('function');
  });

  it('child logger has correct component binding', async () => {
    const { createLogger } = await import('../logger.js');
    const log = createLogger('my-component');

    // pino child loggers store bindings; access via the internal bindings method
    const bindings = (log as any).bindings();
    expect(bindings.component).toBe('my-component');
  });

  it('default log level is info', async () => {
    const { rootLogger } = await import('../logger.js');
    expect(rootLogger.level).toBe('info');
  });
});
