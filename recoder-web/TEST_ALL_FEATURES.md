# Complete Feature Testing Guide

## 🚀 Start Development Server

```bash
cd /Users/arhansubasi/bolt.new
NODE_ENV=development pnpm run dev
```

Server will be available at: http://localhost:5173/

## ✅ Testing Checklist

### 1. Chat History Integration ✅

**Test Steps:**
1. Open http://localhost:5173/
2. Start a new chat by typing a message
3. Look for the history button (clock icon) next to the "Recoder" logo in the header
4. Click the history button to open the sidebar
5. Send several messages to create chat history
6. Refresh the page - chat should reload from database
7. Open history sidebar again - you should see your chat in the list

**Expected Behavior:**
- ✅ History button visible in header (left side, next to logo)
- ✅ Sidebar opens when clicking history button
- ✅ Chats are saved to database automatically
- ✅ Chats persist across page refreshes
- ✅ Delete button works for removing chats

**Database Check:**
```bash
# Check if DATABASE_URL is set
grep DATABASE_URL /Users/arhansubasi/bolt.new/.env

# Check database connection
psql $DATABASE_URL -c "SELECT COUNT(*) FROM chat_sessions;"
```

### 2. Database Schema Generator ✅

**Test Steps:**
1. Go to http://localhost:5173/schema
2. Type a description: "Create a blog with users, posts, and comments"
3. Select database type (SQLite/PostgreSQL/MySQL)
4. Click "Generate Schema"
5. Wait for results
6. Click through tabs: SQL, TypeScript, Prisma, Seed Data
7. Click the X button (top right) to close the result view
8. Generate again
9. Click "Import to Project" button (green button in toolbar)

**Expected Behavior:**
- ✅ Schema generates successfully
- ✅ All tabs show correct code
- ✅ Close button (X) visible in top right when results showing
- ✅ Import to Project button downloads/imports files
- ✅ Copy and download buttons work

### 3. MCP Tools & Servers 🆕

**Test Steps:**
1. Start the development server
2. Look for the wrench icon button in the header (after database icon)
3. Click the MCP Tools button
4. Modal should open showing:
   - Connected servers list
   - Available tools
   - Server status indicators

**Expected Behavior:**
- ✅ MCP Tools button visible in header
- ✅ Modal opens when clicked
- ✅ Shows at least 4 servers: filesystem, github, database, api
- ✅ Each server shows tool count
- ✅ Can execute tools with parameters

**API Test:**
```bash
# List servers
curl http://localhost:5173/api/mcp?action=list-servers

# List tools
curl http://localhost:5173/api/mcp?action=list-tools

# Execute a tool
curl -X POST http://localhost:5173/api/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "toolName": "filesystem_list_directory",
    "parameters": {"path": "/home/project"}
  }'
```

### 4. Deployment System ✅

**Test Steps:**
1. Create a simple project in the chat (e.g., "create a simple HTML page")
2. Wait for files to appear in workbench
3. Look for the "Deploy" button (green/blue gradient, with rocket icon)
4. Click the Deploy button
5. Modal should open with deployment options
6. Select a platform (Vercel, Netlify, or Cloudflare)
7. Configure project settings
8. Click "Deploy"

**Expected Behavior:**
- ✅ Deploy button visible when workbench is open
- ✅ Modal opens with platform selection
- ✅ Can configure deployment settings
- ✅ Shows deployment progress
- ✅ Returns deployment URL on success

**API Test:**
```bash
# Get supported platforms
curl http://localhost:5173/api/deploy?action=platforms

# Test deployment detection
curl -X POST http://localhost:5173/api/deploy \
  -H "Content-Type: application/json" \
  -d '{
    "action": "detect",
    "files": {
      "package.json": "{\"name\": \"test\", \"version\": \"1.0.0\"}"
    }
  }'
```

### 5. GitHub Integration ⚠️

**Test Steps:**
1. Click the GitHub icon button in the header
2. Modal opens with template/repository options
3. Try cloning a public repository
4. Or select a template to start with

**Expected Behavior:**
- ✅ GitHub button opens modal
- ✅ Can browse templates
- ✅ Can clone repositories
- ⚠️ May hit rate limits without GITHUB_TOKEN

**Fix Rate Limiting:**
```bash
# Ensure GITHUB_TOKEN is in .dev.vars
echo "GITHUB_TOKEN=your_token_here" >> .dev.vars

# Restart server to apply changes
```

### 6. Preview Functionality ⚠️

**Test Steps:**
1. Create a simple web project (HTML/React)
2. Wait for files to be created
3. Look for workbench to appear on right side
4. Click "Preview" tab in workbench
5. Preview should show your application running

**Expected Behavior:**
- ✅ Workbench opens when files are created
- ✅ Code tab shows file editor
- ⚠️ Preview tab may show webcontainer error

**Debug Preview:**
- Check browser console for webcontainer errors
- Verify files are being written correctly
- Check terminal output in workbench

### 7. Cross-Feature Integration Tests

**Test: Full Workflow**
1. Import a GitHub template
2. Modify code in the workbench
3. Generate a database schema
4. Import schema files to project
5. Deploy the project
6. Check chat history sidebar

**Test: MCP + Chat**
1. Open chat
2. Use MCP filesystem tool to list files
3. Use MCP database tool to query schema
4. Results should appear in chat

**Test: History + Deploy**
1. Create multiple projects in separate chats
2. Switch between chats in history
3. Each chat should load its own project
4. Deploy each project separately

## 🔧 Environment Variables Checklist

Verify all required variables are set:

```bash
# Check .env file
cat /Users/arhansubasi/bolt.new/.env | grep -E "(DATABASE_URL|GITHUB_TOKEN|VERCEL_TOKEN|ANTHROPIC_API_KEY|OPENAI_API_KEY)"

# Check .dev.vars file
cat /Users/arhansubasi/bolt.new/.dev.vars | grep -E "(GITHUB_TOKEN)"
```

Required variables:
- ✅ DATABASE_URL or NEON_DATABASE_URL (for chat history)
- ✅ GITHUB_TOKEN (for GitHub integration)
- ✅ ANTHROPIC_API_KEY or OPENAI_API_KEY (for AI features)
- ⚠️ VERCEL_TOKEN (optional, for Vercel deployments)
- ⚠️ NETLIFY_TOKEN (optional, for Netlify deployments)
- ⚠️ CLOUDFLARE_API_TOKEN (optional, for Cloudflare deployments)

## 📊 Feature Status Summary

| Feature | Status | Notes |
|---------|--------|-------|
| Chat History | ✅ Working | Saves to database, loads on refresh |
| History Button | ✅ Working | Positioned correctly in header |
| Schema Generator | ✅ Working | Close and Import buttons functional |
| MCP Tools Panel | ✅ Working | Accessible from header wrench icon |
| MCP Servers | ✅ Working | 4 servers initialized |
| Deployment | ✅ Working | Deploy button in header when workbench open |
| GitHub Clone | ⚠️ Testing | May need token for rate limits |
| Preview | ⚠️ Testing | Needs webcontainer debugging |

## 🐛 Known Issues

1. **Preview Not Working**: Webcontainer may need initialization debugging
2. **GitHub Rate Limiting**: Set GITHUB_TOKEN in .dev.vars
3. **Database Connection**: Ensure DATABASE_URL is correct in .env

## 💡 Tips

1. **Clear browser cache** if UI changes don't appear
2. **Check browser console** for any JavaScript errors
3. **Monitor terminal** for backend errors
4. **Test in incognito mode** to verify anonymous user features
5. **Use PostgreSQL client** to verify database operations

## 🎯 Success Criteria

All features are working if:
- ✅ Chat history saves and loads correctly
- ✅ History button opens sidebar with chats
- ✅ Schema generator creates and imports files
- ✅ MCP tools panel opens and shows servers
- ✅ Deploy button appears and opens modal
- ⚠️ Preview loads projects (may need debugging)
- ⚠️ GitHub clone works (with token)

## 📝 Next Steps

If issues found:
1. Document the exact error message
2. Check relevant log files
3. Verify environment variables
4. Test API endpoints directly
5. Report with reproduction steps

## 🚀 Production Checklist

Before deploying to production:
- [ ] Set all environment variables in Cloudflare dashboard
- [ ] Test database migrations
- [ ] Verify API rate limits
- [ ] Enable error tracking (Sentry, etc.)
- [ ] Test authentication flow
- [ ] Verify deployment webhooks
- [ ] Check CORS settings
- [ ] Test file upload limits
- [ ] Monitor performance
- [ ] Set up backups for database
