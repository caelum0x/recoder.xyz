# Recoder.xyz Architecture Overview

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER INTERFACES                                  │
├────────────────────┬─────────────────────┬───────────────────────────────────┤
│   recoder-web      │     app (Next.js)   │      recoder-code CLI             │
│   (Remix + Vite)   │   Marketing + Auth  │      (Terminal AI)                │
│   Browser IDE      │   Billing + Dash    │      108K+ lines                  │
│   localhost:5173   │   localhost:3000    │      Global CLI                   │
├────────────────────┴─────────────────────┴───────────────────────────────────┤
│                              API LAYER                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                         docker-backend (Port 3100)                           │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐           │
│  │  Container  │ │     MCP     │ │   Snapshot  │ │   Browser   │           │
│  │    Pool     │ │   Manager   │ │   Manager   │ │ Automation  │           │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘           │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐           │
│  │  Dev Server │ │   Search    │ │     Git     │ │    Code     │           │
│  │   Manager   │ │   Service   │ │  Operations │ │    Index    │           │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘           │
├─────────────────────────────────────────────────────────────────────────────┤
│                         CONTAINER LAYER (Docker)                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                    recoder-workspace:latest                           │  │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐        │  │
│  │  │ Node.js │ │ Python  │ │  Rust   │ │   Go    │ │   Git   │        │  │
│  │  │   20    │ │    3    │ │  1.75+  │ │  1.21+  │ │  2.43+  │        │  │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘        │  │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐                    │  │
│  │  │ ripgrep │ │ MCP     │ │ Claude  │ │ Chromium│                    │  │
│  │  │         │ │ Servers │ │  Code   │ │ (headless)                   │  │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘                    │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────────────────┤
│                         DATA LAYER                                           │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐                           │
│  │    Neon     │ │    Redis    │ │   Docker    │                           │
│  │ PostgreSQL  │ │  (Sessions) │ │  Volumes    │                           │
│  └─────────────┘ └─────────────┘ └─────────────┘                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

### 1. Recoder-Web (Web IDE)

**Technology:** Remix + React + Vite + Zustand

**Responsibilities:**
- Browser-based code editor (Monaco/CodeMirror)
- AI chat interface with streaming responses
- File tree management
- Terminal UI (xterm.js)
- Live preview iframe
- Problems panel (error detection)
- Logs panel (dev server output)
- Search panel (ripgrep integration)
- Mode selector (Architect/Code/Ask/Debug)
- Slash commands and command palette

**Key Files:**
```
recoder-web/app/
├── components/
│   ├── chat/           # Chat UI, ModeSelector, SlashCommandMenu
│   ├── editor/         # Monaco editor, CodeMirror with inline copilot
│   └── workbench/      # EditorPanel, Terminal, Preview, FileTree
├── lib/
│   ├── .server/llm/    # AI integration (prompts, streaming, tools)
│   ├── stores/         # Zustand state management
│   ├── runtime/        # Action runner, message parser
│   └── hooks/          # Custom React hooks
└── routes/
    └── api.*.ts        # API endpoints
```

### 2. Docker-Backend (Container Orchestration)

**Technology:** Express + Dockerode + WebSocket

**Responsibilities:**
- Container lifecycle management
- Pre-warmed container pool (instant project start)
- Terminal PTY via WebSocket
- File operations (CRUD)
- Dev server management
- Git-based snapshot system
- MCP server lifecycle
- Browser automation (Puppeteer)
- Semantic code indexing
- URL cloning (website replication)
- Cloudflared tunnel management

**Key Modules:**
```
docker-backend/src/
├── server.ts           # Main Express app, all API routes
├── container-pool.ts   # Pre-warm and recycle containers
├── dev-server.ts       # Start/stop/restart dev servers
├── snapshot-manager.ts # Git-based versioning
├── mcp-manager.ts      # MCP server lifecycle
├── browser-automation.ts # Puppeteer headless browser
├── code-index.ts       # OpenAI embeddings + vector search
├── url-cloner.ts       # Clone websites to static files
├── package-manager.ts  # npm/pip/cargo package operations
├── secrets-manager.ts  # .env file management
├── git-operations.ts   # Git commands wrapper
├── search.ts           # Ripgrep integration
└── file-watcher.ts     # Watch for file changes
```

### 3. Main App (Marketing + Auth)

**Technology:** Next.js 14 + Better Auth

**Responsibilities:**
- Marketing pages
- User authentication (email, OAuth)
- API key management (encrypted)
- Billing/subscriptions
- Admin tools (email testing, user management)
- Internal API for service-to-service auth

**Key Files:**
```
app/app/
├── [locale]/
│   ├── page.tsx              # Landing page
│   ├── settings/             # User settings
│   └── verify/               # Email verification
├── api/
│   ├── auth/                 # Better Auth endpoints
│   ├── user/                 # User API (claude-code, ai-provider-keys)
│   └── admin/                # Admin endpoints
└── lib/
    ├── auth/                 # Better Auth config
    └── encryption.ts         # AES-256-GCM key encryption
```

### 4. Recoder-Code CLI

**Technology:** TypeScript + Yargs + OpenRouter

**Responsibilities:**
- Interactive AI chat in terminal
- 50+ slash commands
- 40+ AI model support
- MCP server integration
- Agent system (subagents)
- Cost optimization (caching, compression)
- Parallel mode (git worktrees)
- Web sync (link to recoder-web)

**Key Commands:**
```
recoder-code           # Interactive mode
recoder-code "prompt"  # One-shot
recoder mcp list       # MCP servers
recoder mcp marketplace # MCP marketplace
recoder parallel       # Git worktree parallel execution
recoder web link       # Link to recoder-web
```

## Data Flow Diagrams

### AI Chat Flow

```
┌─────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  User   │───▶│ recoder-web │───▶│  /api/chat  │───▶│  OpenRouter │
│ Browser │    │    Chat     │    │   Route     │    │  /Anthropic │
└─────────┘    └─────────────┘    └─────────────┘    └─────────────┘
                     │                   │                   │
                     ▼                   ▼                   │
              ┌─────────────┐    ┌─────────────┐            │
              │   Action    │◀──│   Stream    │◀───────────┘
              │   Runner    │    │   Parser    │
              └─────────────┘    └─────────────┘
                     │
                     ▼
              ┌─────────────┐
              │   docker-   │
              │   backend   │
              │  File/Exec  │
              └─────────────┘
```

### Container Creation Flow

```
┌─────────┐    ┌─────────────┐    ┌─────────────┐
│ Project │───▶│ POST /api/  │───▶│  Container  │
│  Load   │    │  container  │    │    Pool     │
└─────────┘    └─────────────┘    └─────────────┘
                                        │
                     ┌──────────────────┴──────────────────┐
                     ▼                                     ▼
              ┌─────────────┐                       ┌─────────────┐
              │ Pool has    │                       │ Pool empty  │
              │ available   │                       │ Create new  │
              │ container   │                       │ container   │
              └─────────────┘                       └─────────────┘
                     │                                     │
                     └──────────────────┬──────────────────┘
                                        ▼
                                 ┌─────────────┐
                                 │ Inject env  │
                                 │ vars & keys │
                                 └─────────────┘
                                        │
                                        ▼
                                 ┌─────────────┐
                                 │  Register   │
                                 │ container   │
                                 └─────────────┘
```

### Terminal WebSocket Flow

```
┌─────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ xterm.js│◀──▶│  WebSocket  │◀──▶│   docker-   │◀──▶│  Container  │
│   UI    │    │ /terminal/  │    │   backend   │    │  PTY/Bash   │
└─────────┘    └─────────────┘    └─────────────┘    └─────────────┘
     │                                    │
     │         RPC Messages               │
     ├────────────────────────────────────┤
     │  terminal.resize {cols, rows}      │
     │  terminal.clear                    │
     │  terminal.kill                     │
     │  resetTimer                        │
     └────────────────────────────────────┘
```

### Snapshot System Flow

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ File Edit   │───▶│  Snapshot   │───▶│   Git       │
│             │    │  Manager    │    │ Repository  │
└─────────────┘    └─────────────┘    └─────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
 ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
 │   Manual    │  │ Auto-save   │  │   Error     │
 │  Snapshot   │  │ (5 min)     │  │  Recovery   │
 └─────────────┘  └─────────────┘  └─────────────┘
```

## Security Model

### Authentication Layers

```
┌─────────────────────────────────────────────────────────────┐
│                      Browser (User)                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Better Auth Cookie                      │   │
│  │         recoder.session_token = <token>              │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    API Layer (Remix)                         │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           verifySession(request)                     │   │
│  │    Extracts and validates session from cookie        │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
              Authorization: Bearer <token>
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  Docker Backend                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │         authenticateRequest middleware               │   │
│  │    1. Extract token from Authorization header        │   │
│  │    2. Verify with main app /api/auth/verify-token    │   │
│  │    3. Attach userId to request                       │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │        verifyProjectOwnership middleware             │   │
│  │    1. Check userId owns projectId                    │   │
│  │    2. Call main app /api/project/verify-ownership    │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Container Security

```
Container Hardening:
├── CapDrop: ALL
├── CapAdd: [CHOWN, SETUID, SETGID, DAC_OVERRIDE, FOWNER, NET_BIND_SERVICE]
├── SecurityOpt: [no-new-privileges, seccomp=unconfined]
├── PidsLimit: 256
├── Memory: 2GB (configurable)
├── CPU: 100% of 1 core (configurable)
├── Ulimits:
│   ├── nofile: 4096 soft, 8192 hard
│   └── nproc: 128 soft, 256 hard
└── Tmpfs: /tmp (512MB, noexec, nosuid)
```

### Input Sanitization

```typescript
// Path sanitization (prevents traversal)
sanitizePath(path)
  .replace(/\.\.\//g, '')      // No ../ traversal
  .replace(/[;&|`$(){}]/g, '') // No shell metacharacters
  .replace(/[\r\n]/g, '')      // No newlines
  .replace(/^\/+/, '')         // Force relative to workspace

// Command validation (blocks dangerous patterns)
blockedPatterns: [
  /docker\s/i,           // Docker commands
  /nsenter/i,            // Namespace escape
  /\/proc\/1/,           // PID 1 access
  /chroot/i,             // Chroot escape
  /mount\s/i,            // Mount commands
  /curl.*\|\s*sh/i,      // Piped scripts
  /rm\s+-rf\s+\//,       // Root deletion
]
```

### API Key Encryption

```
┌─────────────────────────────────────────────────────────────┐
│                    Main App (Next.js)                        │
│                                                              │
│    User API Key  ───▶  AES-256-GCM Encrypt  ───▶  Database  │
│                              │                               │
│                        ENCRYPTION_KEY                        │
│                    (from environment)                        │
└─────────────────────────────────────────────────────────────┘
```

## Multi-Mode System

The AI operates in different modes with specific capabilities:

```
┌─────────────────────────────────────────────────────────────┐
│                         Modes                                │
├─────────────┬───────────────────────────────────────────────┤
│ Architect   │ Planning & design, markdown editing only      │
│ (purple)    │ Tools: read, browser, mcp                     │
├─────────────┼───────────────────────────────────────────────┤
│ Code        │ Implementation, all file operations           │
│ (blue)      │ Tools: read, edit, browser, command, mcp      │
├─────────────┼───────────────────────────────────────────────┤
│ Ask         │ Q&A and explanations, read-only               │
│ (green)     │ Tools: read, browser, mcp                     │
├─────────────┼───────────────────────────────────────────────┤
│ Debug       │ Diagnose and fix issues                       │
│ (red)       │ Tools: read, edit, browser, command, mcp      │
├─────────────┼───────────────────────────────────────────────┤
│ Orchestrator│ Coordinate subtasks, delegate to other modes  │
│ (yellow)    │ Spawns tasks with spawn_task action           │
└─────────────┴───────────────────────────────────────────────┘
```

## MCP Integration

```
┌─────────────────────────────────────────────────────────────┐
│                   MCP Server Lifecycle                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. User requests MCP server (e.g., "github")               │
│                      │                                       │
│                      ▼                                       │
│  2. Check if pre-installed or NPX server                    │
│     ┌─────────────┐    ┌─────────────┐                      │
│     │Pre-installed│    │  NPX Server │                      │
│     │  (instant)  │    │ (download)  │                      │
│     └─────────────┘    └─────────────┘                      │
│                      │                                       │
│                      ▼                                       │
│  3. Start server process inside container                   │
│                      │                                       │
│                      ▼                                       │
│  4. Extract available tools                                 │
│                      │                                       │
│                      ▼                                       │
│  5. Register tools with AI system                           │
│                      │                                       │
│                      ▼                                       │
│  6. Auto-kill after 5 min idle (resource management)        │
│                                                              │
│  Max 3 servers per project                                  │
│                                                              │
└─────────────────────────────────────────────────────────────┘

Pre-installed Servers (instant):
├── filesystem    - File operations
├── memory        - Key-value storage
├── fetch         - HTTP requests
├── time          - Time utilities
└── sequential-thinking - Structured problem solving

NPX Servers (download on first use):
├── github        - GitHub API (requires token)
├── brave-search  - Web search (requires key)
├── postgresql    - Database operations
├── sqlite        - SQLite operations
└── slack         - Slack integration (requires token)
```

## Scaling Considerations

### Current Architecture (Single Server)

```
┌─────────────────────────────────────────────────────────────┐
│                    Single Hetzner Server                     │
│                     (16-64GB RAM)                            │
├─────────────────────────────────────────────────────────────┤
│  nginx (reverse proxy)                                       │
│      │                                                       │
│      ├──▶ docker-backend :3100                              │
│      ├──▶ recoder-web :5173                                 │
│      └──▶ app :3000                                         │
│                                                              │
│  Container Pool: 10-25 warm containers                      │
│  Max Users: ~20-50 concurrent                               │
└─────────────────────────────────────────────────────────────┘
```

### Future Scaling (Multi-Server)

```
                    ┌─────────────┐
                    │   Load      │
                    │  Balancer   │
                    └─────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
 ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
 │   Server 1  │  │   Server 2  │  │   Server N  │
 │  (docker-   │  │  (docker-   │  │  (docker-   │
 │   backend)  │  │   backend)  │  │   backend)  │
 └─────────────┘  └─────────────┘  └─────────────┘
        │                 │                 │
        └─────────────────┼─────────────────┘
                          ▼
                 ┌─────────────┐
                 │    Redis    │
                 │  (Sessions) │
                 └─────────────┘
                          │
                          ▼
                 ┌─────────────┐
                 │ PostgreSQL  │
                 │  (Shared)   │
                 └─────────────┘
```

**Required Changes:**
1. Centralized Redis for session/container state
2. Shared PostgreSQL for project data
3. Container state synchronization
4. Sticky sessions or container routing
5. Kubernetes/Docker Swarm for orchestration
