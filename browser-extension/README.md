# 🔌 Recoder.xyz Local AI Bridge Extension

Browser extension that seamlessly connects www.recoder.xyz to your local AI models (Ollama/LM Studio) without any proxy setup!

## 🚀 Why This Extension?

Web browsers block HTTPS sites from accessing HTTP localhost services for security. This extension bridges that gap:

- **🔓 Bypass Browser Security** - Direct access to localhost AI services
- **🆓 Free Local AI** - Use Ollama/LM Studio without API costs
- **🔒 Privacy First** - Your code never leaves your machine
- **⚡ Zero Setup** - Install and it just works
- **🎯 Seamless Integration** - Works perfectly with recoder.xyz

## 📦 Installation

### Option 1: From Chrome Web Store (Coming Soon)
1. Visit Chrome Web Store
2. Search "Recoder Local AI Bridge"
3. Click "Add to Chrome"
4. Enable in Extensions menu

### Option 2: Developer Mode (Available Now)
1. Download or clone this repository
2. Open Chrome → More Tools → Extensions
3. Enable "Developer mode" (top right)
4. Click "Load unpacked"
5. Select the `browser-extension` folder
6. Extension icon appears in toolbar

### Option 3: Firefox Add-ons (Coming Soon)
1. Visit Firefox Add-ons
2. Search "Recoder Local AI Bridge"
3. Click "Add to Firefox"

## 🎯 How It Works

### Automatic Detection
The extension automatically detects when you visit:
- https://recoder.xyz/chat
- https://www.recoder.xyz/chat

### Bridge Functionality
1. **Injects Bridge Script** - Adds `window.RecoderLocalAI` API
2. **Tests Connections** - Checks localhost:11434 (Ollama) and localhost:1234 (LM Studio)
3. **Proxies Requests** - Forwards AI requests to local services
4. **Status Updates** - Real-time connection monitoring

### Supported Services
- **Ollama** (`http://localhost:11434`) - Primary local AI
- **LM Studio** (`http://localhost:1234`) - Alternative local AI

## 🔧 Setup Requirements

### Install Local AI First
You need at least one local AI service running:

#### Ollama (Recommended)
```bash
# Install Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# Download coding model
ollama pull qwen2.5-coder:7b

# Start Ollama (auto-starts)
ollama serve
```

#### LM Studio
1. Download from https://lmstudio.ai
2. Install and open LM Studio
3. Download "qwen2.5-coder" or similar model
4. Start local server (port 1234)

### Verify Installation
1. Install extension
2. Start Ollama or LM Studio
3. Visit https://recoder.xyz/chat
4. Look for "🔌 Local AI Bridge Active" in console
5. Extension badge shows ✓ (green) or ✗ (red)

## 🎮 Usage

### Automatic Integration
Once installed, the extension works automatically:

1. **Visit** https://recoder.xyz/chat
2. **Extension activates** and injects local AI bridge
3. **Web app detects** local AI automatically
4. **Start coding** with unlimited free AI!

### Extension Popup
Click the extension icon to see:
- **Connection Status** - Ollama and LM Studio status
- **Test Connection** - Manual connection testing
- **Setup Instructions** - Quick help if needed

### Web App Integration
The web app automatically detects the extension and:
- Shows "Local AI Active" status
- Prioritizes local models over cloud APIs
- Displays unlimited usage indicators
- Provides setup help if needed

## 🛠️ Development

### Build from Source
```bash
# Clone repository
git clone https://github.com/recoder-xyz/browser-extension.git
cd browser-extension

# No build step needed - pure JavaScript/HTML/CSS
# Just load the folder as unpacked extension
```

### File Structure
```
browser-extension/
├── manifest.json        # Extension configuration
├── background.js        # Service worker (main logic)
├── content-script.js    # Injected into recoder.xyz
├── bridge.js           # Local AI bridge API
├── popup.html          # Extension popup UI
├── popup.js            # Popup functionality
├── icons/              # Extension icons
└── README.md           # This file
```

### Key Components

#### manifest.json
- Extension metadata and permissions
- Defines content scripts and background workers
- Specifies allowed hosts and permissions

#### background.js
- Tests connections to localhost services
- Proxies requests from web to local AI
- Updates extension badge status

#### content-script.js
- Injects bridge script into recoder.xyz
- Forwards messages between page and extension
- Notifies page when extension is ready

#### bridge.js
- Provides `window.RecoderLocalAI` API
- Handles AI generation requests
- Manages connection status and testing

## 🔒 Security & Privacy

### Permissions Explained
- `activeTab` - Access current tab when extension is used
- `storage` - Store connection status and preferences
- `background` - Run service worker for local AI testing
- `localhost:*` - Connect to local AI services only

### Privacy Benefits
- **No data collection** - Extension doesn't track usage
- **Local processing** - AI runs on your machine only
- **No external requests** - Only connects to localhost
- **Open source** - Inspect all code yourself

### Security Features
- **Origin validation** - Only works on recoder.xyz domains
- **Localhost only** - Cannot connect to external services
- **No code injection** - Uses secure message passing
- **Permission minimal** - Only requests necessary permissions

## 📊 Status Indicators

### Extension Badge
- **✓ Green** - Local AI connected and working
- **✗ Red** - No local AI found
- **⚠️ Yellow** - Partial connection (some services working)

### Web App Integration
- **🎉 Local AI Active** - Extension working, unlimited usage
- **⚠️ Cloud AI Only** - No local AI, using paid APIs
- **❌ No AI Available** - Need to setup local AI or API keys

## 🔧 Troubleshooting

### Common Issues

**Extension not working**
- Refresh recoder.xyz page after installing
- Check that extension is enabled
- Look for console errors (F12 → Console)

**Can't detect Ollama**
- Ensure Ollama is running: `ollama list` should work
- Check port 11434 is available
- Try restarting Ollama: `ollama serve`

**LM Studio not detected**
- Make sure local server is started in LM Studio
- Check port 1234 is available
- Verify model is loaded and server running

**Permission denied**
- Extension needs localhost permissions
- Try reloading extension in developer mode
- Check Chrome security settings

### Debug Mode
1. Open Chrome DevTools (F12)
2. Go to Console tab
3. Look for messages starting with "🔌 Recoder"
4. Check Network tab for localhost requests

## 🔗 Links

- **Main Website**: https://recoder.xyz
- **Web Chat**: https://recoder.xyz/chat (where extension works)
- **Desktop App**: Alternative with native local AI access
- **GitHub**: https://github.com/recoder-xyz/browser-extension
- **Issues**: Report bugs and feature requests

## 📝 License

MIT License - see [LICENSE](LICENSE) for details.

## 🤝 Contributing

1. Fork the repository
2. Make your changes
3. Test with both Ollama and LM Studio
4. Submit a pull request

### Testing Checklist
- [ ] Extension loads without errors
- [ ] Connects to Ollama (if running)
- [ ] Connects to LM Studio (if running)  
- [ ] Badge updates correctly
- [ ] Web app detects extension
- [ ] AI generation works through extension
- [ ] Error handling works when services offline

## 🆘 Support

### Getting Help
- 📧 Email: support@recoder.xyz
- 💬 Discord: Join our developer community
- 🐛 GitHub: Report issues with detailed logs
- 📚 Docs: Full guides at docs.recoder.xyz

### Before Reporting Issues
1. Check extension is enabled and up-to-date
2. Verify local AI is running (test with `curl`)
3. Include browser console logs
4. Specify which local AI service you're using

---

**Made with 💙 for developers who value privacy and free local AI**

*Bridge the gap between your browser and local AI models!*