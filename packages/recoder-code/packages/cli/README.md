# 🤖 Recoder Code CLI

**AI-Powered Coding Assistant for Your Terminal**

Recoder Code CLI is an intelligent coding assistant that helps you write, debug, and understand code directly from your terminal. Powered by advanced AI models, it provides contextual assistance while you code.

[![Version](https://img.shields.io/npm/v/recoder-code-cli)](https://www.npmjs.com/package/recoder-code-cli)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## ✨ Features

- 🎯 **Interactive AI Assistant** - Natural language conversations about your code
- 📁 **File Context Awareness** - Understands your project structure and files
- 🔄 **Multi-Turn Conversations** - Maintains context across multiple interactions
- 💻 **Multiple AI Providers** - Supports OpenAI, Anthropic, Google GenAI, and more
- 🎨 **Syntax Highlighting** - Beautiful code formatting in terminal
- 🔧 **IDE Integration** - Works seamlessly with VS Code extension
- 🚀 **Fast & Efficient** - Optimized for quick responses
- 🔒 **Privacy Focused** - Your code stays on your machine

## 📦 Installation

### Global Installation (Recommended)

```bash
npm install -g recoder-code-cli
```

### Local Installation

```bash
npm install recoder-code-cli
```

### From Source

```bash
git clone https://github.com/caelum0x/recoder-code.git
cd recoder-code/packages/cli
npm install
npm run build
npm link
```

## 🚀 Quick Start

### 1. Run Recoder Code

```bash
recoder-code
```

Or use the short alias:

```bash
recoder
```

### 2. Start Asking Questions

```
You: How do I read a file in Node.js?

Recoder: Here's how to read a file in Node.js...
```

### 3. Get Help with Your Code

```
You: Can you review the code in main.js?

Recoder: I'll analyze main.js for you...
```

## 🎯 Usage Examples

### Basic Conversation

```bash
$ recoder-code

🤖 Recoder Code - AI Coding Assistant
Type your question or 'exit' to quit

You: Write a function to calculate fibonacci numbers

Recoder: Here's an efficient fibonacci function...
[Code example provided]

You: Can you optimize it?

Recoder: Sure! Here's an optimized version using memoization...
```

### Working with Files

```bash
You: Read the package.json file and explain the dependencies

Recoder: I'll analyze package.json...
[Detailed explanation of dependencies]

You: How can I update outdated packages?

Recoder: Here are the steps...
```

### Code Review

```bash
You: Review the code in src/index.ts for potential issues

Recoder: I'll review src/index.ts...
[Code review with suggestions]
```

### Debugging Help

```bash
You: I'm getting an error: "Cannot find module 'express'"

Recoder: This error means...
[Troubleshooting steps provided]
```

## ⚙️ Configuration

### Environment Variables

Create a `.env` file or set environment variables:

```bash
# AI Provider API Keys (at least one required)
OPENAI_API_KEY=your_openai_key
ANTHROPIC_API_KEY=your_anthropic_key
GOOGLE_API_KEY=your_google_key

# Model Selection (optional)
RECODER_MODEL=gpt-4  # or claude-3-opus, gemini-pro, etc.

# Custom API Endpoints (optional)
RECODER_API_URL=https://custom-endpoint.com

# Logging
RECODER_LOG_LEVEL=info  # debug, info, warn, error
```

### Configuration File

Create `~/.recoder/config.json`:

```json
{
  "model": "gpt-4",
  "maxTokens": 4000,
  "temperature": 0.7,
  "provider": "openai",
  "logLevel": "info"
}
```

## 🎨 Commands

### Interactive Mode

```bash
recoder-code
```

Start interactive conversation mode.

### Direct Query

```bash
recoder-code "How do I sort an array in JavaScript?"
```

Get a direct answer without entering interactive mode.

### File Analysis

```bash
recoder-code analyze src/**/*.ts
```

Analyze TypeScript files in the src directory.

### Debug Mode

```bash
recoder-code --debug
```

Run with detailed debug logging.

### Help

```bash
recoder-code --help
```

Show all available commands and options.

## 🔧 Advanced Features

### Multi-Model Support

Switch between different AI models:

```bash
# Use GPT-4
export RECODER_MODEL=gpt-4

# Use Claude
export RECODER_MODEL=claude-3-opus

# Use Gemini
export RECODER_MODEL=gemini-pro
```

### Context Management

Recoder Code automatically tracks:
- Open files in your editor
- Recent conversations
- Project structure
- Git status

### IDE Integration

Works with the VSCode extension for enhanced features:
- Inline code suggestions
- Diff view for changes
- File context synchronization

## 📚 API Keys

You'll need at least one AI provider API key:

### OpenAI

Get your key: https://platform.openai.com/api-keys

```bash
export OPENAI_API_KEY=sk-...
```

### Anthropic (Claude)

Get your key: https://console.anthropic.com/

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

### Google (Gemini)

Get your key: https://makersuite.google.com/app/apikey

```bash
export GOOGLE_API_KEY=AIza...
```

## 🐛 Troubleshooting

### "No API key found"

Make sure you've set at least one API key:

```bash
export OPENAI_API_KEY=your_key_here
```

### "Command not found: recoder-code"

If installed globally, make sure npm global bin is in your PATH:

```bash
npm config get prefix
export PATH=$(npm config get prefix)/bin:$PATH
```

### "Module not found" errors

Reinstall dependencies:

```bash
cd /path/to/recoder-code-cli
npm install
npm run build
```

### Slow Responses

Try a faster model or reduce max_tokens:

```bash
export RECODER_MODEL=gpt-3.5-turbo
```

### Debug Logs

Enable debug mode:

```bash
recoder-code --debug
```

Logs are saved to `~/.recoder/logs/`

## 🔒 Privacy & Security

- Your code never leaves your machine unless sent to AI provider
- API keys are stored locally and never transmitted except to respective AI services
- No telemetry or usage tracking
- Open source - audit the code yourself

## 📊 System Requirements

- **Node.js:** >= 18.0.0
- **npm:** >= 9.0.0  
- **OS:** macOS, Linux, Windows
- **Memory:** 512MB+ recommended
- **Disk:** 100MB for installation

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](../../CONTRIBUTING.md) for guidelines.

## 📄 License

MIT License - see [LICENSE](LICENSE) for details

## 🔗 Links

- **GitHub:** https://github.com/caelum0x/recoder-code
- **Website:** https://recoder.xyz
- **Issues:** https://github.com/caelum0x/recoder-code/issues
- **VSCode Extension:** [Recoder Code Companion](https://marketplace.visualstudio.com/items?itemName=recoder.recoder-code-vscode-companion)

## 📞 Support

- **Documentation:** https://recoder.xyz/docs
- **Discord:** https://discord.gg/recoder (if available)
- **Email:** support@recoder.xyz
- **Issues:** https://github.com/caelum0x/recoder-code/issues

## 🎓 Examples

### Example 1: Quick Code Generation

```bash
$ recoder "Create a REST API endpoint for user login"
```

### Example 2: Code Review

```bash
$ recoder "Review src/auth.ts for security issues"
```

### Example 3: Debugging

```bash
$ recoder "Why is my React component not re-rendering?"
```

### Example 4: Learning

```bash
$ recoder "Explain async/await in JavaScript"
```

## 🗺️ Roadmap

- [ ] Plugin system for custom tools
- [ ] Code refactoring suggestions
- [ ] Automated testing generation
- [ ] Multi-language support
- [ ] Team collaboration features
- [ ] Custom model fine-tuning

## ⭐ Show Your Support

If you find Recoder Code helpful, please give it a star on [GitHub](https://github.com/caelum0x/recoder-code)!

---

**Built with ❤️ by the Recoder Code Team**

*Making coding with AI accessible to everyone*
