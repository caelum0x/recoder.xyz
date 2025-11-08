# 🔌 Connection Guide - Eternos MCP Server

## Quick Connection for AI Assistants

Eternos v2.2 is ready to connect to Claude Desktop, Cursor, and any MCP-compatible AI assistant.

---

## 📱 Claude Desktop (Recommended)

### Step 1: Locate Config File

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`  
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`  
**Linux:** `~/.config/Claude/claude_desktop_config.json`

### Step 2: Get Absolute Path

```bash
cd /path/to/recoder-code/packages/mcp-eternos
pwd
# Copy the output path
```

### Step 3: Edit Config File

Open (or create) `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "eternos": {
      "command": "node",
      "args": [
        "/PASTE_YOUR_ABSOLUTE_PATH_HERE/dist/index.js"
      ]
    }
  }
}
```

**Example (macOS):**
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

### Step 4: Restart Claude Desktop

1. **Completely quit** Claude Desktop (not just close the window)
2. Reopen Claude Desktop
3. Look for the 🔨 (hammer) icon in the input area
4. Click it to see your 68 Eternos tools!

### Step 5: Test It

In Claude Desktop, try:
```
Use the get_system_info tool to show me my system information
```

Or:
```
Search npm for "react" using the search_npm tool
```

---

## 💻 Cursor IDE

### Step 1: Open Cursor Settings

1. Open Cursor IDE
2. Press `Cmd+,` (Mac) or `Ctrl+,` (Windows/Linux)
3. Search for "MCP" or "Model Context Protocol"

### Step 2: Add MCP Server

Click "Edit in settings.json" or find `~/.cursor/mcp_config.json`

Add:
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

### Step 3: Restart Cursor

Close and reopen Cursor IDE completely.

### Step 4: Test It

Ask Cursor's AI:
```
Use the search_github tool to find React repositories
```

---

## 🧪 Verify Installation

### Check Server Works

```bash
cd /path/to/recoder-code/packages/mcp-eternos
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

### Use MCP Inspector (Optional)

```bash
npx @modelcontextprotocol/inspector node /path/to/mcp-eternos/dist/index.js
```

This opens a web interface to test all tools interactively.

---

## 🔍 Troubleshooting

### ❌ Tools Not Showing

**Check:**
1. Is the path in config absolute? (starts with `/` on Mac/Linux or `C:\` on Windows)
2. Did you save the config file?
3. Did you **completely quit** and restart the app? (not just close window)
4. Does `dist/index.js` exist? Run `npm run build` if not

**View Logs:**
- **macOS:** `~/Library/Logs/Claude/mcp*.log`
- **Windows:** `%APPDATA%\Claude\logs\`

### ❌ "Command not found"

**Fix:**
```bash
which node  # Should show path like /usr/local/bin/node
# Use the full path in config:
"command": "/usr/local/bin/node"
```

### ❌ "Permission denied"

**Fix:**
```bash
chmod +x /path/to/mcp-eternos/dist/index.js
```

### ❌ "Module not found"

**Fix:**
```bash
cd /path/to/mcp-eternos
rm -rf node_modules package-lock.json
npm install
npm run build
```

### ❌ Server starts but tools don't work

Check Node.js version:
```bash
node --version  # Should be >= 18.0.0
```

Upgrade if needed:
```bash
# macOS with Homebrew
brew upgrade node

# Or download from nodejs.org
```

---

## 📚 What's Available

Once connected, you have access to **68 powerful tools**:

### 🌐 Web & Search
- Web scraping, crawling, search (Google, Bing, DuckDuckGo)
- Link extraction and analysis

### 📦 Package Ecosystems
- npm (JavaScript/TypeScript)
- PyPI (Python)
- Crates.io (Rust)
- Maven (Java)
- Packagist (PHP)
- Go packages
- Docker Hub

### 🤖 AI/ML
- OpenRouter models
- Hugging Face models/datasets
- Model information and pricing

### 👨‍💻 Developer Content
- GitHub (repos, trending, awesome lists)
- Stack Overflow
- Dev.to articles
- Medium posts
- Reddit discussions
- API discovery

### 🛠️ Developer Tools
- File operations (search, read, write, watch)
- Git operations (all commands)
- Code analysis (complexity, LOC, functions)
- Data processing (JSON, CSV, YAML, XML)
- Security (hashing, encryption)
- Image processing
- Text search/replace
- System information

---

## 💡 Example Queries

Try these in your AI assistant:

### Research Packages
```
Search for web frameworks across different languages:
- Use search_npm to find JavaScript frameworks
- Use search_pypi to find Python frameworks
- Use search_crates_io to find Rust frameworks
```

### Find AI Models
```
Use search_openrouter to find chat models, 
then get details with get_model_info
```

### Web Research
```
Use crawl_webpage to crawl https://docs.python.org 
with maxDepth 2 and extractContent true
```

### Code Analysis
```
Use search_files to find all .ts files in the current directory,
then analyze_code on the main files
```

### Trending Tech
```
Use get_github_trending with language "python" 
to see what's trending today
```

---

## 🎯 Configuration Tips

### Multiple Servers

You can run multiple MCP servers:

```json
{
  "mcpServers": {
    "eternos": {
      "command": "node",
      "args": ["/path/to/eternos/dist/index.js"]
    },
    "other-server": {
      "command": "node",
      "args": ["/path/to/other-server/index.js"]
    }
  }
}
```

### Environment Variables (Optional)

```json
{
  "mcpServers": {
    "eternos": {
      "command": "node",
      "args": ["/path/to/eternos/dist/index.js"],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

### Windows Paths

Use forward slashes or escaped backslashes:

```json
"args": ["C:/Users/yourname/eternos/dist/index.js"]
// OR
"args": ["C:\\Users\\yourname\\eternos\\dist\\index.js"]
```

---

## 🚀 Next Steps

1. ✅ Connect to your AI assistant
2. 📖 Read `QUICK_REFERENCE.md` for tool syntax
3. 🎯 Try example queries above
4. 🔍 Explore all 68 tools
5. 🎉 Build amazing workflows!

---

## 📞 Need Help?

- **Setup Issues:** See `SETUP_GUIDE.md`
- **Tool Reference:** See `QUICK_REFERENCE.md`
- **Complete Documentation:** See `README.md`
- **New Features:** See `NEW_FEATURES.md`

---

**🎉 Ready to supercharge your AI assistant with 68 powerful tools!**

*No API keys required • Completely free • Open source MIT license*
