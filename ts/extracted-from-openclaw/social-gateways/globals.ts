// Owned by Recoder. The raw social-gateways were extracted importing a
// monorepo-root `../../globals.js` that the extraction did not carry over. The
// Discord adapter uses exactly two of its exports — `danger()` (red-emphasis
// text for error log lines) and `logVerbose()` (gated diagnostic logging). Both
// are reconstructed here as their real, dependency-free behavior; verbosity is
// keyed off the connectors env (`RECODER_CONNECTORS_VERBOSE`, legacy
// `OPENCLAW_VERBOSE`) honored elsewhere in this package, with a `DEBUG` fallback.

import { readConnectorEnv } from "../src/identity.js";

const ANSI_RED = "[31m";
const ANSI_RESET = "[0m";

/**
 * Wrap `text` in red-emphasis ANSI when stderr is a TTY, otherwise return it
 * unchanged. Used for error log lines so failures stand out in interactive
 * terminals without corrupting piped / file output.
 */
export function danger(text: string): string {
  if (!process.stderr.isTTY) {
    return text;
  }
  return `${ANSI_RED}${text}${ANSI_RESET}`;
}

function isVerboseEnabled(): boolean {
  const flag = readConnectorEnv("VERBOSE");
  if (flag != null) {
    const normalized = flag.trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes";
  }
  return Boolean(process.env.DEBUG);
}

/**
 * Emit a diagnostic line to stderr only when verbose mode is enabled. No-op
 * otherwise, so hot inbound paths can call it unconditionally.
 */
export function logVerbose(message: string): void {
  if (!isVerboseEnabled()) {
    return;
  }
  process.stderr.write(`${message}\n`);
}
