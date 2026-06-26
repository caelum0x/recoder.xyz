#!/usr/bin/env node
/**
 * Brain MCP stdio bin entry (`recoder-brain`). Spawned over stdio by MCP clients
 * (e.g. recoder-code's default `brain` server). Fail-safe: any boot error is
 * written to stderr and the process exits non-zero — it never hangs silently.
 */

import { runBrainMcpStdio } from "./mcp-server";

runBrainMcpStdio().catch((error: unknown) => {
  const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`@recoder/brain MCP server failed to start: ${detail}\n`);
  process.exit(1);
});
