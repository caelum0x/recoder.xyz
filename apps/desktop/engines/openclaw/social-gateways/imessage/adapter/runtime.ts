// Owned by Recoder. The minimal runtime surface the iMessage ConnectorPort
// adapter needs, made dependency-free. The raw social-gateways/imessage/*.ts
// files import `RuntimeEnv` from the un-extracted monorepo module `../runtime.js`
// and `resolveUserPath` from `../utils.js` (neither is part of this extraction —
// see the adapter handoff foundationGaps). We reproduce the exact structural
// contract the iMessage RPC client + probe rely on (an error/info logger sink and
// a `~`/`$HOME` path expander) so the adapter compiles and runs in isolation.

import os from "node:os";
import path from "node:path";

/**
 * The structural subset of the original `RuntimeEnv` the iMessage code touches:
 * optional `error`/`info` logging sinks. Hostile-by-default ingress never relies
 * on these for control flow; they only surface truthful diagnostics.
 */
export interface RuntimeEnv {
  error?: (message: string) => void;
  info?: (message: string) => void;
}

/**
 * Expand a leading `~` (or `~/`) to the current user's home directory and
 * resolve the result to an absolute path. Mirrors the `../utils.resolveUserPath`
 * contract the original iMessage client used for `--db <path>` resolution.
 */
export function resolveUserPath(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return trimmed;
  }
  const home = os.homedir();
  if (trimmed === "~") {
    return home;
  }
  if (trimmed.startsWith("~/")) {
    return path.join(home, trimmed.slice(2));
  }
  return path.resolve(trimmed);
}
