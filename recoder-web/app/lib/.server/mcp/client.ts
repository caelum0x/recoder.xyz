/**
 * MCP Client
 * Handles tool execution and communication with MCP servers
 */

import type { MCPToolCall, MCPToolResult, MCPError, MCPServer } from './types';
import { mcpRegistry } from './registry';

export class MCPClient {
  /**
   * Execute a tool call
   */
  async executeTool(call: MCPToolCall): Promise<MCPToolResult> {
    const startTime = Date.now();

    try {
      console.log(`🔧 Executing tool: ${call.toolName}`);

      // Get the tool and its server
      const toolInfo = mcpRegistry.getTool(call.toolName);
      
      if (!toolInfo) {
        throw this.createError(
          'TOOL_NOT_FOUND',
          `Tool "${call.toolName}" not found`,
          false
        );
      }

      const server = mcpRegistry.get(toolInfo.serverId);
      
      if (!server) {
        throw this.createError(
          'SERVER_NOT_FOUND',
          `Server for tool "${call.toolName}" not found`,
          false
        );
      }

      if (!server.enabled) {
        throw this.createError(
          'SERVER_DISABLED',
          `Server "${server.name}" is disabled`,
          false
        );
      }

      // Validate parameters against schema
      this.validateParameters(call.parameters, toolInfo.tool.inputSchema);

      // Execute the tool (will be implemented by specific servers)
      const result = await this.executeToolInternal(server, toolInfo.tool.name, call.parameters);

      const executionTime = Date.now() - startTime;

      console.log(`✅ Tool executed successfully in ${executionTime}ms`);

      return {
        callId: call.id,
        success: true,
        result,
        executionTime,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;

      console.error(`❌ Tool execution failed:`, error);

      return {
        callId: call.id,
        success: false,
        error: error instanceof Error 
          ? this.createError('EXECUTION_ERROR', error.message, true)
          : this.createError('UNKNOWN_ERROR', 'Unknown error occurred', true),
        executionTime,
      };
    }
  }

  /**
   * List all available tools
   */
  async listTools(): Promise<any[]> {
    const tools = mcpRegistry.getAllTools();
    
    return tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      category: tool.category,
      inputSchema: tool.inputSchema,
      requiresAuth: tool.requiresAuth,
      requiresApproval: tool.requiresApproval,
    }));
  }

  /**
   * Get server information
   */
  async getServer(serverId: string): Promise<MCPServer | null> {
    return mcpRegistry.get(serverId) || null;
  }

  /**
   * List all servers
   */
  async listServers(): Promise<MCPServer[]> {
    return mcpRegistry.getAll();
  }

  /**
   * Internal tool execution
   */
  private async executeToolInternal(
    server: MCPServer,
    toolName: string,
    parameters: Record<string, any>
  ): Promise<any> {
    // Get the tool from the server
    const tool = server.tools.find(t => t.name === toolName);
    
    if (!tool || !tool.handler) {
      throw this.createError(
        'NO_HANDLER',
        `No handler found for tool ${toolName}`,
        false
      );
    }

    // Execute the tool's handler
    try {
      const result = await tool.handler(parameters);
      return result;
    } catch (error) {
      throw this.createError(
        'HANDLER_ERROR',
        error instanceof Error ? error.message : 'Handler execution failed',
        true
      );
    }
  }

  /**
   * Validate parameters against JSON schema
   */
  private validateParameters(parameters: Record<string, any>, schema: any): void {
    // Basic validation - will be enhanced with proper JSON schema validation
    if (!schema) return;

    if (schema.required) {
      for (const required of schema.required) {
        if (!(required in parameters)) {
          throw this.createError(
            'VALIDATION_ERROR',
            `Missing required parameter: ${required}`,
            false
          );
        }
      }
    }
  }

  /**
   * Create a standardized error object
   */
  private createError(code: string, message: string, retryable: boolean): MCPError {
    return {
      code,
      message,
      retryable,
      stack: new Error().stack,
    };
  }
}

// Global client instance
export const mcpClient = new MCPClient();
