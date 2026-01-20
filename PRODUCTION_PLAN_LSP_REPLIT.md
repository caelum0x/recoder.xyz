# Production Plan: LSP & Replit-like Features

**Created**: January 19, 2026
**Goal**: Full Replit/Cursor parity with Language Servers + Production API Service

---

## Current State Summary

### What's Working
- Multi-language runtime (Node.js, Python, Rust, Go, Java) ✅
- Docker containers with auto-install/dev-server ✅
- Clone URL feature ✅
- One-click deploy (cloudflared tunnels) ✅
- MCP Marketplace ✅
- Browser automation ✅
- Code Index (semantic search) ✅
- Multi-mode AI (Architect/Code/Ask/Debug/Orchestrator) ✅
- Inline autocomplete ✅
- Task automation (slash commands) ✅

### What's Missing for Replit Parity
1. **Language Server Protocol (LSP)** - Real autocomplete, go-to-definition, hover docs
2. **Package Management UI** - Visual package installer
3. **Secrets/Environment Variables UI** - .env management
4. **Git Integration UI** - Visual git operations
5. **Database Explorer UI** - View/edit database tables
6. **Console/REPL Panel** - Interactive language REPLs
7. **Multiplayer/Collaboration** - Real-time co-editing (future)

---

## Phase 1: Language Server Protocol (LSP) Integration

### Why LSP?
- **Real autocomplete** - Not just AI suggestions, actual language-aware completions
- **Go-to-definition** - Click to jump to function/class definitions
- **Hover documentation** - See types/docs on hover
- **Find references** - Find all usages of a symbol
- **Rename symbol** - Refactor across entire codebase
- **Diagnostics** - Real-time errors/warnings (not just build output)

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         BROWSER (Monaco)                         │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    Monaco Editor                             ││
│  │  • LSP Client (monaco-languageclient)                       ││
│  │  • WebSocket connection to LSP proxy                        ││
│  └─────────────────────────────────────────────────────────────┘│
└────────────────────────┬────────────────────────────────────────┘
                         │ WebSocket
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                     docker-backend (Port 3100)                   │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │              LSP Proxy Service                               ││
│  │  • Route LSP messages to correct container                  ││
│  │  • Manage LSP server lifecycles                             ││
│  │  • Handle reconnection/failover                             ││
│  └─────────────────────────────────────────────────────────────┘│
└────────────────────────┬────────────────────────────────────────┘
                         │ stdio/WebSocket
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Docker Container                             │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐│
│  │TypeScript  │  │  Python    │  │   Rust     │  │    Go      ││
│  │LSP Server  │  │LSP Server  │  │LSP Server  │  │LSP Server  ││
│  │(tsserver)  │  │(pylsp/     │  │(rust-      │  │(gopls)     ││
│  │            │  │ pyright)   │  │ analyzer)  │  │            ││
│  └────────────┘  └────────────┘  └────────────┘  └────────────┘│
│                                                                  │
│  Pre-installed in Docker image for instant startup               │
└─────────────────────────────────────────────────────────────────┘
```

### LSP Servers to Install

| Language | Server | npm/pip Package | Features |
|----------|--------|-----------------|----------|
| TypeScript/JS | tsserver | `typescript` (bundled) | Full TS support |
| Python | Pyright | `pyright` | Fast, accurate types |
| Rust | rust-analyzer | System package | Full Rust support |
| Go | gopls | `golang.org/x/tools/gopls` | Full Go support |
| Java | jdtls | Eclipse JDT | Java 17+ |
| HTML/CSS | vscode-langservers | `vscode-langservers-extracted` | HTML, CSS, JSON |

### Implementation Files

**docker-backend:**
```
docker-backend/
├── src/
│   ├── lsp-manager.ts          # NEW - LSP server lifecycle management
│   ├── lsp-proxy.ts            # NEW - WebSocket proxy for LSP messages
│   └── server.ts               # Add LSP endpoints
└── docker/
    └── Dockerfile              # Add LSP server packages
```

**recoder-web:**
```
recoder-web/
├── app/
│   ├── components/
│   │   └── editor/
│   │       └── MonacoEditor.tsx  # Modify - Add LSP client
│   └── lib/
│       └── lsp/
│           ├── client.ts         # NEW - LSP WebSocket client
│           └── languages.ts      # NEW - Language configurations
```

### Dockerfile Additions

```dockerfile
# LSP Servers
RUN npm install -g typescript typescript-language-server
RUN npm install -g pyright
RUN npm install -g vscode-langservers-extracted
RUN npm install -g @volar/vue-language-server
RUN npm install -g bash-language-server
RUN npm install -g dockerfile-language-server-nodejs

# Rust analyzer (binary)
RUN curl -L https://github.com/rust-lang/rust-analyzer/releases/latest/download/rust-analyzer-x86_64-unknown-linux-gnu.gz | gunzip -c - > /usr/local/bin/rust-analyzer && chmod +x /usr/local/bin/rust-analyzer

# Go LSP
RUN go install golang.org/x/tools/gopls@latest
```

### API Endpoints

```
WebSocket /api/lsp/:projectId/:language
  - Connect to LSP server for specific language
  - Messages: JSON-RPC (LSP protocol)

POST /api/lsp/:projectId/start
  - Body: { language: "typescript" }
  - Starts LSP server in container

POST /api/lsp/:projectId/stop
  - Body: { language: "typescript" }
  - Stops LSP server

GET /api/lsp/:projectId/status
  - Returns running LSP servers
```

---

## Phase 2: Package Management UI

### Features
- Visual search for packages (npm, pip, cargo, go)
- One-click install
- Version selection
- Installed packages list
- Dependency tree visualization
- Vulnerability warnings

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    PackageManagerPanel.tsx                       │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │  Search Bar     │  │ Installed List  │  │ Package Details │ │
│  │  [npm registry] │  │ - react 18.2.0  │  │ Name: lodash    │ │
│  │                 │  │ - lodash 4.17   │  │ Version: 4.17.21│ │
│  │ Results:        │  │ - axios 1.6     │  │ Size: 72kb      │ │
│  │ - lodash        │  │                 │  │ [Install]       │ │
│  │ - lodash-es     │  │ [Update All]    │  │ [View on npm]   │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Implementation Files

**recoder-web:**
```
recoder-web/app/components/workbench/
├── PackageManagerPanel.tsx     # NEW - Main package manager UI
├── PackageSearch.tsx           # NEW - Search component
├── PackageList.tsx             # NEW - Installed packages list
└── PackageDetails.tsx          # NEW - Package details modal
```

**docker-backend:**
```
docker-backend/src/
├── package-manager.ts          # NEW - Package operations
└── server.ts                   # Add package endpoints
```

### API Endpoints

```
GET /api/packages/:projectId
  - Returns installed packages from package.json/requirements.txt/Cargo.toml/go.mod

POST /api/packages/:projectId/search
  - Body: { query: "lodash", registry: "npm" }
  - Searches npm/PyPI/crates.io/pkg.go.dev

POST /api/packages/:projectId/install
  - Body: { name: "lodash", version: "latest", registry: "npm" }
  - Runs npm install/pip install/cargo add/go get

POST /api/packages/:projectId/uninstall
  - Body: { name: "lodash", registry: "npm" }

POST /api/packages/:projectId/update
  - Body: { name: "lodash", version: "4.18.0" }
```

---

## Phase 3: Secrets/Environment Variables UI

### Features
- Visual .env editor
- Encrypted storage (already have encryption)
- Per-environment configs (dev, staging, prod)
- Secret masking in UI
- Import/export .env files

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                       SecretsPanel.tsx                           │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ Environment: [Development ▼]  [+ Add Variable]  [Import]    ││
│  ├─────────────────────────────────────────────────────────────┤│
│  │ Variable Name          │ Value              │ Actions       ││
│  ├────────────────────────┼────────────────────┼───────────────┤│
│  │ DATABASE_URL           │ ••••••••••••••••   │ [Edit] [Del]  ││
│  │ OPENAI_API_KEY         │ ••••••••••••••••   │ [Edit] [Del]  ││
│  │ STRIPE_SECRET_KEY      │ ••••••••••••••••   │ [Edit] [Del]  ││
│  │ JWT_SECRET             │ ••••••••••••••••   │ [Edit] [Del]  ││
│  └─────────────────────────────────────────────────────────────┘│
│  [Save to Container]  [Download .env]  [Clear All]              │
└─────────────────────────────────────────────────────────────────┘
```

### Implementation Files

```
recoder-web/app/components/workbench/
├── SecretsPanel.tsx            # NEW - Main secrets UI
├── SecretEditor.tsx            # NEW - Add/edit secret modal
└── EnvironmentSelector.tsx     # NEW - Dev/staging/prod selector

recoder-web/app/lib/stores/
├── secrets.ts                  # NEW - Secrets state management

recoder-web/app/routes/
├── api.secrets.ts              # NEW - Secrets API

docker-backend/src/
├── secrets-manager.ts          # NEW - Inject secrets into container
```

### Data Model

```typescript
interface ProjectSecret {
  id: string;
  projectId: string;
  name: string;
  encryptedValue: string;  // AES-256-GCM encrypted
  environment: 'development' | 'staging' | 'production';
  createdAt: Date;
  updatedAt: Date;
}
```

### Database Migration

```sql
CREATE TABLE project_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  encrypted_value TEXT NOT NULL,
  environment VARCHAR(50) DEFAULT 'development',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(project_id, name, environment)
);
```

---

## Phase 4: Git Integration UI

### Features
- Visual git status (changed/staged/untracked files)
- Commit with message
- Branch management (create, switch, merge)
- Push/pull buttons
- Diff viewer
- Conflict resolution UI

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        GitPanel.tsx                              │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ Branch: [main ▼]  [+ New Branch]  [Pull]  [Push]            ││
│  ├─────────────────────────────────────────────────────────────┤│
│  │ STAGED CHANGES (2)                              [Unstage]   ││
│  │   ✓ src/App.tsx                                 [View Diff] ││
│  │   ✓ package.json                                [View Diff] ││
│  ├─────────────────────────────────────────────────────────────┤│
│  │ CHANGES (3)                                     [Stage All] ││
│  │   M src/components/Header.tsx                   [Stage]     ││
│  │   A src/utils/helpers.ts                        [Stage]     ││
│  │   D src/old-file.ts                             [Stage]     ││
│  ├─────────────────────────────────────────────────────────────┤│
│  │ Commit Message:                                             ││
│  │ ┌─────────────────────────────────────────────────────────┐ ││
│  │ │ feat: add user authentication                          │ ││
│  │ └─────────────────────────────────────────────────────────┘ ││
│  │                                              [Commit]       ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### Implementation Files

```
recoder-web/app/components/workbench/
├── GitPanel.tsx                # NEW - Main git UI
├── GitStatusList.tsx           # NEW - File status list
├── GitDiffViewer.tsx           # NEW - Side-by-side diff
├── GitBranchSelector.tsx       # NEW - Branch dropdown
└── GitConflictResolver.tsx     # NEW - Merge conflict UI

recoder-web/app/lib/stores/
├── git.ts                      # NEW - Git state management

docker-backend/src/
├── git-operations.ts           # NEW - Git commands wrapper
```

### API Endpoints

```
GET /api/git/:projectId/status
  - Returns { staged: [], unstaged: [], untracked: [], branch: "main" }

POST /api/git/:projectId/stage
  - Body: { files: ["src/App.tsx"] }

POST /api/git/:projectId/unstage
  - Body: { files: ["src/App.tsx"] }

POST /api/git/:projectId/commit
  - Body: { message: "feat: add feature" }

POST /api/git/:projectId/push
POST /api/git/:projectId/pull

GET /api/git/:projectId/branches
POST /api/git/:projectId/branch
  - Body: { name: "feature/auth", checkout: true }

POST /api/git/:projectId/checkout
  - Body: { branch: "main" }

GET /api/git/:projectId/diff
  - Query: ?file=src/App.tsx
  - Returns unified diff

GET /api/git/:projectId/log
  - Query: ?limit=50
  - Returns commit history
```

---

## Phase 5: Database Explorer UI

### Features
- Connect to PostgreSQL/MySQL/SQLite
- Visual table browser
- Run SQL queries
- View/edit rows
- Export data (CSV, JSON)
- Schema visualization

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      DatabasePanel.tsx                           │
│  ┌─────────────────┐  ┌─────────────────────────────────────────┐│
│  │ CONNECTIONS     │  │ Query Editor                            ││
│  │ ├─ PostgreSQL   │  │ ┌─────────────────────────────────────┐ ││
│  │ │  ├─ users     │  │ │ SELECT * FROM users WHERE id > 5;  │ ││
│  │ │  ├─ posts     │  │ └─────────────────────────────────────┘ ││
│  │ │  └─ comments  │  │                           [Run Query]   ││
│  │ └─ SQLite       │  ├─────────────────────────────────────────┤│
│  │    └─ local.db  │  │ Results (25 rows)        [Export CSV]  ││
│  │                 │  │ ┌────┬──────────┬─────────────────────┐ ││
│  │ [+ Connection]  │  │ │ id │ name     │ email               │ ││
│  │                 │  │ ├────┼──────────┼─────────────────────┤ ││
│  └─────────────────┘  │ │ 1  │ John Doe │ john@example.com    │ ││
│                       │ │ 2  │ Jane Doe │ jane@example.com    │ ││
│                       │ └────┴──────────┴─────────────────────┘ ││
│                       └─────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### Implementation Files

```
recoder-web/app/components/workbench/
├── DatabasePanel.tsx           # NEW - Main database UI
├── DatabaseTree.tsx            # NEW - Tables/schemas tree
├── QueryEditor.tsx             # NEW - SQL editor with syntax highlighting
├── ResultsTable.tsx            # NEW - Query results grid
└── ConnectionModal.tsx         # NEW - Add database connection

recoder-web/app/lib/stores/
├── database.ts                 # NEW - Database connections state

docker-backend/src/
├── database-explorer.ts        # NEW - Database query execution
```

### Supported Databases

| Database | Package | Connection String |
|----------|---------|-------------------|
| PostgreSQL | pg | postgres://user:pass@host:5432/db |
| MySQL | mysql2 | mysql://user:pass@host:3306/db |
| SQLite | better-sqlite3 | /workspace/data.db |
| MongoDB | mongodb | mongodb://user:pass@host:27017/db |

---

## Phase 6: Console/REPL Panel

### Features
- Language-specific REPLs (Node, Python, etc.)
- Command history
- Multi-line input
- Syntax highlighting
- Variable inspection

### Languages

| Language | REPL Command |
|----------|--------------|
| Node.js | `node` |
| Python | `python3` |
| Ruby | `irb` |
| Go | `gore` (if installed) |
| Rust | `evcxr` (Rust REPL) |

---

## Implementation Priority

### Week 1: LSP Foundation
1. Add LSP server packages to Docker image
2. Create `lsp-manager.ts` in docker-backend
3. Implement WebSocket proxy for LSP messages
4. Basic Monaco LSP client integration

### Week 2: LSP Completion
1. Test TypeScript/Python/Go LSP integration
2. Add go-to-definition, hover, references
3. Fix any Monaco integration issues
4. Add diagnostics (real-time errors)

### Week 3: Package Manager UI
1. Create PackageManagerPanel component
2. Implement search API (npm, PyPI)
3. Install/uninstall functionality
4. Dependency tree visualization

### Week 4: Secrets & Git UI
1. Create SecretsPanel component
2. Database migration for secrets
3. Create GitPanel component
4. Git status/stage/commit/push

### Week 5: Database Explorer
1. Create DatabasePanel component
2. PostgreSQL/SQLite connection
3. Query editor with Monaco
4. Results table with pagination

### Week 6: Polish & Testing
1. End-to-end testing all features
2. Performance optimization
3. Documentation
4. Bug fixes

---

## Files to Create Summary

### docker-backend
```
src/
├── lsp-manager.ts              # LSP server lifecycle
├── lsp-proxy.ts                # WebSocket proxy
├── package-manager.ts          # Package operations
├── secrets-manager.ts          # Secrets injection
├── git-operations.ts           # Git commands
├── database-explorer.ts        # DB queries
```

### recoder-web
```
app/components/workbench/
├── PackageManagerPanel.tsx
├── SecretsPanel.tsx
├── GitPanel.tsx
├── DatabasePanel.tsx
├── ConsolePanel.tsx

app/lib/stores/
├── packages.ts
├── secrets.ts
├── git.ts
├── database.ts

app/lib/lsp/
├── client.ts
├── languages.ts

app/routes/
├── api.packages.ts
├── api.secrets.ts
├── api.git.ts
├── api.database.ts
```

---

## Testing Checklist

### LSP
- [ ] TypeScript autocomplete works
- [ ] Go-to-definition jumps correctly
- [ ] Hover shows type information
- [ ] Diagnostics show real-time errors
- [ ] Find references works
- [ ] Works for Python/Go/Rust

### Package Manager
- [ ] Search returns relevant packages
- [ ] Install adds to package.json
- [ ] Uninstall removes package
- [ ] Version selection works
- [ ] Shows installed packages

### Secrets
- [ ] Can add new secret
- [ ] Values are encrypted in DB
- [ ] Secrets injected into container
- [ ] Can switch environments
- [ ] Export/import .env works

### Git
- [ ] Status shows correct files
- [ ] Stage/unstage works
- [ ] Commit creates new commit
- [ ] Push sends to remote
- [ ] Branch switching works
- [ ] Diff viewer shows changes

### Database
- [ ] Can connect to PostgreSQL
- [ ] Tables shown in tree
- [ ] Query execution works
- [ ] Results display correctly
- [ ] Export to CSV/JSON works

---

## Questions Before Starting

1. **LSP Priority**: Start with TypeScript only, or all languages at once?
2. **Git Authentication**: How should users authenticate for push/pull? (SSH keys, personal access tokens)
3. **Database Connections**: Store connection strings encrypted in DB?
4. **Replit Secrets**: Copy their "Environment Variables" UX exactly?

---

Ready to start implementation when you approve this plan!
