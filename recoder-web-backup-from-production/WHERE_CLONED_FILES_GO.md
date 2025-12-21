# Where Do Cloned Files Go?

## Quick Answer

**Cloned files go into the WebContainer (in-browser virtual filesystem)** - they don't save to your local disk.

## The Flow

### When You Clone a Repository

```
1. User clicks "Import from GitHub"
   ↓
2. Enters repo URL: https://github.com/google-gemini/gemini-cli.git
   ↓
3. System clones files into memory (JavaScript object)
   ↓
4. Files object: { "package.json": "content", "src/index.ts": "content", ... }
   ↓
5. Files sent to WebContainer
   ↓
6. WebContainer creates virtual filesystem
   ↓
7. Files appear in the Code Editor
   ↓
8. You can edit, run, preview in browser
```

## Where Files Actually Are

### In the Application
```
┌─────────────────────────────────────┐
│  Browser Memory (RAM)               │
│  ├─ WebContainer (Virtual FS)       │
│  │  ├─ /package.json               │
│  │  ├─ /src/index.ts               │
│  │  ├─ /src/components/...         │
│  │  └─ ... all cloned files        │
│  └─ Code Editor displays files      │
└─────────────────────────────────────┘
```

### NOT on Your Disk
```
❌ NOT saved to: /Users/arhansubasi/Downloads
❌ NOT saved to: /Users/arhansubasi/Projects
❌ NOT saved to: Any local folder
```

## WebContainer Explained

**WebContainer** is a browser-based Node.js runtime that:
- Runs entirely in your browser
- Creates a virtual filesystem in memory
- Lets you edit code
- Runs npm install
- Starts dev servers
- All without touching your actual filesystem

### Think of it Like
```
WebContainer = A complete computer running inside your browser tab
├─ Has its own filesystem (virtual)
├─ Has its own terminal
├─ Can run Node.js
├─ Can install packages
└─ All disappears when you close the tab
```

## The Test Script

The test script I created (`test-github-clone.mjs`) only:
- ✅ Downloads files from GitHub
- ✅ Validates the clone worked
- ✅ Analyzes file structure
- ❌ Does NOT save to disk
- ❌ Does NOT create folders locally

It proves the **cloning logic works** but doesn't persist files.

## How to Actually Save Files Locally

If you want to save cloned files to your actual disk:

### Option 1: Use the Download Feature
```
1. Clone repo in bolt.new
2. Click "Download" button
3. Saves as ZIP to ~/Downloads
4. Extract and use locally
```

### Option 2: Clone with Git Directly
```bash
# Instead of using bolt.new's import
cd ~/Projects
git clone https://github.com/google-gemini/gemini-cli.git
cd gemini-cli
npm install
```

### Option 3: Export from WebContainer
```
1. Clone in bolt.new
2. Edit/customize files
3. Use "Export" or "Download" 
4. Get ZIP with all files
5. Extract to local disk
```

## What Happens in the UI

### When Import Succeeds

```
┌─────────────────────────────────────────┐
│  Left: Chat & Preview                   │
│  ┌─────────────────────────────────┐   │
│  │ ✅ Repository cloned!            │   │
│  │                                  │   │
│  │ Files loaded:                    │   │
│  │ • package.json                   │   │
│  │ • src/index.ts                   │   │
│  │ • ... 1,104 files                │   │
│  └─────────────────────────────────┘   │
│                                         │
│  Right: Code Editor & Terminal          │
│  ┌─────────────────────────────────┐   │
│  │ 📁 Explorer                      │   │
│  │  ├─ 📄 package.json             │   │
│  │  ├─ 📁 src/                     │   │
│  │  │  ├─ 📄 index.ts              │   │
│  │  │  └─ 📁 components/           │   │
│  │  └─ 📁 ...                      │   │
│  │                                  │   │
│  │ 💻 Terminal                      │   │
│  │  $ npm install                   │   │
│  │  $ npm run dev                   │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

## File Persistence

### During Session
```
✅ Files exist in WebContainer
✅ Can edit files
✅ Can run code
✅ Can install packages
✅ Can start servers
```

### After Closing Tab
```
❌ All files lost (WebContainer cleared)
❌ Changes not saved
❌ Need to re-import
```

### To Keep Your Work
```
1. Download as ZIP before closing
2. Or use GitHub integration to push changes
3. Or export project
```

## File Storage Options

### 1. WebContainer (Current)
```
Location: Browser memory
Persistence: Session only
Speed: Very fast
Use case: Quick edits, testing
```

### 2. Local Filesystem (Future Enhancement)
```
Location: Your actual disk
Persistence: Permanent
Speed: Fast
Use case: Real development
```

### 3. GitHub (Available)
```
Location: GitHub servers
Persistence: Permanent
Speed: Network dependent
Use case: Version control
```

## Summary

**Q: Where are cloned files?**  
A: In WebContainer (browser's virtual filesystem)

**Q: Are they on my disk?**  
A: No, only in browser memory

**Q: How do I save them permanently?**  
A: Download as ZIP or push to GitHub

**Q: What if I close the browser?**  
A: All files lost, need to re-import

**Q: Can I edit the files?**  
A: Yes, in the Code Editor

**Q: Can I run the code?**  
A: Yes, in the Terminal

**Q: Where does the test save files?**  
A: Nowhere - it only validates the clone works

The test proves the cloning **works correctly** (all 1,104 files loaded), but in the actual app, those files go into WebContainer for in-browser editing and execution.
