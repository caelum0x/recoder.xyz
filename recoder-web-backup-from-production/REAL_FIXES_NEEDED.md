# Real Fixes Needed - Proper Implementation Plan

## Issue 1: Deployment Uses Hardcoded Tokens ❌

### Current Problem:
- Deployment requires admin tokens in `.dev.vars`
- All deployments go to admin's Vercel/Netlify account
- Users can't deploy to their own accounts

### Proper Solution:
1. **OAuth Flow Implementation**
   - Add Vercel OAuth: User clicks "Connect Vercel" → OAuth flow → stores user's token
   - Add Netlify OAuth: Same flow for Netlify
   - Store tokens per-user in database (users table, add `vercel_token`, `netlify_token` columns)

2. **Implementation Files:**
   ```
   app/routes/auth.vercel.tsx - Vercel OAuth callback
   app/routes/auth.netlify.tsx - Netlify OAuth callback
   app/components/deployment/ConnectPlatform.tsx - UI for connecting
   app/lib/.server/db/user-tokens.ts - Token storage
   ```

3. **Flow:**
   ```
   User clicks "Deploy" →
   Check if user has platform token →
   If NO: Show "Connect [Platform]" button → OAuth → Store token → Deploy
   If YES: Deploy to user's account
   ```

---

## Issue 2: GitHub Token Expires Daily ❌

### Current Problem:
- GitHub Personal Access Token expires
- Need manual refresh every day
- Blocks repository cloning

### Proper Solution:
1. **GitHub OAuth App**
   - Create GitHub OAuth App at https://github.com/settings/developers
   - Implement OAuth flow (similar to deployment)
   - Tokens don't expire (refresh tokens available)

2. **OR: Public Repository Clone (No Token)**
   - For public repos, use GitHub's public API
   - No authentication needed
   - Rate limit: 60 requests/hour (enough for most use cases)

3. **Implementation:**
   ```typescript
   // app/lib/.server/github/clone-public.ts
   async function clonePublicRepo(repoUrl: string) {
     // Use GitHub API without token for public repos
     const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents`);
     // Download files without authentication
   }
   ```

---

## Issue 3: Starters Not Auto-Selected ❌

### Current Problem:
- User says "build e-commerce"
- AI doesn't use e-commerce starter from `/starters`
- Starts from scratch instead

### Proper Solution:
1. **Smart Starter Detection in Chat**
   ```typescript
   // app/lib/ai/starter-detector.ts
   const STARTER_KEYWORDS = {
     'e-commerce': ['starters/nextjs-commerce', 'starters/shopify-starter'],
     'blog': ['starters/blog-starter', 'starters/mdx-blog'],
     'dashboard': ['starters/admin-dashboard'],
     'mobile': ['starters/bolt-expo', 'starters/react-native'],
     'angular': ['starters/angular'],
     // etc...
   };

   function detectStarter(userMessage: string): string | null {
     // Analyze message for keywords
     // Return matching starter path
   }
   ```

2. **Auto-inject into Chat Context**
   ```typescript
   // In chat handler
   const detectedStarter = detectStarter(userMessage);
   if (detectedStarter) {
     // Load starter files
     // Inject into system message:
     // "Use this e-commerce starter as base: [files]"
   }
   ```

---

## Issue 4: Cannot Import Starters ❌

### Current Problem:
- Starters exist in `/starters` folder
- No way to import them into current project
- Can't click "Use this starter"

### Proper Solution:
1. **Starter Import API**
   ```typescript
   // app/routes/api.starters.ts
   export async function action({ request }: ActionFunctionArgs) {
     const { starterId } = await request.json();

     // Read starter files from /starters/[starterId]
     const fs = await import('fs/promises');
     const starterPath = path.join(process.cwd(), 'starters', starterId);
     const files = await readDirRecursive(starterPath);

     return json({ files });
   }
   ```

2. **UI in GitHub Integration**
   ```typescript
   // Add "Local Starters" tab
   <Tabs>
     <Tab name="GitHub Repos">...</Tab>
     <Tab name="Templates">...</Tab>
     <Tab name="Local Starters">
       {starters.map(starter => (
         <StarterCard
           onImport={() => importStarter(starter.id)}
         />
       ))}
     </Tab>
   </Tabs>
   ```

3. **Import to Workbench**
   ```typescript
   async function importStarter(starterId: string) {
     const response = await fetch('/api/starters', {
       method: 'POST',
       body: JSON.stringify({ starterId, action: 'import' })
     });

     const { files } = await response.json();

     // Inject into workbench
     workbenchStore.files.set(files);
     toast.success(`Imported ${starterId} starter!`);
   }
   ```

---

## Implementation Priority

### Phase 1: Critical (Do First)
1. ✅ **GitHub Public Clone** (no auth needed for public repos)
2. ✅ **Starter Import API** (enable using local starters)
3. ✅ **Smart Starter Detection** (auto-select on user prompt)

### Phase 2: Important
4. **Deployment OAuth** (user's own accounts)
5. **GitHub OAuth** (for private repos)

### Phase 3: Nice to Have
6. Token refresh mechanisms
7. Multi-account management

---

## Quick Wins (Can Implement Now)

### 1. GitHub Public Clone (30 min)
```typescript
// No token needed for public repos
async function clonePublicRepo(url: string) {
  const { owner, repo } = parseGitHubUrl(url);
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents`;
  // Fetch without authentication
}
```

### 2. Starter Loader (1 hour)
```typescript
// Server-side file reader
import fs from 'fs/promises';
import path from 'path';

export async function getStarter(id: string) {
  const starterPath = path.join(process.cwd(), 'starters', id);
  const files = await loadDirectory(starterPath);
  return files;
}
```

### 3. Chat Starter Injection (1 hour)
```typescript
// Detect keywords in user message
// Auto-load matching starter
// Add to system prompt: "Start with this template: ..."
```

---

## Next Steps

**Should I implement:**
1. GitHub public repository cloning (no token needed)?
2. Starter import API + UI?
3. Smart starter auto-selection in chat?

All 3 can be done quickly and solve your real problems!
