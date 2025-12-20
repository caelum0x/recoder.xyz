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

### 1. recoder-web (Port 5173)
**Error**: `require is not defined` in react-dom/server.node.js
**Location**: `/node_modules/.pnpm/react-dom@18.3.1_react@18.3.1/node_modules/react-dom/server.node.js:9:3`
**Impact**: SSR failing, routes not loading
**Cause**: Vite ESM/CJS mismatch

**Error**: Missing `ChatHistoryList` component
**Location**: `recoder-web/app/routes/history.tsx`
**Impact**: history.tsx route broken
**TODO**: Create ChatHistoryList component or remove import

### 2. app (Next.js - Port 3000)
**Status**: Prisma client generated ✅
**Previous Error**: Missing `.prisma/client/default` - FIXED
**TODO**: Test if /api/auth/session works now

### 3. docker-backend (Port 3100)
**Status**: NOT TESTED
**TODO**: Check if service is running
**TODO**: Test container creation endpoint

---

## ⚠️ WARNINGS

### recoder-web
- Vite CJS deprecation warning (react-dom SSR)
- Remix v7 migration flags needed:
  - `v3_lazyRouteDiscovery`
  - `v3_singleFetch`
- Missing starters submodule (marked as modified)

### app
- 4 zombie Next.js worker processes from Dec 10 (PIDs: 77015-77018)
- Each consuming 96% CPU
- Prisma v7 migration needed (package.json#prisma deprecated)

---

## 📋 TODO

### IMMEDIATE (Fix to test locally)
- [ ] Fix recoder-web SSR `require is not defined` error
- [ ] Create ChatHistoryList component for history.tsx
- [ ] Kill zombie Next.js processes (77015, 77016, 77017, 77018)
- [ ] Test app folder on port 3000
- [ ] Test recoder-web on port 5173 (orange button)

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

### app/ (Main Website - Next.js)
- **Port**: 3000
- **Status**: ⚠️ Running but with zombie processes
- **Database**: Neon PostgreSQL (connected)
- **Auth**: Better Auth configured
- **Errors**: None (after Prisma generate)

### recoder-web/ (IDE - Remix)
- **Port**: 5173
- **Status**: 🔴 Running but SSR broken
- **Tech**: Remix 2.17.1, Vite 5.4.21, React 18.3.1

**Core Features Status**:
- ✅ **File Creation**: Workbench with Monaco editor fully integrated
- ✅ **File Tree**: Complete file management in workbench
- ✅ **Project Creation**: Template system with starters templates no always necesaary if user promtp wants specicifc stack tempalte canbe used
- ⚠️ **Terminal**: xterm.js integrated (needs testing)
- ⚠️ **Live Preview**: docker-backend (port 3100) - needs testing
- ✅ **AI Chat**: Claude/Groq/OpenAI integration working

**Code Execution**:
- ❌ WebContainer API - CANNOT USE (StackBlitz blocks live usage)
- ✅ docker-backend service - our solution for code execution
- 🔴 Status: Needs testing and verification

**Errors**:
  - require is not defined (react-dom SSR)
  - Missing ChatHistoryList component

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

---

## 🚀 NEW FEATURES ADDED (Dec 10-16)

From production backup:
1. ✅ **admin.tsx** - Admin panel (2.8 KB)
2. ✅ **api.generate-image.ts** - AI image generation API (2.1 KB)
3. ✅ **api.web-search.ts** - Web search API (2.2 KB)
4. ⚠️ **history.tsx** - Chat history page (1.3 KB) - BROKEN (missing ChatHistoryList)

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

## 📈 NEXT STEPS

1. Fix recoder-web SSR error to test locally
2. Verify orange deploy button works
3. Push working branch to GitHub
4. Plan new server deployment
5. Address Hetzner security issue
