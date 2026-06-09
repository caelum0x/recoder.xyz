import type { McpToolCallInput } from '../permissions';
import { McpRegistry, type McpServerRegistration } from '../registry';
import type { McpToolExecutor, McpToolResult } from './mcp-host';

export type McpToolHandler = (input: McpToolCallInput) => Promise<McpToolResult> | McpToolResult;

export class McpToolRouter implements McpToolExecutor {
  private readonly handlers = new Map<string, McpToolHandler>();

  constructor(private readonly registry: McpRegistry) {}

  register(server: McpServerRegistration, toolName: string, handler: McpToolHandler): void {
    this.registry.register(server);
    this.handlers.set(`${server.serverId}:${toolName}`, handler);
  }

  async call(input: McpToolCallInput): Promise<McpToolResult> {
    const handler = this.handlers.get(`${input.server.serverId}:${input.toolName}`);
    if (!handler) {
      throw new Error(`No MCP handler registered for ${input.server.serverId}:${input.toolName}`);
    }
    return handler(input);
  }
}
