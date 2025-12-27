# 🎯 Recoder.xyz - Technical Status & Competitor Analysis

**Last Updated**: December 27, 2025
**Goal**: Feature parity with Replit, Cursor, and Bolt.new

---

## ✅ What We Have (MVP)

### Working Features
- ✅ File creation/editing (Monaco editor)
- ✅ Live preview (Docker containers + proxy)
- ✅ Terminal access (WebSocket PTY)
- ✅ AI chat (Claude, OpenRouter, Groq)
- ✅ Project creation (starter templates)
- ✅ Chat history (PostgreSQL)
- ✅ Authentication (Better Auth)

### Infrastructure
- Docker backend (port 3100) - container orchestration
- Next.js frontend (port 5173)
- Neon PostgreSQL database
- WebSocket for terminal
- HTTP proxy for preview

---

## ❌ What Competitors Have That We Don't

### **Replit**

#### Missing Features
1. **Multi-file editing**
   - ❌ No tabs for open files
   - ❌ No split view
   - ❌ Can only edit one file at a time

2. **File tree**
   - ❌ Can't create folders through UI
   - ❌ Can't rename files
   - ❌ Can't drag-drop files
   - ❌ No file search

3. **Package management**
   - ❌ No visual package installer
   - ❌ No dependency detection
   - ❌ Must manually edit package.json

4. **Deployment**
   - ❌ No one-click deploy
   - ❌ No automatic HTTPS
   - ❌ No custom domains

5. **Collaboration**
   - ❌ No real-time collaboration
   - ❌ No share links
   - ❌ No multiplayer cursor

6. **Database**
   - ❌ No built-in database
   - ❌ No PostgreSQL UI
   - ❌ No Redis integration

### **Bolt.new**

#### Missing Features
1. **AI code generation**
   - ❌ Can't generate full stack from description
   - ❌ No component generation
   - ❌ No "magic" full-app creation
   - ✅ Has basic chat (but not as smart)

2. **Template system**
   - ❌ Limited starter templates
   - ❌ No template marketplace
   - ❌ Can't save as template

3. **Preview features**
   - ❌ No mobile preview mode
   - ❌ No responsive testing
   - ❌ No dev tools in preview

### **Cursor**

#### Missing Features
1. **AI features**
   - ❌ No inline code suggestions
   - ❌ No "fix with AI" button
   - ❌ No code explanation
   - ❌ No test generation
   - ❌ No refactoring suggestions

2. **Code intelligence**
   - ❌ No Go to Definition
   - ❌ No Find References
   - ❌ No auto-import
   - ❌ No intelligent autocomplete

3. **Git integration**
   - ❌ No GitHub integration
   - ❌ Can't commit/push from UI
   - ❌ No diff viewer
   - ❌ No branch management

---

## 🔧 Technical Implementation Plan

### **Priority 1: Multi-File Editing** (Week 1)

**Problem**: Can only edit one file at a time
**Goal**: Match Replit's editor tabs

#### Implementation
```typescript
// recoder-web/app/lib/stores/editor.ts
export interface EditorFile {
  path: string;
  content: string;
  modified: boolean;
  monaco?: monaco.editor.IStandaloneCodeEditor;
}

export const editorStore = {
  openFiles: atom<EditorFile[]>([]),
  activeFile: atom<string | null>(null),

  openFile(path: string, content: string) {
    // Add to openFiles if not already open
    // Set as activeFile
  },

  closeFile(path: string) {
    // Remove from openFiles
    // Switch to previous tab
  },

  saveFile(path: string) {
    // Save to backend
    // Mark as not modified
  }
}
```

```tsx
// recoder-web/app/components/workbench/EditorTabs.tsx
export function EditorTabs() {
  const openFiles = useStore(editorStore.openFiles);
  const activeFile = useStore(editorStore.activeFile);

  return (
    <div className="tabs">
      {openFiles.map(file => (
        <Tab
          key={file.path}
          active={file.path === activeFile}
          modified={file.modified}
          onClose={() => editorStore.closeFile(file.path)}
          onClick={() => editorStore.setActive(file.path)}
        >
          {file.path}
        </Tab>
      ))}
    </div>
  );
}
```

**Tasks**:
- [ ] Create editor store with multi-file state
- [ ] Add tab bar UI component
- [ ] Implement tab close/switch
- [ ] Add keyboard shortcuts (Cmd+W to close, Cmd+Tab to switch)
- [ ] Show modified indicator (dot on tab)
- [ ] Save all on Cmd+S

---

### **Priority 2: Advanced File Tree** (Week 1-2)

**Problem**: Basic file list, can't manage folders
**Goal**: Match Replit's file explorer

#### Implementation
```typescript
// recoder-web/app/lib/stores/files.ts
export interface FileNode {
  path: string;
  name: string;
  type: 'file' | 'folder';
  children?: FileNode[];
  expanded?: boolean;
}

export const fileTreeStore = {
  tree: atom<FileNode[]>([]),

  async createFolder(parentPath: string, name: string) {
    // POST /api/files/folder
    // Update tree
  },

  async renameFile(oldPath: string, newPath: string) {
    // POST /api/files/rename
    // Update tree + open tabs
  },

  async deleteFile(path: string) {
    // DELETE /api/files
    // Close tab if open
  },

  async moveFile(from: string, to: string) {
    // POST /api/files/move
    // Update tree
  }
}
```

```tsx
// recoder-web/app/components/workbench/FileTree.tsx
export function FileTree() {
  const [draggedFile, setDraggedFile] = useState<string | null>(null);

  return (
    <div className="file-tree">
      <TreeNode
        onDragStart={handleDragStart}
        onDrop={handleDrop}
        onContextMenu={showContextMenu}
      />
    </div>
  );
}
```

**Backend API**:
```typescript
// docker-backend/src/server.ts
app.post('/api/files/folder', async (req, res) => {
  const { projectId, path, name } = req.body;
  await docker.exec(containerId, ['mkdir', '-p', `${path}/${name}`]);
  res.json({ success: true });
});

app.post('/api/files/rename', async (req, res) => {
  const { projectId, oldPath, newPath } = req.body;
  await docker.exec(containerId, ['mv', oldPath, newPath]);
  res.json({ success: true });
});
```

**Tasks**:
- [ ] Add folder creation
- [ ] Add file/folder rename
- [ ] Add file/folder delete
- [ ] Implement drag-drop
- [ ] Add context menu (right-click)
- [ ] Add file search (Cmd+P)

---

### **Priority 3: Container Resource Management** (Week 2)

**Problem**: Containers run forever, consume resources
**Goal**: Clean up inactive containers, set limits

#### Implementation
```typescript
// docker-backend/src/cleanup.ts
import cron from 'node-cron';

const containers = new Map<string, {
  id: string;
  lastActive: number;
  port: number;
}>();

// Run cleanup every hour
cron.schedule('0 * * * *', async () => {
  const now = Date.now();
  const timeout = 24 * 60 * 60 * 1000; // 24 hours

  for (const [projectId, container] of containers) {
    if (now - container.lastActive > timeout) {
      console.log(`🧹 Removing inactive container: ${projectId}`);
      await docker.getContainer(container.id).stop();
      await docker.getContainer(container.id).remove();
      containers.delete(projectId);
    }
  }
});
```

```typescript
// docker-backend/src/server.ts
// Add resource limits to container creation
const container = await docker.createContainer({
  Image: 'recoder-universal:latest',
  HostConfig: {
    Memory: 512 * 1024 * 1024, // 512MB
    NanoCpus: 1000000000, // 1 CPU
    PidsLimit: 100, // Max 100 processes
    CpuShares: 1024,
  },
  // ...
});
```

**Tasks**:
- [ ] Add cron job for cleanup
- [ ] Add resource limits to containers
- [ ] Track lastActive timestamp
- [ ] Add container health checks
- [ ] Add manual cleanup endpoint

---

### **Priority 4: AI Code Generation** (Week 3)

**Problem**: Chat is basic, can't generate full features
**Goal**: Match Bolt.new's "build from description"

#### Implementation
```typescript
// recoder-web/app/lib/ai/code-generator.ts
export async function generateFromPrompt(prompt: string) {
  const systemPrompt = `You are a code generator. Generate complete, working code.

  Rules:
  1. Generate ALL files needed (HTML, CSS, JS, package.json)
  2. Code must work without modification
  3. Use modern best practices
  4. Include comments
  5. Return as JSON: { files: [{ path, content }] }
  `;

  const response = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 8000,
    messages: [{
      role: 'user',
      content: prompt
    }],
    system: systemPrompt
  });

  const files = JSON.parse(response.content[0].text);
  return files;
}
```

```tsx
// recoder-web/app/components/chat/GenerateButton.tsx
export function GenerateButton() {
  const handleGenerate = async () => {
    const prompt = "Build a todo app with React";

    // Show loading
    setGenerating(true);

    // Generate files
    const files = await generateFromPrompt(prompt);

    // Create all files
    for (const file of files.files) {
      await createFile(file.path, file.content);
    }

    // Auto-install and preview
    await runCommand('npm install');
    await runCommand('npm run dev');
  };

  return <button onClick={handleGenerate}>Generate App</button>;
}
```

**Tasks**:
- [ ] Create code generation prompt system
- [ ] Add "Generate" button in chat
- [ ] Auto-create all generated files
- [ ] Auto-install dependencies
- [ ] Auto-start preview
- [ ] Add streaming for progress

---

### **Priority 5: Real-time Collaboration** (Week 4)

**Problem**: Can't collaborate with others
**Goal**: Match Replit's multiplayer

#### Implementation
```typescript
// Use Yjs for CRDT-based collaboration
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { MonacoBinding } from 'y-monaco';

// recoder-web/app/lib/collaboration/sync.ts
export function setupCollaboration(editor: monaco.editor.IStandaloneCodeEditor, projectId: string) {
  // Create Yjs document
  const ydoc = new Y.Doc();
  const ytext = ydoc.getText('monaco');

  // WebSocket provider for sync
  const provider = new WebsocketProvider(
    'wss://recoder.xyz/collab',
    projectId,
    ydoc
  );

  // Bind Monaco editor to Yjs
  const binding = new MonacoBinding(
    ytext,
    editor.getModel()!,
    new Set([editor]),
    provider.awareness
  );

  // Show other cursors
  provider.awareness.on('change', (changes: any) => {
    // Render cursor positions
  });
}
```

**Backend**:
```typescript
// Create WebSocket server for collaboration
import { WebSocketServer } from 'ws';
import { setupWSConnection } from 'y-websocket/bin/utils';

const wss = new WebSocketServer({ port: 3101 });

wss.on('connection', (ws, req) => {
  setupWSConnection(ws, req);
});
```

**Tasks**:
- [ ] Add Yjs + y-websocket
- [ ] Create collaboration WebSocket server
- [ ] Bind Monaco editor to Yjs
- [ ] Show other users' cursors
- [ ] Add user presence indicator
- [ ] Add share link generation

---

### **Priority 6: Package Management UI** (Week 5)

**Problem**: Must manually edit package.json
**Goal**: Visual package installer like Replit

#### Implementation
```tsx
// recoder-web/app/components/workbench/PackageManager.tsx
export function PackageManager() {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);

  const handleSearch = async (query: string) => {
    // Search npm registry
    const res = await fetch(`https://registry.npmjs.org/-/v1/search?text=${query}`);
    const data = await res.json();
    setResults(data.objects);
  };

  const handleInstall = async (packageName: string) => {
    // Run npm install in container
    await runCommand(`npm install ${packageName}`);

    // Refresh package.json
    await refreshFiles();
  };

  return (
    <div className="package-manager">
      <input
        value={search}
        onChange={(e) => handleSearch(e.target.value)}
        placeholder="Search packages..."
      />

      <div className="results">
        {results.map(pkg => (
          <PackageCard
            key={pkg.package.name}
            name={pkg.package.name}
            version={pkg.package.version}
            description={pkg.package.description}
            onInstall={() => handleInstall(pkg.package.name)}
          />
        ))}
      </div>
    </div>
  );
}
```

**Tasks**:
- [ ] Create package search UI
- [ ] Add npm registry search
- [ ] Show installed packages
- [ ] Add install/uninstall buttons
- [ ] Show package versions
- [ ] Auto-detect missing imports

---

### **Priority 7: Deployment Integration** (Week 6)

**Problem**: Can't deploy projects
**Goal**: One-click deploy like Replit

#### Implementation
```typescript
// recoder-web/app/lib/deploy/vercel.ts
export async function deployToVercel(projectId: string) {
  // Get all files
  const files = await getProjectFiles(projectId);

  // Create Vercel deployment
  const deployment = await fetch('https://api.vercel.com/v13/deployments', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.VERCEL_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: projectId,
      files: files.map(f => ({
        file: f.path,
        data: f.content
      })),
      projectSettings: {
        framework: 'vite'
      }
    })
  });

  const { url } = await deployment.json();
  return url;
}
```

```tsx
// recoder-web/app/components/workbench/DeployButton.tsx
export function DeployButton() {
  const [deploying, setDeploying] = useState(false);

  const handleDeploy = async () => {
    setDeploying(true);

    const url = await deployToVercel(projectId);

    setDeploying(false);

    // Show success with URL
    toast.success(`Deployed to ${url}`);
  };

  return (
    <button onClick={handleDeploy} disabled={deploying}>
      {deploying ? 'Deploying...' : 'Deploy to Vercel'}
    </button>
  );
}
```

**Tasks**:
- [ ] Add Vercel API integration
- [ ] Add Railway API integration
- [ ] Add Netlify API integration
- [ ] Create deploy button UI
- [ ] Show deployment status
- [ ] Show deployed URL

---

### **Priority 8: Git Integration** (Week 7-8)

**Problem**: Can't use Git from UI
**Goal**: Match Cursor's Git features

#### Implementation
```typescript
// docker-backend/src/git.ts
import simpleGit from 'simple-git';

export async function initGitInContainer(containerId: string) {
  const git = simpleGit();

  await docker.exec(containerId, ['git', 'init']);
  await docker.exec(containerId, ['git', 'config', 'user.name', 'Recoder User']);
  await docker.exec(containerId, ['git', 'config', 'user.email', 'user@recoder.xyz']);
}

export async function commitChanges(containerId: string, message: string) {
  await docker.exec(containerId, ['git', 'add', '.']);
  await docker.exec(containerId, ['git', 'commit', '-m', message]);
}

export async function pushToGitHub(containerId: string, repo: string, token: string) {
  const remoteUrl = `https://${token}@github.com/${repo}.git`;
  await docker.exec(containerId, ['git', 'remote', 'add', 'origin', remoteUrl]);
  await docker.exec(containerId, ['git', 'push', '-u', 'origin', 'main']);
}
```

**Tasks**:
- [ ] Add Git to containers
- [ ] Create commit UI
- [ ] Add GitHub token management
- [ ] Show diff viewer
- [ ] Add branch management
- [ ] Create PR from UI

---

### **Priority 9: AI Code Intelligence** (Week 9-10)

**Problem**: No AI-powered suggestions
**Goal**: Match Cursor's inline AI

#### Implementation
```typescript
// recoder-web/app/lib/ai/inline-suggestions.ts
export async function getInlineSuggestion(
  code: string,
  cursorPosition: number,
  context: string[]
) {
  const prompt = `Given this code and cursor position, suggest the next line:

  Code:
  ${code}

  Cursor at position: ${cursorPosition}

  Context files:
  ${context.join('\n\n')}

  Return ONLY the suggested code, no explanation.`;

  const suggestion = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 500,
    messages: [{ role: 'user', content: prompt }]
  });

  return suggestion.content[0].text;
}
```

```tsx
// Monaco editor integration
editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyI, () => {
  const position = editor.getPosition();
  const code = editor.getValue();

  getSuggestion(code, position).then(suggestion => {
    editor.executeEdits('ai-suggestion', [{
      range: new monaco.Range(
        position.lineNumber,
        position.column,
        position.lineNumber,
        position.column
      ),
      text: suggestion
    }]);
  });
});
```

**Tasks**:
- [ ] Add inline suggestion API
- [ ] Bind to keyboard shortcut (Cmd+I)
- [ ] Show suggestion ghost text
- [ ] Add "Explain code" command
- [ ] Add "Fix with AI" command
- [ ] Add "Generate tests" command

---

## 📊 Feature Comparison

| Feature | Replit | Bolt.new | Cursor | Recoder |
|---------|--------|----------|--------|---------|
| Multi-file editing | ✅ | ✅ | ✅ | ❌ |
| File tree (folders) | ✅ | ✅ | ✅ | ❌ |
| Live preview | ✅ | ✅ | ❌ | ✅ |
| Terminal | ✅ | ❌ | ✅ | ✅ |
| Package manager UI | ✅ | ✅ | ❌ | ❌ |
| Collaboration | ✅ | ❌ | ❌ | ❌ |
| Git integration | ✅ | ❌ | ✅ | ❌ |
| One-click deploy | ✅ | ✅ | ❌ | ❌ |
| AI code gen | ❌ | ✅ | ✅ | 🟡 |
| Inline AI | ❌ | ❌ | ✅ | ❌ |
| Database UI | ✅ | ❌ | ❌ | ❌ |

**Legend**: ✅ = Has, ❌ = Missing, 🟡 = Partial

---

## 🚀 12-Week Implementation Timeline

### Weeks 1-2: Core Editor Features
- [ ] Multi-file editing with tabs
- [ ] Advanced file tree
- [ ] Container resource limits
- [ ] Container cleanup cron

### Weeks 3-4: AI & Collaboration
- [ ] AI code generation
- [ ] Real-time collaboration
- [ ] Share links

### Weeks 5-6: Package Management & Deploy
- [ ] Visual package manager
- [ ] Vercel deployment
- [ ] Railway deployment

### Weeks 7-8: Git Integration
- [ ] Git commit/push
- [ ] GitHub integration
- [ ] Diff viewer
- [ ] Branch management

### Weeks 9-10: AI Intelligence
- [ ] Inline AI suggestions
- [ ] Code explanation
- [ ] Test generation
- [ ] Fix with AI

### Weeks 11-12: Polish & Scale
- [ ] Performance optimization
- [ ] Error handling
- [ ] Monitoring
- [ ] Load testing

---

## 🔨 Critical Technical Debt

### Immediate
- [ ] Remove console logs
- [ ] Add proper error boundaries
- [ ] Implement retry logic
- [ ] Add loading states (no emojis)

### Short-term
- [ ] Optimize bundle size (4.8MB → <2MB)
- [ ] Add service worker
- [ ] Lazy load Monaco languages
- [ ] Database query optimization

### Long-term
- [ ] Replace in-memory session with Redis
- [ ] Container pooling (pre-warm)
- [ ] Multi-region deployment
- [ ] CDN for static assets

---

**Focus**: Build features in priority order. Don't skip ahead. Each feature must work 100% before moving to next.
