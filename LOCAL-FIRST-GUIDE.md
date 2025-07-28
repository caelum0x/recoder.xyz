# 🚀 Local-First Development Guide

**Recoder.xyz works great without any API keys!** This guide shows you what works locally vs what requires cloud AI providers.

## 🎯 **TL;DR - Quick Start (No API Keys)**

```bash
# 1. Install Ollama (local AI)
brew install ollama

# 2. Download a coding model
ollama pull tinyllama

# 3. Start Ollama
ollama serve

# 4. Test CLI (no API keys needed!)
cd packages/cli
npm run dev
npx tsx src/index.ts generate "hello world in javascript"
```

**✅ That's it! You now have a working AI-powered development CLI.**

---

## 🤖 **What Works WITHOUT API Keys (Ollama Only)**

### **✅ CLI Features (100% Functional)**
- **Code Generation**: Generate any type of application code
- **Multiple Languages**: JavaScript, TypeScript, Python, React, Vue, etc.
- **Real File Writing**: Generated files are actually written to disk
- **Project Analysis**: Analyzes existing projects and generates contextual code
- **Security Scanning**: Basic security validation of generated code
- **Agent System**: 7 specialized AI agents (Web, Blockchain, Mobile, etc.)
- **Chat Interface**: Interactive AI chat for development assistance
- **Validation**: Code functionality and production-readiness checks

### **✅ Backend Features (Functional with Limitations)**
- **User Management**: Registration, login, sessions
- **Local Database**: PostgreSQL-based user and project storage
- **API Endpoints**: Full REST API for all core features
- **Request Routing**: Intelligent routing to Ollama for AI requests
- **Basic Analytics**: Usage tracking and monitoring
- **File Management**: Project storage and organization

### **✅ Web Interface (Core Features)**
- **Dashboard**: User interface for managing projects
- **Code Editor**: Basic code editing and preview
- **Project Browser**: Browse and organize generated projects
- **Local Authentication**: User accounts without external dependencies
- **Responsive Design**: Mobile-friendly interface

### **✅ Production Engine (Fully Functional)**
- **Code Generation**: Production-ready code synthesis
- **Template System**: Customizable code templates
- **Multi-file Support**: Complex project structures
- **Real Implementation**: No mock code, everything works

---

## 🌐 **What Requires API Keys (Cloud Enhanced)**

### **⭐ Enhanced AI Capabilities**
- **Claude Integration**: Complex reasoning, security analysis, blockchain
- **GPT-4 Integration**: Advanced language understanding and generation
- **Gemini Integration**: Multimodal capabilities, large file analysis
- **Multiple Models**: Access to 10+ AI providers for specialized tasks

### **💳 Payment Features**
- **Stripe Integration**: Premium subscriptions and billing
- **Usage Quotas**: Advanced usage tracking and limits
- **Premium Features**: Priority processing, advanced models

### **📧 Communications**
- **Email Notifications**: Account updates, project sharing
- **Slack/Discord**: Team collaboration features
- **GitHub Integration**: Repository synchronization

### **🔍 Advanced Analytics**
- **Usage Analytics**: Detailed performance metrics
- **Error Tracking**: Advanced error monitoring and reporting
- **A/B Testing**: Feature experimentation

---

## 📊 **Feature Comparison Matrix**

| Feature | Local (Ollama) | Cloud (API Keys) | Notes |
|---------|----------------|------------------|-------|
| **Code Generation** | ✅ Full | ⭐ Enhanced | Local works great, cloud adds advanced models |
| **File Writing** | ✅ Yes | ✅ Yes | Identical functionality |
| **Security Scanning** | ✅ Basic | ⭐ Advanced | Local has core scanning, cloud adds deep analysis |
| **Agent System** | ✅ 7 Agents | ⭐ 7 Agents | Same agents, cloud models are more capable |
| **Web Interface** | ✅ Full | ✅ Full | Identical core functionality |
| **User Management** | ✅ Local | ⭐ Enhanced | Local DB vs cloud sync |
| **Payment Processing** | ❌ No | ✅ Yes | Requires Stripe API keys |
| **Email Features** | ❌ No | ✅ Yes | Requires SMTP/SendGrid |
| **Advanced Analytics** | ✅ Basic | ⭐ Advanced | Local metrics vs cloud insights |
| **Multi-Model AI** | ⭐ 1 Model | ⭐ 15+ Models | Ollama vs Claude+GPT+Gemini+more |

---

## 🛠️ **Local Development Setup**

### **1. Prerequisites (Required)**
```bash
# Install Node.js and npm
brew install node

# Install PostgreSQL
brew install postgresql
brew services start postgresql

# Install Ollama (Local AI)
brew install ollama

# Install Redis (Optional, for caching)
brew install redis
```

### **2. Database Setup**
```bash
# Create database
createdb recoder_db

# The backend will automatically create tables on first run
```

### **3. AI Models Setup**
```bash
# Start Ollama service
ollama serve

# Download recommended models (in order of priority)
ollama pull tinyllama          # Fastest, smallest (637MB)
ollama pull phi3:mini          # Better quality (2.2GB)  
ollama pull deepseek-coder     # Best for coding (6.9GB)
ollama pull llama3             # Best overall (4.7GB)

# Check installed models
ollama list
```

### **4. Start All Services**
```bash
# Terminal 1: Backend
cd backend
npm install
npm run dev    # Starts on port 3001

# Terminal 2: Production Engine  
cd production-engine
npm install
npm run dev    # Starts on port 3002

# Terminal 3: Web Interface
cd recoder-web  
npm install
npm run dev    # Starts on port 3000

# Terminal 4: CLI Router (Optional)
cd packages/recoder-cli-router
npm install
npm run dev    # Starts on port 8080

# Terminal 5: Test CLI
cd packages/cli
npm install
npx tsx src/index.ts generate "hello world app"
```

---

## 🎯 **Recommended Local-First Workflow**

### **Phase 1: Pure Local (No API Keys)**
1. **Set up Ollama** with `tinyllama` model
2. **Test CLI** code generation
3. **Start Backend** for user management
4. **Use Web Interface** for project management

### **Phase 2: Enhanced Local (Optional Models)**
1. **Upgrade Models**: Add `deepseek-coder` and `llama3`
2. **Performance Tuning**: Optimize model selection
3. **Advanced Features**: Use specialized agents

### **Phase 3: Cloud Enhanced (Add API Keys Gradually)**
1. **Add Claude Key**: For complex reasoning and security
2. **Add Groq Key**: For fastest inference
3. **Add Gemini Key**: For multimodal capabilities
4. **Enable Payments**: Add Stripe for monetization

---

## 🚨 **Common Issues & Solutions**

### **"No AI providers available"**
```bash
# Check if Ollama is running
ollama list

# If not running, start it
ollama serve

# If no models, install one
ollama pull tinyllama
```

### **"Production engine not available"**
```bash
# The CLI works without production engine
# It falls back to local AI generation
# This is normal and expected!
```

### **"Database connection failed"**
```bash
# Make sure PostgreSQL is running
brew services start postgresql

# Create the database if it doesn't exist
createdb recoder_db
```

### **"Files not being written"**
- ✅ **Fixed!** The latest version writes files properly
- Generated code is saved to the specified output directory
- Check the console output for file paths

---

## 💡 **Pro Tips for Local Development**

### **Model Selection Strategy**
- **Start with**: `tinyllama` (fastest)
- **Upgrade to**: `phi3:mini` (better quality)  
- **Ultimate**: `deepseek-coder` (best for coding)

### **Performance Optimization**
- Use smaller models for rapid iteration
- Switch to larger models for complex projects
- Keep Ollama running in the background

### **Development Workflow**
1. Use CLI for quick code generation
2. Use Web interface for project management
3. Use Backend API for custom integrations
4. Add cloud AI when you need advanced features

---

## 🌟 **Why Local-First Works**

### **✅ Privacy**: Your code never leaves your machine
### **✅ Cost**: No API costs, unlimited usage
### **✅ Speed**: No network latency for AI requests  
### **✅ Reliability**: Works offline, no external dependencies
### **✅ Control**: Choose your own models and configuration

---

## 🚀 **Next Steps**

1. **Start Local**: Get everything working with Ollama
2. **Test Features**: Try all CLI commands and web interface
3. **Build Projects**: Generate real applications
4. **Scale Up**: Add API keys when you need advanced features
5. **Deploy**: Use the production configurations

**Remember: Recoder.xyz is designed to work great locally first, with cloud enhancement as an optional upgrade!**