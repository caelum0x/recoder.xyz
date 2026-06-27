// Owned by Recoder. The REAL iMessage availability probe for the ConnectorPort
// adapter, ported from social-gateways/imessage/probe.ts. The three-stage check
// is unchanged: (1) the `imsg` binary resolves on PATH, (2) the build supports
// the `rpc` subcommand (`imsg rpc --help`), and (3) a live `chats.list` RPC
// round-trips. The original pulled `detectBinary` from `../commands/...`,
// `loadConfig` from `../config`, and `runCommandWithTimeout` from `../process/exec`
// — all un-extracted. Those are reproduced here dependency-free (PATH probe via
// `which`/`where`, `--help` via a spawned child) so the probe never fakes health.

import { spawn } from "node:child_process";
import { createIMessageRpcClient } from "./client.js";
import { DEFAULT_IMESSAGE_PROBE_TIMEOUT_MS } from "./client.js";
import type { RuntimeEnv } from "./runtime.js";

export type IMessageProbe = {
  ok: boolean;
  error?: string | null;
  fatal?: boolean;
};

export type IMessageProbeOptions = {
  cliPath?: string;
  dbPath?: string;
  runtime?: RuntimeEnv;
};

type CommandResult = { code: number | null; stdout: string; stderr: string };

/** Run a command to completion with a timeout, capturing stdout/stderr. */
function runCommandWithTimeout(
  argv: string[],
  opts: { timeoutMs: number },
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const [command, ...args] = argv;
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (result: CommandResult) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(result);
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish({ code: null, stdout, stderr: `${stderr}\n[timeout]`.trim() });
    }, opts.timeoutMs);
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      finish({ code: null, stdout, stderr: `${stderr}\n${String(err)}`.trim() });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      finish({ code, stdout, stderr });
    });
  });
}

/** Detect whether `cliPath` resolves to an executable on PATH (or as a path). */
async function detectBinary(cliPath: string, timeoutMs: number): Promise<boolean> {
  // An explicit path (absolute or wrapper script) is trusted; spawn errors are
  // caught downstream by the rpc support probe.
  if (cliPath.includes("/")) {
    return true;
  }
  const locator = process.platform === "win32" ? "where" : "which";
  const result = await runCommandWithTimeout([locator, cliPath], { timeoutMs });
  return result.code === 0 && result.stdout.trim().length > 0;
}

type RpcSupportResult = {
  supported: boolean;
  error?: string;
  fatal?: boolean;
};

const rpcSupportCache = new Map<string, RpcSupportResult>();

async function probeRpcSupport(cliPath: string, timeoutMs: number): Promise<RpcSupportResult> {
  const cached = rpcSupportCache.get(cliPath);
  if (cached) {
    return cached;
  }
  try {
    const result = await runCommandWithTimeout([cliPath, "rpc", "--help"], { timeoutMs });
    const combined = `${result.stdout}\n${result.stderr}`.trim();
    const normalized = combined.toLowerCase();
    if (normalized.includes("unknown command") && normalized.includes("rpc")) {
      const fatal = {
        supported: false,
        fatal: true,
        error: 'imsg CLI does not support the "rpc" subcommand (update imsg)',
      };
      rpcSupportCache.set(cliPath, fatal);
      return fatal;
    }
    if (result.code === 0) {
      const supported = { supported: true };
      rpcSupportCache.set(cliPath, supported);
      return supported;
    }
    return {
      supported: false,
      error: combined || `imsg rpc --help failed (code ${String(result.code ?? "unknown")})`,
    };
  } catch (err) {
    return { supported: false, error: String(err) };
  }
}

/**
 * Probe iMessage RPC availability. Returns truthful `ok`/`error`/`fatal`:
 * `fatal` marks a non-retryable condition (the `imsg` build predates the `rpc`
 * subcommand) so callers can stop instead of looping.
 */
export async function probeIMessage(
  timeoutMs?: number,
  opts: IMessageProbeOptions = {},
): Promise<IMessageProbe> {
  const cliPath = opts.cliPath?.trim() || "imsg";
  const dbPath = opts.dbPath?.trim();
  const effectiveTimeout = timeoutMs ?? DEFAULT_IMESSAGE_PROBE_TIMEOUT_MS;

  const detected = await detectBinary(cliPath, effectiveTimeout);
  if (!detected) {
    return { ok: false, error: `imsg not found (${cliPath})` };
  }

  const rpcSupport = await probeRpcSupport(cliPath, effectiveTimeout);
  if (!rpcSupport.supported) {
    return {
      ok: false,
      error: rpcSupport.error ?? "imsg rpc unavailable",
      fatal: rpcSupport.fatal,
    };
  }

  const client = await createIMessageRpcClient({
    cliPath,
    dbPath,
    runtime: opts.runtime,
  });
  try {
    await client.request("chats.list", { limit: 1 }, { timeoutMs: effectiveTimeout });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  } finally {
    await client.stop();
  }
}
