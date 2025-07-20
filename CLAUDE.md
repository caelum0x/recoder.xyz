# CLAUDE.md - Recoder.xyz Project Context

> 🤖 **For Claude Code CLI**: This document provides essential context about the recoder.xyz project to help you understand the codebase, architecture, and development principles.

## 🎯 Project Vision & Goals

**Recoder.xyz** is a superior AI-powered development CLI that generates **REAL, PRODUCTION-READY CODE** - not mock implementations. We're building the ultimate developer tool that creates functional applications ready for immediate deployment.

### Core Mission
- **Real Functionality First**: Every generated line of code must work in production
- **Multi-AI Intelligence**: Leverage the best of Claude, GPT, Gemini, and Ollama models
- **Developer Productivity**: 10x developer speed without sacrificing code quality
- **Enterprise Ready**: Security, compliance, and scalability built-in from day one

### What Makes Us Different
Unlike existing tools (GitHub Copilot, claude-cli, openai-cli, gemini-cli) that generate placeholder code, recoder.xyz creates:
- ✅ **Real database operations** with actual CRUD functionality
- ✅ **Real API endpoints** with authentication and error handling  
- ✅ **Real blockchain contracts** that deploy and execute transactions
- ✅ **Real payment processing** through Stripe/PayPal that handles actual money
- ✅ **Real AI integrations** with working OpenAI/Anthropic/Google APIs
- ✅ **Real deployment pipelines** with Docker/Kubernetes configurations

## 🏗️ Architecture Overview

```
recoder.xyz/
├── packages/
│   ├── cli/                    # Main CLI package
│   │   ├── src/
│   │   │   ├── commands/       # CLI commands (generate, plan, validate)
│   │   │   ├── services/       # AI models, agents, project management
│   │   │   ├── generators/     # Production code generators
│   │   │   ├── validators/     # Real functionality validators
│   │   │   └── utils/          # Shared utilities
│   │   └── package.json
│   ├── shared/                 # Shared types and utilities
│   ├── vscode-extension/       # VSCode integration
│   └── web/                   # Optional web dashboard
├── backend/                   # API server
│   ├── src/
│   │   ├── routes/            # API endpoints
│   │   ├── services/          # Business logic
│   │   ├── generators/        # Code generation engines
│   │   ├── validators/        # Validation systems
│   │   └── integrations/      # External service integrations
│   └── package.json
├── production-engine/         # Real code validation engine
├── examples/                  # Real working examples
├── claude-cli/               # Git clone of existing claude-cli
├── openai-cli/               # Git clone of existing openai-cli
├── gemini-cli/               # Git clone of existing gemini-cli
└── docs/                     # Documentation
```

## 🧠 AI Model Integration

### Multi-Provider Support
Recoder.xyz integrates with multiple AI providers to leverage their unique strengths:

**Anthropic Claude** (Primary for reasoning)
- Best for: Complex logic, code analysis, security reviews
- Models: claude-3-sonnet, claude-3-opus
- Strengths: Superior reasoning, safety, code understanding

**OpenAI GPT** (General code generation)
- Best for: General coding tasks, API integrations
- Models: gpt-4, gpt-3.5-turbo, o1-preview
- Strengths: Broad knowledge, fast generation

**Google Gemini** (Multimodal tasks)
- Best for: Image processing, complex data analysis
- Models: gemini-pro, gemini-pro-vision
- Strengths: Multimodal capabilities, large context

**Ollama** (Local models)
- Best for: Privacy-sensitive projects, offline development
- Models: llama2, codellama, mistral
- Strengths: Local execution, no API costs, privacy

### Smart Model Routing
The system automatically selects the optimal AI model based on:
- Task complexity and type
- User preferences and patterns
- Cost optimization requirements
- Security and privacy needs

## 🔧 Core Components

### 1. CLI Package (`packages/cli/`)
The main command-line interface that developers interact with.

**Key Services:**
- `ai-hub.ts`: Central AI model management and routing
- `project-planner.ts`: Intelligent project planning and architecture
- `code-generator.ts`: Production code generation
- `reality-validator.ts`: Ensures generated code actually works
- `agent-manager.ts`: Custom AI agent management

**Key Commands:**
- `recoder generate "build a Solana DEX"` - Generate real applications
- `recoder plan "e-commerce platform"` - Create detailed project plans
- `recoder validate` - Validate generated code functionality
- `recoder agent create` - Build custom AI agents

### 2. Backend (`backend/`)
API server providing centralized AI services and project management.

**Key Features:**
- Multi-AI provider orchestration
- Project planning and analysis
- Code generation and validation
- User analytics and optimization
- Enterprise features (SSO, compliance)

### 3. Production Engine (`production-engine/`)
Specialized service for validating that generated code actually works.

**Validation Types:**
- **Functionality**: Does the code execute correctly?
- **Integration**: Do external services actually connect?
- **Security**: Are there vulnerabilities or exposed secrets?
- **Performance**: Does it meet production requirements?

### 4. Security Layer
Built-in security from day one:
- **Prompt Sanitization**: Prevents AI prompt injection attacks
- **Secret Detection**: Automatically redacts sensitive data
- **Code Scanning**: Real-time vulnerability detection
- **Audit Logging**: Complete security event tracking

## 🤖 AI Agent System (Conversational)

### Built-in Specialized Agents
Users can chat with different agents for specialized tasks:

```bash
# Talk to specific agents
recoder "blockchain agent, help me build a Solana NFT marketplace"
recoder "security agent, review my smart contract for vulnerabilities"  
recoder "web agent, create a modern dashboard with charts"
recoder "ai agent, build a chatbot with RAG system"

# Or let recoder choose the best agents automatically
recoder "build a full-stack e-commerce platform"
# 🤖 Auto-selects: Web Agent + Backend Agent + Security Agent
```

**Available Specialized Agents:**
- 🔗 **Blockchain Agent** - Solana, Ethereum, smart contracts, DeFi
- 🌐 **Web Agent** - React, Next.js, Vue, modern frontends  
- 📱 **Mobile Agent** - React Native, Flutter, iOS, Android
- 🤖 **AI Agent** - OpenAI, RAG, chatbots, ML pipelines
- ⚙️ **Backend Agent** - APIs, databases, microservices
- 🔒 **Security Agent** - Vulnerability scanning, secure coding
- 🎨 **UI/UX Agent** - Design systems, accessibility, user experience
- 📊 **Analytics Agent** - Data visualization, metrics, dashboards
- 🚀 **DevOps Agent** - Docker, Kubernetes, CI/CD, deployment
- ⚡ **Performance Agent** - Optimization, caching, scaling

### Creating Custom Agents (Conversational)
```bash
# Create agents through natural conversation
recoder "create a new agent specialized in cybersecurity"

🤖 "I'll help you create a cybersecurity specialist agent!

📋 Let's configure your agent:
   • Agent Name: What should we call it?
   • Specialization: Cybersecurity (confirmed)
   • AI Model: Which model? (Claude for security analysis?)
   • Focus Areas: Penetration testing? Secure coding? Compliance?

💡 I can base it on successful security patterns from our database."

> "Call it CyberGuard, use Claude, focus on secure smart contracts"

🤖 "Perfect! Creating CyberGuard agent...

✅ Agent Created: CyberGuard
   🧠 Model: Claude-3-Sonnet  
   🎯 Specialization: Secure Smart Contract Development
   🛡️ Capabilities:
      • Smart contract vulnerability scanning
      • Secure coding pattern enforcement  
      • DeFi protocol security auditing
      • Gas optimization with security focus

🚀 Test your agent: recoder 'CyberGuard, review my token contract'"
```

### Agent Marketplace (Conversational)
```bash
# Discover community agents
recoder "show me agents for game development"

🤖 "Here are game development agents from our community:

🎮 **GameDev Pro** (by @developer123)
   ⭐ 4.8/5 stars | 1.2k downloads
   🎯 Unity, Unreal Engine, game mechanics
   
🎨 **GameArt Assistant** (by @artist456)  
   ⭐ 4.6/5 stars | 800 downloads
   🎯 Game assets, animation, UI design

🕹️ **Blockchain Gaming** (by @web3builder)
   ⭐ 4.9/5 stars | 600 downloads  
   🎯 NFT games, play-to-earn, GameFi

💬 Try: 'install GameDev Pro' or 'tell me more about Blockchain Gaming'"

# Install community agents conversationally
> "install GameDev Pro and tell me how to use it"

🤖 "Installing GameDev Pro agent...

✅ GameDev Pro installed successfully!
   🎮 Specializes in Unity and Unreal Engine development
   🎯 Best for: game mechanics, physics, AI behaviors

💡 Try these commands:
   'GameDev Pro, create a 2D platformer game'
   'build a multiplayer shooter with GameDev Pro'
   'GameDev Pro, add physics to my character controller'

🚀 Ready to start building games!"
```

### Agent Collaboration (Multi-Agent Conversations)
```bash
# Multiple agents work together naturally
recoder "build a social media app with real-time features"

🤖 "I'll coordinate multiple agents for your social media app:

👥 **Team Assembly:**
   🌐 Web Agent - React frontend with real-time UI
   ⚙️ Backend Agent - Node.js API with WebSocket support  
   📱 Mobile Agent - React Native cross-platform app
   🔒 Security Agent - Authentication and data protection
   📊 Analytics Agent - User engagement tracking

🔄 **Collaborative Build Process:**
   
🌐 Web Agent: "Creating responsive React frontend with real-time chat..."
⚙️ Backend Agent: "Building scalable API with Socket.io and Redis..."
📱 Mobile Agent: "Developing React Native app with push notifications..."
🔒 Security Agent: "Implementing JWT auth and rate limiting..."
📊 Analytics Agent: "Adding user behavior tracking and metrics..."

✅ **Result:** Complete social media platform with web + mobile apps!"
```

## 🗣️ Conversational AI Interface

**Recoder.xyz works like Claude Code CLI** - users can directly chat with AI using natural language:

### Natural Language Commands
```bash
# Direct conversational interface - just like Claude Code
recoder "code a photo app with camera integration and filters"
recoder "build a Solana DEX with real token swapping functionality"  
recoder "create an e-commerce platform with Stripe payments"
recoder "make a React dashboard with real-time charts"

# The AI understands context and intent naturally
recoder "add authentication to my photo app"
recoder "deploy this to production with Docker"
recoder "fix the bug in the payment flow"
```

### Main App Entrance (AI-First Experience)
When users run `recoder` without arguments, they enter an **interactive AI chat mode**:

```bash
$ recoder
╭─────────────────────────────────────────────────────────────╮
│  🤖 Recoder.xyz - AI Development Assistant                  │
│  💬 Chat naturally about what you want to build            │
│  🚀 I'll generate real, production-ready code              │
╰─────────────────────────────────────────────────────────────╯

💬 What would you like to build today?
> I want to create a photo app with camera and filters

🤖 Great! I'll help you build a photo app. Let me ask a few questions:
   📱 Which platform? (React Native, Flutter, or Web)
   🎨 What kind of filters? (Instagram-style, artistic, or custom)
   📸 Any specific camera features? (multiple lenses, video, etc.)

> React Native with Instagram-style filters and video recording

🚀 Perfect! I'll create a React Native photo app with:
   ✅ Camera integration with video recording
   ✅ Real-time filter application 
   ✅ Instagram-style filter library
   ✅ Photo/video gallery management
   ✅ Share functionality

   🔄 Generating your app... (using optimal AI agents)
```

### AI Agent Conversation Flow
The system automatically selects and coordinates multiple agents:

```bash
💬 User: "build a Solana DEX"

🤖 Recoder: 
   🎯 I'll use the Blockchain Agent for Solana expertise
   🎨 Web Agent will handle the frontend interface  
   🔒 Security Agent will ensure safe smart contracts
   
   Let me start building your DEX...

🔧 Blockchain Agent: "Creating Anchor smart contracts with real swap logic..."
🎨 Web Agent: "Building Next.js frontend with wallet integration..."
🔒 Security Agent: "Adding slippage protection and security checks..."

✅ Your Solana DEX is ready! 
   📁 Created: my-solana-dex/
   🚀 Deploy with: cd my-solana-dex && npm run deploy
```

## 🔄 Workflow (Conversational Style)

### 1. Natural Conversation Start
```bash
# Just talk to recoder like you'd talk to Claude Code
recoder "I want to build a DeFi yield farming protocol"

# Or enter interactive mode
recoder
> Tell me about building a photo sharing app
```

### 2. AI-Guided Planning
```bash
🤖 "I'll help you build a DeFi yield farming protocol. Let me plan this:

📋 Architecture Analysis:
   • Smart contracts for yield farming pools
   • Frontend for staking/unstaking
   • Price oracle integration  
   • Reward distribution system

🤔 Questions for you:
   • Which blockchain? (Ethereum, Solana, Polygon)
   • What tokens can users stake?
   • How should rewards be calculated?

💡 Would you like me to start with a basic staking pool?"
```

### 3. Contextual Code Generation
```bash
# AI remembers context from conversation
> "Yes, start with Solana and SOL staking"

🤖 "Perfect! Building Solana staking pool...
   
🔧 Generating:
   ✅ Anchor smart contract with real staking logic
   ✅ Next.js frontend with Phantom wallet integration
   ✅ Real reward calculation algorithms
   ✅ Deployment scripts for devnet/mainnet

📁 Created: defi-yield-farm/
   contracts/ - Anchor programs  
   app/ - Next.js frontend
   tests/ - Complete test suite"
```

### 4. Iterative Development
```bash
> "Add auto-compound feature to maximize yields"

🤖 "Great idea! Adding auto-compound functionality...
   
🔄 Updating smart contract with auto-compound logic
✅ Added compound() function to pool contract
✅ Updated frontend with toggle option
✅ Added compound reward calculations

Want me to also add compound frequency settings?"
```

## 🔒 Security & Compliance

### AI Security Measures
- **Prompt Injection Protection**: Sanitizes all user inputs
- **Data Leakage Prevention**: Prevents sensitive data exposure
- **Model Isolation**: Secure boundaries between AI providers
- **Audit Trails**: Complete logging of all AI interactions

### Enterprise Compliance
- **GDPR Compliance**: User data protection and privacy
- **SOC 2 Type II**: Enterprise security standards
- **HIPAA Support**: Healthcare data protection
- **Custom Compliance**: Configurable for industry requirements

## 🚀 Real Examples (Conversational Interface)

### Photo App Example
```bash
$ recoder "code a photo app with camera and real-time filters"

🤖 Recoder: "I'll build a professional photo app for you!

📱 **App Architecture:**
   • React Native for cross-platform support
   • Real camera integration with multiple lenses
   • Live filter processing using native modules
   • Photo gallery with cloud sync
   • Social sharing capabilities

🎨 **Filter System:**
   • Instagram-style filters (Valencia, Nashville, etc.)
   • Real-time preview with smooth 60fps
   • Custom filter creation tools
   • Filter intensity controls

📸 **Camera Features:**
   • Photo and video recording
   • Portrait mode with background blur
   • Night mode for low light
   • Timer and burst mode

🔄 Generating your photo app..."

**Generated Output:**
- ✅ React Native app with real camera integration
- ✅ Native filter modules for iOS/Android  
- ✅ Real-time image processing pipeline
- ✅ Cloud storage with Firebase integration
- ✅ Social sharing with Instagram/TikTok APIs
- ✅ Complete build and deployment configs
```

### Solana DEX Example  
```bash
$ recoder "build a Solana DEX with real token swapping and liquidity pools"

🤖 Recoder: "I'll create a production-ready Solana DEX!

🔗 **DeFi Architecture:**
   • Anchor smart contracts for AMM pools
   • Real token swapping with slippage protection  
   • Liquidity provision with rewards
   • Price oracle integration (Pyth)
   • Cross-chain bridge support

💱 **Trading Features:**
   • Spot trading with real market data
   • Limit orders and stop-loss
   • Portfolio tracking and PnL
   • Advanced charting with TradingView

🏦 **Liquidity Mining:**
   • LP token staking rewards
   • Yield farming pools
   • Governance token distribution

🔄 Building your DEX with Blockchain Agent..."

**Generated Output:**
- ✅ Anchor smart contracts with real swap logic
- ✅ Next.js frontend with Phantom wallet integration
- ✅ Real Pyth price oracle connections
- ✅ Automated market maker (AMM) algorithms
- ✅ Liquidity pool management system
- ✅ Deployment scripts for devnet/mainnet
- ✅ Complete test suite with real transactions
```

### E-commerce Platform Example
```bash
$ recoder "create a complete e-commerce platform with payments and inventory"

🤖 Recoder: "I'll build a full-scale e-commerce platform!

🛒 **Platform Features:**
   • Product catalog with search and filters
   • Shopping cart and wishlist
   • User accounts and order history
   • Admin dashboard for management
   • Real-time inventory tracking

💳 **Payment System:**
   • Stripe integration for credit cards
   • PayPal and Apple Pay support
   • Multi-currency support
   • Subscription billing options

📦 **Fulfillment:**
   • Real shipping integration (FedEx, UPS)
   • Order tracking and notifications
   • Returns and refunds processing
   • Inventory alerts for low stock

🔄 Coordinating Web Agent + Backend Agent + Security Agent..."

**Generated Output:**
- ✅ Next.js storefront with modern design
- ✅ Real Stripe payment processing
- ✅ PostgreSQL database with proper schemas  
- ✅ Admin dashboard with real analytics
- ✅ Inventory management system with alerts
- ✅ Email notifications via SendGrid
- ✅ Docker deployment with load balancing
- ✅ Mobile-responsive PWA version
```

## 🔧 Development Guidelines

### Code Quality Standards
- **Real Functionality**: No mock/placeholder code allowed
- **Production Ready**: All code must be deployment-ready
- **Security First**: Security considerations in every component
- **Performance Optimized**: Efficient code generation and execution
- **Well Documented**: Comprehensive documentation and comments

### AI Model Usage Patterns
- **Claude**: Complex reasoning, security analysis, code reviews
- **GPT-4**: General coding, API integrations, documentation
- **Gemini**: Multimodal tasks, data processing, analysis
- **Ollama**: Local development, privacy-sensitive projects

### Testing Requirements
- **Unit Tests**: For all core functionality
- **Integration Tests**: Real external service connections
- **End-to-End Tests**: Complete user workflows
- **Security Tests**: Vulnerability scanning and penetration testing
- **Performance Tests**: Load testing and optimization

## 🎯 Current Development Focus

### Phase 1 (Current)
- ✅ Multi-AI provider integration
- ✅ Real code generation engines
- ✅ Security layer implementation
- 🔄 Plugin ecosystem development

### Phase 2 (Next)
- 📋 Advanced learning system
- 📋 Real-time collaboration features
- 📋 Enterprise SSO integration
- 📋 Mobile companion app

### Phase 3 (Future)
- 📋 AI model fine-tuning
- 📋 Community marketplace
- 📋 Advanced analytics dashboard
- 📋 Multi-language support

## 🤝 Contributing Guidelines

### For Claude Code CLI Development
When working on recoder.xyz codebase:

1. **Understand the "Real Code" Philosophy**
   - Every generated line must be functional
   - No placeholder or mock implementations
   - Production deployment is the goal

2. **Respect the Multi-AI Architecture**
   - Use appropriate AI models for specific tasks
   - Implement proper model routing logic
   - Handle API failures gracefully

3. **Maintain Security Standards**
   - Implement prompt sanitization
   - Add security scanning for generated code
   - Protect user data and API keys

4. **Follow Validation Patterns**
   - All generated code must be validated
   - Test real functionality, not just syntax
   - Provide meaningful error messages

5. **Consider Performance**
   - Optimize AI API usage costs
   - Implement intelligent caching
   - Monitor response times

## 📚 Key Files to Understand

### Core CLI Files
- `packages/cli/src/commands/generate.ts` - Main code generation command
- `packages/cli/src/services/ai-hub.ts` - AI model orchestration
- `packages/cli/src/services/code-generator.ts` - Production code generation
- `packages/cli/src/services/reality-validator.ts` - Real functionality validation

### Backend Files
- `backend/src/services/plannerService.js` - Project planning logic
- `backend/src/generators/productionGenerator.js` - Production code generation
- `backend/src/validators/integrationValidator.js` - Integration validation

### Security Files
- `packages/security/src/ai-prompt-sanitizer.ts` - Prompt injection protection
- `packages/security/src/code-vulnerability-scanner.ts` - Security scanning

## 🎯 Development Principles

1. **Real Functionality Over Pretty Code**
   - Working trumps elegant
   - Production-ready over proof-of-concept
   - Actual integrations over mocked APIs

2. **Multi-AI Intelligence**
   - Leverage each AI model's strengths
   - Smart routing based on task type
   - Fallback strategies for reliability

3. **Security First**
   - Assume hostile input
   - Protect user data zealously
   - Audit everything

4. **Developer Experience**
   - Simple commands for complex tasks
   - Clear error messages
   - Comprehensive documentation

5. **Enterprise Ready**
   - Scale from indie developer to Fortune 500
   - Compliance and governance built-in
   - Professional support and reliability

---

**Ready to build the future of AI-powered development? Let's make recoder.xyz the tool every developer reaches for.** 🚀
# 🤖 AI Coding CLIs Explained: Claude Code vs OpenAI Codex vs Gemini CLI

## Overview: The Terminal AI Revolution

All three tools bring **conversational AI directly into your terminal** for coding tasks, but each has different strengths and approaches:

## 🔵 **Claude Code** (Anthropic)

### What It Is
**Conversational terminal-based coding agent** that uses Claude models for development tasks.

### How It Works
```bash
# Installation
npm install -g @anthropic-ai/claude-code

# Basic usage - conversational interface
claude
> Build me a React todo app with authentication

# Direct commands
claude "fix the bug in my payment flow"
claude "add a new API endpoint for user profiles"
claude "explain this complex algorithm"
```

### Key Features
- **🗣️ Natural Language Interface**: Chat directly like you would with Claude
- **📁 Project Understanding**: Uses `CLAUDE.md` files for project context
- **🔄 Autonomous Actions**: Can edit files, run commands, make commits
- **🧠 Session Memory**: Remembers context across commands
- **🔧 Tool Integration**: Works with Git, MCP (Model Context Protocol)

### Command Examples
```bash
# Interactive mode
claude
> Create a new React component for user authentication
> Run the tests and fix any failures
> Deploy this to production

# File operations
claude "analyze the entire codebase and suggest improvements"
claude "refactor this class component to hooks"
claude "add TypeScript types to this JavaScript file"

# Git operations  
claude "review this PR and suggest changes"
claude "create a commit message for these changes"
```

### Strengths
- ✅ **Best reasoning ability** (Claude models excel at complex logic)
- ✅ **Project awareness** with CLAUDE.md context files
- ✅ **Safety-focused** with confirmation prompts
- ✅ **Long context window** for large codebases
- ✅ **Git integration** built-in

### Limitations
- ❌ **Requires paid Claude API** (no free tier)
- ❌ **Limited to Claude models only**
- ❌ **Newer tool** (less community resources)

---

## 🟠 **OpenAI Codex CLI** (OpenAI)

### What It Is
**Terminal coding agent** powered by OpenAI's latest reasoning models (o4-mini, o1-preview).

### How It Works
```bash
# Installation
npm install -g @openai/codex

# Basic usage
codex
> Build a Python API with FastAPI and database integration

# Direct commands with approval modes
codex --approval-mode suggest "create a machine learning pipeline"
codex --approval-mode full-auto "fix all linting errors"
```

### Key Features
- **🎯 Multiple Approval Modes**:
  - `suggest`: Proposes changes, asks for approval
  - `auto-edit`: Edits files automatically, asks before commands  
  - `full-auto`: Fully autonomous within sandbox
- **🖼️ Multimodal Input**: Screenshots, diagrams, text prompts
- **🔒 Sandboxed Execution**: Safe command execution with network isolation
- **📋 Scriptable**: Can be used in CI/CD pipelines

### Command Examples
```bash
# Different approval modes
codex --suggest "optimize this database query"
codex --auto-edit "add error handling to all API endpoints"
codex --full-auto "set up complete testing suite"

# Multimodal capabilities
codex "build this UI from the screenshot I'm pasting"
codex "@mockup.png implement this design in React"

# Scriptable usage
echo "optimize this code" | codex --quiet --json
```

### Strengths
- ✅ **Powerful reasoning models** (o1-preview, o4-mini)
- ✅ **Flexible automation** with different approval modes
- ✅ **Multimodal capabilities** (images, diagrams)
- ✅ **Good for automation** and scripting
- ✅ **Strong safety** with sandboxing

### Limitations
- ❌ **Requires paid OpenAI API** (can be expensive)
- ❌ **Limited to OpenAI models**
- ❌ **Newer tool** (still experimental)
- ❌ **Windows support limited** (needs WSL2)

---

## 🔴 **Google Gemini CLI** (Google)

### What It Is
**Open-source AI agent** that brings Gemini 2.5 Pro directly into your terminal.

### How It Works
```bash
# Installation
npm install -g @google/gemini-cli

# Basic usage
gemini
> Create a Discord bot that answers questions from a FAQ file

# Direct commands
gemini "analyze this codebase and create documentation"
gemini "help me debug this performance issue"
```

### Key Features
- **🆓 Generous Free Tier**: 60 requests/minute, 1000/day with personal Google account
- **🌐 Built-in Google Search**: Real-time web context
- **📊 Huge Context Window**: 1M+ tokens for large codebases
- **🔧 MCP Integration**: Model Context Protocol support
- **🎨 Multimodal**: Images, PDFs, sketches
- **📝 GEMINI.md Files**: Project-specific context like Claude

### Command Examples
```bash
# Large codebase analysis
gemini "analyze this entire monorepo and suggest architecture improvements"

# Web-enhanced prompts  
gemini "research the latest React patterns and apply them to my code"

# Multimodal development
gemini "@design.pdf generate a React app matching this mockup"
gemini "@screenshot.png what's wrong with this UI?"

# DevOps automation
gemini "create a complete CI/CD pipeline for this Node.js app"
```

### Strengths
- ✅ **Best free tier** (1000 requests/day free!)
- ✅ **Largest context window** (1M+ tokens)
- ✅ **Real-time web search** built-in
- ✅ **Fully open-source** (Apache 2.0)
- ✅ **Strong multimodal** capabilities
- ✅ **MCP integration** for extensibility

### Limitations
- ❌ **Newest tool** (less mature than others)
- ❌ **Limited to Gemini models**
- ❌ **Google ecosystem dependency**

---

## 🚀 **How Recoder.xyz Is Different & Superior**

### Multi-AI Intelligence
**Unlike the others, recoder.xyz uses ALL the best models:**
```bash
# Recoder automatically chooses the best model for each task
recoder "build a Solana DEX"  # → Uses Claude for blockchain reasoning
recoder "create ML pipeline"  # → Uses GPT for general coding  
recoder "analyze this image"  # → Uses Gemini for multimodal tasks
recoder "run local model"     # → Uses Ollama for privacy
```

### Real Production Code Focus
**Other tools often generate placeholder code:**
```bash
# Typical AI CLI output:
// TODO: Implement payment processing
// Mock data for testing
const paymentResult = { success: true }; // Replace with real API

# Recoder.xyz output:
// REAL Stripe integration with actual payment processing
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const paymentResult = await stripe.paymentIntents.create({
  amount: calculateTotal(items),
  currency: 'usd',
  // ... complete working implementation
});
```

### Agent Ecosystem
**Specialized agents vs single general AI:**
```bash
# Other CLIs: One AI tries to do everything
claude "build blockchain app"      # Claude tries its best
codex "build blockchain app"       # GPT tries its best  
gemini "build blockchain app"      # Gemini tries its best

# Recoder.xyz: Specialized agents collaborate
recoder "build blockchain app"
# → Blockchain Agent: Creates smart contracts
# → Web Agent: Builds frontend
# → Security Agent: Adds security auditing
# → DevOps Agent: Sets up deployment
```

### Conversational Interface Comparison

| Feature | Claude Code | OpenAI Codex | Gemini CLI | **Recoder.xyz** |
|---------|-------------|--------------|------------|-----------------|
| **Natural Chat** | ✅ | ✅ | ✅ | ✅ **Enhanced** |
| **Multi-Model Support** | ❌ (Claude only) | ❌ (OpenAI only) | ❌ (Gemini only) | ✅ **All Models** |
| **Specialized Agents** | ❌ | ❌ | ❌ | ✅ **10+ Agents** |
| **Real Code Focus** | ⚠️ Mixed | ⚠️ Mixed | ⚠️ Mixed | ✅ **Always Real** |
| **Free Tier** | ❌ | ❌ | ✅ Limited | ✅ **Local Models** |
| **Agent Marketplace** | ❌ | ❌ | ❌ | ✅ **Community** |
| **Production Validation** | ❌ | ❌ | ❌ | ✅ **Built-in** |

## 💬 **Conversational Examples**

### Claude Code Style:
```bash
$ claude
> I need to build an e-commerce platform

Claude: I'll help you build an e-commerce platform. Let me create a plan...
[Creates files, but might include mock payment processing]
```

### OpenAI Codex Style:  
```bash
$ codex
> I need to build an e-commerce platform

Codex: I'll create an e-commerce platform for you.
[Generates code with different approval modes]
```

### Gemini CLI Style:
```bash
$ gemini  
> I need to build an e-commerce platform

Gemini: I'll build an e-commerce platform with modern features...
[Uses web search for latest patterns, large context for complex apps]
```

### **Recoder.xyz Style:**
```bash
$ recoder
> I need to build an e-commerce platform

🤖 Recoder: Perfect! I'll build a production-ready e-commerce platform.

🎯 **Agent Team Assembly:**
   • Web Agent - Next.js storefront with modern design
   • Backend Agent - Node.js API with real database  
   • Security Agent - Authentication & data protection
   • Payment Agent - REAL Stripe integration (processes actual money)
   • DevOps Agent - Docker deployment with monitoring

💳 **Real Payment Processing:**
   ✅ Stripe integration that handles real transactions
   ✅ Inventory management with actual stock tracking
   ✅ Order fulfillment with shipping APIs
   ✅ Tax calculation for all US states

🔒 **Production Security:**
   ✅ JWT authentication with refresh tokens
   ✅ Input validation and sanitization
   ✅ Rate limiting and DDoS protection  
   ✅ PCI compliance for payment data

🚀 **Ready for Production:**
   ✅ Docker containerization
   ✅ CI/CD pipeline with GitHub Actions
   ✅ Monitoring with real error tracking
   ✅ Backup and disaster recovery

📁 Created: ecommerce-platform/
   app/ - Next.js storefront
   api/ - Node.js backend
   payments/ - Stripe integration
   docker/ - Production deployment
   
🎉 **Result:** Complete e-commerce platform that can process real orders TODAY!
```

## 🎯 **Why Recoder.xyz Wins**

1. **🧠 Smart Model Selection**: Automatically uses the best AI for each task
2. **⚡ Real Functionality**: No mock code - everything works in production  
3. **👥 Agent Collaboration**: Specialized experts work together
4. **🔒 Security First**: Built-in security scanning and compliance
5. **💰 Cost Optimization**: Uses most efficient models for each task
6. **🌐 Community Driven**: Agent marketplace and plugin ecosystem
7. **🎛️ Local + Cloud**: Supports both local models (Ollama) and cloud APIs

**Bottom Line:** While Claude Code, OpenAI Codex, and Gemini CLI are great single-model tools, **recoder.xyz is the first multi-AI development platform** that actually generates real, production-ready code through specialized agent collaboration.

It's like having a whole development team of AI experts in your terminal! 🚀