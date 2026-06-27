import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * Write a `.mcp.json` passthrough file for the Claude Code CLI from MCP server config pulled
 * (upstream) via `seams/mcp-port`. The CLI consumes it via `--mcp-config <path>`.
 *
 * Shape mirrors Claude Code's `.mcp.json`:
 *   { "mcpServers": { "<name>": { "command"|"url", ... } } }
 *
 * The driver owns the temp file's lifecycle; the caller passes the resulting path into
 * `buildClaudeArgs`. No secrets are inlined here — credentials arrive in each server entry
 * from the registry and the env is redacted for logging elsewhere.
 */

export type ClaudeMcpServerConfig =
  | {
      type?: 'stdio';
      command: string;
      args?: readonly string[];
      env?: Readonly<Record<string, string>>;
    }
  | {
      type: 'sse' | 'http';
      url: string;
      headers?: Readonly<Record<string, string>>;
    };

export type ClaudeMcpConfig = {
  mcpServers: Readonly<Record<string, ClaudeMcpServerConfig>>;
};

/** Serialize an MCP config to the `.mcp.json` JSON text the CLI expects. */
export function serializeClaudeMcpConfig(config: ClaudeMcpConfig): string {
  return JSON.stringify({ mcpServers: config.mcpServers }, null, 2);
}

/** True when there is at least one server to pass through. */
export function hasMcpServers(config: ClaudeMcpConfig | undefined): config is ClaudeMcpConfig {
  return config !== undefined && Object.keys(config.mcpServers).length > 0;
}

/**
 * Write the `.mcp.json` to a temp dir and return its absolute path. Returns undefined when
 * there are no servers to pass through (so the driver omits `--mcp-config` entirely).
 */
export async function writeClaudeMcpConfig(
  config: ClaudeMcpConfig | undefined,
  prefix = 'recoder-claude-mcp-',
): Promise<string | undefined> {
  if (!hasMcpServers(config)) return undefined;
  const dir = await mkdtemp(path.join(tmpdir(), prefix));
  const filePath = path.join(dir, '.mcp.json');
  await writeFile(filePath, serializeClaudeMcpConfig(config), 'utf8');
  return filePath;
}
