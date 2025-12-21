# RECODER.XYZ - CURRENT STATUS
**Updated**: 2025-12-20 20:15

---

## ⚠️ AI ASSISTANT RULES

**CRITICAL**: AI assistants (Claude Code, GitHub Copilot, etc.) working in this repository:

1. **DO NOT** edit or remove content from this file without explicit user consent
2. **DO NOT** add new code editors - we already have Monaco editor fully integrated
3. **DO NOT** suggest adding file tree - we already have workbench with file management
4. **DO NOT** remove existing features without understanding the full system
5. **ALWAYS** ask before making structural changes to the codebase
6. **READ** this file completely before suggesting changes
7. **UNDERSTAND** we have a complete IDE - just need to fix bugs, not rebuild
 1- only do one task at a chat do not try to do alla t once you will get hallucinate 2- do not
  simpliyf we want actual chat history that tracs recoder code packages cli and recoder-web 3-
  we need to actually auth users and track them app folder is central of app ecossystem auth,
  traction , user data , sessions 4- we most likely need to work on docker backend due to we
  back to 10 days ago , we may check our latest commits 42doeda for checking if docker backend
  is messed we need to turn our backend to replit like it need to be handle project, codes,
  folder and files and terminal managment each chat can be count as project and temrinal
  commands folder files they all need to connect do not use polling it takes time 5- recoder-web
  needs much we wll discuss this later we need  make sure terminal fodler file creation peoject
  creation live rpeview eev rything works on frontend correctly rememebr we need to be like
  replit also we ened to remove emojis from lodaing indicator and remove not needed logs we have
  too much not neecearfy logs on console 
  ⚠ Next.js 15.5.3 has a critical vulnerability (CVE-2025-66478) that could allow attackers to 
   execute arbitrary code on your server. Run `pnpm update next` to update.
**What we already have**:
- ✅ Monaco editor (fully integrated in workbench)
- ✅ File tree and file management
- ✅ Workbench system
- ✅ Terminal (xterm.js)
- ⚠️ Live preview (docker-backend at port 3100)
- ✅ AI chat integration

**CRITICAL CONSTRAINTS**:
- ❌ **WebContainer API is BLOCKED** - StackBlitz doesn't allow live usage
- ✅ **Use docker-backend** (port 3100) for code execution
- ✅ **Or find open-source alternatives** for container management

**What we need**:
- 🔧 Fix existing bugs (SSR errors, missing components)
- 🔧 Test docker-backend service (port 3100)
- 🔧 Remove/replace WebContainer API dependencies
- 🔧 Add multi-language support
- 🔧 Deploy working version

---

## 🎯 MISSION

**Compete with Replit, Cursor, Bolt.new, and Loveable.dev**

AI-powered full-stack development platform for building REAL production applications.

### Core Features (Must Work)
1. **File Creation** - Create, edit, delete files in project
2. **Project Creation** - Initialize new projects from templates or scratch
3. **Terminal** - Full terminal access with command execution
4. **Live Preview** - Real-time preview of running applications

### Multi-Language Support
- ✅ JavaScript/TypeScript (currently working)
- 🔴 Python (TODO)
- 🔴 Go (TODO)
- 🔴 Rust (TODO)
- 🔴 Java (TODO)
- 🔴 PHP (TODO)

### Project Types
- ✅ React/Next.js (currently working)
- ✅ Remix (currently working)
- 🔴 Vue/Nuxt (TODO)
- 🔴 Svelte/SvelteKit (TODO)
- 🔴 Python/FastAPI (TODO)
- 🔴 Django (TODO)
- 🔴 Go/Fiber (TODO)
- 🔴 Rust/Actix (TODO)

---

## 📊 PROJECT STATUS

### ✅ COMPLETED TODAY
- [x] Restored working version from Dec 10 (commit a9144dc)
- [x] Added 4 new features from production backup (Dec 10-16 work)
- [x] Fixed remix-island dependency issue
- [x] Created branch: `working-dec10-with-new-features`
- [x] Committed all changes (commit 6e590ec)
- [x] Generated Prisma client for app folder

### 📦 WORKING VERSION CONFIRMED
- **Commit**: a9144dc (Dec 10, 2025)
- **Files**: 7,874 total files intact
- **UI**: Orange deploy button (working)
- **Code**: All November/December work preserved

---

## 🔴 CRITICAL ERRORS
1. API Routes Failing - Cannot read properties of undefined (reading 'env')
  - /api/chat-history → 500 error
  - /api/mcp/servers → 500 error

  2. Google Profile Image Blocked - COEP blocking external images
  net::ERR_BLOCKED_BY_RESPONSE.NotSameOriginAfterDefaultedToSameOriginByCoep

  3. Browser extension errors (not critical, can ignore)

  Let me fix these:

### HIGH PRIORITY
- [ ] Deal with Hetzner server security lockdown
- [ ] Plan deployment to new/clean server
- [ ] Push working branch to GitHub as backup

### MEDIUM PRIORITY
- [ ] Migrate to Remix v7 future flags
- [ ] Fix Vite SSR react-dom issue
- [ ] Update Prisma config (prisma.config.ts)
- [ ] Test docker-backend service

---

## 📊 PROJECTS OVERVIEW

### docker-backend/ (Execution Backend)
- **Port**: 3100
- **Status**: ❓ Unknown (not tested)
- **Purpose**: Docker container management, code execution
- **Why**: WebContainer API blocked by StackBlitz, we use docker-backend instead
- **Features**: Container creation, npm/pip/cargo install, terminal access, code execution
- **TODO**:
  - Test health endpoint
  - Verify container creation works
  - Test package installation (npm, pip, cargo)
  - Test terminal execution

  🎯 Docker Backend Architecture

  What We Need:

  1. Multi-Language Containers:
    - Node.js/TypeScript
    - Python
    - Go
    - Rust
    - PHP
    - Java
  2. Features:
    - WebSocket terminal access
    - Live preview with port forwarding
    - Package installation (npm, pip, cargo, etc.)
    - File system management

  I'll create a minimal backend that:
  - ✅ Runs on port 3100 (as your config expects)
  - ✅ Creates Docker containers per project
  - ✅ WebSocket terminal access
  - ✅ Port forwarding for live preview
  - ✅ Supports: Node, Python, Go, Rust, PHP, Java

  Option A: Quick Start with Existing Solution (Recommended)

  Use code-server (VS Code backend) with custom wrapper:
  - Free & Open Source
  - Multi-language support
  - Built-in terminal
  - Port forwarding

  Option B: Build Custom Backend (More control)

  Create minimal Express + Dockerode backend:
  - Full control over everything
  - Simpler architecture
  - Easier to customize
---

## 🚀 NEW FEATURES ADDED (Dec 10-16)



---

## 🔐 SECURITY

### Hetzner Server Lockdown
- **IP**: 77.42.23.19
- **Date**: Dec 16-17, 2025
- **Reason**: Port scanning detected (SSH 22, MySQL 3306, RDP 3389, FTP 21)
- **Status**: Server inaccessible
- **Action Required**: Contact Hetzner support OR deploy to new server

### Git Security
- Pre-commit hook active (blocks secrets)
- Production backup downloaded: `recoder-web-backup-from-production/`

---


