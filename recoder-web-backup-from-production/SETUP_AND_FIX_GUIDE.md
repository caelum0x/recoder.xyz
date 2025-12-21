# Complete Setup and Fix Guide

## 🔴 CRITICAL: Security Issue Fixed

**Your API keys were exposed in `.env.local`!** I've cleaned up the file, but you should:

1. **Rotate all exposed keys immediately:**
   - Anthropic API Key: https://console.anthropic.com/
   - OpenRouter API Key: https://openrouter.ai/keys
   - GitHub Personal Access Token: https://github.com/settings/tokens

2. **Never commit `.env`, `.env.local`, or `.dev.vars` to Git**
   - They are already in `.gitignore`
   - But verify: `cat .gitignore | grep env`

## 📋 Issues Status

### ✅ Fixed Issues

1. **Schema Generator - Close Button** 
   - Already implemented at line 231-239 of `SchemaGenerator.tsx`
   - Click the X button in top-right when schema is displayed

2. **Schema Generator - Import to Project**
   - Already implemented at lines 118-178 and 502-509
   - Click "Import to Project" button after generating schema
   - Files will be downloaded and attempted to import to workbench

3. **History Button Position**
   - Already properly positioned in Header next to Recoder logo
   - Clean clock icon button for toggling history sidebar

4. **Database Setup Script**
   - Fixed `init-database.ts` to use environment variables (was hardcoded!)
   - Added chat history tables creation to init script
   - Security issue resolved - no more hardcoded credentials

### ⚠️ Issues Requiring Your Action

#### 1. **Database Connection** (CRITICAL - Blocks chat history)

**Problem:** The DATABASE_URL in `.dev.vars` is expired or incorrect.

**Solution:**
1. Get your current Neon database connection string from: https://console.neon.tech/
2. Update `.dev.vars` with the correct URL:

```bash
DATABASE_URL=postgresql://user:password@host/database?sslmode=require
```

3. Run the database setup:

```bash
npm run db:init
```

4. Verify setup:

```bash
npm run db:verify
```

**Note:** The old connection string was:
```
postgresql://neondb_owner:npg_e2mFob8SaEOV@ep-silent-mode-adii0v0d-pooler.us-east-1.aws.neon.tech/neondb
```

This appears to be expired. Please get a fresh one from Neon console.

#### 2. **Chat History Empty**

**Root Cause:** Database connection failing (see issue #1 above)

**After fixing DATABASE_URL:**
- Chat history will automatically save to database
- Anonymous users get localStorage + database backup
- Authenticated users get full database persistence
- History sidebar will show all saved chats

**Test Steps:**
1. Fix DATABASE_URL
2. Run `npm run db:init`
3. Start dev server: `npm run dev`
4. Create a new chat
5. Send a message
6. Check browser console for: `✅ Chat saved to database`
7. Click history button (clock icon) to see saved chats

#### 3. **Preview Not Working**

**Possible Causes:**
- WebContainer not initializing properly
- Dev server not starting in preview
- Port not being exposed correctly

**Debug Steps:**
1. Open browser dev tools console
2. Look for webcontainer errors
3. Check for: `📺 Preview URL set:` log
4. Verify the URL is not `about:blank`

**To investigate further:**
```bash
# Check Preview.tsx logs
grep -n "Preview" app/components/workbench/Preview.tsx

# Check webcontainer init
grep -n "webcontainer" app/lib/webcontainer.ts
```

**Common Fixes:**
- Clear browser cache
- Restart dev server
- Check if ports 3000-3100 are available
- Verify WebContainer is supported (needs Chrome-based browser)

#### 4. **GitHub Clone Rate Limit**

**Status:** GitHub token exists in `.dev.vars`

**Verify Token:**
1. Test your token:
```bash
curl -H "Authorization: token YOUR_GITHUB_TOKEN" https://api.github.com/user
```

2. If expired, create new token:
   - Go to: https://github.com/settings/tokens
   - Generate new token (classic)
   - Required scopes: `repo`, `read:user`
   - Update in `.dev.vars`

3. Rate limit info:
   - Without token: 60 requests/hour
   - With token: 5000 requests/hour

### 🚧 Features Not Yet Implemented

#### 5. **MCP Server Integration**

**Current Status:**
- Backend infrastructure exists (`app/routes/api.mcp.ts`)
- MCP registry and client implemented
- Servers for filesystem, GitHub, database, and API exist

**What's Missing:**
- UI components for MCP server management
- Integration with chat interface
- Server selection and configuration UI

**To Implement:**
Would you like me to implement this? It requires:
1. MCP server selector component
2. Tool execution in chat
3. Server configuration interface
4. Status indicators

#### 6. **Vercel Deployment Button**

**Current Status:** Not implemented

**To Implement:**
Would you like me to implement this? It requires:
1. Vercel API integration
2. Authentication flow
3. Project creation API
4. Deployment button in UI
5. Status monitoring

### 📊 Working Features (No Action Needed)

1. ✅ Chat with AI (Anthropic Claude, OpenRouter)
2. ✅ Code generation and editing
3. ✅ File management in workbench
4. ✅ Terminal integration
5. ✅ Database schema generation
6. ✅ Template quick start
7. ✅ GitHub repository browsing (with token)
8. ✅ Subscription management (Paddle, DodoPay)
9. ✅ Analytics tracking
10. ✅ Model selection and optimization

## 🚀 Quick Start After Fixes

1. **Update your DATABASE_URL in `.dev.vars`** (most important!)

2. **Initialize database:**
```bash
npm run db:init
```

3. **Start development:**
```bash
npm run dev
```

4. **Test features:**
   - Create a new chat → verify it saves to history
   - Generate a database schema → test close and import buttons
   - Clone a GitHub repo → verify token works
   - Open preview → check if it loads

## 🔧 Troubleshooting Commands

```bash
# Check database connection
npm run db:verify

# View database tables
npm run db:seed  # This also shows existing tables

# Check all tables
psql YOUR_DATABASE_URL -c "\dt"

# Test chat history API
curl http://localhost:5173/api/chat-history?anonymousId=test&limit=10

# Check logs
tail -f logs/*.log

# Clear node modules if issues persist
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

## 📝 File Changes Made

1. **`.env.local`**
   - Removed invalid DATABASE_URL format
   - Added security comment

2. **`scripts/init-database.ts`**
   - Removed hardcoded DATABASE_URL (SECURITY FIX)
   - Now uses environment variables
   - Added chat_sessions, chat_messages, projects, anonymous_sessions tables
   - Added all triggers and functions for chat history

3. **`COMPREHENSIVE_FIX_PLAN.md`** (New)
   - Detailed analysis of all issues
   - Implementation status

4. **`SETUP_AND_FIX_GUIDE.md`** (This file)
   - Complete setup instructions
   - Troubleshooting guide

## 🔐 Security Best Practices

1. **Never commit secrets:**
   ```bash
   # Check what's in git
   git status
   
   # If .env.local is tracked, remove it:
   git rm --cached .env.local
   git commit -m "Remove .env.local from tracking"
   ```

2. **Use environment-specific files:**
   - `.dev.vars` → Local development (Cloudflare Workers)
   - `.env.local` → Local development (Vite)
   - Never commit either!

3. **Rotate compromised keys immediately**

4. **Use separate keys for development and production**

## ❓ Next Steps

Please:

1. Update your DATABASE_URL in `.dev.vars` with a fresh connection string from Neon
2. Rotate your exposed API keys (Anthropic, OpenRouter, GitHub)
3. Run `npm run db:init` to create tables
4. Test the application with `npm run dev`
5. Let me know if you want me to implement:
   - MCP Server Integration UI
   - Vercel Deployment Button
   - Any other features

## 📞 Need Help?

If you encounter issues:
1. Check browser console for errors
2. Check terminal for server errors
3. Run `npm run db:verify` to test database
4. Share any error messages you see

