# Recoder Web IDE - User Guide

## Overview

Recoder Web IDE is a browser-based development environment powered by AI. Build full-stack applications without leaving your browser.

---

## Getting Started

### Access the IDE
1. Go to [ide.recoder.xyz](https://ide.recoder.xyz)
2. Start typing what you want to build
3. AI generates your project

### Configure API Keys
Click the settings icon and add your AI provider keys:
- **Anthropic** - Best for code generation
- **OpenRouter** - Access multiple models
- **Groq** - Fast responses

---

## Interface

### Layout
```
┌─────────────────────────────────────────────────────┐
│  Header (project name, settings, deploy)            │
├──────────┬──────────────────────┬───────────────────┤
│          │                      │                   │
│  File    │      Editor          │     Preview       │
│  Tree    │                      │                   │
│          │                      │                   │
├──────────┴──────────────────────┴───────────────────┤
│  Terminal / Chat                                    │
└─────────────────────────────────────────────────────┘
```

### File Tree
- Click file to open in editor
- Right-click for context menu (rename, delete)
- Drag to reorder
- Search files with `Cmd/Ctrl + P`

### Editor
- Syntax highlighting for all languages
- Auto-completion
- Multiple tabs
- Unsaved changes indicator (dot)

### Preview
- Live preview of your app
- Auto-refreshes on changes
- Multiple port support
- Open in new tab

### Terminal
- Full terminal emulator
- Run npm commands
- View build output
- Multiple terminal tabs

### Chat Panel
- Describe changes in natural language
- AI modifies your code
- View diff before applying
- Chat history preserved

---

## Building Projects

### From Prompt
1. Type: "Build a todo app with React and Tailwind"
2. AI generates complete project structure
3. Dev server starts automatically
4. Preview shows your app

### From Template
1. Click "Templates" or use `/template` command
2. Choose starter (Next.js, React, Express, etc.)
3. Customize with AI assistance

### From GitHub
1. Click "Import" or paste GitHub URL
2. Repository clones into IDE
3. Dependencies install automatically

---

## AI Features

### Code Generation
```
User: Add a dark mode toggle
AI: [Creates ThemeToggle component, updates CSS, adds to layout]
```

### Bug Fixing
```
User: Fix the login form validation
AI: [Identifies issues, applies fixes, explains changes]
```

### Refactoring
```
User: Convert this to TypeScript
AI: [Adds types, renames files, updates imports]
```

### Explanations
```
User: Explain how the auth flow works
AI: [Provides detailed explanation with code references]
```

---

## File Operations

### Create File
- Right-click folder → New File
- Or ask AI: "Create a utils/helpers.ts file"

### Edit File
- Click to open in editor
- Or ask AI to make changes

### Delete File
- Right-click → Delete
- Or ask AI: "Remove the old config file"

### Rename/Move
- Right-click → Rename
- Drag to new location

---

## Terminal Commands

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Run tests
npm test

# Add package
npm install axios
```

---

## Saving & Exporting

### Auto-Save
Projects auto-save to browser storage (IndexedDB).

### Download ZIP
1. Click "Download" button
2. Get complete project as ZIP
3. Extract and run locally

### Push to GitHub
1. Click "GitHub" button
2. Authorize if needed
3. Choose repo and branch
4. Commit message
5. Push changes

---

## Keyboard Shortcuts

| Action | Mac | Windows/Linux |
|--------|-----|---------------|
| Save | `⌘S` | `Ctrl+S` |
| Open file | `⌘P` | `Ctrl+P` |
| Search in files | `⌘⇧F` | `Ctrl+Shift+F` |
| Toggle terminal | `⌘\`` | `Ctrl+\`` |
| New chat | `⌘N` | `Ctrl+N` |
| Close tab | `⌘W` | `Ctrl+W` |
| Undo | `⌘Z` | `Ctrl+Z` |
| Redo | `⌘⇧Z` | `Ctrl+Shift+Z` |

---

## Tips & Tricks

### Be Specific
❌ "Make it better"
✅ "Add form validation with error messages for email and password fields"

### Iterate
Build incrementally:
1. "Create basic layout"
2. "Add navigation"
3. "Implement auth"
4. "Add dashboard"

### Use Context
Reference existing code:
- "Update the Header component to include a search bar"
- "Make the Button component match the Card styling"

### Check Preview
Always verify changes in the preview before moving on.

---

## Troubleshooting

### Preview Not Loading
1. Check terminal for errors
2. Ensure `npm run dev` is running
3. Click refresh in preview panel
4. Check correct port is selected

### AI Not Responding
1. Verify API key is set
2. Check browser console for errors
3. Try refreshing the page
4. Switch to different model

### Files Not Saving
1. Check browser storage isn't full
2. Try downloading as ZIP backup
3. Clear browser cache and reload

### Terminal Stuck
1. Click "Kill" to stop process
2. Open new terminal tab
3. Refresh page if needed

---

## Browser Support

- Chrome 90+ (recommended)
- Edge 90+
- Firefox 90+
- Safari 15+

WebContainer requires modern browser features. Use Chrome for best experience.

---

## Privacy & Data

- Code runs entirely in your browser
- Files stored in browser IndexedDB
- API keys stored locally (encrypted)
- No code sent to servers except AI prompts
- GitHub sync requires authorization
