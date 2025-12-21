# OpenRouter API Key Not Loading - Fix Guide

## Problem
The console shows:
```
⚠️  OpenRouter not configured, using Anthropic Haiku
⚠️  Using fallback model - set OPENROUTER_API_KEY for full multi-model access
```

Even though `OPENROUTER_API_KEY` is set in `.env.local`.

## Root Cause
Remix with Cloudflare Workers in development mode doesn't automatically load `.env.local` for the `context.cloudflare.env` object.

## Solution Options

### Option 1: Use wrangler.toml (Recommended)
Create or update `wrangler.toml` in the project root:

```toml
name = "bolt-new"
compatibility_date = "2024-01-01"

[vars]
# Non-secret environment variables
NODE_ENV = "development"

# For local development, create .dev.vars file (see below)
```

Then create `.dev.vars` file (Cloudflare's way of loading env vars):

```bash
ANTHROPIC_API_KEY=sk-ant-REDACTED
OPENROUTER_API_KEY=sk-or-v1-REDACTED
GITHUB_TOKEN=github_pat_REDACTED
```

**Note**: Add `.dev.vars` to `.gitignore` to keep secrets safe!

### Option 2: Manual Environment Loading
Update `app/routes/api.chat.ts` to manually load env vars:

```typescript
async function chatAction({ context, request }: ActionFunctionArgs) {
  const { messages } = await request.json<{ messages: Messages }>();

  // Manually ensure env vars are loaded in development
  const env = context.cloudflare.env;
  if (!env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY) {
    env.OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
  }

  // ... rest of code
}
```

### Option 3: Use Environment Variable Plugin
Install and configure a Vite plugin to load `.env.local`:

```bash
npm install --save-dev vite-plugin-environment
```

Then in `vite.config.ts`:

```typescript
import EnvironmentPlugin from 'vite-plugin-environment';

export default defineConfig({
  plugins: [
    EnvironmentPlugin('all', { prefix: '' }),
    // ... other plugins
  ],
});
```

## Quick Test

After applying one of the solutions above, restart the dev server and make a request. You should see:

```
🔑 API Keys available: OpenRouter=true, Anthropic=true
🎯 Using optimized model: Gemini 2.5 Flash Lite ($0.0000)
```

Instead of:

```
⚠️  OpenRouter not configured, using Anthropic Haiku
```

## Recommended Approach

**Use Option 1** (wrangler.toml + .dev.vars) because:
1. ✅ It's the official Cloudflare Workers way
2. ✅ Works consistently in development and production
3. ✅ Remix + Cloudflare expects this approach
4. ✅ Cleaner separation of config vs secrets

## Steps to Implement Option 1

1. Create `wrangler.toml`:
```bash
cat > wrangler.toml << 'EOF'
name = "bolt-new"
compatibility_date = "2024-01-01"
main = "build/server/index.js"

[vars]
NODE_ENV = "development"
EOF
```

2. Create `.dev.vars` (copy from .env.local):
```bash
cp .env.local .dev.vars
```

3. Add to `.gitignore`:
```bash
echo ".dev.vars" >> .gitignore
```

4. Restart dev server:
```bash
npm run dev
```

5. Test by sending a chat message - you should see:
   - `🔑 API Keys available: OpenRouter=true`
   - No more fallback warnings
   - Models being routed through OpenRouter

## Verification

Check the console output when you send a chat message:

**Before fix:**
```
⚠️  OpenRouter not configured, using Anthropic Haiku
⚠️  Using fallback model
```

**After fix:**
```
🔑 API Keys available: OpenRouter=true, Anthropic=true
🎯 Using optimized model: Gemini 2.5 Flash Lite ($0.0000)
```

## Production Deployment

For production on Cloudflare Pages:

1. Go to your Cloudflare Pages dashboard
2. Navigate to Settings → Environment Variables
3. Add:
   - `ANTHROPIC_API_KEY`
   - `OPENROUTER_API_KEY`
   - `GITHUB_TOKEN`
4. Redeploy

The keys will be automatically available in `context.cloudflare.env` in production!
