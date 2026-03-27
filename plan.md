# Recoder Platform — Honest Status

Last updated: 2026-03-27 00:00 UTC — based on USER browser testing

---

## 1. Agents (agents.recoder.xyz)

### User-confirmed working:
- Plain text chat
- Web search (first ~5 links)
- Agent runs tools (execute command, python3) — actions visible in UI
- Files tab shows sandbox directory listing

### User-confirmed broken:
| Issue | Detail |
|-------|--------|
| **DOCX output empty** | Agent says "created at /workspace/claude_code_report.docx" but file is empty. Python script runs but produces no output. |
| **DOCX preview doesn't show content** | Shows filename, not rendered document content. DocxPreview component exists but sandbox stops (archived) before fetch. |
| **Files/History empty** | Shows "Nothing here yet" even after agent creates files |
| **CORS blocks project data** | `/v1/projects/{id}` blocked by CORS intermittently → sandbox ID not available → preview falls back to icon |
| **ERR_HTTP2_PROTOCOL_ERROR** | SSE streams (notifications, realtime) still fail intermittently |

### Not tested yet by user:
- Sidebar Chats/Workers/Spaces/Triggers (deployed, needs login test)
- Settings scroll, Credentials, Webhooks (deployed)
- Slides, Excel, Image tools (backend verified, needs browser test)
- Chat persistence (backend fix deployed)

---

## 2. Agency (agency.recoder.xyz)

### User-confirmed:
- Login page works
- Basics work (notebook-style manual content)
- **NO COPILOT VISIBLE** — user says "agency do not have copilot none of the pages I did not see any copilot"

### User-confirmed broken:
| Issue | Detail |
|-------|--------|
| **Copilot not visible** | Copilot tool calling code was deployed to API route but there's no copilot UI on agency pages. The copilot only exists on the project detail page, not globally. |
| **Workflows page** | Different/weird UI, not functional |
| **Vector stores page** | Different UI, not working |

### What's needed:
- Add copilot UI to agency dashboard/sidebar (not just project page)
- Copilot needs to be accessible from ALL agency pages like Cursor/VSCode

---

## 3. PM (pm.recoder.xyz)

### User-confirmed working:
- Basics work
- Copilot can chat and reads from features page
- PM pages: Home, Activity, Insights, Plan, Feedback, Interviews, Initiatives, Features, Proposals, Ship, Roadmap, Gantt, Calendar, Releases, Changelog, Users, Companies

### User-confirmed issues:
| Issue | Detail |
|-------|--------|
| **Copilot only on Insights** | Needs to be on ALL PM pages, not just Insights |
| **Features page has Recoder's test data** | Shows "Recoder Web IDE", "Recoder A2A" etc. — these are my seed data, not user data. Need to remove for real users. |
| **Feature connections** | "Connect feature" shows GitHub/Linear/Jira options but "Install GitHub app" — not set up |

### What's needed:
- Remove Recoder-specific seed features from user accounts
- Make copilot accessible on ALL pages
- Set up GitHub app for feature connections

---

## 4. OpenClaw (openclaw.recoder.xyz)

### User-confirmed:
- Dashboard loads with full UI
- Health badge shows "OK"
- All sidebar items visible (Chat, Channels, Instances, Sessions, Cron Jobs, Agents, Skills, Nodes, Config, Debug, Logs)

### Status: BEST platform right now

---

## 5. Web IDE (web.recoder.xyz)

### User-confirmed:
- Can generate code (AI writes files)
- Container creates successfully
- Files appear in sidebar (claude_code_report.py visible)

### User-confirmed broken:
| Issue | Detail |
|-------|--------|
| **Preview times out** | "Dev server health check timed out after 30 attempts" — npm install or dev server never starts |
| **Chat times out** | "Chat request timed out (90608ms)" — AI response takes too long |
| **DOCX empty** | Agent creates .py file but .docx output is empty |
| **Auth falls back to anonymous** | "Session token not found in cookies. Auth will fall back to anonymous mode." |
| **No live preview** | Preview URL generated but iframe shows nothing |

### What's needed:
- Fix dev server startup in Daytona sandbox
- Fix AI response timeout (90s not enough)
- Fix anonymous auth fallback

---

## 6. recoder.xyz

### User-confirmed:
- Landing page works
- Login form works (redirects to PM, Web IDE)

### Issues:
- Sign Out not visible on landing page (only shows when logged in)
- Recoder seed data appears in PM features for all users

---

## Latest user feedback (2026-03-27):

### Agents:
- DOCX says "Loading space_tech.docx / Retrying..." — won't render content
- Agent says it created report but file is empty on Files tab
- Actions show python3 ran but output not visible
- Files tab shows /workspace listing (home dir junk: .ICEauthority, .bashrc, Desktop, etc.) not project files

### Web IDE:
- Preview health check times out after 30 attempts
- Chat request times out at 90s
- "Session token not found in cookies" — auth broken, falls back to anonymous
- Preview URL generated but iframe blank

### PM:
- Copilot works on Features page but needs to work on ALL pages (Home, Activity, Insights, Plan, Feedback, Interviews, Initiatives, Features, Proposals, Ship, Roadmap, Gantt, Calendar, Releases, Changelog, Users, Companies)
- Features page has Recoder-specific seed data (Recoder Web IDE, A2A etc.) — bad for other users
- "Connect feature" shows GitHub/Linear/Jira but none set up

### Agency:
- NO copilot visible anywhere — not on any page
- Workflows/vector stores have different weird UI

### OpenClaw:
- Best platform — health shows OK, dashboard works

---

## Priority — What to fix next:

1. **Web IDE auth** — "Session token not found" blocks everything. Fix cross-domain cookie issue.
2. **Web IDE preview** — dev server health check timeout. Daytona recovery in preview.ts deployed but needs verification.
3. **Agent DOCX rendering** — DocxPreview shows "Loading/Retrying" because sandbox stops before file can be fetched.
4. **Agent Files tab** — shows /home/daytona junk files instead of project workspace files.
5. **Agency copilot UI** — add copilot chat to all agency pages (global sidebar/floating button).
6. **PM copilot on all pages** — not just Insights page.
7. **Remove Recoder seed data** — from PM features for non-Recoder users.
8. **PM Feature connections** — GitHub/Linear/Jira setup.
