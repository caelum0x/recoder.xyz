// Owned by Recoder. The raw gateway imported a monorepo-root `../runtime.js` /
// `../../runtime.js` for the injectable runtime environment (logging + process
// exit) that lets the gateway be driven both as a standalone process and
// embedded under a host. That sibling was not part of the extraction. The
// Discord adapter uses `RuntimeEnv` purely through its optional `log`, `error`,
// and `exit` members (`runtime.log?.(...)`, `runtime.error?.(...)`). This is the
// real, dependency-free contract; provider.ts defaults it to the console.

/**
 * Injectable runtime environment. Every member is optional so a caller can
 * supply a partial implementation (e.g. only `error`) and the gateway will
 * no-op the rest via optional-call (`runtime.log?.(...)`).
 */
export interface RuntimeEnv {
  /** Informational logging sink (defaults to `console.log`). */
  log?: (message: string, ...rest: unknown[]) => void;
  /** Error logging sink (defaults to `console.error`). */
  error?: (message: string, ...rest: unknown[]) => void;
  /** Process-exit hook (defaults to throwing, so embedders don't kill the host). */
  exit?: (code: number) => never;
}

/**
 * A {@link RuntimeEnv} backed by the console, with an `exit` that throws instead
 * of terminating the process — safe to use when the gateway runs embedded.
 */
export function defaultRuntimeEnv(): Required<RuntimeEnv> {
  return {
    log: console.log,
    error: console.error,
    exit: (code: number): never => {
      throw new Error(`exit ${code}`);
    },
  };
}
