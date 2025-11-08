# 🎨 Recoder Code Companion for VS Code

**Seamless AI-Powered Coding Assistant Integration for Visual Studio Code**

The official VS Code extension for Recoder Code - brings AI assistance directly into your editor with native diff viewing, file context tracking, and intelligent code suggestions.

[![Version](https://img.shields.io/visual-studio-marketplace/v/recoder.recoder-code-vscode-companion)](https://marketplace.visualstudio.com/items?itemName=recoder.recoder-code-vscode-companion)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/recoder.recoder-code-vscode-companion)](https://marketplace.visualstudio.com/items?itemName=recoder.recoder-code-vscode-companion)
[![Rating](https://img.shields.io/visual-studio-marketplace/r/recoder.recoder-code-vscode-companion)](https://marketplace.visualstudio.com/items?itemName=recoder.recoder-code-vscode-companion)

## ✨ Features

### 📂 Smart File Context
Recoder Code automatically tracks:
- All open files in your editor
- Currently selected text
- Cursor position and active file
- Your project structure

This gives the AI rich context about what you're working on.

### ✏️ Native Diff Viewing
- View AI-suggested code changes side-by-side
- Accept or reject changes with one click
- Edit suggestions before accepting
- Keyboard shortcuts for quick actions (Ctrl+S / Cmd+S)

### 🚀 Quick Launch
- Start Recoder Code directly from Command Palette
- Automatic terminal integration
- Seamless workflow integration

### 🔄 Real-Time Synchronization
- File changes sync automatically
- Selection tracking
- Context updates in real-time

## 📦 Installation

### From VS Code Marketplace

1. Open VS Code
2. Go to Extensions (Cmd+Shift+X / Ctrl+Shift+X)
3. Search for "Recoder Code Companion"
4. Click **Install**

### From Command Line

```bash
code --install-extension recoder.recoder-code-vscode-companion
```

### From VSIX File

```bash
code --install-extension recoder-code-vscode-companion-1.0.0.vsix
```

## 🚀 Quick Start

### 1. Install the Extension
Follow the installation steps above.

### 2. Install Recoder Code CLI

```bash
npm install -g recoder-code-cli
```

### 3. Open Your Project in VS Code

```bash
code /path/to/your/project
```

### 4. Start Recoder Code

**Option A:** From Command Palette
- Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
- Type "Recoder Code: Run"
- Press Enter

**Option B:** From Terminal
- Open integrated terminal (Ctrl+`)
- Run `recoder-code`

### 5. Start Coding!

The extension will automatically:
- Track your open files
- Monitor your selections
- Provide context to the AI
- Show diff views for suggested changes

## ⌨️ Commands

Access commands via Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`):

### `Recoder Code: Run`
Start a new Recoder Code session in the integrated terminal.

### `Recoder Code: Accept Current Diff`
Accept the AI-suggested code changes shown in the diff view.
- **Keyboard Shortcut:** `Ctrl+S` / `Cmd+S` (when diff is visible)

### `Recoder Code: Close Diff Editor`
Close the diff view without accepting changes.

### `Recoder Code: View Third-Party Notices`
View open source licenses and attributions.

## 🎯 Usage Examples

### Example 1: Code Review

1. Open a file you want reviewed
2. Run Recoder Code from Command Palette
3. Ask: "Review this file for potential issues"
4. View suggested changes in diff view
5. Accept or reject changes

### Example 2: Refactoring

1. Select code you want to refactor
2. Start Recoder Code
3. Ask: "Refactor this to use modern JavaScript"
4. Review changes in diff view
5. Press `Cmd+S` to accept

### Example 3: Adding Features

1. Have relevant files open
2. Start Recoder Code
3. Ask: "Add error handling to the API functions"
4. Review and accept changes

### Example 4: Bug Fixing

1. Open the file with the bug
2. Select the problematic code
3. Ask: "Fix the bug in this code"
4. Review the fix in diff view
5. Accept if correct

## ⚙️ Configuration

### Settings

Currently, the extension works without configuration. Future versions will add:
- Custom keyboard shortcuts
- Diff view preferences
- Context tracking options

## 🎨 Diff View

### Features

- **Side-by-Side Comparison:** See original and suggested code
- **Syntax Highlighting:** Full language support
- **Inline Editing:** Edit suggestions before accepting
- **Quick Actions:** Accept/Reject buttons in editor toolbar

### Keyboard Shortcuts

| Action | Mac | Windows/Linux |
|--------|-----|---------------|
| Accept Changes | `Cmd+S` | `Ctrl+S` |
| Close Diff | `Esc` | `Esc` |

## 🔧 Requirements

- **VS Code:** Version 1.99.0 or newer
- **Recoder Code CLI:** Installed and configured
- **Node.js:** 18.0.0 or newer (for CLI)

## 🐛 Troubleshooting

### Extension Not Working

1. **Check VS Code Version**
   - Ensure you're running VS Code 1.99.0 or newer
   - Help → About

2. **Verify CLI Installation**
   ```bash
   which recoder-code
   recoder-code --version
   ```

3. **Restart VS Code**
   - Quit VS Code completely
   - Reopen your project

### Diff View Not Showing

1. Make sure you started Recoder Code from the terminal
2. Check that the integrated terminal is active
3. Try closing and reopening the diff editor

### Context Not Syncing

1. Check that files are saved
2. Verify the extension is active (check status bar)
3. Try reloading the window (Cmd+R / Ctrl+R)

### Performance Issues

1. Close unnecessary files
2. Reduce the number of open editors
3. Check CPU usage in Activity Monitor

## 📊 Features Comparison

| Feature | With Extension | Without Extension |
|---------|----------------|-------------------|
| AI Assistance | ✅ | ✅ |
| File Context | ✅ Auto | ⚠️ Manual |
| Diff View | ✅ Native | ❌ Terminal only |
| Selection Tracking | ✅ | ❌ |
| Quick Launch | ✅ | ❌ |
| Real-time Sync | ✅ | ❌ |

## 🔒 Privacy & Security

- **Local Processing:** Extension runs entirely locally
- **No Data Collection:** No telemetry or tracking
- **Secure Communication:** Local server only
- **Open Source:** Code is public and auditable

## 🤝 Contributing

We welcome contributions! See [development.md](development.md) for setup instructions.

## 📄 License

MIT License - see [LICENSE](LICENSE) for details

## 🔗 Links

- **GitHub:** https://github.com/caelum0x/recoder-code
- **CLI Package:** [recoder-code-cli](https://www.npmjs.com/package/recoder-code-cli)
- **Core Library:** [recoder-code-core](https://www.npmjs.com/package/recoder-code-core)
- **Website:** https://recoder.xyz
- **Issues:** https://github.com/caelum0x/recoder-code/issues

## 📞 Support

- **Documentation:** https://recoder.xyz/docs
- **GitHub Issues:** https://github.com/caelum0x/recoder-code/issues
- **Email:** support@recoder.xyz

## 🎓 Learn More

- [CLI Documentation](../cli/README.md)
- [Core Library API](../core/README.md)
- [Publishing Guide](PUBLISHING_GUIDE.md)
- [Development Guide](development.md)

## 🗺️ Roadmap

- [ ] Inline suggestions
- [ ] Multi-file refactoring
- [ ] Code lens integration
- [ ] Sidebar panel
- [ ] Settings UI
- [ ] Custom themes for diff view
- [ ] Workspace-wide analysis

## ⭐ Show Your Support

If you find this extension helpful, please:
- ⭐ Star the [GitHub repository](https://github.com/caelum0x/recoder-code)
- ✍️ Leave a review on the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=recoder.recoder-code-vscode-companion)
- 🐦 Share with your friends and colleagues

## 📸 Screenshots

*Coming soon - will include:*
- Extension in action
- Diff view examples
- Command palette integration
- File context tracking

## 🎬 Demo

*Coming soon - video demonstration of all features*

---

**Built with ❤️ by the Recoder Code Team**

*Making AI-assisted coding seamless in VS Code*

