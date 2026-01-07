# 🚀 Recoder-Code

> **Complete AI-powered development platform** - Chat with 40+ AI models, build projects, manage files, and automate workflows - all from your terminal

[![npm version](https://img.shields.io/npm/v/recoder-code.svg)](https://www.npmjs.com/package/recoder-code)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)

## ✨ Features

- 🤖 **40+ AI Models** - GPT-4, Claude, Gemini, DeepSeek, Qwen, and more via OpenRouter
- 🛠️ **Tool Calling & Agentic Workflows** - Advanced function calling with specialized AI agents
- 🎯 **Specialized Agents** - Create custom AI agents for specific tasks (e.g., `@backend-expert`, `@code-reviewer`)
- 💰 **Cost Optimization** - Save 50-90% with automatic prompt caching & context compression
- 🔌 **17 Pre-configured MCP Servers** - Git, GitHub, Playwright, Filesystem work out of the box
- 📁 **Smart File Operations** - Create, edit, search files with AI assistance
- 🎨 **Image Generation** - DALL-E, Gemini, and more image models integrated
- 🎙️ **Audio & PDF Support** - Text-to-speech and PDF analysis
- 🌐 **Web Integration** - Fetch and analyze web content directly
- ⚡ **Free Models Available** - Multiple high-quality models with $0 cost
- 🔄 **Interactive Chat UI** - Beautiful terminal interface with autocomplete
- 🔒 **Sandbox Mode** - Optional Docker/macOS isolation for safe execution
- 📊 **Usage Analytics** - Track costs, tokens, and model performance
- 🌐 **Multi-Platform** - Windows, macOS, and Linux support

## 🚀 Quick Start

### Installation

```bash
npm install -g recoder-code
```

### Quick Setup (First-Time Users)

On first run, Recoder Code will automatically start an interactive setup wizard:

```bash
recoder-code
```

The wizard will guide you through:
- **API Key Setup**: Get a free key from [OpenRouter](https://openrouter.ai/keys) (30 seconds)
- **Model Selection**: Choose from 30+ free and premium AI models
- **Optional Settings**: Enable sandbox mode, IDE integration, etc.

That's it! You're ready to start coding with AI.

**Re-run setup anytime:**
```bash
recoder-code
> /setup
```

Or from command line:
```bash
recoder-code --setup
```

### Usage

**Interactive Mode** (recommended):
```bash
recoder-code
```

**One-shot Commands**:
```bash
# Simple query
recoder-code "create a hello world in python"

# Build a project
recoder-code "build a REST API with Express.js"

# Use specific model
recoder-code --model anthropic/claude-3.5-sonnet "analyze this codebase"
```

## 📚 Examples

### Create a Web App
```bash
recoder-code "create a todo app with React and Tailwind CSS"
```

### Build with Custom Agents
```bash
# Create a specialized agent
recoder-code
> /agents create backend-expert

# Use it in conversation
> @backend-expert design a REST API for user authentication
```

### Generate Images
```bash
recoder-code
> /image a beautiful sunset over mountains --model dall-e-3 --quality hd
```

### Analyze Code
```bash
recoder-code "review my authentication system and suggest improvements"
```

### Debug Issues
```bash
recoder-code "why is my async function not working in app.js?"
```

### Work with PDFs
```bash
recoder-code
> /pdf https://example.com/research-paper.pdf
> Summarize the key findings
```

## 🎯 Key Commands

```bash
recoder-code                    # Start interactive chat
recoder-code --setup            # First-time configuration
recoder-code --help             # Show all options
recoder-code --list-models      # List available AI models
recoder-code --stats            # View usage statistics

# 🆕 OpenRouter Model Explorer
recoder-code --openrouter-explore                    # Explore all models with details
recoder-code --openrouter-tools                      # Find tool-capable models
recoder-code --openrouter-endpoints "model/name"     # View provider endpoints
recoder-code --openrouter-feature tools              # Filter by feature
```

## 🔌 MCP Server Integration

Recoder Code includes **17 pre-configured MCP servers** that enhance AI capabilities:

### Essential Servers (Work Out of the Box)
- **Git MCP** - Accurate git operations, eliminates hallucination
- **GitHub MCP** - Manage repos, issues, PRs without leaving your environment
- **Filesystem MCP** - Safe file operations with permission control
- **Fetch MCP** - HTTP requests and web content access
- **DuckDuckGo MCP** - Free web search, no API key required
- **GitMCP Docs** - Access documentation from any GitHub repository

### Additional Capabilities
- **Playwright & Puppeteer** - Browser automation and testing
- **PostgreSQL & SQLite** - Database operations
- **Brave Search** - Privacy-focused web search (API key needed)
- **Google Drive & Slack** - External integrations
- **Memory Bank & Knowledge Graph** - Context retention
- **Sequential Thinking** - Structured problem-solving

### View MCP Servers
```bash
# In interactive mode
recoder-code
> /mcp list              # Show all configured servers
> /mcp desc              # Show server descriptions  
> /mcp add <name> <cmd>  # Add custom MCP server
> /tools                 # View available tools
```

**Learn more**: See [MCP Server Documentation](docs/mcp-server.md) for detailed setup and configuration.

**Quick Reference**: See [DEFAULT_MCP_SERVERS.md](DEFAULT_MCP_SERVERS.md) for complete server list and examples.



### Interactive Mode Commands

Once in interactive mode (`recoder-code`), use these slash commands:

#### 🎯 Core Commands
- `/help` - Show all available commands
- `/quit` or `/exit` - Exit the application (or Ctrl+C)
- `/clear` - Clear conversation history
- `/copy` - Copy last AI response to clipboard

#### 🤖 Model Management
- `/model` - Switch AI models interactively
- `/model <name>` - Switch to specific model
- `/browse-models` - Browse and compare all available models
- `/compare-models` - Compare two models side by side
- `/recent-models` - View recently used models
- `/model-recommend` - Get AI model recommendations for your task

#### 🔧 Settings & Configuration
- `/setup` - Run setup wizard (API keys, preferences)
- `/setup-api` - Configure API keys only
- `/settings` - View/edit all settings
- `/approval-mode` - Change approval mode (plan/default/auto-edit/yolo)
- `/theme` - Change color theme
- `/vim` - Toggle Vim keybindings

#### 📁 File Operations
- `/files` - List tracked files in context
- `/tree` - Show directory tree
- `/find <pattern>` - Find files matching pattern
- `/search <query>` - Search in files
- `/editor <file>` - Open file in external editor
- `/ide` - Open project in IDE

#### 🧠 Memory & Context
- `/memory` - View conversation memory
- `/summary` - Get conversation summary
- `/compress` - Compress context to save tokens

#### 💬 Chat Management
- `/chat save <name>` - Save conversation checkpoint
- `/chat restore <name>` - Restore saved conversation
- `/chat list` - List saved conversations

#### 🤝 Collaboration (Premium)
- `/agents` - Manage subagents
- `/agents create <name>` - Create specialized AI agent
- `/agents manage` - View/edit/delete agents
- `@agent-name` - Use an agent in conversation (e.g., `@backend-expert help me`)

#### 🎨 Media Generation
- `/image <prompt>` - Generate images with DALL-E or other models
- `/image models` - List available image generation models
- `/audio <text>` - Text-to-speech conversion
- `/pdf <url>` - Extract and analyze PDF content
- `/web <url>` - Fetch and analyze web content

#### 🔌 MCP & Tools
- `/mcp` or `/mcp list` - List configured MCP servers
- `/mcp desc` - Show server descriptions
- `/mcp add <name> <cmd>` - Add custom MCP server
- `/tools` - View available tools

#### 💰 OpenRouter Features
- `/openrouter` - OpenRouter dashboard
- `/openrouter models` - Browse all OpenRouter models
- `/openrouter free` - List free models
- `/openrouter cache` - Check prompt caching status
- `/openrouter activity` - View usage activity
- `/openrouter credits` - Check credit balance
- `/openrouter estimate` - Estimate costs

#### 📊 Analytics
- `/stats` - View usage statistics
- `/about` - About Recoder Code
- `/docs` - Open documentation
- `/bug` - Report a bug

#### 🛠️ Advanced
- `/terminal-setup` - Configure terminal integration
- `/init` - Initialize project configuration
- `/extensions` - Manage extensions
- `/privacy` - Privacy settings
- `/byok` - Bring your own key settings

**💡 Tips:**
- Type `/` to see autocomplete suggestions
- Use `@agent-name` to invoke custom agents (not `/agent-name`)
- Press `Tab` to autocomplete commands and file paths
- Use `Ctrl+L` to clear screen without losing history

### 💰 Cost Optimization Commands

Save 50-90% on API costs with built-in optimizations:

```bash
# In interactive mode
recoder-code
> /openrouter cache      # Check caching status (90% savings on Claude)
> /openrouter transforms # View compression status
> /openrouter estimate anthropic/claude-3.5-sonnet 1000 500  # Estimate costs
> /openrouter activity   # Monitor usage
> /openrouter credits    # Check balance
> /openrouter free       # Find free models
```

**📚 Full Guide**: [Cost Optimization Quick Start](docs/COST_OPTIMIZATION_QUICK_START.md)

**Features**:
- ✅ Automatic prompt caching (90% discount on Claude)
- ✅ Smart context compression (no more errors)
- ✅ Cost estimation before sending
- ✅ Real-time usage tracking
- ✅ Free models for development

## 🔍 OpenRouter Model Explorer (New!)

Recoder Code now includes powerful tools to explore and compare OpenRouter models:

### Explore All Models

```bash
# See all available models with detailed information
recoder-code --openrouter-explore

# Filter by category (programming, chat, etc.)
recoder-code --openrouter-explore --openrouter-category programming

# Filter by features
recoder-code --openrouter-feature tools      # Models with tool calling
recoder-code --openrouter-feature vision     # Models with image understanding
recoder-code --openrouter-feature streaming  # Models with streaming support
```

### View Provider Endpoints

Check pricing, availability, and uptime for any model:

```bash
# See all providers offering Claude
recoder-code --openrouter-endpoints "anthropic/claude-3.5-sonnet"

# Compare DeepSeek providers
recoder-code --openrouter-endpoints "deepseek/deepseek-chat-v3.1"
```

**Endpoint information includes:**
- Provider names and online status
- Real-time uptime statistics
- Pricing per million tokens (input/output)
- Context length and token limits
- Quantization details
- Supported parameters

### Find Tool-Capable Models

List all models supporting tool/function calling for agentic workflows:

```bash
recoder-code --openrouter-tools
```

### Programmatic Access

```javascript
import { getOpenRouterClient } from 'recoder-code-core';

const client = getOpenRouterClient();

// List all models
const models = await client.listModels();

// Get tool-capable models
const toolModels = await client.getModelsWithFeature('tools');

// View model endpoints
const endpoints = await client.listModelEndpoints('anthropic/claude-3.5-sonnet');
```

**Learn more:** See [OPENROUTER_FEATURES.md](./OPENROUTER_FEATURES.md) for complete documentation and examples.

## 🔧 Configuration

### First-Time Setup

When you run `recoder-code` for the first time, you'll be automatically guided through an interactive setup wizard:

1. **API Key Configuration**: Get a free key from [OpenRouter](https://openrouter.ai/keys) (takes 30 seconds)
   - Choose from OpenRouter, OpenAI, or custom provider
   - Enter your API key (stored securely in `~/.recoder-code/.env`)
   - Select your default AI model

2. **Model Selection**: Choose from 30+ models including:
   - Free models (DeepSeek, Qwen, Mistral, etc.)
   - Premium models (GPT-4, Claude, Gemini)

3. **Optional Features**: Configure sandbox mode, IDE integration, and more

Your configuration is stored securely and never published with your code.

```bash
OPENROUTER_API_KEY=sk-or-v1-...
```

### Model Selection

Recoder Code supports 40+ AI models through OpenRouter. Switch models anytime:

```bash
# In interactive mode
> /model                              # Interactive model selector
> /browse-models                      # Browse all models with details
> /compare-models                     # Compare two models
> /model anthropic/claude-3.5-sonnet  # Switch directly

# Command line
recoder-code --model anthropic/claude-3.5-sonnet "your prompt"
recoder-code --list-models            # List all available models
```

**Popular Free Models with Tool Calling:**
- `deepseek/deepseek-chat-v3.1:free` - Fast, excellent for coding (128K context)
- `qwen/qwen3-coder-480b-a35b:free` - 480B MoE optimized for agentic coding (262K context)
- `qwen/qwen3-235b-a22b:free` - 235B MoE with thinking mode (131K context)
- `z-ai/glm-4.5-air:free` - Lightweight MoE for agents with tool use (131K context)
- `deepseek/deepseek-v3-0324:free` - 685B MoE for complex tasks (164K context)
- `google/gemini-2.0-flash-exp:free` - Fast multimodal with function calling (1M+ context)
- `alibaba/tongyi-deepresearch-30b-a3b:free` - Optimized for research & multi-step reasoning (131K context)

**Premium Models:**
- `anthropic/claude-3.5-sonnet` - Best for complex reasoning (200K context)
- `openai/gpt-4o` - Great all-rounder with vision (128K context)
- `openai/gpt-4-turbo` - Advanced reasoning and coding (128K context)

### Sandbox Mode (Optional Security Feature)

Recoder Code includes optional **sandbox isolation** for running AI-generated code safely:

```bash
# Enable Docker sandbox (recommended)
export RECODER_SANDBOX=docker
recoder-code

# Or use macOS Seatbelt (macOS only, lightweight)
export RECODER_SANDBOX=sandbox-exec
recoder-code

# Make it permanent (add to ~/.bashrc or ~/.zshrc)
echo 'export RECODER_SANDBOX=docker' >> ~/.bashrc
```

**Benefits:**
- 🔒 Isolates code execution from your system
- ✅ Prevents accidental system changes
- 🧪 Creates reproducible environments
- 🛡️ Adds security for untrusted code

When sandbox is enabled, you'll see `🔒 docker` or `🔒 macOS Seatbelt` in the footer instead of "💻 Interactive Mode".

**Setup Requirements:**
- Docker: Install [Docker Desktop](https://docs.docker.com/get-docker/) (all platforms)
- macOS Seatbelt: Built-in on macOS, no installation needed

See [SANDBOX_SETUP_GUIDE.md](./SANDBOX_SETUP_GUIDE.md) for detailed setup instructions.

### Advanced Options

```bash
# Use faster model
recoder-code --fast "quick question"

# Use cheapest model
recoder-code --cheap "simple task"

# Enable streaming
recoder-code --stream "long response"

# Debug mode
RECODER_DEBUG=true recoder-code "test query"
```

## 🌟 Why Recoder-Code?

- ✅ **No Configuration Hell** - Works immediately after 30-second setup
- ✅ **40+ AI Models** - Free and premium models, switch instantly
- ✅ **Specialized Agents** - Create custom AI experts for your workflow
- ✅ **Tool Calling & MCP** - Advanced agentic workflows with 17+ integrations
- ✅ **Rich Media Support** - Images, PDFs, audio, web content
- ✅ **Smart File Operations** - AI-powered file creation and editing
- ✅ **Cost Optimized** - Save 50-90% with automatic caching & compression
- ✅ **Beautiful Terminal UI** - Intuitive interface with 40+ commands
- ✅ **Sandbox Mode** - Optional secure code execution
- ✅ **Production Ready** - Used in real development workflows daily

## 📖 Documentation

- **[Quick Start Guide](./docs/QUICK_START.md)** - Get started in 5 minutes
- **[Interactive Commands](./docs/INTERACTIVE_GUIDE.md)** - Complete command reference
- **[Agent Creation Guide](./AGENT_CREATION_FIX.md)** - Create specialized AI agents
- **[Image Generation](./IMAGE_GENERATION_QUICK_REFERENCE.md)** - Generate images with AI
- **[Cost Optimization](./docs/COST_OPTIMIZATION_QUICK_START.md)** - Save 50-90% on costs
- **[MCP Servers](./DEFAULT_MCP_SERVERS.md)** - Configure integrations
- **[OpenRouter Features](./OPENROUTER_FEATURES.md)** - Explore all models
- **[Sandbox Setup](./SANDBOX_SETUP_GUIDE.md)** - Secure code execution
- **[Model Selection](./MODEL_SELECTION.md)** - Choose the right model
- **[Production Guide](./PRODUCTION_GUIDE.md)** - Deploy in production
- **[Contributing](./CONTRIBUTING.md)** - Help improve Recoder Code

## 🐛 Troubleshooting

### "Command not found"
```bash
npm install -g recoder-code
```

### "API Key Required"
```bash
recoder-code --setup
```

### "Module not found"
```bash
npm install -g recoder-code --force
```

## 💡 Pro Tips

1. **Use Free Models First** - DeepSeek, Qwen, and Gemini are free and powerful
2. **Create Specialized Agents** - Use `/agents create` to make expert assistants
3. **Image Generation** - Try `/image your prompt` with DALL-E or Gemini
4. **Browse Models** - Use `/browse-models` to discover new models
5. **Cost Tracking** - Check `/openrouter activity` to monitor spending
6. **Save Conversations** - Use `/chat save <name>` to checkpoint progress
7. **File Operations** - Use `/files`, `/tree`, `/find` for project navigation
8. **Keyboard Shortcuts** - `Ctrl+L` clear screen, `Tab` autocomplete, `Ctrl+C` cancel
9. **Debug Mode** - Set `RECODER_DEBUG=true` for detailed logs
10. **Use @mentions** - Invoke agents with `@agent-name` (not `/agent-name`)

## 🤝 Contributing

We welcome contributions! See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

```bash
# Clone the repo
git clone https://github.com/recoderxyz/recoder-code.git

# Install dependencies
npm install

# Run locally
node cli/run.js "test query"
```

## 📜 License

Apache-2.0 © [Recoder Code Team](https://github.com/recoderxyz)

## 🔗 Links

- [NPM Package](https://www.npmjs.com/package/recoder-code)
- [GitHub Repository](https://github.com/recoderxyz/recoder-code)
- [OpenRouter (Get API Key)](https://openrouter.ai)
- [Report Issues](https://github.com/recoderxyz/recoder-code/issues)
- 📧 Contact: recoderxyz@gmail.com

## ⭐ Star Us!

If you find Recoder-Code useful, please star the repo on GitHub! It helps others discover the project.

---

**Made with ❤️ by developers, for developers**
