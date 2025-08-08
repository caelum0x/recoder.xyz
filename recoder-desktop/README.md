# 🖥️ Recoder Desktop

The ultimate AI-powered development environment with **direct local AI access** - no proxy setup required!

## 🌟 Why Desktop?

Unlike web browsers that block HTTP→HTTPS requests, the desktop app provides:

- **🔓 Direct Local AI Access** - No HTTPS proxy setup needed
- **⚡ Native Performance** - Better than browser performance
- **🔒 Maximum Privacy** - Your code never leaves your machine
- **🎯 Seamless Integration** - Works with Ollama and LM Studio out of the box
- **🔄 Auto-Updates** - Always get the latest features

## 🚀 Quick Start

### 1. Install Local AI (Optional but Recommended)

#### Option A: Ollama (Recommended)
```bash
# Install Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# Download coding model
ollama pull qwen2.5-coder:7b

# Start Ollama (runs automatically)
ollama serve
```

#### Option B: LM Studio
1. Download from https://lmstudio.ai
2. Install and open LM Studio
3. Download "qwen2.5-coder" or similar model
4. Start the local server (port 1234)

### 2. Install Desktop App

#### From Source (Development)
```bash
# Clone repository
git clone https://github.com/recoder-xyz/recoder-desktop.git
cd recoder-desktop

# Install dependencies
npm install

# Run in development
npm run dev

# Build for your platform
npm run build
```

#### Download Releases (Coming Soon)
- **macOS**: Download `.dmg` from releases
- **Windows**: Download `.exe` from releases  
- **Linux**: Download `.AppImage` from releases

## 🎯 Features

### ✅ What Works Now
- **Direct localhost access** to Ollama and LM Studio
- **Full web app functionality** embedded in native app
- **Auto-detection** of local AI services
- **Real-time status monitoring** of AI providers
- **Native menus and shortcuts**
- **Auto-updater** for seamless updates

### 🔄 Local AI Integration
The desktop app automatically detects and connects to:

1. **Ollama** at `http://localhost:11434`
2. **LM Studio** at `http://localhost:1234`
3. **Cloud providers** as fallback (with API keys)

### 📋 AI Provider Priority
1. 🆓 **Ollama** (FREE) - qwen2.5-coder:7b, mistral:7b
2. 🆓 **LM Studio** (FREE) - Your custom models
3. 💰 **Groq** - Fast inference
4. 💰 **Claude** - High quality
5. 💰 **OpenAI** - General purpose
6. 💰 **xAI** - Backup option

## 🛠️ Development

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Git

### Setup
```bash
# Clone the repository
git clone https://github.com/recoder-xyz/recoder-desktop.git
cd recoder-desktop

# Install dependencies
npm install

# Development mode
npm run dev

# Build for production
npm run build

# Package for distribution
npm run dist
```

### Project Structure
```
recoder-desktop/
├── src/
│   ├── main.js          # Main process (Electron)
│   ├── preload.js       # Preload script (secure bridge)
│   └── ...
├── assets/
│   ├── icon.png         # App icon
│   ├── entitlements.mac.plist
│   └── ...
├── package.json         # Dependencies & build config
└── README.md
```

### Build Scripts
- `npm run start` - Start the app
- `npm run dev` - Development mode with DevTools
- `npm run build` - Build for current platform
- `npm run build-mac` - Build for macOS
- `npm run build-win` - Build for Windows
- `npm run build-linux` - Build for Linux
- `npm run dist` - Build and package for distribution

## 🔧 Configuration

### Environment Variables
Create `.env` in the project root:

```bash
# Development mode
NODE_ENV=development

# Local AI endpoints (auto-detected)
OLLAMA_BASE_URL=http://localhost:11434
LM_STUDIO_BASE_URL=http://localhost:1234

# Cloud API keys (optional)
ANTHROPIC_API_KEY=your-key-here
GROQ_API_KEY=your-key-here
OPENAI_API_KEY=your-key-here
```

### App Settings
The app auto-configures based on available services:
- **Local AI detected** → Uses free local models
- **No local AI** → Prompts for cloud API keys
- **Mixed setup** → Prioritizes local, falls back to cloud

## 📱 Desktop-Specific Features

### Native Integration
- **Menu bar integration** with AI status
- **Keyboard shortcuts** for common actions
- **System notifications** for AI events
- **File system access** for project management
- **Clipboard integration** for code sharing

### AI Menu
- `Cmd/Ctrl + Shift + A` - Test Local AI
- `Cmd/Ctrl + Shift + G` - Generate Code
- `Cmd/Ctrl + Shift + S` - AI Settings

### Performance Optimizations
- **Native rendering** instead of browser engine
- **Direct API calls** without web security restrictions
- **Optimized memory usage** for long coding sessions
- **Background AI processing** without UI blocking

## 🛡️ Security & Privacy

### Local AI Benefits
- **No data leaves your machine** when using Ollama/LM Studio
- **No API call logs** stored externally
- **Private model training** possible with local models
- **Offline capable** for sensitive projects

### Security Features
- **Secure preload scripts** prevent code injection
- **Sandboxed renderer** for web content
- **Encrypted preferences** storage
- **Auto-update verification** with signatures

## 📊 Performance

### System Requirements
- **macOS**: 10.14+ (Intel/Apple Silicon)
- **Windows**: Windows 10+ (64-bit)
- **Linux**: Ubuntu 18.04+ or equivalent
- **RAM**: 4GB minimum, 8GB+ recommended
- **Disk**: 500MB for app + models storage

### Local AI Models
- **qwen2.5-coder:7b**: ~4.5GB (recommended for coding)
- **mistral:7b-instruct**: ~4.1GB (good for reasoning)
- **codellama:13b**: ~7.4GB (specialized for code)

## 🔗 Links

- **Main Website**: https://recoder.xyz
- **Web Chat**: https://recoder.xyz/chat  
- **Documentation**: https://docs.recoder.xyz
- **GitHub**: https://github.com/recoder-xyz/recoder-desktop
- **Issues**: https://github.com/recoder-xyz/recoder-desktop/issues

## 📝 License

MIT License - see [LICENSE](LICENSE) for details.

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 🆘 Support

### Common Issues

**Q: App won't detect Ollama**
A: Make sure Ollama is running: `ollama serve`

**Q: "Permission denied" on macOS**
A: Right-click app → "Open" to bypass Gatekeeper

**Q: Slow performance**
A: Close unnecessary apps, ensure enough RAM for AI models

**Q: Can't connect to local AI**
A: Check if ports 11434 (Ollama) or 1234 (LM Studio) are available

### Getting Help
- 📧 Email: support@recoder.xyz
- 💬 Discord: [Join our community](https://discord.gg/recoder)
- 🐛 GitHub Issues: Report bugs and feature requests
- 📚 Docs: Comprehensive guides at docs.recoder.xyz

---

**Made with ❤️ by the Recoder team**

*Desktop app for developers who value privacy, performance, and the power of local AI.*