# Smoke Test Checklist - Recoder.xyz

**Last Updated**: January 20, 2026

> This checklist should be completed manually before each deployment. Check off items as you test them.

---

## 1. Critical Path Tests (MUST PASS)

These tests are blocking for deployment. All must pass before going to production.

### 1.1 User Authentication
- [ ] **Sign up with email** - Verify email sent, code received
- [ ] **Email verification** - Click link or enter 6-digit code at `/verify`
- [ ] **Login with email** - Existing user can log in
- [ ] **OAuth login (Google)** - Social login works
- [ ] **OAuth login (GitHub)** - Social login works
- [ ] **Logout** - User session cleared properly
- [ ] **Session persistence** - Refresh page maintains login state

### 1.2 Project Management
- [ ] **Create new project** - From scratch
- [ ] **Create from template** - Starter templates load correctly
- [ ] **Project loads** - File tree visible, preview working
- [ ] **Switch projects** - Navigate between multiple projects
- [ ] **Delete project** - Project and container removed

### 1.3 AI Chat Functionality
- [ ] **Send message** - AI responds with Claude/OpenRouter/Groq
- [ ] **Multi-mode system** - Architect/Code/Ask/Debug/Orchestrator modes selectable
- [ ] **Mode auto-switching** - AI can switch modes mid-conversation
- [ ] **File creation** - AI can create new files via `<boltAction type="file">`
- [ ] **File editing** - AI can edit files via `str_replace` action
- [ ] **Read files** - AI uses `readFile` before editing
- [ ] **Search files** - AI uses `searchFiles` (ripgrep)
- [ ] **Command execution** - AI can run shell commands
- [ ] **Chat history** - Messages persist across page refresh

### 1.4 File Editing
- [ ] **Open file** - Click file in tree, opens in Monaco editor
- [ ] **Edit file** - Make changes, file saved
- [ ] **Syntax highlighting** - Correct highlighting for JS/TS/Python/etc.
- [ ] **Create file** - Right-click tree, create new file
- [ ] **Rename file** - Right-click file, rename works
- [ ] **Delete file** - Right-click file, delete works
- [ ] **Create folder** - Right-click tree, create folder

### 1.5 Preview & Build
- [ ] **Live preview** - Changes reflect in preview iframe
- [ ] **Preview port detection** - Automatically detects dev server (3000, 5173, etc.)
- [ ] **Build command** - `npm run build` succeeds
- [ ] **Dev server start** - `npm run dev` starts successfully
- [ ] **Preview URL** - HTTP proxy serves preview correctly

### 1.6 Production Static Assets
- [ ] **Static smoke script** - `cd app && BASE_URL=https://recoder.xyz npm run smoke:static` passes
- [ ] **Logo asset** - `https://recoder.xyz/logo.png` returns `200 image/png`
- [ ] **Next static assets** - homepage-referenced `/_next/static/*` assets return `200` with correct MIME

---

## 2. Feature Tests (By Module)

### 2.1 Debug Panel
- [ ] **Debug session start** - Start debugging for Node.js/Python/Go/Rust
- [ ] **Set breakpoints** - Click gutter to add breakpoint (red dot)
- [ ] **Conditional breakpoints** - Right-click, add condition (yellow dot)
- [ ] **Logpoints** - Add log message (blue dot)
- [ ] **Step controls** - Continue, Step Over, Step Into, Step Out work
- [ ] **Call stack** - Shows frames, click to navigate
- [ ] **Variables panel** - Shows local/global variables
- [ ] **Watch expressions** - Add expression, updates on pause
- [ ] **Current execution line** - Highlighted in editor
- [ ] **Debug session stop** - Stop button ends session

### 2.2 Organization & Enterprise Features
- [ ] **Create organization** - Organization dashboard accessible
- [ ] **Organization settings** - Update name, description
- [ ] **Create team** - Add team to organization
- [ ] **Team permissions** - Permission matrix works (VIEWER/MEMBER/ADMIN/OWNER)
- [ ] **Invite members** - Email invitation sent
- [ ] **Bulk invitations** - CSV upload works
- [ ] **Audit log** - Actions logged (create project, add member, etc.)
- [ ] **Audit log search** - Filter by action type, user, date range
- [ ] **Audit log export** - Export CSV/JSON
- [ ] **Billing dashboard** - Subscription info, usage tracking
- [ ] **Activity log** - Recent organization activity visible

### 2.3 Package Manager Panel
- [ ] **List packages** - Shows installed npm/pip/cargo/go packages
- [ ] **Search packages** - Query npm/PyPI/crates.io registries
- [ ] **Install package** - Add new package
- [ ] **Update package** - Update to latest version
- [ ] **Uninstall package** - Remove package
- [ ] **Multi-language support** - Works for npm, pip, cargo, go, composer, gem, bun

### 2.4 Git Integration
- [ ] **Git status** - Shows modified/staged/untracked files
- [ ] **Stage files** - Click to stage changes
- [ ] **Unstage files** - Remove from staging
- [ ] **Commit** - Create commit with message
- [ ] **Branch list** - Shows all branches
- [ ] **Switch branch** - Checkout different branch
- [ ] **Create branch** - New branch created
- [ ] **Merge branch** - Merge works without conflicts
- [ ] **Commit history** - Visual timeline with diffs
- [ ] **Diff viewer** - Side-by-side or inline diff

### 2.5 Deployment
- [ ] **Vercel deployment** - Deploy to Vercel (requires token)
- [ ] **Netlify deployment** - Deploy to Netlify (requires token)
- [ ] **Cloudflare Pages** - Deploy to Cloudflare (requires token)
- [ ] **Railway deployment** - Deploy to Railway (requires token)
- [ ] **Deployment status** - Check deployment status API
- [ ] **One-click tunnel** - Cloudflared tunnel generates public URL
- [ ] **Tunnel URL** - trycloudflare.com link works
- [ ] **Tunnel stop** - Stop tunnel, cleanup process

### 2.6 LSP (Language Server Protocol)
- [ ] **Autocomplete** - Trigger completions in TypeScript/Python/Go/Rust
- [ ] **Hover info** - Hover shows type information
- [ ] **Go to definition** - Ctrl+Click navigates to definition
- [ ] **Find references** - Shows all usages
- [ ] **Diagnostics** - Errors/warnings shown in Problems panel
- [ ] **Multi-language** - Works for TypeScript, Python, Go, Rust, Java

### 2.7 Database Explorer
- [ ] **Connect PostgreSQL** - Add connection, test successful
- [ ] **Connect SQLite** - Local SQLite file connection
- [ ] **Browse tables** - Schema explorer shows tables
- [ ] **SQL editor** - Run SELECT query
- [ ] **Results grid** - Query results display
- [ ] **Parameterized queries** - No SQL injection vulnerability
- [ ] **Credentials encryption** - Keys stored encrypted (AES-256-GCM)

### 2.8 Secrets/Environment Variables
- [ ] **Add secret** - Create new key-value pair
- [ ] **Edit secret** - Update value (masked input)
- [ ] **Delete secret** - Remove secret
- [ ] **Environment switching** - Development/Production/Test
- [ ] **Secrets in terminal** - Environment variables available in container

### 2.9 Real-time Collaboration
- [ ] **Multiple users** - Open same project in two browsers
- [ ] **Cursor sync** - See remote user cursors
- [ ] **Selection sync** - See remote selections
- [ ] **Text sync** - Edits appear in real-time (Yjs CRDT)
- [ ] **User presence** - Collaborator avatars visible
- [ ] **Auto-save** - Document saved to server every 5s

### 2.10 REPL Console
- [ ] **Node.js REPL** - Interactive JavaScript shell
- [ ] **Python REPL** - Interactive Python shell
- [ ] **Ruby REPL** - Interactive Ruby shell
- [ ] **Go REPL** - Interactive Go shell
- [ ] **Command history** - Arrow up/down navigation
- [ ] **Multi-line input** - Shift+Enter for multi-line

### 2.11 Mobile API (Backend Only)
- [ ] **Mobile API health** - GET `/api/mobile/health` returns 200
- [ ] **Compressed responses** - Gzip compression for responses > 1KB
- [ ] **Pagination** - List endpoints support page/limit params
- [ ] **Offline sync** - POST `/api/mobile/sync/:projectId` works
- [ ] **Push notification registration** - POST `/api/mobile/push/register` works
- [ ] **Send push notification** - POST `/api/mobile/push/send` works

### 2.12 Terminal
- [ ] **Terminal opens** - PTY terminal loads
- [ ] **Command execution** - Run `ls`, `pwd`, `echo` commands
- [ ] **Color output** - ANSI colors displayed
- [ ] **Scrollback** - Scroll through terminal history
- [ ] **Resize** - Terminal resizes with panel
- [ ] **Multiple terminals** - Create/switch between terminals
- [ ] **Terminal tabs** - Rename terminal tabs
- [ ] **Clear terminal** - Clear command works
- [ ] **Claude Code CLI** - `claude` command available
- [ ] **Recoder Code CLI** - `recoder` command available
- [ ] **AI CLI tools** - `codex`, `gemini`, `opencode` commands work (if keys configured)

### 2.13 Problems Panel
- [ ] **Show errors** - Compiler/runtime errors displayed
- [ ] **Error detection** - Auto-detects errors from terminal/LSP
- [ ] **Fix with AI** - Click button, AI analyzes error
- [ ] **Error navigation** - Click error, jumps to file/line
- [ ] **Clear problems** - Problems cleared after fix

### 2.14 Logs Panel
- [ ] **Container logs** - Shows stdout/stderr from container
- [ ] **Auto-scroll** - Scrolls to bottom on new log
- [ ] **Scrollable** - Can scroll through history
- [ ] **Text color** - White text on dark background (readable)

### 2.15 Search Panel
- [ ] **Ripgrep search** - Search across all files
- [ ] **Regex support** - Regex patterns work
- [ ] **Case sensitivity toggle** - Case-sensitive/insensitive
- [ ] **File type filter** - Filter by .js, .ts, .py, etc.
- [ ] **Results navigation** - Click result, opens file

### 2.16 Inline Autocomplete
- [ ] **Ghost text** - Suggestions appear while typing
- [ ] **Tab to accept** - Tab key accepts suggestion
- [ ] **Partial accept** - Ctrl+Right to accept word
- [ ] **Dismiss** - Escape dismisses suggestion
- [ ] **Context-aware** - Reads surrounding code for suggestions
- [ ] **Fast response** - Suggestions appear < 200ms

### 2.17 MCP Server Marketplace
- [ ] **Browse marketplace** - View available MCP servers
- [ ] **Search servers** - Filter by name/description/tags
- [ ] **Category filter** - Filter by Browser/Database/DevTools/etc.
- [ ] **One-click install** - Install server without manual config
- [ ] **Server configuration** - Configure environment variables
- [ ] **List installed servers** - Shows running MCP servers
- [ ] **Call MCP tool** - Use installed MCP server tool
- [ ] **Stop server** - Stop MCP server, auto-kill after 5 min idle

### 2.18 Task Automation
- [ ] **Slash commands** - Type `/` shows autocomplete menu
- [ ] **Command palette** - Ctrl+Shift+P opens palette
- [ ] **Built-in commands** - `/test`, `/build`, `/lint`, `/format` work
- [ ] **Refactoring commands** - `/refactor`, `/simplify`, `/optimize`, `/document` work
- [ ] **Custom commands** - Load from `.recoder/commands/` directory
- [ ] **Fuzzy matching** - Type partial command, finds match

### 2.19 Advanced Features
- [ ] **Clone URL** - Clone website from URL (HTML/CSS/images/fonts)
- [ ] **Spawn task** - AI spawns subtask via event system
- [ ] **Multi-apply diff** - Apply multiple file edits atomically
- [ ] **Web search** - AI uses DuckDuckGo/Tavily for internet search
- [ ] **Code index** - Semantic code search with OpenAI embeddings
- [ ] **Browser automation** - Puppeteer actions (launch, click, screenshot, etc.)
- [ ] **CLI-Web sync** - `recoder web pull/diff/watch` commands
- [ ] **Parallel mode** - `recoder parallel` creates git worktrees

---

## 3. API Health Checks

Test these API endpoints manually with curl or Postman.

### 3.1 Authentication APIs
- [ ] `POST /api/auth/signup-email` - Returns `{ success: true, userId }`
- [ ] `POST /api/auth/verify-email` - Returns verification token
- [ ] `POST /api/auth/verify-code` - Accepts 6-digit code
- [ ] `POST /api/auth/login` - Returns session token

### 3.2 Docker Backend APIs (Port 3100)
- [ ] `GET /api/health` - Returns `{ status: "ok" }`
- [ ] `GET /api/health/public-api-queue` - Returns selected backend diagnostics (`selectedBackend=redis` in prod)
- [ ] `GET /api/health/byok-readiness` - Returns `overallReady=true` for prod BYOK prerequisites
- [ ] `GET /api/pool/stats` - Returns pool statistics
- [ ] `POST /api/containers/:projectId/create` - Creates container
- [ ] `POST /api/containers/:projectId/files` - Creates file
- [ ] `GET /api/containers/:projectId/files?path=` - Lists files
- [ ] `GET /api/containers/:projectId/file?path=` - Reads file
- [ ] `PUT /api/containers/:projectId/file` - Updates file
- [ ] `DELETE /api/containers/:projectId/file?path=` - Deletes file

### 3.3 Debug APIs
- [ ] `POST /api/debug/:projectId/start` - Starts debug session
- [ ] `POST /api/debug/:projectId/breakpoints` - Sets breakpoints
- [ ] `POST /api/debug/:projectId/continue` - Continues execution
- [ ] `GET /api/debug/:projectId/stacktrace` - Returns call stack
- [ ] `GET /api/debug/:projectId/variables` - Returns variables
- [ ] `POST /api/debug/:projectId/evaluate` - Evaluates expression
- [ ] `POST /api/debug/:projectId/stop` - Stops session

### 3.4 Organization APIs
- [ ] `POST /api/organizations` - Creates organization
- [ ] `GET /api/organizations/:orgId` - Gets organization details
- [ ] `PUT /api/organizations/:orgId` - Updates organization
- [ ] `GET /api/organizations/:orgId/members` - Lists members
- [ ] `POST /api/organizations/:orgId/teams` - Creates team
- [ ] `POST /api/organizations/:orgId/invitations` - Sends invitation
- [ ] `GET /api/organizations/:orgId/audit-log` - Gets audit log
- [ ] `GET /api/organizations/:orgId/billing/usage` - Gets usage stats

### 3.5 LSP APIs
- [ ] `POST /api/lsp/:projectId/completions` - Returns completions
- [ ] `POST /api/lsp/:projectId/hover` - Returns hover info
- [ ] `POST /api/lsp/:projectId/definition` - Returns definition location
- [ ] `POST /api/lsp/:projectId/references` - Returns references
- [ ] `GET /api/lsp/:projectId/diagnostics` - Returns errors/warnings

### 3.6 Database APIs
- [ ] `POST /api/database/:projectId/connect` - Connects to database
- [ ] `GET /api/database/:projectId/connections` - Lists connections
- [ ] `POST /api/database/:projectId/query` - Executes query
- [ ] `GET /api/database/:projectId/tables` - Lists tables
- [ ] `DELETE /api/database/:projectId/connections/:connId` - Removes connection

### 3.7 MCP APIs
- [ ] `GET /api/mcp/catalog` - Lists available MCP servers
- [ ] `POST /api/mcp/:projectId/start` - Starts MCP server
- [ ] `GET /api/mcp/:projectId/servers` - Lists running servers
- [ ] `GET /api/mcp/:projectId/tools` - Lists available tools
- [ ] `POST /api/mcp/:projectId/call` - Calls MCP tool
- [ ] `POST /api/mcp/:projectId/stop` - Stops MCP server

### 3.8 Deployment APIs
- [ ] `POST /api/deploy` - Deploys to platform (Vercel/Netlify/etc.)
- [ ] `GET /api/deploy/status/:deploymentId` - Gets deployment status
- [ ] `POST /api/tunnel/start` - Starts cloudflared tunnel
- [ ] `GET /api/tunnel/status/:projectId` - Gets tunnel status
- [ ] `POST /api/tunnel/stop` - Stops tunnel

### 3.9 Enterprise Tool APIs
- [ ] `POST /api/enterprise-tools` - Calls enterprise tool (webSearch, browserAutomation, codeIndex, etc.)
- [ ] `POST /api/code-index/:projectId/index` - Indexes workspace
- [ ] `POST /api/code-index/:projectId/search` - Semantic search
- [ ] `POST /api/clone-url/:projectId` - Clones website from URL

### 3.10 Mobile APIs
- [ ] `GET /api/mobile/health` - Returns `{ status: "ok" }`
- [ ] `POST /api/mobile/sync/:projectId` - Syncs offline changes
- [ ] `POST /api/mobile/push/register` - Registers device for push notifications
- [ ] `POST /api/mobile/push/send` - Sends push notification

### 3.11 Admin APIs
- [ ] `GET /api/admin/test-email` (Header: `x-admin-secret`) - Tests email config
- [ ] `POST /api/admin/test-email` - Sends test email
- [ ] `GET /api/admin/pending-verifications?email=` - Lists pending verifications

---

## 4. Security Checks

### 4.1 Authentication & Authorization
- [ ] **Unauthenticated API calls** - Return 401 Unauthorized
- [ ] **Wrong project ownership** - Cannot access other user's projects
- [ ] **Session expiry** - Logged out after token expires
- [ ] **CORS protection** - Only allowed origins accepted
- [ ] **Rate limiting** - Too many requests return 429

### 4.2 Input Validation
- [ ] **Path traversal** - `../../etc/passwd` blocked
- [ ] **Command injection** - `; rm -rf /` blocked
- [ ] **SQL injection** - Parameterized queries only, no raw SQL
- [ ] **XSS protection** - HTML entities escaped in UI
- [ ] **File upload limits** - Large files rejected

### 4.3 Container Security
- [ ] **Container isolation** - Containers cannot access each other
- [ ] **Resource limits** - Memory/CPU limits enforced (2GB, 100% CPU)
- [ ] **Dropped capabilities** - CapDrop ALL in container config
- [ ] **No docker.sock** - Docker socket not mounted
- [ ] **Pids limit** - Max 512 processes per container
- [ ] **Ulimits** - nofile: 1024, nproc: 512

### 4.4 Secrets & Encryption
- [ ] **API keys encrypted** - AES-256-GCM encryption at rest
- [ ] **Database credentials encrypted** - AES-256-GCM for DB passwords
- [ ] **No .env in git** - `.env` files in `.gitignore`
- [ ] **Environment variable injection** - Secrets injected into containers securely
- [ ] **Key rotation** - Ability to rotate encryption keys

### 4.5 Audit & Logging
- [ ] **Audit log events** - All sensitive operations logged
- [ ] **Audit log immutability** - Cannot delete/modify logs
- [ ] **Error sanitization** - No stack traces exposed to frontend
- [ ] **Failed login attempts** - Rate limited and logged

---

## 5. Performance Checks

### 5.1 Response Times
- [ ] **Page load** - < 2 seconds for initial load
- [ ] **AI response** - First token < 1 second
- [ ] **File open** - < 500ms to open file in editor
- [ ] **Search** - < 1 second for ripgrep search
- [ ] **Autocomplete** - < 200ms for suggestions
- [ ] **Container creation** - < 5 seconds for new container

### 5.2 Resource Usage
- [ ] **Container pool** - 10 warm containers pre-started
- [ ] **Container recycling** - Containers recycled up to 10 times
- [ ] **Stale cleanup** - Idle containers cleaned after 30 min
- [ ] **Max containers per user** - Limited to 5 containers
- [ ] **Memory limits** - Containers capped at 2GB RAM
- [ ] **CPU limits** - Containers capped at 100% of 1 CPU

### 5.3 Scalability
- [ ] **Multiple projects** - Can handle 10+ projects simultaneously
- [ ] **Concurrent users** - 5+ users working without slowdown
- [ ] **Large files** - Open 10,000+ line files without lag
- [ ] **Large directories** - Browse 1,000+ file trees

---

## 6. Email System Checks

### 6.1 Transactional Emails
- [ ] **Verification email** - Received in inbox (not spam)
- [ ] **Email subject** - `123456 is your Recoder.xyz verification code`
- [ ] **Email body** - 6-digit code clearly visible
- [ ] **Verification link** - Click link, redirects to `/verify`
- [ ] **Code input** - Enter code, account verified

### 6.2 Onboarding Emails
- [ ] **Getting started email** - Sent on Day 1 after signup
- [ ] **Feature deep dive** - Sent on Day 3
- [ ] **Weekly tips** - Sent weekly for active users
- [ ] **Re-engagement** - Sent if user inactive for 7 days

### 6.3 Marketing Emails (Campaign Manager)
- [ ] **Newsletter subscription** - POST `/api/newsletter/subscribe`
- [ ] **Unsubscribe** - POST `/api/newsletter/unsubscribe`
- [ ] **Unsubscribe link** - One-click unsubscribe from email
- [ ] **CAN-SPAM compliance** - Physical address, unsubscribe link present

---

## 7. Browser Compatibility

Test in multiple browsers:

- [ ] **Chrome/Edge** - All features work
- [ ] **Firefox** - All features work
- [ ] **Safari** - All features work (macOS/iOS)

---

## 8. Regression Tests

These are known issues that were fixed. Verify they stay fixed:

- [ ] **Problems panel icons** - Show correct Phosphor icons (not "T"/"F")
- [ ] **Logs panel scrollable** - Can scroll through logs (not stuck)
- [ ] **Logs panel text color** - White text (not gray, not invisible)
- [ ] **AI regenerates everything** - AI makes targeted edits, not full file rewrites
- [ ] **AI explores first** - AI uses `readFile`, `searchFiles` before fixing
- [ ] **AI checks package.json** - AI reads package.json before imports
- [ ] **PostCSS .cjs extension** - Config file created with correct extension

---

## 9. Documentation Checks

- [ ] **API documentation** - `/docs/API.md` accurate and up-to-date
- [ ] **OpenAPI spec** - `/docs/openapi.yaml` has 113+ endpoints documented
- [ ] **WebSocket docs** - `/docs/WEBSOCKET.md` explains WebSocket protocol
- [ ] **Architecture docs** - `/docs/ARCHITECTURE.md` explains system design
- [ ] **Security audit** - `SECURITY_AUDIT_REPORT.md` documents security measures

---

## 10. Deployment Readiness

### 10.1 Environment Variables
- [ ] **All secrets set** - Check `.env.production` has all required keys
- [ ] **Database URL** - PostgreSQL connection string valid
- [ ] **Redis URL** - Redis connection string valid (if using Redis)
- [ ] **API keys** - Anthropic, OpenAI, OpenRouter, Groq, Tavily keys valid
- [ ] **OAuth credentials** - Google, GitHub OAuth apps configured
- [ ] **Email provider** - Resend API key valid
- [ ] **Payment provider** - DodoPay credentials valid (if using payments)
- [ ] **Internal service key** - INTERNAL_SERVICE_KEY set for docker-backend

### 10.2 Infrastructure
- [ ] **Docker daemon** - Docker running and accessible
- [ ] **Docker images** - All images built and tagged
- [ ] **Database migrations** - All migrations applied
- [ ] **Database indexes** - Indexes created for performance
- [ ] **CDN configured** - Static assets served from CDN (if applicable)
- [ ] **Load balancer** - HTTPS termination configured (if applicable)

### 10.3 Monitoring
- [ ] **Health endpoints** - `/api/health` returns 200
- [ ] **Error tracking** - Sentry/equivalent configured (if using)
- [ ] **Logging** - Logs aggregated to central service (if using)
- [ ] **Metrics** - Prometheus/equivalent collecting metrics (if using)
- [ ] **Alerts** - Critical alerts configured (downtime, high error rate)

### 10.4 Secrets Rotation (CRITICAL)
> The following secrets were exposed in git history and MUST be rotated before production:
- [ ] **Database credentials** - Neon PostgreSQL password changed
- [ ] **OAuth secrets** - Google, GitHub client secrets regenerated
- [ ] **AI API keys** - Anthropic, OpenAI, OpenRouter, Groq keys rotated
- [ ] **JWT/Auth secrets** - Better Auth secret regenerated
- [ ] **Payment API keys** - DodoPay keys rotated
- [ ] **Encryption keys** - Master encryption key rotated
- [ ] **Admin secrets** - ADMIN_SECRET_KEY changed

---

## 11. Pre-Deploy Final Checks

- [ ] **All tests passing** - 532/532 unit tests passing
- [ ] **E2E tests passing** - All Playwright tests passing
- [ ] **No console errors** - Browser console clean
- [ ] **No console warnings** - No React warnings
- [ ] **TypeScript compilation** - 0 errors in both frontend and backend
- [ ] **Build succeeds** - `pnpm build` completes without errors
- [ ] **Lighthouse score** - Performance > 80, Accessibility > 90
- [ ] **Bundle size** - Check bundle size is reasonable (< 5MB gzipped)

---

## Checklist Summary

**Total Items**: ~350+

**Categories**:
- Critical Path: 35 items
- Feature Tests: 170+ items
- API Health Checks: 50+ items
- Security Checks: 25 items
- Performance Checks: 15 items
- Email Checks: 10 items
- Browser Compatibility: 3 items
- Regression Tests: 8 items
- Documentation: 5 items
- Deployment Readiness: 30+ items
- Pre-Deploy Final: 10 items

---

## Notes for Testers

1. **Test with real API keys**: Configure at least one AI provider (Anthropic/OpenAI) for full testing
2. **Use dev mode**: Set `SHOW_TEST_CREDENTIALS=true` to see verification codes in API responses
3. **Check docker-backend logs**: Run `docker logs -f <container-id>` to debug issues
4. **Test in incognito**: Verify flows work for first-time users
5. **Test with rate limits**: Trigger rate limits to verify 429 responses
6. **Test container cleanup**: Verify stale containers removed after 30 min
7. **Test email delivery**: Use real email address, check spam folder if not received

---

## Test Execution Log

| Date | Tester | Pass % | Critical Issues | Notes |
|------|--------|--------|-----------------|-------|
| 2026-01-XX | Name | XX% | List issues | Additional notes |

---

**Remember**: This is a living document. Update it as new features are added or issues are discovered.
