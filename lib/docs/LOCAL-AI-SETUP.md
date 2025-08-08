# 🆓 Free Local AI Setup Guide

## Quick Start (5 Minutes)

Get started with Recoder.xyz completely free using local AI models - no API keys required!

### 1. Automatic Setup ✨

The easiest way to get started:

```bash
# Start any Recoder platform
cd recoder-web && pnpm dev
# or
cd recoder-chat && pnpm dev

# Local AI will auto-install on first use!
```

When you first use AI features, Recoder will:
- ✅ Detect your system capabilities
- ✅ Auto-install Ollama (local AI engine) 
- ✅ Download the best model for your system
- ✅ Start providing AI assistance immediately

### 2. Manual Setup (Advanced Users)

If you prefer manual control:

```bash
# Install Ollama directly
curl -fsSL https://ollama.ai/install.sh | sh

# Download recommended coding model
ollama pull qwen2.5-coder:7b

# Start using Recoder with local AI!
```

---

## 🎯 Model Recommendations

### For Beginners (4-8GB RAM)
- **Llama 3.2 3B** - 2GB, fast responses, great for learning
- **DeepSeek Coder 6.7B** - 3.8GB, excellent code generation

### For Developers (8-16GB RAM) 
- **Qwen2.5 Coder 7B** ⭐ **RECOMMENDED** - 4.4GB, best code quality
- **Mistral 7B** - 4.1GB, versatile for coding + general tasks

### For Power Users (16GB+ RAM)
- **CodeLlama 13B** - 7.4GB, Meta's specialized coding model
- **Phi-3 Medium** - 7.9GB, Microsoft's advanced reasoning model

---

## 🚀 Platform Integration

### Web Platform (port 3000)
```bash
cd recoder-web
pnpm dev
```
- Navigate to AI features
- Select local model from dropdown
- Start coding with free AI!

### Chat Platform (port 3001) 
```bash
cd recoder-chat  
pnpm dev
```
- Click model selector
- Choose local model
- Chat with AI for free!

### Mobile App
```bash
cd recoder-chat-mobile
npm start
```
- Open model settings
- Toggle "Use Local AI"
- Enjoy AI on mobile!

---

## 🔧 Advanced Configuration

### Model Management UI

Access the model manager in any platform:
- **Web**: Settings → AI Models
- **Chat**: Click gear icon → Models  
- **Mobile**: Profile → AI Settings

### Smart Routing Configuration

```typescript
import { localAI } from '@/lib/services/LocalAIIntegration';

// Prefer local models
localAI.updateConfig({
  preferLocal: true,
  maxCostPerRequest: 0.05, // $0.05 max per request
  fallbackToCloud: true,   // Use cloud if local fails
  autoDownloadRecommended: true
});
```

### Custom Model Setup

```bash
# Add any Ollama model
ollama pull llama3.1:8b
ollama pull codestral:22b
ollama pull phi3:medium

# They'll automatically appear in Recoder!
```

---

## 🎚️ Performance Optimization

### GPU Acceleration (Optional)

If you have an NVIDIA GPU:

```bash
# Install NVIDIA drivers
# Ollama will automatically use GPU acceleration!

# Check GPU usage
nvidia-smi
```

### Memory Management

```typescript
// Configure memory usage
const config = {
  maxConcurrentModels: 1,    // Only load 1 model at a time
  modelSwapTimeout: 300,     // Unload after 5 minutes  
  enableModelCache: true     // Cache responses
};
```

### Storage Management

```bash
# Check model storage usage
ollama list

# Remove unused models  
ollama rm old-model-name

# Recoder shows storage stats in UI
```

---

## 🔍 Troubleshooting

### Common Issues

**"No models available"**
```bash
# Check if Ollama is running
ollama list

# If not running:
ollama serve

# Download a model
ollama pull qwen2.5-coder:7b
```

**"Model download failed"**
- Check internet connection
- Ensure sufficient disk space
- Try downloading smaller model first

**"Slow responses"**
- Close other applications
- Try smaller model (3B instead of 7B)
- Enable GPU acceleration if available

### System Requirements

| Model Size | RAM Needed | Disk Space | Speed |
|------------|------------|------------|--------|
| 3B | 4GB | 2GB | Very Fast |
| 7B | 8GB | 5GB | Fast |  
| 13B | 16GB | 8GB | Good |
| 22B+ | 32GB | 15GB+ | Slower |

### Performance Tips

1. **Close unused applications** - More RAM = better performance
2. **Use SSD storage** - Faster model loading
3. **Enable GPU** - 5-10x speed improvement
4. **Choose right model** - Balance quality vs speed

---

## 📊 Usage Analytics

### Monitor Your Usage

The AI system tracks:
- ✅ Requests per day/month
- ✅ Response times  
- ✅ Model usage statistics
- ✅ Cost savings vs cloud APIs

### Cost Comparison

| Service | Cost | Recoder Local AI |
|---------|------|------------------|
| OpenAI GPT-4 | $0.03/1k tokens | **FREE** ✅ |
| Anthropic Claude | $0.015/1k tokens | **FREE** ✅ |
| Google Gemini | $0.0025/1k tokens | **FREE** ✅ |
| **Your Savings** | **$50-200/month** | **$0** 🎉 |

---

## 🤝 Getting Help

### Built-in Help
- **Web Platform**: Help → Local AI Guide
- **Chat Platform**: Type "/help local-ai"
- **Mobile**: Settings → Help → Local AI

### Community Support
- **GitHub Issues**: Technical problems
- **Discord**: Real-time chat support  
- **Documentation**: Comprehensive guides

### Professional Support
- **Enterprise**: Priority technical support
- **Custom Models**: Model fine-tuning services
- **Training**: Team onboarding sessions

---

## 🎉 Success! You're Ready

Once setup is complete, you'll have:

✅ **Free AI assistance** - No monthly costs  
✅ **Privacy-first** - Code stays on your machine  
✅ **Fast responses** - No network latency  
✅ **Always available** - Works offline  
✅ **Professional quality** - Excellent code generation  

Start building amazing projects with free local AI! 🚀

---

**Need Premium Features?** You can always add API keys later for:
- ⚡ Ultra-fast cloud models (Groq)
- 🧠 Advanced reasoning (Claude)  
- 🖼️ Multimodal capabilities (GPT-4V)
- 🌐 Latest model updates

But for 90% of coding tasks, free local AI is perfect! 💯