# Recoder - Issue Resolution Plan

## Critical Issues to Fix

### 1. ✅ Build Error - FIXED
**Status:** COMPLETE
- **Issue:** MCP component importing non-existent `Tool` icon from lucide-react
- **Fix:** Changed to `Wrench` icon
- **Result:** Build now successful

### 2. 🔴 Preview Not Working
**Status:** NEEDS INVESTIGATION
- **Issue:** WebContainer preview shows blank/not loading
- **Likely Causes:**
  - WebContainer initialization issue
  - Port exposure not working
  - Dev server not starting in container
- **Files to Check:**
  - `app/components/workbench/Preview.tsx`
  - `app/lib/stores/workbench.ts`
  - WebContainer integration code
- **Action:** Need to add better error handling and logging

### 3. 🔴 GitHub Clone Rate Limit
**Status:** TOKEN CONFIGURED
- **Issue:** GitHub API rate limiting
- **Fix:** User added GitHub token to .env
- **Action:** Verify token is being used correctly in API calls

### 4. 🟡 Database Schema Generator - Missing Close Button
**Status:** NEEDS FIX
- **Issue:** No X button to close the schema generator modal
- **File:** `app/components/database/SchemaGenerator.tsx`
- **Fix:** Add close button in header
- **Action:** Add X icon button with onClose callback

### 5. 🟡 Database Schema Generator - No Import to Project
**Status:** NEEDS IMPLEMENTATION
- **Issue:** Generated schema cannot be imported to current project
- **File:** `app/components/database/SchemaGenerator.tsx`
- **Fix:** Add "Import to Project" button that writes files to workbench
- **Action:** 
  - Add import button
  - Integrate with workbench store to write files
  - Support multiple formats (SQL, Prisma, Drizzle, TypeScript)

### 6. 🟡 Chat History Empty
**Status:** DATABASE CONFIGURED, NEEDS TESTING
- **Issue:** Chat history not showing up
- **Files:**
  - `app/routes/api.chat-history.ts` (backend exists)
  - `app/lib/.server/db/chat-history-db.ts` (DB code exists)
  - Need frontend hook to load/save
- **Fix:** 
  - Create `useChatHistory` hook
  - Integrate with chat store
  - Test save/load functionality
- **Action:** Implement frontend integration

### 7. 🟡 History Button Position Wrong
**Status:** BUTTON EXISTS, NEEDS REPOSITIONING
- **Issue:** History button not in correct position
- **File:** `app/components/header/Header.tsx`
- **Current:** Button exists next to logo
- **Desired:** Should be more prominent in header
- **Action:** Verify current position matches requirements

## MCP Server Integration Plan

### Phase 1: Core MCP Protocol (Backend)
**Status:** PLANNED
1. Create MCP protocol handler
2. Implement JSON-RPC communication
3. Add server lifecycle management
4. Handle tool discovery and execution

### Phase 2: MCP UI Components (Frontend)
**Status:** PARTIALLY DONE
- ✅ MCPServerPanel.tsx exists
- ✅ MCPToolsPanel.tsx exists
- ✅ MCPServerManager.tsx exists
- 🔴 Need to integrate with chat for tool calling

### Phase 3: MCP Filesystem Bridge
**Status:** PLANNED
1. Bridge WebContainer filesystem to MCP
2. Implement file read/write operations
3. Add directory traversal
4. Handle file watching

## Deployment Integration Plan

### Phase 1: Platform APIs
**Status:** BACKEND EXISTS, NEEDS TOKENS
1. Vercel deployment API - needs token
2. Netlify deployment API - needs token
3. Railway deployment API - needs token
4. GitHub Pages deployment

### Phase 2: Deployment UI
**Status:** NEEDS IMPLEMENTATION
1. Deployment panel in workbench
2. Platform selection
3. Configuration options
4. Deployment status tracking
5. Logs display

## Testing Checklist

### Before Testing
- [x] Build passes successfully
- [x] Dev server starts
- [x] Database connection string configured
- [x] GitHub token configured

### Feature Tests
- [ ] Preview loads and displays correctly
- [ ] GitHub clone works without rate limit
- [ ] Schema generator opens
- [ ] Schema generator has close button
- [ ] Schema can be imported to project
- [ ] Chat history saves messages
- [ ] Chat history loads on page refresh
- [ ] History button is in correct position
- [ ] MCP tools are accessible
- [ ] Deployment options are available

## Priority Order

1. **HIGH PRIORITY** (Blocking user experience)
   - Fix Preview not working
   - Add Schema Generator close button
   - Implement Schema import to project
   - Fix Chat History save/load

2. **MEDIUM PRIORITY** (Enhances usability)
   - Verify History button position
   - Test GitHub clone with token
   - Add better error messages

3. **LOW PRIORITY** (Future enhancements)
   - Full MCP protocol implementation
   - Deployment integrations
   - Cross-device sync

## Next Steps

1. Fix Schema Generator UI (close button + import)
2. Create useChatHistory hook
3. Test chat history functionality
4. Debug Preview component
5. Test GitHub clone
6. Document any remaining issues
