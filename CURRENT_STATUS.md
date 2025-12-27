# 🎯 Recoder.xyz - Technical Status & Competitor Analysis

**Last Updated**: December 27, 2025
**Goal**: Feature parity with Replit, Cursor, and Bolt.new + Terminal CLI Integration

---

## ✅ What We Have (MVP)

### Working Features
- File creation and editing with Monaco editor
- Live preview using Docker containers with HTTP proxy
- Terminal access via WebSocket PTY
- AI chat integration (Claude, OpenRouter, Groq)
- Project creation from starter templates
- Chat history stored in PostgreSQL
- Authentication via Better Auth

### Infrastructure
- Docker backend running on port 3100 for container orchestration
- Next.js frontend on port 5173
- Neon PostgreSQL database for persistence
- WebSocket connections for terminal interaction
- HTTP proxy system for live preview

---

## 🖥️ Terminal CLI Integration (Critical Priority)

### Overview
Users need to be able to use industry-standard terminal CLIs directly within our web platform, with live preview integration. This is a major competitive advantage that combines the power of terminal-based AI tools with our visual interface.

### Claude Code Integration

**Why This Matters**: Claude Code from Anthropic is the most popular AI development CLI. It has over 5 million users and generates $40M+ ARR. Launched in 2025, it's powered by Sonnet 4.5 and includes features like automatic checkpointing, VS Code integration, and Slack integration. Users want Claude Code but need visual feedback - we provide that.

**Technical Approach**:
- Users sign in to their Anthropic accounts directly from recoder.xyz
- Claude Code CLI runs inside the Docker container terminal
- All terminal output is captured in real-time via our WebSocket PTY
- When Claude Code makes file changes, our file watcher detects them
- Live preview automatically refreshes to show Claude Code's work
- Users see both the terminal conversation with Claude AND the visual results

**User Flow**:
1. User clicks "Connect Anthropic Account" in settings
2. OAuth flow to authenticate with Anthropic
3. Claude Code CLI is pre-installed in container
4. User runs "claude-code" command in terminal
5. Interacts with Claude naturally via terminal
6. Live preview shows results in real-time as Claude writes code
7. User can switch between terminal and visual editing seamlessly

**Key Features to Implement**:
- Anthropic OAuth integration for account linking
- Pre-installed Claude Code CLI in Docker images
- File system watcher to detect Claude Code changes
- Automatic preview refresh on file changes
- Session persistence across container restarts
- Usage tracking and API key management
- Support for Claude Code's checkpoint system
- Integration with Claude Code's VS Code extension protocol

### Recoder-Code Integration

**What It Is**: Our existing terminal CLI (v2.4.5 on npm) that needs platform integration. Currently works standalone with 40+ AI models. We need to connect it to recoder-web for bidirectional sync and live preview.

**Current Features** (already built):
- Published on npm as recoder-code v2.4.5
- Supports 40+ AI models via OpenRouter (Claude, GPT-4, Gemini, DeepSeek, Qwen3)
- Tool calling and agentic workflows with 17 MCP servers
- Interactive terminal UI with file operations
- Sandbox mode (Docker/macOS isolation)
- Image generation, PDF analysis, audio support
- Cost optimization with prompt caching

**What We Need to Add**:

Platform Integration:
- WebSocket connection to recoder-web backend
- Bidirectional file sync with web editor
- Project association between CLI and web
- Shared chat history across CLI and web interfaces
- Live preview URL display when running in platform
- Container detection (running local vs in our Docker containers)
- Session persistence across platforms

Ollama Integration (Local AI):
- Add Ollama provider support for privacy-focused development
- Local model execution without API costs
- Support popular models (Llama, Mistral, CodeLlama, etc.)
- Automatic model download and management
- Fallback to cloud models when local unavailable
- Cost savings for development and testing

**User Flow**:
1. User installs via "npm install -g recoder-code" (already available)
2. Links API keys (Claude, OpenAI, Groq, Gemini) via existing setup wizard
3. NEW: Connects to recoder.xyz account for project sync
4. NEW: Can work on projects locally or in platform containers
5. NEW: Changes made in CLI sync to web editor in real-time
6. NEW: Live preview automatically reflects CLI changes

**Integration Requirements**:
- Add recoder.xyz account authentication to CLI
- Build WebSocket client for real-time sync
- Implement file watcher that pushes to platform
- Pull platform changes to local CLI session
- Display live preview URL in CLI when connected
- Support offline mode (CLI works without platform)

### Platform Integration Benefits

**Unique Value Proposition**: We're the only platform that combines terminal CLI power with live visual preview. Competitors have either CLI (Claude Code, cursor terminal) OR visual (Bolt.new, Replit) - not both.

**Implementation Priority**: This should be Priority 0 (before current Priority 1). Terminal CLI integration is a major differentiator and attracts the developer community that prefers terminal workflows.

**Technical Requirements**:
- OAuth flows for Anthropic, OpenAI, and other providers
- Secure API key storage and rotation
- Real-time file system watching in containers
- Bidirectional sync between terminal CLI and web editor
- Container restart handling without losing CLI state
- Usage metering for CLI-initiated API calls
- Support for multiple CLIs running simultaneously
- Terminal multiplexing for multiple AI agents

---

## ❌ What Competitors Have That We Don't

### Replit (2025 Analysis)

**What They Have**:

Real-time multiplayer collaboration where everyone joins the same workspace, edits together, and chats inline with zero setup. Their Ghostwriter AI provides inline code completions, contextual explanations, code transformations, and full code generation from natural language. They announced Plan Mode in September 2025 for better collaboration with Replit Agent.

Multi-file editing with tabs and split view. We can only edit one file at a time with no tab system.

Advanced file tree with folder creation, file renaming, drag-drop functionality, and file search. Our file tree is basic with no folder management through UI.

Visual package management with dependency detection. They compress the entire development workflow inside a single workspace powered by Ghostwriter and Agent 3.

One-click deployment with automatic HTTPS and custom domains. We have no deployment integration.

Built-in PostgreSQL database with UI and Redis integration. We have no database management features.

**Our Gap**: Multi-file editing, advanced file tree, package manager UI, deployment, real-time collaboration, database UI.

### Bolt.new (2025 Analysis)

**What They Have**:

AI with complete environment control - their AI models control the filesystem, node server, package manager, terminal, and browser console. This empowers AI agents to handle the entire app lifecycle from creation to deployment. As of March 2025, they're generating $40M ARR with 5 million users.

Natural language to full-stack code generation powered by StackBlitz's WebContainers technology. You type an idea, Bolt transforms it into a working product in minutes.

Now available in AWS Marketplace as of December 2025. Integrates with Figma for design, GitHub for version control, Expo for mobile apps, and Stripe for payments.

Mobile preview mode with responsive testing. Dev tools integrated into preview. Template marketplace where users can save and share templates.

**Our Gap**: We have basic chat but can't generate full-stack apps from descriptions. No template marketplace. No mobile preview mode. No platform integrations.

### Cursor (2025 Analysis)

**What They Have**:

Terminal integration where agents can run in any terminal or script. Sandboxed terminals are generally available for macOS with agent commands running in secure sandbox by default in version 2.0. Shell commands run with read/write access to workspace but no internet access for security.

AI code reviews to find and fix bugs directly in Cursor with issues displayed in sidepanel. Cursor 2.1 responds with clarifying questions when creating plans and shows interactive UI for answers.

New editor with sidebar for agents and plans that can run up to eight agents in parallel on a single prompt. Built-in speech-to-text functionality.

Inline code suggestions, "fix with AI" button when errors appear in terminal, code explanation via Quick Question feature, test generation, and refactoring suggestions.

Code intelligence features: Go to Definition, Find References, auto-import, intelligent autocomplete.

Full Git integration with GitHub, commit/push from UI, diff viewer, and branch management.

**Our Gap**: No inline AI suggestions. No code intelligence. No Git integration. No AI code reviews. No multi-agent parallel execution.

---

## 🔧 Technical Implementation Plan

### Priority 0: Terminal CLI Integration (Weeks 1-3)

**Phase 1 - Claude Code Integration**:

Build Anthropic OAuth authentication flow for users to link accounts. Research and implement Anthropic's OAuth 2.0 endpoints and scopes. Store access tokens securely in PostgreSQL with encryption. Build settings UI for account linking and management.

Install Claude Code CLI in Docker container base images. Update Dockerfile to include latest Claude Code NPM package. Configure environment variables for Anthropic API access. Test CLI functionality inside containers.

Implement real-time file watching system. Use chokidar or similar to watch all files in container. Detect changes made by Claude Code. Trigger file list refresh in frontend. Update Monaco editor content if file is open. Refresh live preview automatically.

Build terminal session persistence. Store Claude Code session state in Redis. Restore conversations when container restarts. Link terminal sessions to user accounts. Implement session timeout handling.

**Phase 2 - Recoder-Code Platform Integration**:

Add recoder.xyz authentication to existing CLI. Implement account login flow. Store authentication tokens securely. Handle token refresh and expiration. Support logout and account switching.

Build WebSocket client for platform communication. Connect to recoder-web backend. Implement reconnection logic. Handle connection state changes. Show connection status in CLI.

Implement bidirectional file sync protocol. Watch local file changes and push to platform. Pull remote changes from web editor. Handle conflict resolution with user prompts. Maintain sync state and history. Queue changes during offline mode.

Add project association and management. Link CLI sessions to web projects. Create projects from CLI. List and switch between projects. Display live preview URLs. Sync chat history across platforms.

Implement Ollama integration for local AI. Add Ollama provider to recoder-code. Support model download and management. Detect available local models. Enable offline AI development. Fallback to cloud when local models unavailable. Show model source (local vs cloud) in UI.

**Phase 3 - Platform Integration**:

Build unified terminal experience. Support multiple CLI tools running simultaneously. Implement terminal multiplexing. Show AI activity indicators. Create split view for terminal + preview.

Add usage metering for CLI operations. Track API calls initiated by CLI. Display usage in user dashboard. Implement billing for API usage. Show cost estimates before operations.

Create OAuth manager for multiple providers. Support Anthropic, OpenAI, Google, and others. Implement token refresh logic. Handle revocation and re-authentication. Show connection status in UI.

### Priority 1: Multi-File Editing (Week 4)

**Goal**: Match Replit's editor tabs system.

Create editor state management using nanostores. Design store to track array of open files with path, content, modified flag, and Monaco instance. Implement functions to open file, close file, switch active file, save file, and save all files.

Build tab bar UI component. Show all open files as tabs. Highlight active tab. Display modified indicator (dot). Add close button per tab. Implement drag-to-reorder. Support tab overflow scrolling.

Add keyboard shortcuts. Command+W to close active tab. Command+Tab to switch tabs. Command+S to save active file. Command+Shift+S to save all files. Command+1 through Command+9 for tab navigation.

Optimize Monaco editor instances. Reuse editor instances when switching tabs. Only change the model, don't recreate editor. Dispose unused models to free memory. Lazy load language support.

### Priority 2: Advanced File Tree (Week 5)

**Goal**: Match Replit's file explorer with full folder management.

Design file tree data structure. Create recursive tree with files and folders. Track expanded state for folders. Support lazy loading for large directories. Implement path-based lookups.

Build folder operations API. Create endpoint for creating folders. Add rename endpoint supporting files and folders. Implement delete with confirmation for folders. Add move/copy operations.

Implement drag-and-drop. Make files and folders draggable. Show drop zones when dragging. Execute move operation on drop. Show visual feedback during drag. Handle drag to different folders.

Add context menu system. Right-click on file or folder shows menu. Options: rename, delete, copy path, reveal in terminal. Different menus for files vs folders. Support keyboard shortcuts for menu actions.

Create file search functionality. Implement fuzzy search like Command+P in VS Code. Search across all file paths. Show results with highlighting. Navigate with keyboard arrows. Open file on Enter.

### Priority 3: Container Resource Management (Week 6)

**Goal**: Prevent resource exhaustion and reduce infrastructure costs.

Implement container lifecycle tracking. Create map of active containers with metadata. Track last activity timestamp. Record resource usage metrics. Store container-to-project mapping.

Add resource limits to container creation. Set memory limit to 512MB per container. Limit CPU to 1 core. Set max process limit to 100. Configure disk quota. Add network bandwidth limits.

Build automated cleanup system. Use node-cron to run cleanup every hour. Find containers inactive for 24+ hours. Stop and remove inactive containers. Free up ports and resources. Log cleanup operations.

Create manual cleanup controls. Add admin endpoint to force cleanup. Build UI for viewing active containers. Show resource usage per container. Allow manual stop/restart. Display cleanup logs.

Implement container health checks. Ping container every 5 minutes. Check if processes are running. Verify network connectivity. Auto-restart unhealthy containers. Alert on repeated failures.

### Priority 4: AI Code Generation (Week 7-8)

**Goal**: Match Bolt.new's full-stack generation from natural language.

Design code generation prompt system. Create specialized system prompts for different frameworks. Include rules for complete, working code. Specify file structure requirements. Add best practices and patterns.

Build generation API endpoint. Accept natural language description. Route to appropriate AI model (Claude Sonnet 4.5 for complex apps). Stream generation progress. Return structured file list with content.

Implement multi-file creation. Parse AI response into file objects. Create all files in container simultaneously. Handle directory creation. Set proper file permissions. Validate file contents.

Add auto-dependency installation. Detect package.json in generated files. Run npm install automatically. Show installation progress. Handle installation errors. Restart preview after install.

Create generation UI. Add prominent "Generate App" button. Show input modal for description. Display streaming progress indicator. Show created files list. Auto-open main file in editor.

Implement iteration support. Allow user to request modifications. Maintain context from initial generation. Support "add feature X" follow-ups. Track generation history. Enable rollback to previous versions.

### Priority 5: Real-time Collaboration (Week 9-10)

**Goal**: Match Replit's multiplayer editing experience.

Integrate Yjs CRDT library. Set up Yjs document for each project. Create text type for each file. Implement awareness protocol for cursors. Handle concurrent edits correctly.

Build WebSocket collaboration server. Create dedicated WebSocket server on port 3101. Use y-websocket for Yjs sync. Handle connection and disconnection. Manage room-based collaboration. Scale with Redis adapter.

Bind Monaco editor to Yjs. Use y-monaco binding library. Sync editor content bidirectionally. Handle local and remote changes. Preserve cursor position during sync. Update decorations for remote changes.

Implement cursor tracking. Show other users' cursors in editor. Display user name and color. Animate cursor movements smoothly. Show selection ranges. Update in real-time via awareness.

Add presence indicators. Show list of active users. Display user avatars or initials. Show which file each user is viewing. Indicate typing status. Show join/leave notifications.

Create share link system. Generate unique shareable URLs. Support read-only vs edit access. Add expiration for links. Track who accessed via links. Implement access revocation.

### Priority 6: Package Management UI (Week 11)

**Goal**: Visual package installation like Replit, no manual package.json editing.

Build package search interface. Create search input with debouncing. Query npm registry API. Parse and display search results. Show package name, version, description. Display download stats and popularity.

Implement package installation. Add install button per search result. Run npm install in container via terminal API. Stream installation output to UI. Update package.json file tree. Refresh dependencies list.

Create installed packages view. Parse package.json to show installed packages. Display current versions. Show if updates available. Add uninstall button. Link to package documentation.

Add dependency detection. Scan code for import statements. Detect missing packages. Show suggestions to install. One-click install from suggestions. Auto-install on file save.

Implement version management. Show version dropdown for each package. Support installing specific versions. Display changelog between versions. Handle breaking changes warnings. Support version pinning.

### Priority 7: Deployment Integration (Week 12-13)

**Goal**: One-click deployment to Vercel, Railway, and Netlify.

Build Vercel deployment integration. Implement Vercel API authentication. Create deployment from project files. Configure framework detection. Handle environment variables. Return deployment URL and status.

Add Railway deployment. Integrate Railway API. Support Docker deployments. Configure database connections. Set up domain management. Handle deployment logs.

Implement Netlify deployment. Use Netlify API for static sites. Configure build commands. Handle redirects and headers. Set up form handling. Support serverless functions.

Create deployment UI. Add deploy button in header. Show deployment configuration modal. Display deployment progress. Show build logs in real-time. Display deployed URL prominently.

Add environment variable management. Create UI for env var configuration. Store encrypted in database. Inject into deployments. Support per-environment variables. Validate required variables.

Implement deployment history. Track all deployments per project. Show deployment status and timestamps. Support rollback to previous deployments. Display deployment differences. Link to live URLs.

### Priority 8: Git Integration (Week 14-15)

**Goal**: Match Cursor's Git features with commit, push, diff, and branches.

Install Git in containers. Update Docker images with Git CLI. Configure default Git user. Initialize repository on project creation. Create initial commit automatically.

Build commit interface. Show changed files list. Display diff for each file. Add commit message input. Implement staged changes UI. Support partial file staging.

Create GitHub integration. Implement GitHub OAuth for repository access. Link existing repositories. Create new repositories from UI. Configure push/pull permissions. Handle SSH key management.

Implement diff viewer. Show side-by-side or unified diff. Syntax highlight diff content. Support inline comments. Show line numbers. Handle binary files gracefully.

Add branch management. Display current branch. Show branch list with switcher. Create new branches from UI. Support branch deletion. Handle merge conflicts. Display branch graph.

Build pull request creation. Generate PR from current branch. Pre-fill title from commits. Auto-generate description. Link to GitHub PR. Show PR status in UI.

### Priority 9: AI Code Intelligence (Week 16-17)

**Goal**: Match Cursor's inline AI with suggestions, explanations, and fixes.

Implement inline code suggestions. Capture cursor position and surrounding code. Send context to Claude API. Generate next-line suggestions. Display as ghost text in editor. Accept with Tab key.

Add keyboard command for AI assistance. Bind Command+I to AI prompt. Show inline input for user request. Send selected code as context. Stream AI response. Apply changes to editor.

Create "Explain Code" feature. Right-click on code shows explain option. Send code to AI with explanation prompt. Display explanation in sidebar panel. Support follow-up questions. Link to relevant documentation.

Implement "Fix with AI" for errors. Detect TypeScript/ESLint errors. Show fix button in error popup. Send error and code to AI. Apply suggested fix automatically. Support undo if fix incorrect.

Add test generation. Right-click function shows "Generate Tests". Send function code to AI with test framework context. Create test file automatically. Import necessary testing libraries. Run tests to verify.

Build refactoring suggestions. Detect code smells and anti-patterns. Show refactoring suggestions. Preview refactoring changes. Apply with one click. Support multiple refactoring options.

---

## 📊 Feature Comparison Table

| Feature | Replit | Bolt.new | Cursor | Recoder (Current) | Recoder (Target) |
|---------|--------|----------|--------|-------------------|------------------|
| **Terminal CLI Integration** | ❌ | ❌ | ❌ | 🟡 | ✅ |
| Claude Code Support | ❌ | ❌ | ❌ | ❌ | ✅ |
| Standalone CLI (recoder-code) | ❌ | ❌ | ❌ | ✅ | ✅ |
| CLI + Web Sync | ❌ | ❌ | ❌ | ❌ | ✅ |
| Local AI (Ollama) | ❌ | ❌ | ❌ | ❌ | ✅ |
| Multi-file editing | ✅ | ✅ | ✅ | ❌ | ✅ |
| File tree (folders) | ✅ | ✅ | ✅ | ❌ | ✅ |
| Live preview | ✅ | ✅ | ❌ | ✅ | ✅ |
| Terminal | ✅ | ❌ | ✅ | ✅ | ✅ |
| Package manager UI | ✅ | ✅ | ❌ | ❌ | ✅ |
| Collaboration | ✅ | ❌ | ❌ | ❌ | ✅ |
| Git integration | ✅ | ❌ | ✅ | ❌ | ✅ |
| One-click deploy | ✅ | ✅ | ❌ | ❌ | ✅ |
| AI code gen | 🟡 | ✅ | ✅ | 🟡 | ✅ |
| Inline AI | ❌ | ❌ | ✅ | ❌ | ✅ |
| Database UI | ✅ | ❌ | ❌ | ❌ | 🟡 |
| AI Code Review | ❌ | ❌ | ✅ | ❌ | ✅ |
| Multi-agent Parallel | ❌ | ❌ | ✅ | ❌ | ✅ |

**Legend**: ✅ = Has, ❌ = Missing, 🟡 = Partial

**Note on Terminal CLI**: recoder-code v2.4.5 is already published on npm with 40+ AI models, tool calling, and MCP servers. What's missing is the platform integration (sync with recoder-web, live preview connection, shared sessions).

---

## 🚀 17-Week Implementation Timeline

### Week 1-3: Terminal CLI Integration (NEW PRIORITY 0)
- Anthropic OAuth integration for Claude Code
- Claude Code CLI pre-installed in containers
- File system watching for Claude Code changes
- recoder-code platform authentication
- recoder-code WebSocket sync with platform
- Bidirectional file sync (CLI ↔ web)
- Ollama integration for local AI models
- Terminal multiplexing support
- Usage metering for CLI operations

### Week 4: Multi-File Editing
- Editor state management
- Tab bar UI
- Keyboard shortcuts
- Monaco optimization

### Week 5: Advanced File Tree
- Folder operations
- Drag-and-drop
- Context menus
- File search

### Week 6: Container Management
- Resource limits
- Automated cleanup
- Health checks
- Manual controls

### Week 7-8: AI Code Generation
- Generation API
- Multi-file creation
- Auto-dependency install
- Iteration support

### Week 9-10: Real-time Collaboration
- Yjs integration
- WebSocket server
- Cursor tracking
- Share links

### Week 11: Package Management
- Package search UI
- Installation interface
- Dependency detection
- Version management

### Week 12-13: Deployment
- Vercel, Railway, Netlify
- Deployment UI
- Environment variables
- Deployment history

### Week 14-15: Git Integration
- Git in containers
- Commit interface
- GitHub integration
- Branch management

### Week 16-17: AI Intelligence
- Inline suggestions
- Code explanation
- Fix with AI
- Test generation

---

## 🔨 Critical Technical Debt

### Immediate
- Remove all console.log statements from production code
- Add proper React error boundaries for graceful failures
- Implement retry logic with exponential backoff for API calls
- Add loading states throughout UI without emoji decorations

### Short-term
- Optimize bundle size from 4.8MB down to under 2MB
- Implement service worker for offline capability
- Lazy load Monaco language definitions to reduce initial load
- Add database query optimization and connection pooling
- Implement request debouncing for file operations
- Add proper TypeScript types throughout codebase

### Long-term
- Replace in-memory session storage with Redis cluster
- Implement container pooling with pre-warmed instances
- Set up multi-region deployment for global users
- Configure CDN for static assets and images
- Build horizontal scaling for WebSocket servers
- Implement database sharding for large user base

---

## 🎯 Competitive Advantages

### What Makes Us Different

**Terminal + Visual Integration**: We're the only platform combining terminal CLI power (Claude Code, recoder-code) with live visual preview. Competitors force you to choose between terminal OR visual - we give both.

**Multi-AI Provider Support**: Unlike Claude Code (Anthropic only) or Cursor (proprietary), we support 40+ models including Claude, GPT-4, Groq, Gemini, DeepSeek, and Qwen. Users aren't locked into one AI provider.

**Local AI with Ollama**: We'll be the only platform supporting local AI models via Ollama. Privacy-focused developers can run Llama, Mistral, or CodeLlama locally without sending code to cloud APIs. Zero API costs for development. Offline AI capability.

**Live Preview + Terminal Sync**: When AI makes changes via terminal, users immediately see results in browser. No other platform connects terminal AI output to live preview.

**Open Source Potential**: Our terminal CLI (recoder-code) can be open sourced to build community while keeping platform closed source. This builds trust and ecosystem.

**Developer-First Design**: Built by developers who actually use terminal tools. We understand the workflow of command-line users but provide visual benefits.

---

## 📈 Success Metrics

### Phase 1 (Weeks 1-3 - CLI Integration)
- Claude Code integration working end-to-end in containers
- At least 100 users connecting Anthropic accounts
- recoder-code v2.4.5+ authenticated with platform
- Bidirectional sync working (CLI ↔ web) with <200ms latency
- Live preview updates reflect CLI changes instantly
- Terminal session persistence across platforms
- Ollama integration working with local models (Llama, Mistral, CodeLlama)
- Zero-cost local AI development enabled

### Phase 2 (Weeks 4-6 - Core Editor)
- Multi-file editing with tabs functioning
- Advanced file tree with all operations
- Container cleanup reducing costs by 40%
- Zero resource exhaustion incidents

### Phase 3 (Weeks 7-10 - AI & Collaboration)
- Full-stack app generation from description
- Real-time collaboration with multiple users
- Less than 100ms latency for cursor updates
- Share links working with access controls

### Phase 4 (Weeks 11-13 - Deployment)
- One-click deployment to all three platforms
- Visual package manager adoption over manual editing
- Successful deployments with zero downtime

### Phase 5 (Weeks 14-17 - Git & Intelligence)
- Git operations working from UI
- Inline AI suggestions with high acceptance rate
- Code review and fix features functioning
- Feature parity achieved with Cursor and Replit

---

**Focus**: Build features in strict priority order starting with terminal CLI integration. Don't skip ahead. Each feature must work 100% before moving to the next. Terminal CLI integration is the differentiator that sets us apart from all competitors.

---

## Sources

- [Claude Code GitHub Repository](https://github.com/anthropics/claude-code)
- [Anthropic Claude Code Official Site](https://www.anthropic.com/claude-code)
- [Claude Code Documentation](https://code.claude.com/docs/en/overview)
- [Cursor AI Features](https://cursor.com/features)
- [Cursor CLI Guide 2025](https://zoer.ai/posts/zoer/cursor-cli-features-guide)
- [Replit Ghostwriter Features](https://blog.replit.com/ai)
- [Replit vs Cursor Comparison](https://replit.com/discover/replit-vs-cursor)
- [Bolt.new GitHub](https://github.com/stackblitz/bolt.new)
- [Bolt.new Introduction](https://support.bolt.new/building/intro-bolt)
- [Bolt.new Review 2025](https://www.designmonks.co/case-study/bolt-ai-app-builder-case-study)
