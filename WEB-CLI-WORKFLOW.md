# 🔄 Recoder: Seamless Web ↔ CLI Workflow

## Your Unique Differentiator

**Bolt.new** = Web only (no terminal access)
**Claude Code** = Terminal only (no web IDE)
**Recoder** = **Web + Terminal** (seamless sync!)

---

## 🚀 Complete Workflow Guide

### **Scenario 1: Start in Web, Continue in Terminal**

```bash
# 1. Create project in web.recoder.xyz
Visit https://web.recoder.xyz
Create a project: "Build a React app"
Get project ID from URL: /chat/1762542265823

# 2. Install CLI (one-time setup)
$ npm install -g recoder-cli

# 3. Authenticate
$ recoder auth login --device-flow
✓ Authenticated as user@example.com

# 4. List your web projects
$ recoder projects list
┌─────────────┬──────────────────┬──────────┬──────────────┐
│ ID          │ Title            │ Messages │ Last Updated │
├─────────────┼──────────────────┼──────────┼──────────────┤
│ 17625422... │ Build a React app│ 5        │ 11/8/2025    │
└─────────────┴──────────────────┴──────────┴──────────────┘

# 5. Download to local machine
$ recoder projects download 1762542265823
✓ Downloaded 24 files to ./project

# 6. Work locally
$ cd project
$ npm install
$ code .  # Open in VS Code
# Make changes...

# 7. Upload changes back to web
$ recoder projects upload 1762542265823 --message "Added auth feature"
✓ Uploaded 24 files

# 8. Continue in web
$ recoder projects open 1762542265823
# Browser opens to web.recoder.xyz/chat/1762542265823
# All your changes are there! 🎉
```

---

### **Scenario 2: Start in Terminal, View in Web**

```bash
# 1. Create project from CLI
$ recoder projects create "My API Server" --from ./my-code
✓ Project created: 1762542280954

# 2. Open in browser to use AI assistance
$ recoder projects open 1762542280954
# Browser opens, you can chat with AI about your code

# 3. Make changes in web IDE
# Add features using AI chat...

# 4. Download latest version
$ recoder projects download 1762542280954
✓ Downloaded 32 files (8 new files added by AI)

# 5. Continue locally
$ npm run dev
```

---

## 📋 Complete Command Reference

### **Authentication**
```bash
recoder auth login --device-flow    # Recommended auth method
recoder auth status                 # Check auth status
```

### **Project Management**
```bash
recoder projects list               # List all web projects
recoder projects info <id>          # Show project details
recoder projects open <id>          # Open in browser
recoder projects download <id>      # Download to local
recoder projects upload <id>        # Upload local changes
recoder projects create <name>      # Create new project
recoder projects sync               # Show sync status
```

### **Download Options**
```bash
recoder projects download <id> --dir ./my-folder   # Custom directory
recoder projects download <id> --force             # Overwrite existing
```

### **Upload Options**
```bash
recoder projects upload <id> --dir ./src           # Upload specific dir
recoder projects upload <id> --message "Bug fix"   # Add upload message
recoder projects upload <id> --dry-run             # Preview what uploads
```

### **Create Options**
```bash
recoder projects create "API" --from ./template    # From existing code
recoder projects create "Blog" --description "..."  # With description
```

---

## 🎯 Key Features

### **✅ Implemented**
- ✅ Download web projects to local filesystem
- ✅ Upload local changes back to web
- ✅ Create projects from CLI
- ✅ Open projects in browser from terminal
- ✅ Sync status tracking (.recoder-sync.json)
- ✅ Bidirectional sync (Web ↔ CLI)
- ✅ Project metadata tracking
- ✅ Smart file ignoring (node_modules, .git, etc.)
- ✅ Beautiful CLI output with ora spinners
- ✅ Web UI integration (ProjectInfo component)
- ✅ My Projects page in web app

### **🔮 Future Enhancements**
- ⏳ Real-time sync (WebSockets)
- ⏳ Conflict resolution (merge tools)
- ⏳ Auto-sync on file changes (watch mode)
- ⏳ Git integration
- ⏳ Collaborative editing
- ⏳ Version history/snapshots

---

## 🏗️ Technical Architecture

### **How It Works**

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│             │         │              │         │             │
│  CLI Tool   ├────────►│   Neon DB    │◄────────┤  Web IDE    │
│             │  API    │              │  API    │             │
└─────────────┘         └──────────────┘         └─────────────┘
      │                                                 │
      │                                                 │
      ▼                                                 ▼
 Local Files                                      WebContainer
```

1. **Web IDE** saves projects to **Neon PostgreSQL**
2. **CLI** calls `/api/chat-history` to read projects
3. **CLI** downloads `fileSnapshot` (JSON with all files)
4. **CLI** writes files to local filesystem using `fs-extra`
5. **CLI** uploads via `/api/projects/upload`
6. **Web** reads updated files from database
7. **Single source of truth** = Neon database

### **API Endpoints**

```typescript
GET  /api/chat-history?urlId=<id>           // Get project with files
GET  /api/chat-history?userId=<id>&limit=50  // List user's projects
POST /api/projects/upload                    // Upload files from CLI
```

### **Sync Status File**

`.recoder-sync.json` (created in project directory):
```json
{
  "projectId": "1762542265823",
  "projectName": "My React App",
  "lastSync": "2025-11-08T20:30:00.000Z",
  "lastDownload": "2025-11-08T20:25:00.000Z",
  "lastUpload": "2025-11-08T20:30:00.000Z",
  "fileCount": 24,
  "webUrl": "https://web.recoder.xyz/chat/1762542265823"
}
```

---

## 📁 Files Modified

### **CLI (`packages/cli/`)**
```
NEW:  src/commands/projects.ts       (520 lines) - All project commands
NEW:  src/utils/sync-status.ts       (120 lines) - Sync tracking
MOD:  src/index.ts                   (+2 lines)  - Register command
```

### **Web App (`recoder-web/`)**
```
NEW:  app/routes/projects.tsx        (270 lines) - Projects dashboard
NEW:  app/routes/api.projects.upload.ts (90 lines) - Upload API
NEW:  app/components/chat/ProjectInfo.tsx (132 lines) - CLI info panel
MOD:  app/components/chat/Chat.client.tsx (+6 lines) - Add component
MOD:  app/components/header/Header.tsx (+9 lines) - Projects button
```

---

## 🧪 Testing the Complete Flow

### **Test Web → CLI → Web**

```bash
# 1. Create in web
Open web.recoder.xyz, create project
Note the project ID

# 2. Download
recoder projects download <id>

# 3. Modify locally
cd project
echo "console.log('hello');" >> src/index.js

# 4. Upload
recoder projects upload <id>

# 5. Verify in web
recoder projects open <id>
# Check that your changes appear!
```

### **Test CLI → Web → CLI**

```bash
# 1. Create from CLI
mkdir myapp && cd myapp
echo "# My App" > README.md
recoder projects create "My App" --from .

# 2. Open in web
recoder projects open <new-id>
# Use AI to generate more code

# 3. Download updates
recoder projects download <new-id>
# Verify AI-generated files are there
```

---

## 💡 Marketing Messaging

### **Tagline**
> "The only AI coding platform that works where you do - browser, terminal, or both."

### **Key Messages**
1. **For Web Users**: "Love the web IDE? Download your projects and edit them locally anytime."
2. **For CLI Users**: "Prefer the terminal? Open your projects in the browser when you need AI help."
3. **For Everyone**: "Start anywhere, work everywhere. One platform, infinite flexibility."

### **Competitive Comparison**
| Feature | Bolt.new | Claude Code | **Recoder** |
|---------|----------|-------------|-------------|
| Web IDE | ✅ | ❌ | ✅ |
| Terminal CLI | ❌ | ✅ | ✅ |
| Download projects | ❌ | N/A | ✅ |
| Upload projects | ❌ | N/A | ✅ |
| Bidirectional sync | ❌ | ❌ | ✅ |

---

## 🚢 Deployment Checklist

- [ ] Build CLI: `cd packages/cli && npm run build`
- [ ] Publish CLI to npm: `npm publish`
- [ ] Deploy web app to production
- [ ] Test authentication flow
- [ ] Test download/upload roundtrip
- [ ] Update landing page with new features
- [ ] Create demo video
- [ ] Write blog post
- [ ] Update documentation site

---

## 📞 Support

If you encounter issues:
1. Check sync status: `recoder projects sync`
2. Verify auth: `recoder auth status`
3. Check logs in `~/.recoder/logs/`
4. Report issues: https://github.com/recoder-team/recoder/issues

---

## 🎉 Summary

You now have a **complete end-to-end Web ↔ CLI workflow**:

✅ Users can start in web, continue in terminal
✅ Users can start in terminal, view in web
✅ Bidirectional sync (download + upload)
✅ Project creation from CLI
✅ Sync status tracking
✅ Beautiful UI in both web and CLI
✅ Single source of truth (Neon database)

**This is your competitive advantage. Nobody else has this!**
