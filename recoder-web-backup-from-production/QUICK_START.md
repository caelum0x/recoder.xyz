# 🚀 Quick Start Guide - Recoder

## Prerequisites
- Node.js 18+ installed
- pnpm installed (`npm install -g pnpm`)
- A Neon/PostgreSQL database (for chat history)
- API keys for AI providers

## Step 1: Install Dependencies

```bash
cd /Users/arhansubasi/bolt.new
NODE_ENV=development pnpm install
```

## Step 2: Set Up Environment Variables

Create or update `.env` file:

```bash
# Required - AI Provider (choose one)
ANTHROPIC_API_KEY=sk-ant-api03-...
# OR
OPENAI_API_KEY=sk-...

# Required - Database for Chat History
# Get this from: https://console.neon.tech/
DATABASE_URL=postgresql://user:password@host/database

# Optional - GitHub Integration
GITHUB_TOKEN=ghp_...

# Optional - Deployment Platforms
VERCEL_TOKEN=...
NETLIFY_TOKEN=...
CLOUDFLARE_API_TOKEN=...
```

### Getting a Neon Database URL

1. Go to https://console.neon.tech/
2. Create a free account
3. Create a new project
4. Copy the connection string
5. It should look like: `postgresql://user:password@ep-xxx.region.aws.neon.tech/dbname?sslmode=require`

## Step 3: Initialize Database

```bash
# Create database tables
pnpm run db:init

# Verify database connection
pnpm run db:verify
```

## Step 4: Start Development Server

```bash
NODE_ENV=development pnpm run dev
```

Server will start at: **http://localhost:5173/**

## Step 5: Test Features

### ✅ Test Chat History
1. Open http://localhost:5173/
2. Send a message in the chat
3. Click the clock icon (history button) next to the logo
4. Refresh the page - your chat should persist

### ✅ Test Schema Generator
1. Go to http://localhost:5173/schema
2. Type: "Create a blog with users, posts, and comments"
3. Click "Generate Schema"
4. Click "Import to Project" to download files
5. Click X button to close the results

### ✅ Test MCP Tools
1. Click the wrench icon in the header
2. View available MCP servers
3. Try executing a filesystem tool
4. Close the modal

### ✅ Test Deployment
1. Create a simple project in chat
2. Wait for files to appear
3. Click the "Deploy" button (rocket icon)
4. Select a platform
5. Configure and deploy

## Common Issues

### Issue: "DATABASE_URL not configured"
**Solution:** Add DATABASE_URL to your .env file
```bash
echo 'DATABASE_URL=postgresql://your_connection_string' >> .env
```

### Issue: "GitHub rate limit exceeded"
**Solution:** Add GITHUB_TOKEN to .dev.vars
```bash
echo 'GITHUB_TOKEN=ghp_your_token' >> .dev.vars
```

### Issue: "Preview not working"
**Solution:** This is a known issue with webcontainer initialization. Use external preview for now.

### Issue: "AI not responding"
**Solution:** Check your API key is valid and has credits
```bash
# Test with curl
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-3-5-sonnet-20241022",
    "max_tokens": 10,
    "messages": [{"role": "user", "content": "Hi"}]
  }'
```

## Features Overview

### ✅ Fully Working
- Chat interface with AI
- Database-backed chat history
- History sidebar with persistence
- Schema generator with multiple formats
- MCP servers (filesystem, GitHub, database, API)
- Deployment system (Vercel, Netlify, Cloudflare)
- GitHub template/repository cloning
- File editing in workbench
- Terminal access

### ⚠️ Needs Testing
- Preview functionality (webcontainer)
- GitHub clone (may need token)
- Cross-device chat sync

## Project Structure

```
app/
├── components/          # React components
│   ├── chat/           # Chat interface
│   ├── deployment/     # Deployment UI
│   ├── database/       # Schema generator
│   ├── github/         # GitHub integration
│   ├── header/         # Header with action buttons
│   ├── mcp/            # MCP tools panel
│   ├── sidebar/        # History sidebar
│   └── workbench/      # Code editor and preview
├── lib/
│   ├── .server/        # Server-side code
│   │   ├── db/         # Database operations
│   │   ├── deployment/ # Deployment logic
│   │   └── mcp/        # MCP servers
│   └── stores/         # State management
└── routes/             # API endpoints
    ├── api.chat-history.ts
    ├── api.deploy.ts
    ├── api.mcp.ts
    └── api.schema.ts
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/chat-history` | GET | Get chat history |
| `/api/chat-history` | POST | Save chat |
| `/api/chat-history` | DELETE | Delete chat |
| `/api/mcp` | GET | List MCP tools/servers |
| `/api/mcp` | POST | Execute MCP tool |
| `/api/deploy` | GET | Get deployment platforms |
| `/api/deploy` | POST | Deploy project |
| `/api/schema` | GET | Get schema examples |
| `/api/schema` | POST | Generate schema |
| `/api/github` | GET | Search repositories |
| `/api/github` | POST | Clone repository |

## Development Commands

```bash
# Start development server
pnpm run dev

# Build for production
pnpm run build

# Run tests
pnpm run test

# Type checking
pnpm run typecheck

# Lint code
pnpm run lint

# Database commands
pnpm run db:init       # Initialize database
pnpm run db:verify     # Verify connection
pnpm run db:seed       # Seed data
```

## Production Deployment

### Deploy to Cloudflare Pages

```bash
# Build
pnpm run build

# Deploy
pnpm run deploy
```

### Environment Variables for Production

Set these in your Cloudflare Pages dashboard:

1. **Required:**
   - `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`
   - `DATABASE_URL`

2. **Optional:**
   - `GITHUB_TOKEN`
   - `VERCEL_TOKEN`
   - `NETLIFY_TOKEN`
   - `CLOUDFLARE_API_TOKEN`

## Getting Help

1. Check `TEST_ALL_FEATURES.md` for detailed testing procedures
2. See `IMPLEMENTATION_COMPLETE.md` for architecture details
3. Review `CURRENT_STATUS_AND_FIXES.md` for known issues
4. Check browser console for errors
5. Check server logs for backend errors

## Success Criteria

You're all set if:
- ✅ Development server starts without errors
- ✅ Chat interface loads and responds
- ✅ History button opens sidebar
- ✅ Database saves chats (check with refresh)
- ✅ MCP tools panel opens and shows servers
- ✅ Schema generator creates SQL and TypeScript
- ✅ Deploy button appears when files are created

## Next Steps

1. **Customize templates** - Add your own project templates
2. **Add AI models** - Configure additional AI providers
3. **Set up monitoring** - Add error tracking and analytics
4. **Deploy to production** - Use Cloudflare Pages
5. **Enable authentication** - Add user accounts
6. **Customize branding** - Update logos and colors

---

**Need more help?** Check the documentation files:
- `TEST_ALL_FEATURES.md` - Complete testing guide
- `IMPLEMENTATION_COMPLETE.md` - Technical documentation
- `MCP_AND_DEPLOYMENT_MASTER_PLAN.md` - MCP & deployment details
