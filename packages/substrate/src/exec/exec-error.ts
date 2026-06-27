/**
 * ExecError — a typed wrapper around an execFile rejection.
 *
 * Node's execFile rejects with an Error decorated with `code`, `stdout`,
 * `stderr`. This normalizes that into a stable shape so callers don't read
 * loosely-typed properties off `unknown`.
 */
export class ExecError extends Error {
  readonly bin: string;
  readonly args: readonly string[];
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;

  constructor(
    bin: string,
    args: readonly string[],
    fields: { code: number | null; stdout: string; stderr: string; message?: string },
  ) {
    super(fields.message ?? `command failed: ${bin} (code ${fields.code ?? 'null'})`);
    this.name = 'ExecError';
    this.bin = bin;
    this.args = args;
    this.code = fields.code;
    this.stdout = fields.stdout;
    this.stderr = fields.stderr;
    Object.setPrototypeOf(this, ExecError.prototype);
  }
}

interface ExecRejection {
  code?: number | null;
  stdout?: string | Buffer;
  stderr?: string | Buffer;
  message?: string;
}

/** Coerce an unknown execFile rejection into a typed ExecError. */
export function toExecError(bin: string, args: readonly string[], value: unknown): ExecError {
  const r = (value ?? {}) as ExecRejection;
  return new ExecError(bin, args, {
    code: typeof r.code === 'number' ? r.code : null,
    stdout: r.stdout != null ? String(r.stdout) : '',
    stderr: r.stderr != null ? String(r.stderr) : '',
    message: r.message,
  });
}
