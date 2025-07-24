<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=recoderxyz.recoder-vscode"><img src="https://img.shields.io/visual-studio-marketplace/v/recoderxyz.recoder-vscode.svg?label=VS%20Code%20Marketplace" alt="VS Code Marketplace"></a>
  <a href="https://github.com/recoderxyz/recoder-extension"><img src="https://img.shields.io/github/stars/recoderxyz/recoder-extension?style=flat&logo=github" alt="GitHub Stars"></a>
  <a href="https://recoder.xyz"><img src="https://img.shields.io/badge/Web%20Platform-2563eb?style=flat&logo=internetexplorer&logoColor=white" alt="Web Platform"></a>
  <a href="https://recoder.xyz/cli"><img src="https://img.shields.io/badge/CLI%20Tool-7c3aed?style=flat&logo=terminal&logoColor=white" alt="CLI Tool"></a>
</p>

# 🚀 Recoder VS Code Extension

> **Production-Ready AI Coding Assistant** - Multi-AI intelligence that generates real, working code with Claude, Groq, Gemini, and Ollama. Part of the [recoder.xyz](https://recoder.xyz) ecosystem.

- 🎆 **Real Production Code** - No mock implementations, only working solutions
- 🤖 **Multi-AI Intelligence** - Claude for complex logic, Groq for speed, Gemini for scale, Ollama for privacy
- ⚡ **Enterprise Ready** - Real database operations, blockchain contracts, payment processing
- 🔗 **Ecosystem Integration** - Works with [Recoder Web](https://web.recoder.xyz) and [Recoder CLI](https://recoder.xyz/cli)
- 🔍 **Quality Validation** - Automatic code quality checks and vulnerability scanning
- 🚀 **Deployment Ready** - Generated code deploys to production immediately

<p align="center">
  <img src="https://raw.githubusercontent.com/recoderxyz/recoder-extension/main/assets/demo.gif" width="100%" alt="Recoder VS Code Extension Demo" />
</p>

## 🔗 Recoder Ecosystem

- **[VS Code Extension](https://marketplace.visualstudio.com/items?itemName=recoderxyz.recoder-vscode)** - Code directly in your editor
- **[Web Platform](https://web.recoder.xyz)** - Browser-based code generation
- **[CLI Tool](https://recoder.xyz/cli)** - Terminal-based development
- **[Main Site](https://recoder.xyz)** - Learn more about Recoder

## 🎨 Key Features

### 💻 Real Code Generation
- **Production-Ready Output** - Every line of code works in production environments
- **No Mock Implementations** - Real database operations, API integrations, and business logic
- **Quality Validation** - Automatic vulnerability scanning and code quality checks

### 🤖 Multi-AI Intelligence
- **Claude** - Complex logic, security, architecture decisions
- **Groq** - Fast prototyping, API endpoints, React components
- **Gemini** - Large codebases, multimodal tasks, documentation
- **Ollama** - Private/offline development, custom models

### ⚙️ Advanced Features
- **Smart Model Routing** - Automatically selects the best AI for each task
- **Context Awareness** - Understands your entire project structure
- **Real Integrations** - Stripe payments, blockchain contracts, auth systems
- **Deployment Ready** - Generated code deploys with Docker, Kubernetes, CI/CD

## 🚀 Getting Started with Recoder

### 1. Install the Extension
```bash
# Via VS Code Marketplace
code --install-extension recoderxyz.recoder-vscode
```

### 2. Configure AI Providers
Add your API keys to VS Code settings or environment variables:
```json
{
  "recoder.apiKeys": {
    "anthropic": "your-claude-api-key",
    "groq": "your-groq-api-key",
    "google": "your-gemini-api-key",
    "ollama": "http://localhost:11434"
  }
}
```

### 3. Start Coding
- **Ctrl+Shift+A** (Cmd+Shift+A on Mac) - Open Recoder
- Describe what you want to build
- Watch Recoder generate production-ready code
- Deploy immediately to your preferred platform

### 4. Ecosystem Integration
- Use with [Recoder Web](https://web.recoder.xyz) for browser-based development
- Combine with [Recoder CLI](https://recoder.xyz/cli) for terminal workflows
- Access the full [Recoder.xyz](https://recoder.xyz) platform

## Difference between Roo Code and Cline

We're doing our best to combine the best of both worlds. Kilo Code combines all features of Cline, Roo, and adds a few of our own additions. It has the best features of both, and we're working on making it even better!

No need to fiddle with API keys, Kilo Code ships with the latest AI models plugged in, including Claude 4 Sonnet and Opus and Gemini 2.5 Pro.

Kilo Code is a direct fork from Roo Code, but also includes the following features from Cline (and more):

- MCP Server Marketplace: Easily find, and use MCP servers to extend the agent capabilities.
- System notifications: Get notified when the agent is done with a task.
- Easy model connection: with bigger free tier.

## Extension Development

For details on building and developing the extension, see [DEVELOPMENT.md](/DEVELOPMENT.md)
