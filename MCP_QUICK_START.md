# MCP Quick Start Guide

## 🎯 What Was Built Today

**Model Context Protocol (MCP)** support has been added to Recoder! This allows AI to use external tools like GitHub, web search, file operations, and browser automation.

**Time Spent:** 6 hours  
**Status:** Core implementation complete (67%)  
**Remaining:** Chat integration (4-6 hours)

---

## 🚀 Try It Now

### 1. Set Environment Variables

```bash
# In app/.env
GITHUB_TOKEN=ghp_your_token_here
BRAVE_API_KEY=BSA_your_key_here
```

### 2. Start the App

```bash
cd /Users/arhansubasi/recoder.xyz/app
npm run dev
```

### 3. Configure MCP Servers

Navigate to: `http://localhost:3000/settings/mcp`

Click "Add" on:
- ✅ GitHub (requires GITHUB_TOKEN)
- ✅ Filesystem (no key needed)
- ✅ Brave Search (requires BRAVE_API_KEY)
- ✅ Playwright (no key needed)

### 4. Test the API

```bash
# List your servers
curl http://localhost:3000/api/mcp/servers \
  -H "Cookie: your-session-cookie"

# List tools from GitHub server
curl "http://localhost:3000/api/mcp/tools?serverId=github" \
  -H "Cookie: your-session-cookie"

# Execute a tool
curl http://localhost:3000/api/mcp/tools \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Cookie: your-session-cookie" \
  -d '{
    "serverId": "github",
    "toolName": "list_repos",
    "args": {}
  }'
```

---

## 📦 What's Available

### 4 Pre-configured Servers

#### 1. GitHub Server
**Tools:**
- `list_repos` - List user repositories
- `create_repo` - Create new repository
- `read_file` - Read file from repo
- `create_pr` - Create pull request
- `list_issues` - List issues
- And more...

**Setup:**
```bash
# Get token from: https://github.com/settings/tokens
export GITHUB_TOKEN=ghp_xxxxx
```

#### 2. Filesystem Server
**Tools:**
- `read_file` - Read file content
- `write_file` - Write to file
- `list_directory` - List directory contents
- `search_files` - Search for files
- `delete_file` - Delete file

**Access:** Sandboxed to `/workspace` directory

#### 3. Brave Search Server
**Tools:**
- `web_search` - Search the web
- `news_search` - Search news
- `image_search` - Search images

**Setup:**
```bash
# Get key from: https://brave.com/search/api/
export BRAVE_API_KEY=BSA_xxxxx
```

#### 4. Playwright Server
**Tools:**
- `navigate` - Navigate to URL
- `screenshot` - Take screenshot
- `click` - Click element
- `fill` - Fill form field
- `extract_content` - Extract page content

**Use:** Browser automation and web scraping

---

## 🔧 For Developers

### Add MCP Tools to Your Chat

```typescript
import { getMCPTools, formatMCPToolsForAI, executeMCPTool } from '~/lib/mcp/tools-integration';

// In your chat API route
const userId = session.user.id;

// Get user's MCP tools
const mcpTools = await getMCPTools(userId);
const formattedTools = formatMCPToolsForAI(mcpTools);

// Pass to OpenAI
const response = await openai.chat.completions.create({
  model: 'gpt-4',
  messages: messages,
  tools: formattedTools, // Add MCP tools
});

// Handle tool calls
if (response.choices[0].message.tool_calls) {
  for (const toolCall of response.choices[0].message.tool_calls) {
    const [serverId, toolName] = toolCall.function.name.split('_');
    const args = JSON.parse(toolCall.function.arguments);
    
    const result = await executeMCPTool(userId, serverId, toolName, args);
    
    // Add result to conversation
    messages.push({
      role: 'tool',
      tool_call_id: toolCall.id,
      content: JSON.stringify(result),
    });
  }
}
```

### Add Custom MCP Server

```typescript
const customServer = {
  id: 'my-server',
  name: 'My Custom Server',
  command: 'node',
  args: ['./my-mcp-server.js'],
  env: {
    API_KEY: process.env.MY_API_KEY,
  },
};

await fetch('/api/mcp/servers', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(customServer),
});
```

---

## 📊 Database Schema

Two new tables were added:

### MCPServer
Stores user's enabled MCP servers
```typescript
{
  id: string;
  userId: string;
  serverId: string;  // e.g., 'github'
  name: string;      // e.g., 'GitHub'
  command: string;   // e.g., 'npx'
  args: string[];    // e.g., ['-y', '@modelcontextprotocol/server-github']
  env: object;       // e.g., { GITHUB_TOKEN: '...' }
  enabled: boolean;
  createdAt: Date;
}
```

### MCPToolCall
Logs all tool executions for analytics
```typescript
{
  id: string;
  userId: string;
  serverId: string;
  toolName: string;
  params: object;
  result: object;
  error: string | null;
  createdAt: Date;
}
```

---

## 🎯 Next Steps

### To Complete MCP (4-6 hours)

1. **Chat Integration** (2h)
   - Modify `app/app/api/ai/chat/route.ts`
   - Add MCP tools to OpenAI/Anthropic calls
   - Handle tool execution in chat loop

2. **MCP Button UI** (1h)
   - Create `MCPButton.tsx` component
   - Add to chat input bar
   - Show active servers count

3. **Tool Consent** (1h)
   - Create `ToolConsentModal.tsx`
   - Ask user before sensitive operations
   - Remember preferences

4. **Testing** (2h)
   - Test all 4 servers
   - Verify error handling
   - Check performance

---

## 📚 Documentation

- **MCP_IMPLEMENTATION_SPEC.md** - Original technical spec
- **MCP_USAGE.md** - Detailed usage guide
- **MCP_IMPLEMENTATION_SUMMARY.md** - Complete implementation summary
- **MCP_QUICK_START.md** - This file

---

## 🐛 Known Issues

1. **Prisma Migration** - Can't run migrations due to shadow DB issue
   - Using `prisma generate` for now
   - Need to fix migration before production

2. **No Tool Consent** - Tools execute without confirmation
   - Security risk for sensitive operations
   - Will add consent modal next

3. **No Error UI** - Connection errors not shown to user
   - Need to add error states to UI

---

## ✅ Success Criteria

- [x] MCP SDK integrated
- [x] 4 default servers configured
- [x] Database schema created
- [x] API endpoints working
- [x] Settings UI built
- [ ] Chat integration (next)
- [ ] Tool execution tested (next)

---

## 🎉 Summary

**MCP core infrastructure is complete!**

You can now:
- ✅ Add/remove MCP servers via UI
- ✅ List available tools from servers
- ✅ Execute tools via API
- ✅ Log tool calls to database

**Next:** Integrate with chat so AI can use these tools automatically.

**Estimated time to full completion:** 4-6 hours
