// Owned by Recoder. The raw gateway imported `../../logging/subsystem.js` for a
// namespaced structured logger; that monorepo module was not part of the
// extraction. The Discord adapter uses `createSubsystemLogger(area)` and the
// returned logger's `.warn(message, meta?)` / `.error(message, meta?)` methods.
// This is the real, dependency-free behavior: a leveled logger that prefixes
// every line with the connectors subsystem tag (`recoder-connectors/<area>`) and
// serializes optional structured metadata. `debug` is gated on the same verbose
// flag the rest of the package honors.

import { readConnectorEnv, subsystemTag } from "../../src/identity.js";

export type SubsystemLogMeta = Record<string, unknown>;

export interface SubsystemLogger {
  debug(message: string, meta?: SubsystemLogMeta): void;
  info(message: string, meta?: SubsystemLogMeta): void;
  warn(message: string, meta?: SubsystemLogMeta): void;
  error(message: string, meta?: SubsystemLogMeta): void;
}

type LogLevel = "debug" | "info" | "warn" | "error";

function isVerboseEnabled(): boolean {
  const flag = readConnectorEnv("VERBOSE");
  if (flag != null) {
    const normalized = flag.trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes";
  }
  return Boolean(process.env.DEBUG);
}

function formatMeta(meta?: SubsystemLogMeta): string {
  if (!meta) {
    return "";
  }
  const keys = Object.keys(meta);
  if (keys.length === 0) {
    return "";
  }
  try {
    return ` ${JSON.stringify(meta)}`;
  } catch {
    // Fall back to a shallow best-effort render when meta contains values that
    // cannot be JSON-serialized (e.g. circular refs); never throw from a log.
    const parts = keys.map((key) => `${key}=${String((meta as Record<string, unknown>)[key])}`);
    return ` ${parts.join(" ")}`;
  }
}

function emit(level: LogLevel, tag: string, message: string, meta?: SubsystemLogMeta): void {
  if (level === "debug" && !isVerboseEnabled()) {
    return;
  }
  const line = `[${level}] ${tag}: ${message}${formatMeta(meta)}\n`;
  if (level === "error" || level === "warn") {
    process.stderr.write(line);
    return;
  }
  process.stdout.write(line);
}

/**
 * Create a logger scoped to `area`. The area is rendered as the connectors
 * subsystem tag (e.g. `createSubsystemLogger("discord/event-queue")` →
 * `recoder-connectors/discord/event-queue`) so every line is greppable by
 * subsystem.
 */
export function createSubsystemLogger(area: string): SubsystemLogger {
  const tag = subsystemTag(area);
  return {
    debug: (message, meta) => emit("debug", tag, message, meta),
    info: (message, meta) => emit("info", tag, message, meta),
    warn: (message, meta) => emit("warn", tag, message, meta),
    error: (message, meta) => emit("error", tag, message, meta),
  };
}
