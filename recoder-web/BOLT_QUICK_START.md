# ⚡ Bolt.new Quick Start Guide

## 🚀 What is Bolt.new?

Bolt.new is an AI-powered development environment that runs entirely in your browser. It can:
- Generate full-stack applications from text prompts
- Execute code in-browser (no backend needed)
- Show live previews of your app
- Provide an integrated terminal and editor

## 🎯 Quick Start (3 Steps)

### 1. Set Up API Keys

Add at least ONE of these to `.env.local`:

```bash
# Option 1: Direct Anthropic (recommended for Claude Sonnet 4.5)
ANTHROPIC_API_KEY=sk-ant-api03-...

# Option 2: OpenRouter (multi-provider, fallback chain)
OPENROUTER_API_KEY=sk-or-v1-...

# Option 3: Groq (fastest, free tier available)
GROQ_API_KEY=gsk_...
```

### 2. Start the Server

```bash
npm run dev
```

### 3. Open Bolt Interface

```
http://localhost:3001/bolt
```

## 💬 Your First App

**Try this prompt**:
```
Build a todo list app with React that saves to local storage
```

**What happens**:
1. 🤖 Claude Sonnet 4.5 generates code
2. 📁 Files appear in the workbench
3. ⚡ Click "Start Preview"
4. 🎉 Your app runs in the browser!

## 🎨 Interface Overview

```
┌─────────────────────────────────────────────────────────┐
│  ⚡ Bolt.new                    [3 files] [2 messages]  │
├──────────────────┬──────────────────────────────────────┤
│                  │  ┌────┬────────┬─────────┐           │
│  Chat Messages   │  │Code│  Split  │ Preview │  ← Views │
│                  │  └────┴────────┴─────────┘           │
│  User: Build...  │  ┌─────────┬───────────────────────┐ │
│                  │  │ 📁 Files│  Code Editor / Preview│ │
│  AI: Here's...   │  │         │                       │ │
│                  │  │  App.tsx│  [Live Preview Here] │ │
│  [Streaming...]  │  │  main.ts│                       │ │
│                  │  │  pkg.json                       │ │
│                  │  └─────────┴───────────────────────┘ │
│                  │  [Terminal] ← Click to open         │
├──────────────────┴──────────────────────────────────────┤
│ What would you like to build? [✨ Send]                │
└─────────────────────────────────────────────────────────┘
```

## 🔥 Example Prompts

### Beginner
```
Create a counter button that increments when clicked
```

### Intermediate
```
Build a weather app that fetches from OpenWeather API
```

### Advanced
```
Create a markdown editor with live preview, syntax highlighting,
and export to PDF functionality
```

### Full App
```
Build a task management app with:
- Add/edit/delete tasks
- Mark as complete
- Filter by status
- Save to local storage
- Dark mode toggle
```

## 🛠️ Using the Workbench

### File Tree
- Click any file to view/edit
- Files auto-update from AI

### Code Editor
- Syntax highlighting
- Edit any file
- Changes persist

### Preview
- Click "Start Preview"
- Live reload on changes
- Full browser environment

### Terminal
- Click "Terminal" button
- Run npm commands
- Install packages
- Debug apps

## 🎯 Model Selection

Currently configured to use **Claude Sonnet 4.5** (premium mode).

You can modify in the code to use:
- `'premium'` - Claude Sonnet 4.5 (best quality)
- `'fast'` - Groq Llama 3.3 (fastest)
- `'free'` - DeepSeek R1 (unlimited)
- `'coding'` - Qwen Coder (specialized)

## 💡 Pro Tips

### Tip 1: Be Specific
❌ **Bad**: "Make a website"
✅ **Good**: "Build a landing page with hero section, features grid, and contact form"

### Tip 2: Iterate
You can continue the conversation:
```
User: Add dark mode
User: Make it responsive for mobile
User: Add animations to the buttons
```

### Tip 3: Use the Terminal
After generation:
```bash
npm install axios      # Add packages
npm run build          # Build for production
ls -la                 # Explore files
```

### Tip 4: View Multiple Files
Use "Split" view to see code and preview simultaneously

### Tip 5: Test in Terminal
```bash
npm test              # If tests are generated
npm run lint          # Check code quality
```

## 🔧 Common Commands

### In Terminal (WebContainer)

```bash
# List files
ls

# Show current directory
pwd

# Install packages
npm install [package-name]

# Run dev server
npm run dev

# Build for production
npm run build

# Check Node version
node --version
```

## 🐛 Troubleshooting

### "No response from AI"
**Fix**: Check API keys in `.env.local`

### "WebContainer won't boot"
**Fix**: Use Chrome/Edge (Safari not supported)

### "Preview won't start"
**Fix**: Check terminal for errors, try `npm install` first

### "Streaming stopped"
**Fix**: Check browser console, verify network connection

## 📚 Learn More

- **Full Documentation**: See `BOLT_INTEGRATION_COMPLETE.md`
- **Testing Guide**: See `TEST_BOLT_INTEGRATION.md`
- **Integration Plan**: See `BOLT_INTEGRATION_PLAN.md`

## 🎉 What You Can Build

✅ **Frontend Apps**
- React, Vue, Svelte apps
- Static websites
- Interactive dashboards

✅ **Utilities**
- Calculators, converters
- Games (tic-tac-toe, snake)
- Tools (markdown editor, color picker)

✅ **API Integrations**
- Weather apps
- GitHub viewers
- Data visualizations

❌ **Limitations**
- No backend servers (frontend only)
- No databases (use localStorage or APIs)
- No native binaries
- No Python packages (pip not available)

## 🚀 Ready to Build!

Just head to **http://localhost:3001/bolt** and start creating!

Try this to get started:
```
Build a Pomodoro timer with start/pause/reset buttons and a countdown display
```

Happy coding! ⚡
