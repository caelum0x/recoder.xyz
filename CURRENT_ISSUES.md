# RECODER.XYZ - SYSTEM STATUS & ISSUES

## 📋 PLATFORM OVERVIEW

### Mission
AI-powered full-stack development platform competing with **Replit**, **Bolt.new**, **Loveable.dev**, and **Cursor**.



### System Architecture

#### recoder.xyz (Main Site)
- **Port**: 3000
- **Tech**: Next.js 15, Better Auth, PostgreSQL
- **Purpose**: Marketing, authentication, user management
- **Status**: ✅ Running (intermittent 504 timeouts)

#### web.recoder.xyz (IDE)
- **Port**: 5173
- **Tech**: Remix, React, WebContainer API, Monaco Editor
- **Purpose**: Development interface, AI chat, code editor, live preview
- **Features**: AI chat, file tree, code editor, template selection, project management
- **Status**: ⚠️ Unstable (service crashes frequently)

#### docker.recoder.xyz (Execution Backend)
- **Port**: 3100
- **Tech**: Node.js, Express, Docker API
- **Purpose**: Container management, code execution, package installation
- **Features**: Docker containers, code execution, npm/pip/cargo, terminal access
- **Status**: 🔴 DOWN (ERR_BLOCKED_BY_RESPONSE)

#### Database (PostgreSQL)
- **Tables**: users, sessions, projects, chat_sessions, messages, ai_generated_projects
- **Status**: ✅ Running (query timeouts during SSR)

---

## 🚨 CRITICAL SECURITY INCIDENT

### Secrets Leaked to GitHub (Commit a104474)
**Compromised**:
- SSH passwords (2 occurrences)
- PostgreSQL URI (1 occurrence)
- Total: 9 secret exposures

**Actions Taken**:
- ✅ Files deleted from repo
- ✅ Enhanced .gitignore (SSH keys, DB URIs, API keys)
- ✅ Pre-commit hook installed (blocks secrets)

**REQUIRED IMMEDIATELY**:
- ⚠️ Rotate SSH password on all servers
- ⚠️ Rotate PostgreSQL password
- ⚠️ Update all services with new credentials
- ⚠️ Check logs for unauthorized access
- ⚠️ Clean git history if secrets in old commits

---

## 🔴 CRITICAL BUGS

### 1. Chat History Not Saving
**Diagnosis**: Save logic not executing - 0 rows in `ai_generated_projects` table
**Impact**: Users lose all chat history
**Root Cause**: Chat save function not being called in API
**Symptoms**:
- API endpoint works correctly
- Frontend hook correct
- Database queries successful
- But NO chats saved

**Fix Required**:
- Locate chat save function in API
- Add logging to track save calls
- Test manual save
- Verify save triggers on chat creation

---

### 2. 504 Gateway Timeout (web.recoder.xyz)
**Diagnosis**: Service crashes + heavy SSR database queries
**Impact**: Homepage inaccessible, appears/disappears on refresh
**Root Cause**: 
- recoder-web service crashes repeatedly (SIGKILL)
- Homepage loader does database queries during SSR
- Queries timeout causing 504
- Service restarts then crashes again

**Symptoms**:
```typescript
// In app/routes/_index.tsx loader:
- Queries projects table
- Queries chat_sessions table
- Blocks page render waiting for DB
```

**Fix Required**:
- Move database queries from SSR to client-side
- Add caching layer (Redis)
- Increase nginx proxy timeout
- Investigate why service crashes (memory/database)
- Add health checks and proper restart logic

---

### 3. docker.recoder.xyz Down (Live Preview Broken)
**Diagnosis**: docker-backend service not running
**Impact**: ENTIRE LIVE PREVIEW SYSTEM DOWN - users cannot run code
**Symptoms**:
- `ERR_BLOCKED_BY_RESPONSE`
- All `/api/container` requests return 500
- npm install fails
- Terminal shows "docker.recoder.xyz bağlanmayı reddetti" (connection refused)
- WebContainer errors

**Fix Required**:
- Check if docker-backend service running
- Verify port 3100 accessible
- Check CORS configuration
- Review nginx proxy settings for docker.recoder.xyz
- Test container creation endpoint

---

## 🟡 HIGH PRIORITY BUGS

### 4. Wrong Starter Template Selection
**Diagnosis**: Template search/scoring algorithm broken
**Impact**: User asks for "todo app", gets "recoder-expo" instead
**Root Cause**: Search index or scoring logic not working
**Symptoms**:
- Logging enabled but not captured
- Always returns expo template regardless of prompt
- Scoring algorithm not evaluating correctly

**Fix Required**:
- Add console.log to template scoring function
- Test with various prompts ("todo app", "react app", "api")
- Debug scoring algorithm
- Verify search index integrity

---

### 5. npm install Fails in Live Preview
**Diagnosis**: Blocked by docker.recoder.xyz being down
**Symptoms**:
- Shows green checkmark but errors in console
- fetch.worker.js preload warnings
- WebContainer warnings: `[Contextify] [WARNING] running source code in new context`
- Multiple 404 and 500 errors

**Fix Required**: Blocked by fixing docker.recoder.xyz (#3)

---

### 6. recoder-code CLI Not Pre-installed
**Diagnosis**: False advertising - package not in Docker images
**Impact**: Terminal claims "✅ recoder-code pre-installed" but command not found
**Symptoms**:
```bash
~/project ❯ recoder-code
jsh: command not found: recoder-code
```

**Fix Required**:
- Add recoder-code package to Docker image
- Update container initialization script
- OR remove claim from terminal banner

---

## 🟢 INFRASTRUCTURE ISSUES

### Service Management
**Problems**:
- Services crash without monitoring
- No auto-restart with backoff
- No alerting on failures
- No log aggregation

**Needed**:
- Health checks for all services
- PM2 or systemd with proper restart policies
- Monitoring (Prometheus/Grafana)
- Centralized logging (ELK/Loki)

### Database Performance
**Problems**:
- SSR queries causing timeouts
- No connection pooling
- No caching layer

**Needed**:
- Query optimization
- Connection pooling (PgBouncer)
- Redis caching layer
- Move heavy queries to client-side

### nginx Configuration
**Problems**:
- Timeouts too aggressive (60s)
- CORS issues
- No request logging

**Needed**:
- Increase proxy timeouts (120s+)
- Standardize CORS headers
- Add access logging
- Rate limiting

---

## 🔵 FUTURE WORK

### Phase 1: Stability (Post-Critical Fixes)
- [ ] Service monitoring and alerting
- [ ] Database query optimization
- [ ] Caching layer implementation
- [ ] Error tracking (Sentry)
- [ ] Performance monitoring

### Phase 2: Feature Completion
- [ ] GitHub integration (clone, push, pull)
- [ ] Real-time collaboration
- [ ] Terminal improvements
- [ ] File upload/download
- [ ] Project templates expansion

### Phase 3: Advanced Features
- [ ] Multi-language support (Python, Go, Rust)
- [ ] Database management UI
- [ ] API testing tools
- [ ] Deployment automation
- [ ] Team workspaces

### Phase 4: Enterprise
- [ ] SSO integration
- [ ] Private deployments
- [ ] Custom AI models
- [ ] Audit logging
- [ ] SLA guarantees

### CLI Features (Completed - Needs Testing)
- ✅ `recoder init` - Initialize projects
- ✅ `recoder plan` - AI planning
- ✅ `recoder mcp detect` - MCP detection
- ✅ `recoder web` - Launch web interface
- ✅ `.recoder` folder configuration
- ✅ AI-executable `.ai.md` files

### Installation Methods (Completed)needs testing and checking
- ✅ curl install script
- ✅ npm/pnpm/yarn packages
- ✅ Homebrew formula

---

## 📊 PRIORITY MATRIX

| Issue | Priority | Impact | Status |
|-------|----------|--------|--------|
| Security: Secrets leaked | P0 | Critical | Partially fixed |
| Chat history not saving | P0 | Critical | Diagnosed |
| 504 Gateway timeout | P0 | Critical | Diagnosed |
| docker.recoder.xyz down | P0 | Critical | Not started |
| Wrong template selection | P1 | High | Diagnosed |
| npm install issues | P1 | High | Blocked by #3 |
| recoder-code not installed | P1 | High | Not started |

---

## 🎯 IMMEDIATE ACTION PLAN

### Security (URGENT)
1. Rotate all compromised credentials
2. Check access logs for breaches
3. Clean git history

### Critical Bugs (IN ORDER)
1. Fix docker-backend service
2. Fix chat history saving
3. Stabilize recoder-web service
4. Fix template selection

### Infrastructure
1. Add service monitoring
2. Implement caching
3. Optimize database queries
4. Configure proper timeouts

---

## 📝 NOTES FOR AI ASSISTANTS

### When Debugging
- Check service status: `systemctl status recoder-app recoder-web`
- Check logs: `journalctl -u <service> -n 100`
- Check ports: `netstat -tlnp | grep <port>`
- Check processes: `ps aux | grep <process>`

### Common Issues
- 504 errors = service down or timeout
- 500 errors = backend error, check logs
- CORS errors = nginx or Express config
- Database errors = connection or query timeout

### File Locations
- Main site: `/home/recoder/recoder.xyz/app`
- IDE: `/home/recoder/recoder.xyz/recoder-web`
- Docker backend: `/home/recoder/recoder.xyz/docker-backend`
- nginx config: `/etc/nginx/sites-available/`
- systemd services: `/etc/systemd/system/`
