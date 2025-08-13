# Recoder Desktop - Unified Multi-App Interface

The unified Recoder Desktop application integrates the Extension, Chat, and Web platforms into a single desktop experience with seamless AI capabilities.

## 🏗️ Architecture

### Unified Interface
- **Single Window**: Tabbed interface hosting all three applications
- **Separate Windows**: Optional mode for individual app windows
- **Cross-App Communication**: Shared AI models and data between apps
- **Native Features**: System integration, notifications, global shortcuts

### Integrated Applications
1. **Extension** - VS Code extension webview with development tools
2. **Chat** - AI chat interface for conversational coding
3. **Web** - Full web platform with code generation and project management

## 🚀 Quick Start

### Development Mode
```bash
# Start in unified mode (new default)
npm run dev

# Start legacy single-app mode
npm run dev:legacy
```

### Production Build
```bash
# Build all integrated apps and desktop bundle
npm run build

# Build for specific platforms
npm run build-mac
npm run build-win  
npm run build-linux
```

## 📁 File Structure

```
recoder-desktop/
├── src/
│   ├── main-unified.js         # Unified main process
│   ├── main.js                 # Legacy main process
│   ├── preload-unified.js      # Enhanced preload script
│   ├── preload.js              # Legacy preload script
│   ├── unified-interface.html  # Generated unified UI
│   ├── app-urls.json          # App URL configuration (generated)
│   └── ai-providers.js         # AI provider implementations
├── scripts/
│   └── build-apps.js          # Build script for all apps
├── app-bundles/               # Built app distributions (generated)
│   ├── extension/
│   ├── chat/
│   └── web/
└── assets/                    # Desktop app assets
```

## 🎛️ Features

### Unified Interface
- **Tab Navigation**: Switch between Extension, Chat, and Web apps
- **Layout Toggle**: Switch between unified and separate window modes
- **Theme Sync**: Synchronized theming across all applications
- **Global Shortcuts**: 
  - `Cmd/Ctrl+Shift+R`: Toggle main window
  - `Cmd/Ctrl+Shift+A`: Quick AI assistant

### AI Integration
- **Local AI Support**: Ollama and LM Studio integration
- **Cloud AI Providers**: Anthropic, OpenAI, Groq, Gemini
- **Smart Routing**: Automatic selection of best AI provider
- **Cross-App Sharing**: Share AI conversations and models between apps

### System Integration
- **System Tray**: Background operation with tray icon
- **Notifications**: Native system notifications
- **File System**: Direct file access and project management
- **Auto-Updates**: Automatic application updates
- **Power Monitoring**: Battery/AC power awareness

## 🔧 Configuration

### App URLs
The desktop app automatically detects and uses:
- **Development**: Local dev servers (localhost:3000, 3003, etc.)
- **Production**: Bundled applications or remote URLs
- **Fallback**: Remote Recoder.xyz URLs

### AI Providers
Configure AI providers through the application or environment variables:
```bash
ANTHROPIC_API_KEY=your_key_here
OPENAI_API_KEY=your_key_here
GROQ_API_KEY=your_key_here
```

## 🧪 Development

### Testing the Integration
1. **Start Development Servers**:
   ```bash
   # In separate terminals, start each app:
   cd ../recoder-chat && npm run dev    # Port 3003
   cd ../recoder-web && npm run dev     # Port 3000
   cd ../recoder-extension && npm run dev # Extension dev mode
   ```

2. **Start Desktop App**:
   ```bash
   npm run dev
   ```

3. **Test Features**:
   - Tab switching between applications
   - AI functionality across all apps
   - Cross-app communication
   - Theme synchronization
   - Window management

### Build Process
The build process:
1. **Pre-build**: `build-apps.js` builds all integrated applications
2. **Bundle**: Copies built apps to `app-bundles/` directory
3. **Package**: Electron Builder creates desktop installers

## 🎯 Usage Scenarios

### For Developers
- **Code in Extension**: Use VS Code extension for development
- **Chat for Help**: Switch to AI chat for coding assistance
- **Web for Projects**: Manage projects in the web platform
- **Seamless AI**: Same AI context across all applications

### For Teams
- **Shared Projects**: Projects sync across all interfaces
- **Collaborative AI**: Share AI conversations and models
- **Unified Workspace**: Single app for all development needs

## 🔍 Troubleshooting

### Common Issues

1. **Apps not loading**:
   - Check if development servers are running
   - Verify app URLs in console
   - Try refreshing with `Cmd/Ctrl+R`

2. **AI not working**:
   - Test local AI connection via menu: AI → Test Local AI
   - Verify API keys for cloud providers
   - Check network connectivity

3. **Theme issues**:
   - Use View → Toggle theme or system preferences
   - Check if individual apps support theme switching

### Debug Mode
```bash
# Enable debug logging
DEBUG=1 npm run dev

# Open DevTools automatically
ELECTRON_ENABLE_DEVTOOLS=1 npm run dev
```

## 📈 Performance

### Optimizations
- **Lazy Loading**: Apps load only when first accessed
- **Memory Management**: Efficient webview management
- **Caching**: AI responses and app states cached
- **Background Processing**: Non-blocking AI operations

### System Requirements
- **Memory**: 4GB RAM minimum, 8GB recommended
- **Storage**: 2GB free space for full installation
- **Network**: Internet connection for cloud AI and updates
- **Platform**: macOS 10.14+, Windows 10+, Linux (Ubuntu 18.04+)

## 🚢 Deployment

### Distribution
```bash
# Build for all platforms
npm run dist-all

# Platform-specific builds
npm run dist-mac
npm run dist-win
npm run dist-linux
```

### Auto-Updates
The app includes automatic update functionality:
- Checks for updates on startup
- Downloads updates in background
- Prompts user for installation

### Installation Packages
- **macOS**: DMG and ZIP archives
- **Windows**: NSIS installer and portable EXE
- **Linux**: AppImage, DEB, RPM, and TAR.GZ

## 🤝 Contributing

To contribute to the unified desktop app:

1. Test the integration across all three applications
2. Ensure AI functionality works in all contexts
3. Verify cross-app communication features
4. Test on multiple platforms (macOS, Windows, Linux)
5. Document any new features or changes

## 📝 License

MIT License - see LICENSE file for details

---

**Recoder Desktop v1.0.0** - The ultimate AI-powered development environment