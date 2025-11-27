# Recoder.xyz Terminal CLI Guide

## Overview
The Recoder.xyz chat IDE includes a fully functional terminal powered by WebContainer, allowing you to run npm commands, Node.js scripts, and the **recoder-code** CLI directly in your browser.

## 🚀 Quick Start

### Opening the Terminal
- Click the **Terminal** button in the bottom toolbar
- Or use the keyboard shortcut (if configured)

### First-Time Setup
When you open the terminal for the first time, Recoder.xyz automatically:
1. ✅ Initializes the WebContainer environment
2. ✅ Installs the `recoder-code` CLI globally
3. ✅ Displays a welcome message with available commands

You'll see this welcome message:
```
╔════════════════════════════════════════════════════════════╗
║               Welcome to Recoder.xyz Terminal              ║
╚════════════════════════════════════════════════════════════╝

🚀 Recoder CLI is available!
   Type recoder --help to see available commands

📦 Quick Commands:
   recoder chat           - Start AI chat session
   recoder generate       - Generate code with AI
   recoder agent          - Run specialized AI agents
   npm install            - Install project dependencies
   npm run dev            - Start development server
```

## 📦 Using Recoder CLI

### Available Commands

#### `recoder chat`
Start an interactive AI chat session directly in the terminal.
```bash
recoder chat
# Follow the prompts to interact with AI
```

#### `recoder generate`
Generate code using natural language prompts.
```bash
recoder generate "create a React component for user authentication"
```

#### `recoder agent`
Run specialized AI agents for specific tasks.
```bash
recoder agent "create a REST API with Express"
```

#### `recoder --help`
View all available commands and options.
```bash
recoder --help
```

### Using with Projects

When working with project files in the IDE:

```bash
# Install dependencies for your project
npm install

# Run the recoder CLI to add features
recoder generate "add authentication to this project"

# The CLI will have access to all files in your project
```

## 🔧 Common npm Commands

### Install Packages
```bash
npm install
npm install axios
npm install -D typescript
```

### Run Scripts
```bash
npm run dev
npm run build
npm test
```

### Global Installs
```bash
npm install -g <package-name>
```

## 💡 Tips & Tricks

### 1. Package Installation Timeout
- npm install commands have a **5-minute timeout**
- For large projects, installation may take 2-3 minutes
- You'll see progress indicators: `📦 Installing packages...`

### 2. Multiple Terminal Sessions
- You can open multiple terminal instances
- Each terminal runs in the same WebContainer environment
- Changes in one terminal affect all others

### 3. File System Access
- The terminal has access to all files in your workspace
- Files created via terminal appear in the file explorer
- Files edited in the IDE are immediately available in terminal

### 4. Environment Variables
- Set environment variables like in a normal terminal:
  ```bash
  export API_KEY="your-key-here"
  ```

### 5. Running Dev Servers
- Dev servers (npm run dev, vite, etc.) work in the terminal
- Access your app via the Preview pane
- The preview automatically updates when code changes

## 🚨 Troubleshooting

### "recoder: command not found"
If you see this error:
1. Close and reopen the terminal
2. Or manually install: `npm install -g recoder-code`

### npm install Appears Stuck
- WebContainer npm installs can be slow
- Wait up to 5 minutes for large projects
- Check the console for progress indicators
- If it times out, try running `npm install` again

### Terminal Not Responding
1. Close the terminal panel
2. Refresh the browser page
3. Reopen the terminal

### Files Not Appearing
- Terminal file system syncs with the IDE
- If files don't appear, try refreshing the file explorer
- Check that you're in the correct directory with `pwd`

## 🎯 Best Practices

1. **Always run `npm install`** after loading a project
2. **Use the file explorer** alongside terminal for better visibility
3. **Check current directory** with `pwd` before running commands
4. **Use tab completion** for file and command names
5. **Close dev servers** before starting new ones to avoid port conflicts

## 📖 Example Workflows

### Creating a New React App
```bash
# Generate a React app using recoder
recoder generate "create a React app with TypeScript and Tailwind"

# Install dependencies
npm install

# Start development server
npm run dev
```

### Adding Features to Existing Project
```bash
# Check current files
ls

# Add a new feature
recoder generate "add a user dashboard component"

# Install any new dependencies
npm install

# Test the changes
npm run dev
```

### Using AI Agents
```bash
# Database setup
recoder agent "setup PostgreSQL with Prisma"

# API creation
recoder agent "create REST API endpoints for user management"

# Testing
recoder agent "write unit tests for authentication"
```

## 🔗 Related Resources

- [Recoder CLI Documentation](https://recoder.xyz/docs/cli)
- [WebContainer Documentation](https://webcontainers.io)
- [npm Documentation](https://docs.npmjs.com)

## 💬 Need Help?

- Type `recoder --help` in the terminal
- Check the [Recoder.xyz documentation](https://recoder.xyz/docs)
- Join our [Discord community](https://discord.gg/recoder)

---

**Note**: The terminal runs in a browser-based Node.js environment (WebContainer). Most npm packages work perfectly, but some native modules may have limitations.
