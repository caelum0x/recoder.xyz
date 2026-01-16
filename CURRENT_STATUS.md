# 🎯 Recoder.xyz - Technical Status & Competitor Analysis

**Last Updated**: January 15, 2026
**Goal**: Feature parity with Replit, Cursor, and Bolt.new + Terminal CLI Integration

## ✅ What We Have (MVP)

### Working Features
- File creation and editing with Monaco editor
- Live preview using Docker containers with HTTP proxy
- Terminal access via WebSocket PTY
- AI chat integration (Claude, OpenRouter, Groq)
- Project creation from starter templates
- Chat history stored in PostgreSQL
- Authentication via Better Auth
- **Claude Code CLI works** - users can run `claude` command in terminal
- Problems Panel with error detection and "Fix with AI" button
- Logs Panel (scrollable, white text)
- Search Panel with ripgrep

### Infrastructure
- Docker backend running on port 3100 for container orchestration
- Remix frontend on port 5173
- Neon PostgreSQL database for persistence
- WebSocket connections for terminal interaction
- HTTP proxy system for live preview

---

## ✅ Issues Fixed (January 15, 2026)

| Issue | Solution |
|-------|----------|
| Problems panel icons showing "T"/"F" | Added `@iconify-json/ph` to UnoCSS presetIcons |
| Logs not scrollable | Added `min-h-0` to LogsPanel for flex overflow |
| Logs/Problems text too dark | Changed to `text-gray-100` / `text-gray-200` |
| AI regenerates everything | Added agentic workflow to system prompt |
| AI doesn't explore first | Added few-shot examples + planning enforcer |
| Auto-fix prompt too vague | Updated to explicitly require readFile first |

---

## 🔴 Critical Issues (Need Testing)

| # | Issue | Status | Notes |
|---|-------|--------|-------|
| 1 | AI explores before fixing | 🧪 Testing | Few-shot + planning enforcer added |
| 2 | AI checks package.json | 🧪 Testing | Dependency management section added |
| 3 | Auto-fix triggers correctly | 🧪 Testing | Updated prompts in auto-fix.ts |
| 4 | PostCSS .cjs extension | 🧪 Testing | Added to dependency_management section |

---
> '/Users/arhansubasi/recoder.xyz/packages/recoder-code/packages/core/src/code_assist''/Users/arhansubasi/recoder.xyz/packages/recoder-code/packages/core/src/subagents''/Users/arhansubasi/recoder.xyz/packages/recoder-code/packages/core/src/services' copy these to recoder web lib .server llm folder we can use these too I already copied tools
---

## 🚀 Feature Roadmap - Kilo/Cursor Parity (NEW)

**Goal: Match Kilo, Cursor, Copilot feature set**

| Feature | Status | Priority | Notes |
|---------|--------|----------|-------|
| **Code Generation** | ✅ Have | - | Natural language to code works |
| **Inline Autocomplete** | ⚠️ Partial | 🔴 High | Copilot-style completions as you type |
| **Task Automation** | ❌ TODO | 🟡 Medium | Automate repetitive coding tasks |
| **Automated Refactoring** | ❌ TODO | 🟡 Medium | AI-powered code improvement |
| **MCP Server Marketplace** | ❌ TODO | 🟡 Medium | Browse/install MCP servers easily |
| **Multi-Mode System** | ❌ TODO | 🔴 High | Architect/Coder/Debugger modes |

### Multi-Mode System Details

**From Kilo Code (Apache-2.0 License) - Can Copy:**

| Mode | Purpose | Tool Groups |
|------|---------|-------------|
| **Architect** | Planning & design | read, edit (md only), browser, mcp |
| **Code** | Implementation | read, edit, browser, command, mcp |
| **Ask** | Q&A, explanations | read, browser, mcp |
| **Debug** | Diagnose & fix issues | read, edit, browser, command, mcp |
| **Orchestrator** | Coordinate subtasks | delegates to other modes |

**Key Implementation Files from Kilo:**
- `packages/types/src/mode.ts` - Mode definitions
- `src/shared/modes.ts` - Mode helpers
- `src/core/prompts/` - System prompts per mode
- `src/services/ghost/` - Inline autocomplete
- `src/core/tools/` - 33 tools implementation

### Inline Autocomplete Requirements

- Ghost text suggestions while typing
- Tab to accept completion
- Multiple suggestions with arrow keys
- Context-aware (reads surrounding code)
- Fast response (<200ms)

### MCP Marketplace Requirements

- Browse available MCP servers
- One-click install
- Categories (database, API, tools, etc.)
- User ratings/reviews
- Auto-configuration

---

## 🔴 New Critical Issues (January 15)

| # | Issue | Priority | Notes |
|---|-------|----------|-------|
| 1 | **Email login verification** | 🔴 Critical | Check manual email login, inbox verify, verify codes |
| 2 | **Email marketing/onboarding** | 🟡 Medium | Onboarding emails, tips, engagement |
| 3 | **Add Codex, Gemini CLI, OpenCode** | 🟡 Medium | Integrate these AI tools into recoder-web |
| 4 | **User profile pic in chat** | 🟢 Low | Currently shows mock user picture, need real avatar |
| 5 | **Container pool scaling** | 🔴 Critical | Only 3 containers warm - won't scale to thousands of users |
| 6 | **API key & .env security** | 🔴 Critical | All deployed to same server - need isolation |
| 7 | **Security audit & middlewares** | 🔴 Critical | Need comprehensive security review |
| 8 | **Auto error fix improvement** | 🔴 Critical | Must actually work automatically |
| 9 | **Chat quality - Cursor/Copilot parity** | 🔴 Critical | Need: planning, grep, fetch, explore, agentic fixes |

---

## 🔒 Security Checklist (NEW)

| Item | Status | Notes |
|------|--------|-------|
| API key encryption | ⚠️ Check | AES-256-GCM in app, verify in recoder-web |
| .env file protection | ❌ TODO | Ensure not exposed in Docker containers |
| Rate limiting | ✅ Done | Basic rate limiter exists |
| Input sanitization | ⚠️ Check | Verify all user inputs sanitized |
| CORS configuration | ⚠️ Check | Review allowed origins |
| Auth middleware | ⚠️ Check | Verify session validation |
| Container isolation | ❌ TODO | Users shouldn't access each other's containers |
| Secret scanning | ❌ TODO | Prevent committing secrets |

---

## 📧 Email System (NEW)

| Feature | Status | Notes |
|---------|--------|-------|
| Email login | ⚠️ Test | Manual verification needed |
| Inbox verification | ⚠️ Test | Check if emails arrive |
| Verify codes | ⚠️ Test | Test code validation flow |
| Onboarding emails | ❌ TODO | Welcome, getting started |
| Tips & engagement | ❌ TODO | Feature tips, usage reminders |
| Marketing campaigns | ❌ TODO | Newsletter, updates |

---

## 🤖 AI Chat Quality Improvements (NEW)

**Goal: Match Cursor/Copilot/Claude Code capabilities**

| Capability | Current | Target |
|------------|---------|--------|
| Read files before editing | ❌ Skips | ✅ Always read first |
| Grep/search codebase | ❌ Rarely | ✅ Use searchFiles |
| Check package.json | ❌ Ignores | ✅ Before any import |
| Fix specific lines | ❌ Regenerates all | ✅ Targeted edits |
| Planning step | ✅ Added | 🧪 Test effectiveness |
| Few-shot examples | ✅ Added | 🧪 Test effectiveness |
| Web/internet search | ❌ None | ✅ Add web fetch tool |
| Explore folders | ❌ Rarely | ✅ Use listFiles |
| Auto error detection | ⚠️ Partial | ✅ Full auto-fix loop |

---

## 🐳 Container Scaling (NEW)

**Current State:**
- Only 3 containers pre-warmed
- Single server deployment
- No horizontal scaling

**Needed:**
| Item | Priority | Notes |
|------|----------|-------|
| Increase pool size | 🔴 High | At least 10-20 warm containers |
| Container recycling | 🔴 High | Reuse containers between users |
| Kubernetes/Swarm | 🟡 Medium | For auto-scaling |
| Multi-server deployment | 🟡 Medium | Load balancing |
| Container limits per user | 🔴 High | Prevent abuse |

---

## 🟡 Medium Priority

| # | Issue | Notes |
|---|-------|-------|
| 5 | EnhancedFileTree.tsx unused | Not imported anywhere |
| 6 | ProjectPlanPanel.tsx unused | Not imported anywhere |

---

## 🟢 Needs Manual Testing

| # | Item | Notes |
|---|------|-------|
| 7 | File Tree rename/delete | Code exists, needs browser test |
| 8 | Inline Copilot | Needs API key test |
| 9 | Deploy Button | Needs Vercel token |
| 10 | Snapshots | Needs container test |
| 11 | CLI `recoder web link/unlink/status` | Needs manual CLI test |

---

## 🔵 Long-term / Roadmap

| # | Item |
|---|------|
| 12 | Redis cluster for sessions |
| 13 | Container pooling with pre-warmed instances |
| 14 | Clone URL feature (clone UI from URL) |
| 15 | One-click deployment (localhost → public URL) |
| 16 | Multi-region deployment |
| 17 | CDN for static assets |

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER INTERFACES                          │
├──────────────────┬─────────────────────┬────────────────────────┤
│  recoder-web     │     app (Next.js)   │   recoder-code CLI     │
│  (Remix)         │  Marketing+Auth     │   (Terminal AI)        │
│  Browser IDE     │  Billing+Dashboard  │   108K+ lines          │
│  Docker Backend  │  Better Auth        │   50+ commands         │
├──────────────────┴─────────────────────┴────────────────────────┤
│                           API LAYER                              │
├─────────────────────────────────────────────────────────────────┤
│  docker-backend (Port 3100)     │   recoder-code-core           │
│  • Container orchestration      │   • AI provider abstraction    │
│  • Real terminal (PTY)          │   • Tool system (17 tools)     │
│  • Live preview proxy           │   • Subagent framework         │
│  • Multi-language support       │   • MCP integration            │
└─────────────────────────────────┴───────────────────────────────┘
```

---

## 📁 Key Files Modified (This Session)

| File | Changes |
|------|---------|
| `recoder-web/uno.config.ts` | Added Phosphor icons collection |
| `recoder-web/app/components/workbench/LogsPanel.tsx` | Fixed scrolling + text color |
| `recoder-web/app/components/workbench/ProblemsPanel.tsx` | Fixed text colors |
| `recoder-web/app/lib/.server/llm/prompts.ts` | Added agentic workflow |
| `recoder-web/app/lib/.server/llm/few-shot-examples.ts` | NEW - Few-shot examples |
| `recoder-web/app/lib/.server/llm/planning-enforcer.ts` | NEW - Planning step |
| `recoder-web/app/lib/services/auto-fix.ts` | Updated error prompts |
| `recoder-web/app/routes/api.chat.ts` | Integrated few-shot + planning |

---

## 🧪 How to Test AI Improvements

1. **Start recoder-web**: `cd recoder-web && pnpm dev`
2. **Create a project** that has an error (e.g., import missing package)
3. **Click "Fix with AI"** in Problems panel
4. **Verify AI behavior**:
   - Should use `readFile` to check package.json first
   - Should use `readFile` to read the error file
   - Should make minimal changes (not regenerate everything)
   - Should run `npm install` only if package was added




   we copy more stuff from kilo code to recoder web and recoder code like paralel executions'/Users/arhansubasi/recoder.xyz/kilocode/cli/src/commands''/Users/arhansubasi/recoder.xyz/kilocode/cli/src/communication''/Users/arhansubasi/recoder.xyz/kilocode/cli/src/parallel''/Users/arhansubasi/recoder.xyz/kilocode/packages/cloud''/Users/arhansubasi/recoder.xyz/kilocode/src/activate''/Users/arhansubasi/recoder.xyz/kilocode/src/api''/Users/arhansubasi/recoder.xyz/kilocode/src/core''/Users/arhansubasi/recoder.xyz/kilocode/src/integrations''/Users/arhansubasi/recoder.xyz/kilocode/src/services''/Users/arhansubasi/recoder.xyz/kilocode/src/shared''/Users/arhansubasi/recoder.xyz/kilocode/src/workers' add
 all of these to docs we should work on these 