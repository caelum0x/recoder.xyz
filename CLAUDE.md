# CLAUDE.md - Recoder.xyz Project Context

> 🤖 **For Claude Code CLI**: Essential context for understanding the recoder.xyz codebase and development approach.

## 📋 Table of Contents

1. [🎯 Project Overview](#-project-overview)
2. [🏗️ Architecture](#-architecture) 
3. [🧠 AI Integration](#-ai-integration)
4. [🤖 Agent System](#-agent-system)
5. [💻 CLI Interface](#-cli-interface)
6. [🔄 Development Workflow](#-development-workflow)
7. [🔒 Security](#-security)
8. [📚 Development Guide](#-development-guide)
9. [🔗 Quick Links](#-quick-links)

---

## 🎯 Project Overview

### Vision
**Recoder.xyz** is a superior AI-powered development CLI that generates **REAL, PRODUCTION-READY CODE** - not mock implementations.

### Core Mission
- **Real Functionality First**: Every generated line must work in production
- **Multi-AI Intelligence**: Claude + Groq + Gemini + Ollama (not OpenAI for coding)
- **Developer Productivity**: 10x speed without sacrificing quality
- **Enterprise Ready**: Security, compliance, scalability built-in

### Key Differentiators
Unlike GitHub Copilot, claude-cli, openai-cli, gemini-cli:
- ✅ **Real database operations** with actual CRUD
- ✅ **Real blockchain contracts** that deploy and execute  
- ✅ **Real payment processing** through Stripe/PayPal
- ✅ **Real AI integrations** with working APIs
- ✅ **Real deployment pipelines** with Docker/Kubernetes

---

## 🏗️ Architecture

### Project Structure
```
recoder.xyz/
├── packages/cli/           # Main CLI (your primary focus)
├── packages/shared/        # Shared types and utilities
├── backend/               # API server
├── production-engine/     # Code validation
├── examples/             # Real working examples
├── claude-cli/           # Reference (git clone)
├── openai-cli/           # Reference (git clone)
└── gemini-cli/           # Reference (git clone)
```

### Core Components
- **CLI Package**: Main developer interface
- **AI Hub**: Multi-provider orchestration  
- **Agent Manager**: Specialized AI agents
- **Production Engine**: Real functionality validation
- **Security Layer**: Prompt sanitization, vulnerability scanning

---

## 🧠 AI Integration

### Smart Model Selection
```typescript
// How recoder connects to AI APIs
const aiProviders = {
  claude: new AnthropicAPI(process.env.ANTHROPIC_API_KEY),    // Complex logic
  groq: new GroqAPI(process.env.GROQ_API_KEY),              // Fast coding
  gemini: new GoogleGenAIAPI(process.env.GOOGLE_API_KEY),   // Multimodal
  ollama: new OllamaAPI(process.env.OLLAMA_BASE_URL),       // Local/privacy
  openai: new OpenAIAPI(process.env.OPENAI_API_KEY)         // Backup only
};
```

### Model Specialization
- **Claude**: Blockchain, security, complex reasoning
- **Groq**: React/Next.js, rapid prototyping, API endpoints
- **Gemini**: Large codebases, multimodal, documentation
- **Ollama**: Private projects, custom models, offline
- **OpenAI**: Limited use (poor at coding tasks)

---

## 🤖 Agent System

### Built-in Agents
```bash
# Specialized agents for different domains
🔗 Blockchain Agent  - Solana, Ethereum, DeFi
🌐 Web Agent        - React, Next.js, Vue
📱 Mobile Agent     - React Native, Flutter
🤖 AI Agent         - OpenAI, RAG, ML pipelines
⚙️ Backend Agent    - APIs, databases, microservices
🔒 Security Agent   - Vulnerability scanning, audits
🚀 DevOps Agent     - Docker, Kubernetes, CI/CD
```

### Agent Collaboration
```bash
recoder "build a social media app"
# → Web Agent: React frontend
# → Backend Agent: Node.js API  
# → Mobile Agent: React Native app
# → Security Agent: Authentication
# → DevOps Agent: Docker deployment
```

### Custom Agents
Users can create domain-specific agents conversationally:
```bash
recoder "create a cybersecurity agent focused on smart contracts"
```

---

## 💻 CLI Interface

### Primary Interface (Conversational)
```bash
# Natural language commands (like Claude Code CLI)
recoder "build a Solana DEX with real token swapping"
recoder "add authentication to my existing project"
recoder "deploy this to production with monitoring"

# Interactive mode
recoder
> I want to build a photo app with filters
🤖 Great! Let me ask a few questions...
```

### Project Context Understanding
```bash
# Recoder automatically reads:
📁 knowledge.md - Project docs, architecture, conventions  
📁 recoder.md - AI preferences, agent configurations
📁 package.json - Dependencies, scripts, metadata
📁 README.md - Project overview

# Example analysis:
🤖 "I've analyzed your Solana DeFi project. Based on knowledge.md,
   I see you're using Anchor with yield farming. From recoder.md,
   I'll use Claude for security audits and Groq for UI components."
```

### Traditional Commands (Secondary)
```bash
recoder generate "description" --agent blockchain-expert
recoder plan "project description" --detailed  
recoder validate --test-real-functionality
recoder agent create custom-name --specialization domain
```

---

## 🔄 Development Workflow

### 1. Planning Phase
```bash
recoder "plan a web3 explorer using solana web3.js and next.js"

🎯 Planning Phase (Claude-3-Sonnet):
• Architecture analysis
• Technology stack selection  
• Development phases
• Risk assessment
```

### 2. Code Generation
```bash
🚀 Building Phase:
🔧 Blockchain Agent (Claude): Solana integration logic
⚡ Web Agent (Groq): Next.js components  
🎨 UI Agent (Groq): Responsive interface

Result: Production-ready application
```

### 3. Validation & Deployment
- Real functionality testing
- Security vulnerability scanning
- Performance optimization
- Production deployment setup

---

## 🔒 Security

### AI Security Measures
- **Prompt Injection Protection**: Input sanitization
- **Data Leakage Prevention**: Sensitive data redaction
- **Code Vulnerability Scanning**: Real-time SAST/DAST
- **Audit Trails**: Complete security event logging

### Enterprise Compliance
- **GDPR**: User data protection
- **SOC 2 Type II**: Enterprise security standards
- **HIPAA**: Healthcare data protection
- **Custom Compliance**: Industry-specific requirements

---

## 📚 Development Guide

### Code Philosophy
1. **Real Functionality Over Pretty Code**: Working trumps elegant
2. **Multi-AI Intelligence**: Use best model for each task
3. **Security First**: Assume hostile input
4. **Production Ready**: Immediate deployment capability

### Key Files
```typescript
// Core CLI files to understand:
packages/cli/src/commands/generate.ts    // Main generation
packages/cli/src/services/ai-hub.ts      // AI orchestration  
packages/cli/src/services/code-generator.ts  // Production code
packages/cli/src/services/reality-validator.ts  // Validation

// Backend files:
backend/src/generators/productionGenerator.js  // Code generation
backend/src/validators/integrationValidator.js // Integration tests

// Security files:
packages/security/src/ai-prompt-sanitizer.ts   // Input protection
packages/security/src/code-vulnerability-scanner.ts // Security scans
```

### Contributing Guidelines
1. **Understand "Real Code" Philosophy**: No mock implementations
2. **Respect Multi-AI Architecture**: Smart model routing
3. **Maintain Security Standards**: Prompt sanitization required
4. **Follow Validation Patterns**: Test real functionality
5. **Optimize Performance**: Efficient API usage

---



**Ready to build the future of AI-powered development? Let's make recoder.xyz the tool every developer reaches for.** 🚀