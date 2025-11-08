# 🚀 Setup Guide - Eternos MCP Server

## Quick Start

Eternos is ready to connect to any MCP-compatible AI assistant including Claude Desktop, Cursor, and other clients.

## Prerequisites

- **Node.js** >= 18.0.0
- **npm** >= 9.0.0
- Git (optional, for cloning)

## Installation

### Option 1: From Source (Recommended for Development)

```bash
# Clone the repository
cd /path/to/recoder-code/packages/mcp-eternos

# Install dependencies
npm install

# Build the project
npm run build

# Verify build
ls -lh dist/index.js
```

### Option 2: From npm (When Published)

```bash
npm install -g @recoder-code/mcp-eternos
```

## Configuration

### 1. Claude Desktop

**Location:** `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)  
**Location:** `%APPDATA%\Claude\claude_desktop_config.json` (Windows)  
**Location:** `~/.config/Claude/claude_desktop_config.json` (Linux)

**Configuration:**

```json
{
  "mcpServers": {
    "eternos": {
      "command": "node",
      "args": [
        "/absolute/path/to/recoder-code/packages/mcp-eternos/dist/index.js"
      ]
    }
  }
}
```

**Steps:**

1. Find your Claude Desktop config file location (see above)
2. Create or edit the `claude_desktop_config.json` file
3. Replace `/absolute/path/to/` with your actual path
4. Save the file
5. Restart Claude Desktop
6. Look for the 🔨 tool icon in Claude Desktop - you should see 72 Eternos tools!

**Example macOS Path:**
```json
{
  "mcpServers": {
    "eternos": {
      "command": "node",
      "args": [
        "/Users/yourname/code/recoder-code/packages/mcp-eternos/dist/index.js"
      ]
    }
  }
}
```

### 2. Cursor IDE

**Location:** Cursor Settings → MCP Servers  
Or manually edit: `~/.cursor/mcp_config.json`

**Configuration:**

```json
{
  "mcpServers": {
    "eternos": {
      "command": "node",
      "args": [
        "/absolute/path/to/recoder-code/packages/mcp-eternos/dist/index.js"
      ]
    }
  }
}
```

**Steps:**

1. Open Cursor IDE
2. Go to Settings (⚙️)
3. Search for "MCP" or "Model Context Protocol"
4. Add the configuration above
5. Restart Cursor
6. The tools will be available in Cursor's AI assistant

### 3. Other MCP Clients

Any MCP-compatible client can use Eternos. The standard configuration is:

```json
{
  "command": "node",
  "args": ["/path/to/mcp-eternos/dist/index.js"],
  "transport": "stdio"
}
```

### 4. Using Global Install (After Publishing)

If installed globally via npm:

```json
{
  "mcpServers": {
    "eternos": {
      "command": "mcp-eternos"
    }
  }
}
```

Or:

```json
{
  "mcpServers": {
    "eternos": {
      "command": "npx",
      "args": ["@recoder-code/mcp-eternos"]
    }
  }
}
```

## Verification

### Test the Server Directly

```bash
# Navigate to the package
cd /path/to/recoder-code/packages/mcp-eternos

# Run the server directly
npm start
```

You should see:
```
╔════════════════════════════════════════════════════════════╗
║   🚀 Eternos MCP Server v2.2 - Advanced Developer Tools   ║
║   📦 68 Powerful Tools for AI Assistants                  ║
║   🌟 By Recoder - https://recoder.xyz                     ║
╚════════════════════════════════════════════════════════════╝
📡 Connected via stdio transport
✨ Ready to assist!
```

Press `Ctrl+C` to stop.

### Test with MCP Inspector

Use the official MCP Inspector tool:

```bash
npx @modelcontextprotocol/inspector node /path/to/mcp-eternos/dist/index.js
```

This opens a web interface where you can test all 68 tools interactively.

### Verify in Claude Desktop

1. Open Claude Desktop
2. Look for the 🔨 (hammer) icon in the input area
3. Click it to see available tools
4. You should see all 72 Eternos tools listed
5. Try a simple tool like `get_system_info`:

```
Can you use the get_system_info tool to show me my system information?
```

### Verify in Cursor

1. Open Cursor IDE
2. Start a conversation with the AI
3. Ask it to use an Eternos tool:

```
Use the search_npm tool to find React packages
```

The AI should have access to all tools automatically.

## Troubleshooting

### Issue: "Command not found" or "Cannot find module"

**Solution:**
1. Verify the path in your config is absolute and correct
2. Make sure you ran `npm run build`
3. Check that `dist/index.js` exists
4. Verify Node.js version is >= 18.0.0: `node --version`

### Issue: "Permission denied"

**Solution:**
```bash
chmod +x /path/to/mcp-eternos/dist/index.js
```

### Issue: "Tools not showing in Claude Desktop"

**Solution:**
1. Verify config file location is correct
2. Check JSON syntax is valid (use a JSON validator)
3. Make sure you saved the file
4. Completely quit and restart Claude Desktop (not just close the window)
5. Check Claude Desktop logs:
   - macOS: `~/Library/Logs/Claude/mcp*.log`
   - Windows: `%APPDATA%\Claude\logs\mcp*.log`

### Issue: "Module version mismatch" or native module errors

**Solution:**
```bash
cd /path/to/mcp-eternos
rm -rf node_modules package-lock.json
npm install
npm run build
```

### Issue: "Connection timeout"

**Solution:**
- Check that no other process is using the same MCP server
- Restart the AI client
- Try running the server directly to check for errors: `npm start`

## Environment Variables (Optional)

Eternos works without any environment variables, but you can optionally configure:

```json
{
  "mcpServers": {
    "eternos": {
      "command": "node",
      "args": ["/path/to/mcp-eternos/dist/index.js"],
      "env": {
        "NODE_ENV": "production",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

## Development Mode

For development with auto-rebuild:

```bash
# Terminal 1: Watch mode
npm run dev

# Terminal 2: Run the server
npm start
```

## Testing Tools

### Test Web Search
```bash
# In Claude Desktop or Cursor:
"Use search_web to find information about TypeScript"
```

### Test Package Search
```bash
"Use search_npm to find web frameworks"
"Use search_pypi to find Python data science packages"
"Use search_crates_io to find Rust async runtime crates"
```

### Test Web Crawling
```bash
"Use crawl_webpage to crawl https://docs.python.org with maxDepth 2"
```

### Test AI Models
```bash
"Use search_openrouter to find chat models"
"Use search_huggingface to find BERT models"
```

### Test File Operations
```bash
"Use search_files to find all TypeScript files in the current directory"
"Use read_file_content to read package.json"
```

## Production Deployment

### For Personal Use
Follow the setup instructions above. The server runs locally and doesn't need external deployment.

### For Team Use
1. Deploy the built package to a shared location
2. Update all team members' configs with the shared path
3. Or publish to private npm registry

### For Public Use
```bash
# Publish to npm (requires npm account)
npm login
npm publish
```

## Security Considerations

### Safe by Default
- No external API keys required
- No data collection or tracking
- Runs entirely locally
- All network requests are explicit and controllable

### Command Execution
The `execute_command` tool can run shell commands. Be careful when:
- Connecting to untrusted MCP clients
- Running in production environments
- Accepting input from untrusted sources

Consider disabling dangerous tools in production:
```typescript
// Edit src/index.ts to remove execute_command from tools array
```

## Performance Tips

### Memory Usage
- Normal: ~50-100MB
- With image processing: ~100-200MB
- With large file operations: up to 500MB

### Network
- All network operations have timeouts (10-60 seconds)
- Configurable rate limiting
- No persistent connections

### File System
- Use `ignore` patterns to exclude large directories
- Set `maxDepth` and `maxPages` limits for crawling
- Use `limit` parameter to control result sizes

## Updates

To update to the latest version:

```bash
cd /path/to/recoder-code/packages/mcp-eternos
git pull  # if using git
npm install  # update dependencies
npm run build  # rebuild
# Restart your AI client
```

## Support

### Documentation
- `README.md` - Main documentation
- `NEW_FEATURES.md` - v2.2 features
- `QUICK_REFERENCE.md` - Quick tool reference
- `TOOLS_OVERVIEW.md` - Complete tool catalog
- `SETUP_GUIDE.md` - This file

### Getting Help
- Check logs in Claude Desktop/Cursor
- Run `npm start` directly to see errors
- Verify build with `npm run build`
- Test tools with MCP Inspector

### Reporting Issues
- Repository: https://github.com/caelum0x/recoder-code
- Issues: https://github.com/caelum0x/recoder-code/issues

## Success Indicators

✅ Server starts without errors  
✅ Shows "Ready to assist!" message  
✅ Tools appear in AI client  
✅ Can execute simple tools like `get_system_info`  
✅ No error logs in AI client  
✅ Can execute web search and file operations  
✅ All 68 tools are available  

## Next Steps

Once connected:
1. Review `QUICK_REFERENCE.md` for tool syntax
2. Try some example queries (see above)
3. Explore the 72 available tools
4. Check `NEW_FEATURES.md` for v2.2 capabilities
5. Build your workflows!

---

**🎉 Eternos v2.2 - Ready to empower your AI assistant with 72 powerful tools!**
