// Owned by Recoder. Loader for the OPTIONAL pi-agent SDKs the embedded runner
// drives (`@mariozechner/pi-ai`, `@mariozechner/pi-agent-core`,
// `@mariozechner/pi-coding-agent`). These are declared as optional peer
// dependencies of @recoder/connectors and are intentionally NOT statically
// imported by the foundation `src/` tree — keeping `npm install` of the
// foundation ENOSPC-safe on the disk-constrained dev box and free of the heavy
// pi dependency graph. Because the pi type declarations are therefore not
// guaranteed present in this tree, the specifier is passed through a runtime
// variable so the type checker never tries to statically resolve a module that
// is only present once an integrator installs it. At runtime this performs the
// genuine dynamic import of the real SDK — a real loader, not a shim.
//
// This is the same optional-peer pattern the per-channel adapters use
// (social-gateways/*/adapter/optional-sdk.ts), lifted into the foundation so
// the embedded runner can rely on it without depending on an adapter subtree.

/** The optional pi-agent SDK module names this package may load at runtime. */
export const PI_AI_MODULE = "@mariozechner/pi-ai";
export const PI_AGENT_CORE_MODULE = "@mariozechner/pi-agent-core";
export const PI_CODING_AGENT_MODULE = "@mariozechner/pi-coding-agent";

/**
 * Dynamically import an optional pi-agent SDK by name. Throws a truthful,
 * actionable error when the optional peer dependency is not installed, naming
 * the exact module so an integrator knows what to add.
 */
export async function loadOptionalPi<T = Record<string, unknown>>(
  moduleName: string,
): Promise<T> {
  // Indirect specifier: keeps the real runtime import while signalling to the
  // type checker that this is a dynamic (non-resolvable-at-build) module.
  const specifier: string = moduleName;
  try {
    return (await import(specifier)) as T;
  } catch (err) {
    throw new Error(
      `${moduleName} is not installed. Add it as a dependency to enable the ` +
        `Recoder embedded pi-agent runner (declared as an optional peer ` +
        `dependency of @recoder/connectors). Underlying error: ${
          err instanceof Error ? err.message : String(err)
        }`,
    );
  }
}
