/**
 * Structured logger for the runtime. Dependency-free by design: it writes redactable,
 * structured records to an injectable sink (default: `console.error` as JSON lines so logs
 * never pollute a CLI's stdout stream). A host may inject `@recoder/logger` via `sink`.
 *
 * It is the runtime's only logging surface; raw-frame debug dumps live behind the opt-in
 * debug tap and run AFTER secret redaction.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogRecord = {
  level: LogLevel;
  message: string;
  time: string;
  data?: Record<string, unknown>;
};

export type LogSink = (record: LogRecord) => void;

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export type RuntimeLoggerOptions = {
  /** Minimum level to emit (default `info`). */
  minLevel?: LogLevel;
  /** Where records go (default: JSON line to stderr). */
  sink?: LogSink;
  /** Static fields merged into every record (e.g. runId, adapterId). */
  base?: Record<string, unknown>;
};

const defaultSink: LogSink = (record) => {
  // stderr keeps structured logs off any CLI's parsed stdout stream.
  process.stderr.write(`${JSON.stringify(record)}\n`);
};

export class RuntimeLogger {
  readonly #minLevel: LogLevel;
  readonly #sink: LogSink;
  readonly #base: Record<string, unknown>;

  constructor(options: RuntimeLoggerOptions = {}) {
    this.#minLevel = options.minLevel ?? 'info';
    this.#sink = options.sink ?? defaultSink;
    this.#base = options.base ?? {};
  }

  /** Return a child logger with additional static fields. */
  child(fields: Record<string, unknown>): RuntimeLogger {
    return new RuntimeLogger({
      minLevel: this.#minLevel,
      sink: this.#sink,
      base: { ...this.#base, ...fields },
    });
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.#log('debug', message, data);
  }
  info(message: string, data?: Record<string, unknown>): void {
    this.#log('info', message, data);
  }
  warn(message: string, data?: Record<string, unknown>): void {
    this.#log('warn', message, data);
  }
  error(message: string, data?: Record<string, unknown>): void {
    this.#log('error', message, data);
  }

  #log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.#minLevel]) return;
    const merged = { ...this.#base, ...(data ?? {}) };
    this.#sink({
      level,
      message,
      time: new Date().toISOString(),
      data: Object.keys(merged).length > 0 ? merged : undefined,
    });
  }
}

export function createRuntimeLogger(options: RuntimeLoggerOptions = {}): RuntimeLogger {
  return new RuntimeLogger(options);
}
