# Recoder.xyz User Guide

## Getting Started

### 1. Create an Account
1. Go to [recoder.xyz](https://recoder.xyz)
2. Click "Sign Up"
3. Enter email and password, or use GitHub/Google OAuth

### 2. Set Up AI Providers
Navigate to **Settings > AI Providers** to add your API keys:
- **Anthropic** (Claude) - Recommended for complex tasks
- **Groq** - Fast inference for rapid prototyping
- **Google** (Gemini) - Large context windows
- **OpenAI** - GPT models

### 3. Install the CLI
```bash
# Using curl (recommended)
curl -fsSL https://recoder.xyz/api/install | bash

# Or via npm
npm install -g recoder-code-cli

# Or via Homebrew
brew install https://recoder.xyz/api/brew/recoder-code.rb
```

### 4. Authenticate CLI
```bash
recoder auth login
```
Follow the browser prompt to authorize.

---

## Using the Web IDE

### Starting a Project

**From Scratch:**
1. Go to [recoder.xyz/ide](https://recoder.xyz/ide)
2. Describe what you want to build
3. AI generates the project structure

**From Template:**
1. Click "New Project"
2. Choose a starter template (Next.js, React, Express, etc.)
3. Customize as needed

**From GitHub:**
1. Click "Import from GitHub"
2. Enter repository URL
3. Project loads in the IDE

### Working with Files
- **File Tree** - Left sidebar shows project structure
- **Editor** - Center panel for editing code
- **Terminal** - Bottom panel for running commands
- **Preview** - Right panel shows live preview

### AI Chat
Use the chat panel to:
- Generate new features
- Fix bugs
- Refactor code
- Ask questions about your codebase

---

## Using the CLI

### Basic Commands

```bash
# Start interactive mode
recoder

# Initialize project config
recoder init

# Create a project plan
recoder plan create "E-commerce app"

# Use a template
recoder plan create "API" -t api

# List plans
recoder plan list

# Open web IDE
recoder web launch
```

### MCP Server Management

```bash
# List configured servers
recoder mcp list

# Auto-detect servers from other tools
recoder mcp detect

# Add detected servers
recoder mcp detect --add

# Add server manually
recoder mcp add filesystem --command "npx" --args "@anthropic/mcp-filesystem"
```

### Authentication

```bash
# Login
recoder auth login

# Check status
recoder auth status

# View quota
recoder auth quota

# Logout
recoder auth logout
```

---

## Project Planning

The planning system helps you architect projects before coding.

### Create a Plan
```bash
recoder plan create "My SaaS App" -t web-app
```

### Plan Templates
- `web-app` - Full-stack web application
- `api` - REST/GraphQL API
- `cli` - Command-line tool

### Generated Files
Plans create 3 files in `.recoder/plans/`:
- `{name}.json` - Structured data
- `{name}.md` - Human-readable documentation
- `{name}.ai.md` - AI-executable instructions

### Scaffold from Plan
```bash
recoder plan scaffold <plan-id>
```

---

## Settings

### Profile
- Update name, avatar
- Change password
- Enable 2FA

### AI Settings
- Default model selection
- Temperature preferences
- Token limits

### Integrations
- GitHub connection
- API key management

### Billing
- View current plan
- Upgrade/downgrade
- Payment methods
- Invoice history

---

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Save file | `Cmd/Ctrl + S` |
| Open file | `Cmd/Ctrl + P` |
| Toggle terminal | `Cmd/Ctrl + `` |
| New chat | `Cmd/Ctrl + N` |
| Search files | `Cmd/Ctrl + Shift + F` |

---

## Troubleshooting

### CLI won't authenticate
```bash
# Clear cached credentials
rm -rf ~/.recoder/auth
recoder auth login
```

### AI not responding
1. Check API key is valid in Settings
2. Verify quota hasn't been exceeded
3. Try a different model

### Preview not loading
1. Check terminal for errors
2. Ensure dev server is running
3. Try refreshing the preview panel

### Need Help?
- [Documentation](https://recoder.xyz/docs)
- [Discord Community](https://discord.gg/recoder)
- [GitHub Issues](https://github.com/recoder-team/recoder/issues)
