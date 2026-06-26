/**
 * Brain MCP server — the thin `@modelcontextprotocol/sdk` shell over the pure
 * {@link createBrainTools} seam. Registers `tools/list` + `tools/call`, then runs
 * on stdio so any MCP client (recoder-code, Claude, Cursor) can spawn it and read
 * the fused Brain context.
 *
 * The Brain is constructed with ALL default adapters wired (repo intel, desktop
 * activity, mem0 memory, context7 docs, beads tasks). Every adapter is
 * degrade-safe, so a missing key/tool just yields an empty section — the server
 * always starts and always responds.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { Brain, createBrain } from "../brain";
import { createRepoIntelAuto } from "../repo/recodergit-repo-intel";
import { createContinuumActivity } from "../activity/continuum-activity-adapter";
import { createMem0Memory } from "../memory/mem0-memory";
import { createContext7Docs } from "../docs/context7-docs";
import { createBeadsTasks } from "../tasks/beads-tasks";
import { createBrainTools, type BrainTool } from "./mcp-seam";

/**
 * Construct a Brain with every default adapter wired in. Each adapter degrades to
 * empty when its tool/key is absent, so this never throws and always yields a
 * usable (if sparse) Brain.
 */
export function createDefaultBrain(): Brain {
  return createBrain({
    repo: createRepoIntelAuto(),
    activity: createContinuumActivity(),
    memory: createMem0Memory(),
    docs: createContext7Docs(),
    tasks: createBeadsTasks(),
  });
}

/**
 * Build a configured MCP `Server` exposing the Brain's tools. Transport-agnostic
 * — the caller connects the desired transport (stdio for the bin entry; an
 * injected transport for tests).
 */
export function createBrainMcpServer(brain: Brain): Server {
  const tools = createBrainTools(brain);
  const byName = new Map<string, BrainTool>(tools.map((t) => [t.name, t]));

  const server = new Server(
    { name: "@recoder/brain", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: { readOnlyHint: tool.readOnly },
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = byName.get(request.params.name);
    if (!tool) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: unknown tool "${request.params.name}".`,
          },
        ],
        isError: true,
      };
    }
    const args = (request.params.arguments ?? {}) as Record<string, unknown>;
    const result = await tool.handler(args);
    // Return an inline literal (not the named BrainToolResult) so the SDK's
    // CallToolResult union resolves to its content-bearing member.
    return { content: result.content, isError: result.isError };
  });

  return server;
}

/**
 * Boot the Brain MCP server on stdio. Wires the default (degrade-safe) Brain and
 * connects a {@link StdioServerTransport}. Resolves once the transport is
 * connected; the process then lives until stdin closes.
 */
export async function runBrainMcpStdio(): Promise<void> {
  const server = createBrainMcpServer(createDefaultBrain());
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
