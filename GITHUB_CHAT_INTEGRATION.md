# 🔗 GitHub Sync in Chat Bar

## Feature: Chat-Driven GitHub Workflow

Users can connect GitHub repos and work on them just by chatting - no manual git commands needed.

---

## 🎯 User Experience

### Chat Bar UI:
```
┌─────────────────────────────────────────────────────────┐
│ [🔗 main] [📁 my-project] [⚙️]                          │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Type your message...                                │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                  [Send] │
└─────────────────────────────────────────────────────────┘
```

**Components:**
- `[🔗 main]` - GitHub branch selector (click to switch)
- `[📁 my-project]` - Connected repo name
- `[⚙️]` - GitHub settings dropdown

### Workflow:
1. User clicks "Connect GitHub" in chat bar
2. Selects repo from their GitHub account
3. AI automatically syncs changes to GitHub
4. User can chat: "Add authentication" → AI codes → Auto-commits to GitHub
5. User can switch branches from chat bar

---

## 🏗️ Implementation

### Phase 1: Chat Bar GitHub UI (2 hours)

**File:** `/recoder-web/app/components/chat/GitHubBar.tsx`

```tsx
import { useState, useEffect } from 'react';
import { GitBranch, Github, Settings, Check, Loader2 } from 'lucide-react';

interface GitHubBarProps {
  chatId: string;
  onRepoConnect: (repo: string) => void;
}

export function GitHubBar({ chatId, onRepoConnect }: GitHubBarProps) {
  const [connected, setConnected] = useState(false);
  const [repo, setRepo] = useState<string | null>(null);
  const [branch, setBranch] = useState('main');
  const [syncing, setSyncing] = useState(false);
  const [showRepoSelector, setShowRepoSelector] = useState(false);

  useEffect(() => {
    loadGitHubStatus();
  }, [chatId]);

  async function loadGitHubStatus() {
    const response = await fetch(`/api/chat/${chatId}/github-status`);
    const data = await response.json();
    if (data.connected) {
      setConnected(true);
      setRepo(data.repo);
      setBranch(data.branch);
    }
  }

  async function connectRepo(repoName: string) {
    setSyncing(true);
    await fetch(`/api/chat/${chatId}/github-connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo: repoName })
    });
    setConnected(true);
    setRepo(repoName);
    setSyncing(false);
    onRepoConnect(repoName);
  }

  if (!connected) {
    return (
      <button 
        onClick={() => setShowRepoSelector(true)}
        className="github-connect-btn"
      >
        <Github size={16} />
        Connect GitHub
      </button>
    );
  }

  return (
    <div className="github-bar">
      {/* Branch Selector */}
      <button className="branch-selector">
        <GitBranch size={14} />
        {branch}
      </button>

      {/* Repo Name */}
      <div className="repo-name">
        <Github size={14} />
        {repo}
      </div>

      {/* Sync Status */}
      {syncing && (
        <div className="sync-status">
          <Loader2 size={14} className="animate-spin" />
          Syncing...
        </div>
      )}

      {/* Settings */}
      <button className="github-settings">
        <Settings size={14} />
      </button>
    </div>
  );
}
```

---

### Phase 2: Auto-Sync on AI Response (1 hour)

**File:** `/recoder-web/app/lib/runtime/github-auto-sync.ts`

```typescript
/**
 * Automatically sync file changes to GitHub after AI generates code
 */

export async function autoSyncToGitHub(chatId: string, files: FileChange[]) {
  // Check if GitHub is connected for this chat
  const status = await fetch(`/api/chat/${chatId}/github-status`).then(r => r.json());
  
  if (!status.connected || !status.autoSync) {
    return; // Skip if not connected or auto-sync disabled
  }

  // Get changed files
  const changedFiles = files.filter(f => f.modified);
  
  if (changedFiles.length === 0) return;

  // Create commit message from AI response
  const commitMessage = generateCommitMessage(changedFiles);

  // Push to GitHub
  await fetch(`/api/chat/${chatId}/github-push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      files: changedFiles,
      message: commitMessage,
      branch: status.branch
    })
  });

  console.log(`✅ Auto-synced ${changedFiles.length} files to GitHub`);
}

function generateCommitMessage(files: FileChange[]): string {
  if (files.length === 1) {
    return `Update ${files[0].path}`;
  }
  return `Update ${files.length} files via Recoder AI`;
}
```

**Integrate into action runner:**

**File:** `/recoder-web/app/lib/runtime/action-runner.ts`

```typescript
// After AI completes file generation
async #runFileAction(action: ActionState) {
  // ... existing code ...
  
  // After file is written
  await this.#webcontainer.fs.writeFile(action.filePath, action.content);
  
  // NEW: Auto-sync to GitHub if connected
  if (this.#githubAutoSync) {
    await autoSyncToGitHub(this.chatId, [{ 
      path: action.filePath, 
      content: action.content,
      modified: true 
    }]);
  }
}
```

---

### Phase 3: Backend API Endpoints (2 hours)

**File:** `/recoder-web/app/routes/api.chat.$chatId.github.ts`

```typescript
import { json } from '@remix-run/cloudflare';
import { getSession } from '~/lib/auth/session.server';

// GET /api/chat/:chatId/github-status
export async function loader({ params, request }: LoaderFunctionArgs) {
  const session = await getSession(request);
  if (!session) return json({ error: 'Unauthorized' }, { status: 401 });

  const chatId = params.chatId;
  
  // Get GitHub connection for this chat
  const connection = await db.query(`
    SELECT repo, branch, auto_sync, last_sync
    FROM chat_github_connections
    WHERE chat_id = $1 AND user_id = $2
  `, [chatId, session.user.id]);

  if (!connection[0]) {
    return json({ connected: false });
  }

  return json({
    connected: true,
    repo: connection[0].repo,
    branch: connection[0].branch,
    autoSync: connection[0].auto_sync,
    lastSync: connection[0].last_sync
  });
}

// POST /api/chat/:chatId/github-connect
export async function action({ params, request }: ActionFunctionArgs) {
  const session = await getSession(request);
  if (!session) return json({ error: 'Unauthorized' }, { status: 401 });

  const { repo, branch = 'main' } = await request.json();
  const chatId = params.chatId;

  // Save connection
  await db.query(`
    INSERT INTO chat_github_connections (chat_id, user_id, repo, branch, auto_sync)
    VALUES ($1, $2, $3, $4, true)
    ON CONFLICT (chat_id) DO UPDATE SET repo = $3, branch = $4
  `, [chatId, session.user.id, repo, branch]);

  return json({ success: true });
}

// POST /api/chat/:chatId/github-push
export async function action({ params, request }: ActionFunctionArgs) {
  const session = await getSession(request);
  if (!session) return json({ error: 'Unauthorized' }, { status: 401 });

  const { files, message, branch } = await request.json();
  const chatId = params.chatId;

  // Get connection
  const connection = await getConnection(chatId, session.user.id);
  
  // Get GitHub token
  const token = await getGitHubToken(session.user.id);

  // Push to GitHub using existing api.github.push.ts
  const result = await pushToGitHub({
    repo: connection.repo,
    branch: branch || connection.branch,
    files,
    message,
    token
  });

  // Update last sync time
  await db.query(`
    UPDATE chat_github_connections 
    SET last_sync = NOW() 
    WHERE chat_id = $1
  `, [chatId]);

  return json({ success: true, commit: result.sha });
}
```

---

### Phase 4: Database Schema (30 min)

```sql
-- Link chats to GitHub repos
CREATE TABLE chat_github_connections (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  chat_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  repo TEXT NOT NULL,  -- e.g., "username/repo-name"
  branch TEXT DEFAULT 'main',
  auto_sync BOOLEAN DEFAULT true,
  last_sync TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(chat_id),
  FOREIGN KEY (chat_id) REFERENCES chat_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_chat_github_user ON chat_github_connections(user_id);
CREATE INDEX idx_chat_github_chat ON chat_github_connections(chat_id);
```

---

### Phase 5: Repo Selector Modal (1 hour)

**File:** `/recoder-web/app/components/chat/RepoSelectorModal.tsx`

```tsx
import { useState, useEffect } from 'react';
import { Dialog } from '~/components/ui/Dialog';
import { Github, Search } from 'lucide-react';

export function RepoSelectorModal({ open, onClose, onSelect }: Props) {
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (open) loadRepos();
  }, [open]);

  async function loadRepos() {
    setLoading(true);
    const response = await fetch('/api/github/repos');
    const data = await response.json();
    setRepos(data.repos || []);
    setLoading(false);
  }

  const filtered = repos.filter(r => 
    r.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Dialog open={open} onClose={onClose}>
      <h2>Connect GitHub Repository</h2>
      
      <div className="search-box">
        <Search size={16} />
        <input 
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search repositories..."
        />
      </div>

      <div className="repo-list">
        {loading ? (
          <div>Loading repositories...</div>
        ) : (
          filtered.map(repo => (
            <button
              key={repo.id}
              onClick={() => {
                onSelect(repo.full_name);
                onClose();
              }}
              className="repo-item"
            >
              <Github size={16} />
              <div>
                <div className="repo-name">{repo.name}</div>
                <div className="repo-desc">{repo.description}</div>
              </div>
            </button>
          ))
        )}
      </div>
    </Dialog>
  );
}
```

---

### Phase 6: Integration with Chat UI (30 min)

**File:** `/recoder-web/app/components/chat/BaseChat.tsx`

```tsx
import { GitHubBar } from './GitHubBar';

export function BaseChat() {
  return (
    <div className="chat-container">
      {/* Existing chat header */}
      
      {/* NEW: GitHub Bar */}
      <GitHubBar 
        chatId={chatId}
        onRepoConnect={(repo) => {
          toast.success(`Connected to ${repo}`);
        }}
      />

      {/* Existing chat messages */}
      
      {/* Existing chat input */}
    </div>
  );
}
```

---

## 🎨 UI Design

### Chat Bar with GitHub:
```
┌─────────────────────────────────────────────────────────┐
│ Chat with AI                                      [⚙️]  │
├─────────────────────────────────────────────────────────┤
│ 🔗 Connected to: username/my-repo (main) ✓             │
│    Last synced: 2 minutes ago                           │
│    [Switch Branch] [Disconnect]                         │
├─────────────────────────────────────────────────────────┤
│ [Messages...]                                           │
└─────────────────────────────────────────────────────────┘
```

### Auto-Sync Notification:
```
┌─────────────────────────────────────────┐
│ ✓ Synced to GitHub                      │
│ Committed 3 files to main               │
│ View on GitHub →                        │
└─────────────────────────────────────────┘
```

---

## 📊 Implementation Timeline

| Task | Time | Priority |
|------|------|----------|
| Chat bar GitHub UI | 2 hours | P0 |
| Auto-sync logic | 1 hour | P0 |
| Backend API endpoints | 2 hours | P0 |
| Database schema | 30 min | P0 |
| Repo selector modal | 1 hour | P1 |
| Integration | 30 min | P0 |
| **Total** | **7 hours** | - |

---

## 🚀 User Flow

1. **User opens chat in recoder-web**
2. **Clicks "Connect GitHub"**
3. **Selects repo from their GitHub account**
4. **Chats with AI:** "Add a login page"
5. **AI generates code** → Files created in WebContainer
6. **Auto-sync triggers** → Changes pushed to GitHub
7. **User sees notification:** "✓ Synced to GitHub"
8. **User continues chatting** → All changes auto-sync

---

## ✅ Success Criteria

- [ ] Users can connect GitHub repo from chat bar
- [ ] Changes auto-sync to GitHub after AI generates code
- [ ] Users can see sync status in real-time
- [ ] Users can switch branches from chat bar
- [ ] Users can disable auto-sync if needed
- [ ] Commit messages are meaningful
- [ ] Works with private repos
- [ ] Handles merge conflicts gracefully

---

## 🔒 Security Considerations

1. **GitHub Token Storage:**
   - Store encrypted in database
   - Use user's OAuth token
   - Refresh token when expired

2. **Permissions:**
   - Only sync repos user has write access to
   - Verify repo ownership before pushing
   - Rate limit API calls

3. **Conflict Resolution:**
   - Detect conflicts before pushing
   - Show warning to user
   - Offer manual resolution

---

**Status:** Ready to implement
**Estimated Time:** 7 hours
**Complexity:** Medium
