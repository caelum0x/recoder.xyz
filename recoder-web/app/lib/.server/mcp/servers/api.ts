/**
 * Web API MCP Server
 * Provides HTTP/REST API operations through MCP protocol
 */

import type { MCPServer, MCPTool, APIResponse } from '../types';

export class APIMCPServer {
  private readonly serverId = 'api';
  private readonly serverName = 'Web API';
  private readonly version = '1.0.0';

  /**
   * Get server configuration
   */
  getServer(): MCPServer {
    return {
      id: this.serverId,
      name: this.serverName,
      description: 'HTTP/REST API operations: GET, POST, PUT, DELETE requests',
      version: this.version,
      enabled: true,
      status: 'active',
      config: {
        permissions: {
          network: {
            allowedDomains: [], // Empty = all domains allowed
            allowedPorts: [80, 443],
            allowOutbound: true,
          },
        },
        rateLimit: {
          maxRequests: 100,
          windowMs: 60000,
        },
      },
      tools: this.getTools(),
      metadata: {
        category: 'api',
        priority: 4,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /**
   * Define available tools
   */
  private getTools(): MCPTool[] {
    return [
      {
        name: 'api_request',
        description: 'Make an HTTP request',
        category: 'api',
        inputSchema: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'Request URL',
            },
            method: {
              type: 'string',
              enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
              default: 'GET',
            },
            headers: {
              type: 'object',
              description: 'Request headers',
            },
            body: {
              type: ['object', 'string'],
              description: 'Request body',
            },
            timeout: {
              type: 'number',
              description: 'Timeout in milliseconds',
              default: 30000,
            },
          },
          required: ['url'],
        },
        requiresAuth: false,
        requiresApproval: false,
        estimatedDuration: 2000,
        examples: [
          {
            description: 'Get JSON data',
            input: {
              url: 'https://api.example.com/data',
              method: 'GET',
            },
          },
        ],
      },
      {
        name: 'api_get',
        description: 'Make a GET request',
        category: 'api',
        inputSchema: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'Request URL',
            },
            headers: {
              type: 'object',
              description: 'Request headers',
            },
            params: {
              type: 'object',
              description: 'Query parameters',
            },
          },
          required: ['url'],
        },
        requiresAuth: false,
        requiresApproval: false,
        estimatedDuration: 1500,
      },
      {
        name: 'api_post',
        description: 'Make a POST request',
        category: 'api',
        inputSchema: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'Request URL',
            },
            data: {
              type: ['object', 'string'],
              description: 'Request body',
            },
            headers: {
              type: 'object',
              description: 'Request headers',
            },
          },
          required: ['url', 'data'],
        },
        requiresAuth: false,
        requiresApproval: true, // Requires approval for POST
        estimatedDuration: 2000,
      },
      {
        name: 'api_fetch_json',
        description: 'Fetch and parse JSON data',
        category: 'api',
        inputSchema: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'API endpoint URL',
            },
            headers: {
              type: 'object',
              description: 'Request headers',
            },
          },
          required: ['url'],
        },
        requiresAuth: false,
        requiresApproval: false,
        estimatedDuration: 1500,
      },
    ];
  }

  /**
   * Execute a tool
   */
  async executeTool(toolName: string, parameters: Record<string, any>): Promise<any> {
    switch (toolName) {
      case 'api_request':
        return await this.makeRequest(parameters);

      case 'api_get':
        return await this.get(parameters.url, parameters.headers, parameters.params);

      case 'api_post':
        return await this.post(parameters.url, parameters.data, parameters.headers);

      case 'api_fetch_json':
        return await this.fetchJSON(parameters.url, parameters.headers);

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  /**
   * Make a generic HTTP request
   */
  private async makeRequest(params: any): Promise<APIResponse> {
    const startTime = Date.now();

    try {
      const { url, method = 'GET', headers = {}, body, timeout = 30000 } = params;

      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const requestOptions: RequestInit = {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        signal: controller.signal,
      };

      if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
        requestOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
      }

      const response = await fetch(url, requestOptions);
      clearTimeout(timeoutId);

      const duration = Date.now() - startTime;

      // Parse response
      let data: any;
      const contentType = response.headers.get('content-type');
      
      if (contentType?.includes('application/json')) {
        data = await response.json();
      } else {
        data = await response.text();
      }

      return {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        data,
        duration,
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;

      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${params.timeout}ms`);
      }

      throw new Error(`Request failed: ${error.message}`);
    }
  }

  /**
   * Make a GET request
   */
  private async get(url: string, headers?: Record<string, string>, params?: Record<string, string>): Promise<APIResponse> {
    // Add query parameters to URL
    if (params) {
      const searchParams = new URLSearchParams(params);
      url = `${url}?${searchParams.toString()}`;
    }

    return await this.makeRequest({
      url,
      method: 'GET',
      headers,
    });
  }

  /**
   * Make a POST request
   */
  private async post(url: string, data: any, headers?: Record<string, string>): Promise<APIResponse> {
    return await this.makeRequest({
      url,
      method: 'POST',
      headers,
      body: data,
    });
  }

  /**
   * Fetch and parse JSON
   */
  private async fetchJSON(url: string, headers?: Record<string, string>): Promise<any> {
    const response = await this.get(url, headers);

    if (response.status >= 400) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.data;
  }
}

// Export singleton
export const apiMCPServer = new APIMCPServer();
