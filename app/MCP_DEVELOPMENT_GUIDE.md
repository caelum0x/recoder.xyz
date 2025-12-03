# MCP Server Development Guide

Complete guide for developing custom MCP servers for recoder-web.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Server Structure](#server-structure)
3. [Adding to Registry](#adding-to-registry)
4. [Testing](#testing)
5. [Deployment](#deployment)
6. [Best Practices](#best-practices)

## Getting Started

### Prerequisites

- Node.js 18+
- TypeScript knowledge
- Understanding of MCP protocol
- Familiarity with recoder-web architecture

### Installation

```bash
npm install @modelcontextprotocol/sdk
```

## Server Structure

### Basic Server Template

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new Server(
  {
    name: 'my-custom-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define tools
server.setRequestHandler('tools/list', async () => ({
  tools: [
    {
      name: 'my_tool',
      description: 'Description of what this tool does',
      inputSchema: {
        type: 'object',
        properties: {
          param1: { type: 'string', description: 'First parameter' },
        },
        required: ['param1'],
      },
    },
  ],
}));

// Handle tool calls
server.setRequestHandler('tools/call', async (request) => {
  const { name, arguments: args } = request.params;
  
  if (name === 'my_tool') {
    // Implement tool logic
    return {
      content: [
        {
          type: 'text',
          text: `Result: ${args.param1}`,
        },
      ],
    };
  }
  
  throw new Error(`Unknown tool: ${name}`);
});

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);
```

## Adding to Registry

### 1. Create Server Definition

Add to `/app/lib/mcp/registry.ts`:

```typescript
{
  id: 'my-custom-server',
  name: 'My Custom Server',
  description: 'What this server does',
  category: 'custom',
  command: 'npx',
  args: ['-y', '@myorg/mcp-server-custom'],
  requiresAuth: false, // Set to true if needs credentials
  envVars: [
    {
      key: 'API_KEY',
      description: 'API key for authentication',
      required: true,
    },
  ],
}
```

### 2. Categories

- `reference` - Official MCP reference implementations
- `official` - Official integrations from companies
- `community` - Community-maintained servers
- `custom` - Recoder-specific servers

## Testing

### Unit Tests

```typescript
import { describe, it, expect } from 'vitest';
import { MCPClient } from '@/lib/mcp/client';

describe('My Custom Server', () => {
  it('should list tools', async () => {
    const client = new MCPClient();
    await client.connect({
      id: 'my-custom-server',
      name: 'My Custom Server',
      command: 'node',
      args: ['./dist/server.js'],
    });
    
    const tools = await client.listTools('my-custom-server');
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('my_tool');
  });
  
  it('should call tool successfully', async () => {
    const client = new MCPClient();
    await client.connect(/* ... */);
    
    const result = await client.callTool('my-custom-server', 'my_tool', {
      param1: 'test',
    });
    
    expect(result.isError).toBe(false);
    expect(result.result).toBeDefined();
  });
});
```

### Integration Tests

```bash
# Test with recoder-web
npx tsx scripts/test-mcp-server.ts my-custom-server
```

## Deployment

### NPM Package

1. Create `package.json`:

```json
{
  "name": "@myorg/mcp-server-custom",
  "version": "1.0.0",
  "type": "module",
  "bin": {
    "mcp-server-custom": "./dist/index.js"
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc",
    "prepublishOnly": "npm run build"
  }
}
```

2. Build and publish:

```bash
npm run build
npm publish
```

### Local Development

```typescript
// In registry.ts for testing
{
  id: 'my-custom-server',
  command: 'node',
  args: ['/path/to/your/server/dist/index.js'],
}
```

## Best Practices

### 1. Error Handling

```typescript
server.setRequestHandler('tools/call', async (request) => {
  try {
    // Tool logic
    return { content: [/* ... */] };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});
```

### 2. Input Validation

```typescript
function validateInput(args: any, schema: any): boolean {
  // Use Zod or similar for validation
  const result = schema.safeParse(args);
  if (!result.success) {
    throw new Error(`Invalid input: ${result.error.message}`);
  }
  return true;
}
```

### 3. Logging

```typescript
import { createLogger } from '@/lib/logger';

const logger = createLogger('my-custom-server');

server.setRequestHandler('tools/call', async (request) => {
  logger.info('Tool called', { tool: request.params.name });
  // ...
});
```

### 4. Rate Limiting

```typescript
import { RateLimiter } from 'limiter';

const limiter = new RateLimiter({
  tokensPerInterval: 10,
  interval: 'minute',
});

server.setRequestHandler('tools/call', async (request) => {
  await limiter.removeTokens(1);
  // Tool logic
});
```

### 5. Caching

```typescript
import { LRUCache } from 'lru-cache';

const cache = new LRUCache({ max: 100, ttl: 1000 * 60 * 5 });

server.setRequestHandler('tools/call', async (request) => {
  const cacheKey = JSON.stringify(request.params);
  
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }
  
  const result = await performExpensiveOperation();
  cache.set(cacheKey, result);
  return result;
});
```

## Advanced Features

### Prompts

```typescript
server.setRequestHandler('prompts/list', async () => ({
  prompts: [
    {
      name: 'analyze_code',
      description: 'Analyze code for issues',
      arguments: [
        {
          name: 'code',
          description: 'Code to analyze',
          required: true,
        },
      ],
    },
  ],
}));

server.setRequestHandler('prompts/get', async (request) => {
  const { name, arguments: args } = request.params;
  
  if (name === 'analyze_code') {
    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Analyze this code:\n\n${args.code}`,
          },
        },
      ],
    };
  }
});
```

### Resources

```typescript
server.setRequestHandler('resources/list', async () => ({
  resources: [
    {
      uri: 'file:///workspace/data.json',
      name: 'Project Data',
      mimeType: 'application/json',
    },
  ],
}));

server.setRequestHandler('resources/read', async (request) => {
  const { uri } = request.params;
  const content = await readResource(uri);
  
  return {
    contents: [
      {
        uri,
        mimeType: 'application/json',
        text: content,
      },
    ],
  };
});
```

## Examples

### Example 1: Database Query Server

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const server = new Server({ name: 'database-server', version: '1.0.0' }, {
  capabilities: { tools: {} },
});

server.setRequestHandler('tools/list', async () => ({
  tools: [
    {
      name: 'query_database',
      description: 'Execute SQL query',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
        },
        required: ['query'],
      },
    },
  ],
}));

server.setRequestHandler('tools/call', async (request) => {
  const { query } = request.params.arguments;
  const result = await pool.query(query);
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result.rows, null, 2),
      },
    ],
  };
});
```

### Example 2: API Integration Server

```typescript
import axios from 'axios';

server.setRequestHandler('tools/list', async () => ({
  tools: [
    {
      name: 'fetch_weather',
      description: 'Get weather data',
      inputSchema: {
        type: 'object',
        properties: {
          city: { type: 'string' },
        },
        required: ['city'],
      },
    },
  ],
}));

server.setRequestHandler('tools/call', async (request) => {
  const { city } = request.params.arguments;
  const response = await axios.get(
    `https://api.weather.com/v1/weather?city=${city}`,
    { headers: { 'API-Key': process.env.WEATHER_API_KEY } }
  );
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(response.data, null, 2),
      },
    ],
  };
});
```

## Troubleshooting

### Server Not Connecting

1. Check command and args in registry
2. Verify server is executable
3. Check environment variables
4. Review server logs

### Tools Not Appearing

1. Verify `tools/list` handler is implemented
2. Check tool schema format
3. Ensure server is connected

### Tool Calls Failing

1. Validate input parameters
2. Check error messages in response
3. Review server logs
4. Test tool independently

## Resources

- [MCP Documentation](https://modelcontextprotocol.io)
- [MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Example Servers](https://github.com/modelcontextprotocol/servers)
- [Recoder MCP Integration](/app/lib/mcp)

## Support

For help with MCP server development:
- GitHub Issues: [recoder-team/recoder](https://github.com/recoder-team/recoder)
- Discord: [Recoder Community](https://discord.gg/recoder)
- Email: support@recoder.xyz
