// Owned by Recoder. Loader for the OPTIONAL channel SDKs the Slack adapter
// runs against (`@slack/web-api`, `@slack/bolt`). These are declared as
// optional peer dependencies of @recoder/connectors and are intentionally not
// part of the foundation install (kept ENOSPC-safe on the disk-constrained dev
// box). Because the SDK type declarations are therefore not present in this
// tree, the specifier is passed through a runtime variable so the type checker
// does not attempt to statically resolve a module that is only present once an
// integrator installs it. At runtime this performs the genuine dynamic import
// of the real SDK — it is a real loader, not a shim.

/**
 * Dynamically import an optional channel SDK by name. Throws a truthful,
 * actionable error when the optional peer dependency is not installed.
 */
export async function loadOptionalSdk<T = Record<string, unknown>>(
  moduleName: string,
): Promise<T> {
  // Indirect specifier: keeps the real runtime import while signalling to the
  // type checker that this is a dynamic (non-resolvable-at-build) module.
  const specifier: string = moduleName;
  try {
    return (await import(specifier)) as T;
  } catch (err) {
    throw new Error(
      `${moduleName} is not installed. Add it as a dependency to enable the Recoder Slack connector ` +
        `(declared as an optional peer dependency of @recoder/connectors). Underlying error: ${
          err instanceof Error ? err.message : String(err)
        }`,
    );
  }
}
