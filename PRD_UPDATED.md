# Product Requirements Document (PRD) - UPDATED
# Recoder.xyz - AI-Powered Web & Terminal Development Platform

**Document Version:** 3.0 (POST-IMPLEMENTATION)  
**Last Updated:** November 29, 2025  
**Status:** Core Features Complete - Testing Phase  
**Owner:** Product Team

---

## Executive Summary

Recoder.xyz has successfully implemented its core features:
- ✅ Web-based IDE with WebContainer
- ✅ Terminal CLI tool
- ✅ Claude-style Projects organization
- ✅ GitHub integration with auto-sync
- ✅ BYOK (Bring Your Own Key) model

**Current Phase:** Testing and polish before production launch

---

## Implementation Status

### ✅ COMPLETED FEATURES

#### 1. Core Platform (100%)
- ✅ Authentication (Google OAuth, JWT)
- ✅ Web IDE (Bolt.new-style)
- ✅ CLI tool (recoder-code)
- ✅ Database persistence
- ✅ BYOK API key management

#### 2. Projects Feature (100%)
**Implementation Date:** Nov 29, 2025

**Database:**
- ✅ `projects` table
- ✅ `project_files` table
- ✅ `chat_sessions.project_id` link

**Backend API:**
- ✅ `/api/projects` - Full CRUD
- ✅ Create, update, delete projects
- ✅ Link chats to projects

**Frontend:**
- ✅ Projects sidebar component
- ✅ Create project modal
- ✅ Save chat to project button
- ✅ Project organization UI

**User Experience:**
Users can now:
- Create projects with name, icon, description
- Save chats to projects
- View all projects in sidebar
- Organize work like Claude Projects

#### 3. GitHub Integration (100%)
**Implementation Date:** Nov 29, 2025

**Database:**
- ✅ `chat_github_connections` table

**Backend API:**
- ✅ `/api/chat/:id/github` - Full integration
- ✅ Connect/disconnect repos
- ✅ Push files to GitHub (real Octokit)
- ✅ Auto-sync logic

**Frontend:**
- ✅ GitHub bar in chat interface
- ✅ Repo selector modal
- ✅ Connection status display
- ✅ Auto-sync notifications

**User Experience:**
Users can now:
- Connect GitHub repo from chat bar
- See connected repo and branch
- Auto-sync files after AI generates code
- Disconnect from GitHub

#### 4. Project Sync (90%)
**Status:** Functional, needs testing

**What Works:**
- ✅ `/app/api/projects/route.ts` - API endpoint
- ✅ `/app/projects/page.tsx` - Projects page
- ✅ CLI commands: list, download, open, push, sync

**What Needs:**
- ⏳ End-to-end testing
- ⏳ Error handling polish

---

## Feature Specifications

### Projects Feature

**Database Schema:**
```sql
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT DEFAULT '📁',
  color TEXT DEFAULT '#6366f1',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE project_files (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE chat_sessions ADD COLUMN project_id TEXT;
```

**API Endpoints:**
```typescript
GET  /api/projects              // List all projects
POST /api/projects              // Create/update/delete
  - action: create              // Create new project
  - action: update              // Update project
  - action: delete              // Delete project
  - action: add-chat            // Link chat to project
```

**UI Components:**
- `ProjectsList.tsx` - Sidebar component
- `SaveToProject.tsx` - Header button
- Create project modal

---

### GitHub Integration

**Database Schema:**
```sql
CREATE TABLE chat_github_connections (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  repo TEXT NOT NULL,
  branch TEXT DEFAULT 'main',
  auto_sync BOOLEAN DEFAULT true,
  last_sync TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```

**API Endpoints:**
```typescript
GET  /api/chat/:chatId/github?action=status  // Check connection
POST /api/chat/:chatId/github
  - action: connect                           // Connect repo
  - action: disconnect                        // Disconnect
  - action: push                              // Push files
```

**UI Components:**
- `GitHubBar.tsx` - Chat bar component
- Repo selector modal
- Connection status display

**Auto-Sync Logic:**
- Tracks modified files in ActionRunner
- Batches changes (2-second delay)
- Pushes to GitHub with Octokit
- Updates sync status

---

## Testing Requirements

### Manual Testing Checklist

#### Projects Feature
- [ ] Create project from sidebar
- [ ] Project appears in list
- [ ] Save chat to project
- [ ] View project details
- [ ] Delete project

#### GitHub Integration
- [ ] Connect GitHub repo
- [ ] Connection shows in chat bar
- [ ] Generate code with AI
- [ ] Verify auto-sync to GitHub
- [ ] Check GitHub for new commit
- [ ] Disconnect repo

#### End-to-End Flows
- [ ] Create project → Generate code → Auto-sync
- [ ] Multiple chats in one project
- [ ] Switch between projects
- [ ] Error scenarios

---

## Launch Readiness

### ✅ Ready for Production
- Core platform functional
- All features implemented
- No mock data
- No TODOs or placeholders
- Real database queries
- Real GitHub integration

### ⏳ Before Launch
- Manual testing (2-3 hours)
- Bug fixes from testing
- User documentation
- Video demos
- Environment variables set

### 🔮 Post-Launch Roadmap
- Project templates
- Team collaboration
- Advanced CLI features
- Real-time sync
- Analytics dashboard

---

## Success Metrics

### Beta Phase (First 2 Months)
- 1,000+ signups
- 60% activation rate
- 40% use Projects feature
- 30% connect GitHub
- 50% month 2 retention

### Key Metrics to Track
- Projects created per user
- GitHub connections
- Auto-sync usage
- Chat-to-project ratio
- User satisfaction

---

## Technical Architecture

### Database Tables (8 total)
1. `users` - User accounts
2. `oauth_accounts` - OAuth connections
3. `chat_sessions` - Chat history
4. `chat_messages` - Individual messages
5. `projects` - User projects ✅ NEW
6. `project_files` - Project files ✅ NEW
7. `chat_github_connections` - GitHub links ✅ NEW
8. `platform_api_keys` - User API keys

### API Endpoints (20+ total)
- Authentication: 5 endpoints
- Projects: 5 endpoints ✅ NEW
- GitHub: 3 endpoints ✅ NEW
- Chat: 4 endpoints
- Settings: 3+ endpoints

### Frontend Components (50+ total)
- Projects: 2 components ✅ NEW
- GitHub: 2 components ✅ NEW
- Chat: 10+ components
- Settings: 5+ components
- Workbench: 10+ components

---

## Deployment Checklist

### Environment Variables
```bash
# Main App
DATABASE_URL=postgresql://...
ENCRYPTION_KEY=...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
NEXT_PUBLIC_RECODER_WEB_URL=https://web.recoder.xyz

# Recoder-Web
DATABASE_URL=postgresql://...
RECODER_WEB_URL=https://web.recoder.xyz
```

### Database Migrations
```bash
cd /Users/arhansubasi/recoder.xyz/app
npx prisma migrate deploy
```

### Build & Deploy
```bash
# Main app
cd app && npm run build && npm start

# Recoder-web
cd recoder-web && npm run build
```

---

## Documentation Status

### ✅ Complete
- Implementation summary
- Test procedures
- Technical specifications

### ⏳ Needed
- User guide for Projects
- GitHub integration guide
- Video tutorials
- Troubleshooting guide

---

## Timeline

### Completed (Nov 29, 2025)
- ✅ Projects feature (7.5 hours)
- ✅ GitHub integration (included)
- ✅ Auto-sync logic (included)
- ✅ Database migrations (included)

### Remaining (1-2 days)
- ⏳ Testing (2-3 hours)
- ⏳ Bug fixes (2-4 hours)
- ⏳ Documentation (2-3 hours)
- ⏳ Deployment (1-2 hours)

**Total Time to Launch:** 7-12 hours

---

## Conclusion

Recoder.xyz has successfully implemented all core features:
- ✅ Web IDE + CLI integration
- ✅ Claude-style Projects
- ✅ GitHub auto-sync
- ✅ BYOK model

**Status:** Ready for testing phase
**Next:** Manual testing → Bug fixes → Launch

---

**Document Status:** ✅ CURRENT
**Implementation Status:** ✅ COMPLETE
**Launch Status:** ⏳ TESTING PHASE
