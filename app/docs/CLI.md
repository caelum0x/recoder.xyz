# Recoder CLI Documentation

## Installation

```bash
# curl (recommended)
curl -fsSL https://recoder.xyz/api/install | bash

# npm
npm install -g recoder-code-cli

# Homebrew
brew install https://recoder.xyz/api/brew/recoder-code.rb

# pnpm
pnpm add -g recoder-code-cli

# yarn
yarn global add recoder-code-cli
```

## Commands

### Interactive Mode
```bash
recoder
```
Start interactive AI chat session.

---

### recoder init
Initialize `.recoder` folder in current directory.

```bash
recoder init           # Project-level config
recoder init --global  # Global ~/.recoder config
recoder init --force   # Overwrite existing
```

**Creates:**
```
.recoder/
├── config.json    # Configuration
├── plans/         # Project plans
├── context/       # Context files
├── cache/         # Temporary cache
└── .gitignore
```

---

### recoder plan
Project planning commands.

#### create
```bash
recoder plan create "My Project"
recoder plan create "API Server" -t api
recoder plan create "Web App" -t web-app
recoder plan create "CLI Tool" -t cli
```

**Templates:**
- `web-app` - Full-stack web application
- `api` - REST/GraphQL API
- `cli` - Command-line tool

#### list
```bash
recoder plan list
```

#### show
```bash
recoder plan show <plan-id>
```

#### delete
```bash
recoder plan delete <plan-id>
```

#### scaffold
```bash
recoder plan scaffold <plan-id>
```
Generate folder structure from plan.

---

### recoder mcp
MCP server management.

#### list
```bash
recoder mcp list
```
Show configured MCP servers.

#### detect
```bash
recoder mcp detect        # Show detected servers
recoder mcp detect --add  # Add detected servers
```
Auto-detect from Claude Desktop, Cursor, VSCode configs.

#### add
```bash
recoder mcp add <name> --command <cmd> --args <args>
```

**Example:**
```bash
recoder mcp add filesystem --command npx --args "@anthropic/mcp-filesystem /home"
```

#### remove
```bash
recoder mcp remove <name>
```

---

### recoder web
Web IDE commands.

#### launch
```bash
recoder web launch
```
Open recoder.xyz in browser.

#### open
```bash
recoder web open <project-id>
recoder web open <id> --browser chrome
recoder web open <id> --copy  # Copy URL to clipboard
```

#### push
```bash
recoder web push
```
Push local project to web IDE.

#### download
```bash
recoder web download <project-id>
```

---

### recoder auth
Authentication commands.

#### login
```bash
recoder auth login
```
Authenticate via browser.

#### logout
```bash
recoder auth logout
```

#### status
```bash
recoder auth status
```
Show authentication status.

#### whoami
```bash
recoder auth whoami
```
Show current user.

#### quota
```bash
recoder auth quota
```
Show usage quota.

---

### recoder ai
AI commands.

#### chat
```bash
recoder ai chat
recoder ai chat --model claude-3-sonnet
```

#### generate
```bash
recoder ai generate "Create a REST API"
```

---

### recoder context
Context management.

#### init
```bash
recoder context init
```
Create context files.

#### edit
```bash
recoder context edit
```
Edit context in editor.

---

## Configuration

### Project Config (`.recoder/config.json`)
```json
{
  "version": "1.0.0",
  "project": {
    "name": "My Project",
    "type": "web-app"
  },
  "ai": {
    "defaultModel": "claude-3-sonnet",
    "temperature": 0.7
  },
  "mcp": {
    "servers": {}
  }
}
```

### Global Config (`~/.recoder/config.json`)
Same structure, applies to all projects.

---

## Environment Variables

```bash
RECODER_API_KEY=...      # API key
RECODER_MODEL=...        # Default model
RECODER_DEBUG=true       # Enable debug logging
```

---

## Examples

### Quick Start
```bash
# Install
curl -fsSL https://recoder.xyz/api/install | bash

# Login
recoder auth login

# Initialize project
cd my-project
recoder init

# Create plan
recoder plan create "E-commerce Platform" -t web-app

# Start coding
recoder
```

### MCP Setup
```bash
# Detect existing servers
recoder mcp detect --add

# Add custom server
recoder mcp add github --command npx --args "@anthropic/mcp-github"

# Verify
recoder mcp list
```
