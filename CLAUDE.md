# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 📋 Project Overview

**Recoder.xyz** is an AI-powered development CLI that generates **REAL, PRODUCTION-READY CODE** - not mock implementations. It's a comprehensive development ecosystem with multiple platforms and specialized AI agents.

### Core Mission
- **Real Functionality First**: Every generated line must work in production
- **Multi-AI Intelligence**: Claude + Groq + Gemini + Ollama + OpenAI with smart routing
- **Developer Productivity**: 10x speed without sacrificing quality
- **Enterprise Ready**: Security, compliance, scalability built-in

## 🏗️ Architecture

### High-Level Structure
This is a monorepo using pnpm workspace with the following key components:

```
recoder.xyz/
├── packages/                    # Core packages (pnpm workspace)
│   ├── cli/                    # Main CLI interface (@recoder/cli)
│   ├── shared/                 # Shared utilities and types
│   ├── recoder-cli-router/     # AI model routing system
│   ├── analytics/              # Usage analytics and monitoring
│   ├── intelligence/           # Adaptive AI learning
│   ├── security/               # Security scanning and protection
│   └── plugins/                # Plugin system
├── backend/                    # API server (Express.js + TypeScript)
├── production-engine/          # Real code generation service
├── recoder-web/               # Next.js web application
├── recoder-chat/              # AI chat interface (Next.js)
├── recoder-extension/         # VS Code extension
├── recoder-desktop/           # Electron desktop app
├── recoder-chat-mobile/       # React Native mobile app
└── browser-extension/         # Browser extension
```

### Key Services
- **Backend API** (port 3001): User management, project storage, billing
- **Production Engine** (port 3002): Real code generation and validation
- **CLI**: Primary developer interface with natural language processing
- **Web Platforms**: Multiple web interfaces for different use cases

## 🛠️ Development Commands

### Setup & Installation
```bash
# Quick setup (recommended for development)
npm run setup

# Full setup with all features
npm run setup:full

# Install all dependencies across workspace
pnpm install --recursive
```

### Development
```bash
# Start all services (backend + production engine + web apps)
npm run dev:all

# Individual services
npm run dev:backend      # Backend API (port 3001)
npm run dev:engine       # Production engine (port 3002) 
npm run dev:cli          # CLI in watch mode
npm run dev:web          # Web platform
npm run dev:chat         # Chat platform
npm run dev:mobile       # Mobile app (Expo)
npm run dev:desktop      # Desktop app
```

### Building
```bash
# Build everything
npm run build

# Build specific components
npm run build:cli        # CLI package
npm run build:backend    # Backend API
npm run build:engine     # Production engine
npm run build:web        # Web applications
npm run build:extension  # VS Code extension (creates VSIX)
```

### Testing
```bash
# Run all tests
npm run test

# Test specific areas
npm run test:cli
npm run test:backend
npm run test:integration
```

### Linting & Type Checking
```bash
# Lint all code
npm run lint

# Fix linting issues
npm run lint:fix

# TypeScript type checking
npm run typecheck
```

### Production
```bash
# Production build
npm run production

# Docker containers
npm run docker:build
npm run docker:up
```

## 🔧 Key Technologies

### Core Stack
- **Language**: TypeScript (primary), JavaScript (legacy)
- **Package Manager**: pnpm with workspaces
- **Build System**: Native TypeScript compilation + custom scripts
- **Runtime**: Node.js 18+

### Backend Services
- **API Server**: Express.js with TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Caching**: Redis
- **Authentication**: JWT + OAuth providers
- **Security**: Helmet, CORS, rate limiting

### Frontend Platforms
- **Web**: Next.js 15 with React 19
- **Chat**: Next.js with AI streaming
- **Mobile**: React Native with Expo
- **Desktop**: Electron
- **Extension**: VS Code extension API

### AI Integration
- **Providers**: Anthropic (Claude), Groq, Google (Gemini), OpenAI, Ollama
- **Routing**: Intelligent model selection based on task type
- **Local AI**: Ollama integration for privacy-focused development
- **Caching**: Response caching and consensus systems

## 🚀 CLI Usage Patterns

The CLI supports both traditional commands and natural language:

### Natural Language (Primary Interface)
```bash
recoder "build a Solana DEX with real token swapping"
recoder "add authentication to my React app"
recoder "deploy this to AWS with monitoring"
```

### Traditional Commands
```bash
recoder generate "description" --type web --validate
recoder plan "project description" --detailed
recoder validate ./my-project --fix
recoder chat --model claude-3-sonnet
recoder agent "create smart contract" --consensus
```

## 🔒 Security & Quality

### Built-in Security Features
- AI prompt sanitization to prevent injection attacks
- Code vulnerability scanning with SAST/DAST
- Secret detection and redaction
- Real-time security monitoring
- Compliance checking (GDPR, SOC 2, HIPAA)

### Code Quality Standards
- **Real Functionality**: All generated code must work in production
- **Type Safety**: Full TypeScript implementation across codebase
- **Testing**: Comprehensive test coverage required
- **Performance**: Production-grade optimization

## 💡 Development Guidelines

### Working with AI Systems
1. **Multi-Model Strategy**: Different AI providers excel at different tasks
   - Claude: Complex reasoning, security, blockchain
   - Groq: Fast React/Next.js development
   - Gemini: Large codebase analysis, multimodal
   - Ollama: Local/private development

2. **Context Awareness**: CLI reads project configuration files:
   - `knowledge.md`: Project documentation and conventions
   - `recoder.md`: AI preferences and agent configuration
   - `package.json`: Dependencies and scripts
   - `README.md`: Project overview

### Code Generation Philosophy
1. **Real Over Pretty**: Working functionality trumps elegant code
2. **Production First**: Code must be immediately deployable
3. **Security by Default**: Assume hostile input, build defensively
4. **Validation Required**: All generated code goes through reality validation

### Common Development Tasks

#### Adding New AI Provider
1. Add provider implementation in `packages/cli/src/api/providers/`
2. Update router configuration in `packages/recoder-cli-router/`
3. Add tests in corresponding `__tests__/` directory
4. Update documentation

#### Adding New Command
1. Create command file in `packages/cli/src/commands/`
2. Register in main CLI entry point (`packages/cli/src/index.ts`)
3. Add help documentation and examples
4. Include in test suite

#### Working with Backend API
- Backend runs on port 3001 by default
- API routes are in `backend/src/routes/`
- Authentication required for most endpoints
- Rate limiting and validation middleware included

#### Debugging Tips
- Use `--verbose` flag for detailed logging
- Check service health: `npm run health`
- View analytics: `recoder analytics --health`
- Monitor performance: `curl http://localhost:3001/metrics`

## 📊 Monitoring & Analytics

### Available Metrics
- System health and performance scores
- AI model usage and performance
- Cost analysis and optimization
- Security scan results
- User activity and patterns

### Health Checks
```bash
# Overall system health
npm run health

# Individual service health
curl http://localhost:3001/health  # Backend
curl http://localhost:3002/health  # Production Engine
```

## 🔄 Deployment

### Local Development
All services can run locally with hot reload enabled through the `npm run dev:all` command.

### Production Deployment
- Docker Compose configuration available
- Kubernetes manifests in `deployment/kubernetes/`
- Environment variables required for AI API keys
- Redis and PostgreSQL dependencies

### Environment Configuration
Key environment variables:
```bash
# AI Providers
ANTHROPIC_API_KEY=sk-ant-...
GROQ_API_KEY=gsk_...
GOOGLE_API_KEY=AIza...
OPENAI_API_KEY=sk-...

# Services
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
NODE_ENV=development|production
```

## ⚠️ Important Notes

### Build Status Issues
From the init analysis, be aware that:
1. ✅ recoder-web - Builds successfully 
2. ✅ recoder-chat - Builds successfully 
3. ✅ recoder-extension - Builds successfully (creates VSIX)
4. ❌ backend - Has TypeScript compilation errors 
5. ❌ production-engine - Has missing jest dependency

When working on backend or production-engine, may need to:
```bash
cd backend && npm install && npm run build
cd production-engine && npm install jest && npm run build
```

### Performance Considerations
- Use `pnpm` instead of `npm` for faster installs
- Services are designed to run concurrently
- AI model responses are cached for performance
- Database queries use connection pooling

### Testing Strategy
- Unit tests for individual packages
- Integration tests for API endpoints  
- End-to-end tests for CLI workflows
- Security tests for AI prompt handling

This codebase prioritizes real functionality over mock implementations, with a focus on production-ready code generation through intelligent AI orchestration.

# AITimeMachine Integration

## Before file changes
Call: `before_action({ action: "description" })`

## After changes  
Call: `after_action({ action: "what was done", success: true })`
