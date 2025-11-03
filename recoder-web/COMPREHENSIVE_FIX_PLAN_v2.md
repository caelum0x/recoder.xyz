# Comprehensive Fix Plan for Recoder-Web Issues

**Created**: 2025-10-29  
**Priority**: HIGH - Multiple critical UX issues

## 📋 Issues Summary

Based on user report and log analysis:

1. **Cannot open old chats** - Header changes but files/messages don't load
2. **AI confusion** - Asked for e-commerce but AI tries to add auth
3. **Template matching** - Detects e-commerce need but uses express-auth-libsql
4. **Installation stuck at step 7** - Everything freezes during npm install
5. **Cannot manually import starters** - No way to load from local /starters directory
6. **GitHub cloning works** ✅ - This is actually functioning correctly

---

## 🔴 Issue #1: Old Chats Don't Load Properly

### Problem Analysis

**What happens:**
1. User clicks on old chat from history
2. URL changes to `/chat/[urlId]` ✅
3. API loads chat with fileSnapshot from database ✅
4. Log shows: `Loaded chat with file snapshot: { fileCount: 131 }` ✅
5. **BUT**: Files never appear in the workbench ❌

**Root Cause:**
The fileSnapshot is loaded in `loadChatFromDatabase()` but the workbench restoration happens BEFORE the Chat component is ready, causing a race condition.

**Evidence from logs:**
```
📂 [loadChatFromDatabase] Restoring file snapshot: 131 files
✅ Loaded chat from database: fe3c5407-06fc-4cff-83b5-65cf18131638
```

But then messages show 0-4 messages, not the full chat history.

### Solution

**File:** `app/lib/persistence/useChatHistory.ts`

The issue is in the useEffect hook around line 132-165. The workbench restoration happens but then the component might not be fully mounted.

**Fix:**
```typescript
// BEFORE (line 132-165):
loadChatFromDatabase(mixedId)
  .then((dbChat) => {
    if (dbChat && dbChat.messages.length > 0) {
      console.log('✅ Loaded chat from database:', dbChat.id);
      setInitialMessages(dbChat.messages);
      setUrlId(dbChat.urlId);
      description.set(dbChat.description);
      chatId.set(dbChat.id);
      setReady(true); // <-- TOO EARLY!
      return;
    }
    // ...
  })

// AFTER (improved):
loadChatFromDatabase(mixedId)
  .then((dbChat) => {
    if (dbChat && dbChat.messages.length > 0) {
      console.log('✅ Loaded chat from database:', dbChat.id);
      
      // Set messages first
      setInitialMessages(dbChat.messages);
      setUrlId(dbChat.urlId);
      description.set(dbChat.description);
      chatId.set(dbChat.id);
      
      // Restore fileSnapshot to workbench AFTER state is set
      if (dbChat.fileSnapshot && Object.keys(dbChat.fileSnapshot).length > 0) {
        console.log('📂 Restoring file snapshot to workbench:', Object.keys(dbChat.fileSnapshot).length, 'files');
        
        // Use setTimeout to ensure this happens after component mounts
        setTimeout(() => {
          Object.entries(dbChat.fileSnapshot!).forEach(([path, content]) => {
            workbenchStore.setFile(path, {
              type: 'file',
              content: content as string,
              isBinary: false,
            });
          });
          
          workbenchStore.showWorkbench.set(true);
          console.log('✅ Workbench files restored');
        }, 100);
      }
      
      // Set ready LAST
      setReady(true);
      return;
    }
    // ...
  })
```

**Why this works:**
1. State updates happen synchronously
2. Workbench file restoration happens after a small delay (100ms)
3. This ensures the Chat component is fully mounted
4. The workbench store updates trigger re-renders properly

---

## 🔴 Issue #2: AI Adds Unnecessary Auth

### Problem Analysis

**What happens:**
- User asks: "Build an e-commerce site with product listings, shopping cart..."
- AI response includes authentication setup
- Not requested, adds complexity

**Root Cause:**
The express-auth-libsql starter is being matched for e-commerce requests, which suggests authentication. The AI then follows through on implementing auth.

### Solution

This is actually two problems:
1. Wrong starter being matched (see Issue #3)
2. AI prompt needs better instructions about NOT adding unrequested features

**File:** `app/routes/api.chat.ts`

Add to system prompt (around line 60-80):

```typescript
const systemPrompt = `You are Recoder, an AI coding assistant...

CRITICAL RULES:
1. Build ONLY what the user explicitly requests
2. DO NOT add features they didn't ask for:
   - No authentication unless requested
   - No database unless requested  
   - No API endpoints unless requested
3. If you think a feature would be helpful, ASK first:
   "Would you like me to add authentication?"
   
4. Focus on the MAIN functionality requested
5. Keep it simple - you can always add more later

${existingPrompt}
`;
```

---

## 🔴 Issue #3: Wrong Template Matching

### Problem Analysis

**What happens:**
```
🔍 Searching for: "Build an e-commerce site with product listings..."
🎯 Search match: express-auth-libsql (score: 5.065)
   Reasoning: Matched by keyword relevance, backend category (506% confidence)
```

**Why this is wrong:**
- User wants e-commerce
- System detects "ecommerce" as primary intent
- But returns an EXPRESS AUTH API starter
- There's no pure e-commerce starter in the bundle

**Root Cause:**
Looking at the starter search logs:
```
🔍 Primary intent detected: ecommerce (matched: /e-?commerce/i)
```

The primary intent IS detected correctly, but the scoring system still prioritizes express-auth-libsql because:
1. It matches "backend" category
2. It has "api" and "database" keywords
3. E-commerce needs those things too

**Solution:**

**File:** `app/lib/.server/llm/starter-search.ts`

Improve the primary intent scoring (around line 365-400):

```typescript
// CURRENT (line 365-400):
const primaryIntent = detectPrimaryIntent(query);

if (primaryIntent) {
  log(`   Primary intent detected: ${primaryIntent}`);
}

// Calculate scores
for (const template of index.templates) {
  // Primary intent boost
  if (primaryIntent) {
    const matchesPrimary =
      template.id.toLowerCase().includes(primaryIntent) ||
      template.name.toLowerCase().includes(primaryIntent) ||
      template.keywords.some(k => k.toLowerCase().includes(primaryIntent)) ||
      template.description.toLowerCase().includes(primaryIntent);

    if (matchesPrimary) {
      score += 10.0; // Massive boost for primary intent match
      matches.push(`primary-intent:${primaryIntent}`);
    }
  }
  // ...
}

// ADD AFTER PRIMARY INTENT CHECK (line ~385):

// PENALTY for mismatched categories
if (primaryIntent) {
  const intentCategoryMap: Record<string, string[]> = {
    'ecommerce': ['ecommerce', 'shop', 'store', 'commerce'],
    'blog': ['blog', 'content', 'cms', 'article'],
    'dashboard': ['dashboard', 'admin', 'analytics'],
    'auth': ['auth', 'authentication', 'login'],
  };
  
  const expectedCategories = intentCategoryMap[primaryIntent];
  if (expectedCategories) {
    const categoryMatches = expectedCategories.some(cat => 
      template.category.toLowerCase().includes(cat) ||
      template.id.toLowerCase().includes(cat)
    );
    
    if (!categoryMatches) {
      // This template doesn't match the primary intent category
      score *= 0.3; // Severe penalty
      matches.push(`category-mismatch:${template.category}`);
    }
  }
}
```

**Alternative Solution (Better):**

Create an actual e-commerce starter template:

```bash
# Create a new starter
mkdir -p starters/nextjs-ecommerce
```

Then add it to the starters bundle. But this requires more work.

For now, the penalty system above will prevent wrong matches.

---

## 🔴 Issue #4: Installation Stuck at Step 7

### Problem Analysis

**What happens:**
```
📦 Progress: 1114/1114 files (100%)
✅ Successfully cloned 1114 files
```

Then system detects project type and the logs stop. From error doc:
```
✅ ✅ Almost done...
Step 7 of 7
```

**Root Cause:**
Looking at `action-runner.ts:144-245`, when a dev server command is run:

```typescript
const isDevServer = /npm (run )?dev|yarn dev|pnpm dev|vite|next dev|remix dev/.test(action.content);

if (isDevServer) {
  logger.info('🚀 Detected dev server command - will run in background');
}
```

The system detects dev servers and tries to wait for them to start, but:
1. In WebContainer, dev servers take 20-45 seconds to start
2. The action is marked as "running" the whole time
3. The UI shows "Almost done..." but never completes
4. User can't interact with the project

**Solution:**

**File:** `app/lib/runtime/action-runner.ts`

Around line 144-245, change the dev server handling:

```typescript
// BEFORE:
if (isDevServer) {
  // Wait up to 45 seconds for server to start
  const timeout = 45000;
  const startTime = Date.now();
  
  while (!serverStarted && Date.now() - startTime < timeout) {
    await new Promise(resolve => setTimeout(resolve, 200));
    // ... checking logic ...
  }
  
  logger.info('✅ Dev server command completed - process running in background');
  return; // Don't wait for exit
}

// AFTER:
if (isDevServer) {
  logger.info('🚀 Dev server detected - completing action immediately');
  logger.info('   Server will start in background. Check terminal for output.');
  
  // Complete the action immediately
  // The dev server process will continue running
  return;
}
```

**Why this works:**
1. Action completes immediately when dev server is detected
2. UI updates to "complete" state
3. User can interact with the project
4. Dev server continues running in background
5. User can see startup in the terminal output

**Additional improvement:**

**File:** `app/lib/.server/llm/prompts.ts`

Around line 440-460, add a NOTE about dev servers:

```typescript
## Step 7: Start Development Server

NOTE: Development servers run in the background. The action will complete
immediately and you'll see output in the terminal. Common commands:

- Next.js: \`npm run dev\` or \`pnpm dev\`
- Vite: \`npm run dev\`  
- Create React App: \`npm start\`

<boltAction type="shell">
npm run dev
</boltAction>

The server typically starts on http://localhost:3000 or http://localhost:5173.
Check the terminal output for the exact URL.
```

---

## 🟡 Issue #5: Can't Manually Import Local Starters

### Problem Analysis

**What's missing:**
- User can't browse /starters directory
- User can't manually load a starter template
- Only way to get starter is through AI detection

**Current flow:**
1. User types prompt
2. AI detects intent
3. System searches for matching starter
4. Starter auto-loads

**What users want:**
- "Show me available templates"
- "Load the nextjs-ecommerce starter"
- Browse button in UI

### Solution

**File:** `app/components/chat/StarterBrowser.tsx` (NEW)

Create a new component:

```tsx
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui/dialog';

interface Starter {
  id: string;
  name: string;
  description: string;
  category: string;
  framework: string;
}

export function StarterBrowser({ 
  onSelect 
}: { 
  onSelect: (starterId: string) => void 
}) {
  const [open, setOpen] = useState(false);
  const [starters, setStarters] = useState<Starter[]>([]);
  const [loading, setLoading] = useState(false);

  async function loadStarters() {
    setLoading(true);
    try {
      const response = await fetch('/api/starters?list=true');
      const data = await response.json();
      setStarters(data.starters || []);
    } catch (error) {
      console.error('Failed to load starters:', error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => {
          setOpen(true);
          loadStarters();
        }}
        className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700"
      >
        Browse Templates
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Starter Templates</DialogTitle>
          </DialogHeader>

          {loading ? (
            <div className="flex justify-center p-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
              {starters.map((starter) => (
                <div
                  key={starter.id}
                  className="border rounded-lg p-4 hover:border-blue-500 cursor-pointer transition"
                  onClick={() => {
                    onSelect(starter.id);
                    setOpen(false);
                  }}
                >
                  <h3 className="font-bold text-lg">{starter.name}</h3>
                  <p className="text-sm text-gray-600 mt-1">{starter.description}</p>
                  <div className="flex gap-2 mt-3">
                    <span className="text-xs bg-gray-100 px-2 py-1 rounded">
                      {starter.framework}
                    </span>
                    <span className="text-xs bg-gray-100 px-2 py-1 rounded">
                      {starter.category}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
```

**File:** `app/routes/api.starters.ts`

Add list functionality (around line 30):

```typescript
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const list = url.searchParams.get('list');

  if (list === 'true') {
    // Return list of available starters
    const startersBundle = await loadStartersBundle();
    const starters = Object.keys(startersBundle).map(id => ({
      id,
      name: startersBundle[id].name || id,
      description: startersBundle[id].description || 'No description',
      category: startersBundle[id].category || 'other',
      framework: startersBundle[id].framework || 'unknown',
    }));

    return json({
      success: true,
      starters,
    });
  }

  return json({ error: 'Invalid request' }, { status: 400 });
}
```

**File:** `app/components/chat/BaseChat.tsx`

Add the browser button (find the chat input area):

```tsx
import { StarterBrowser } from './StarterBrowser';

// In the render:
<div className="flex gap-2 items-center">
  <StarterBrowser 
    onSelect={(starterId) => {
      // Load the starter
      sendMessage(null, `Load the ${starterId} starter template`);
    }}
  />
  
  <textarea 
    ref={textareaRef}
    // ... existing props ...
  />
</div>
```

---

## ✅ Issue #6: GitHub Cloning Works

**Status:** WORKING CORRECTLY ✅

**Evidence from logs:**
```
📦 [GitHub] Clone request: { repoUrl: 'QwenLM/qwen-code', ... }
📦 Cloning public repo: QwenLM/qwen-code (main)
⬇️  Downloading 1114 files...
📦 Progress: 1114/1114 files (100%)
✅ Successfully cloned 1114 files
```

**No fix needed** - This functionality is working correctly.

---

## 📊 Implementation Priority

### Phase 1 (Critical - Do First)
1. ✅ Fix old chats not loading (Issue #1) - 30 min
2. ✅ Fix installation freeze (Issue #4) - 20 min  
3. ✅ Fix wrong template matching (Issue #3) - 45 min

### Phase 2 (Important - Do Next)  
4. ✅ Fix AI adding unnecessary features (Issue #2) - 15 min
5. ⏳ Add manual starter browser (Issue #5) - 2 hours

### Phase 3 (Enhancement)
6. ✅ Document GitHub cloning (Issue #6) - 5 min

---

## 🧪 Testing Checklist

After implementing fixes:

### Issue #1 Testing:
- [ ] Open an old chat from history
- [ ] Verify messages load
- [ ] Verify files appear in workbench
- [ ] Check that file content is correct
- [ ] Test with different chat IDs

### Issue #2 Testing:
- [ ] Ask for "e-commerce site"
- [ ] Verify NO auth is added
- [ ] Ask for "blog platform"
- [ ] Verify NO unnecessary features

### Issue #3 Testing:
- [ ] Request e-commerce
- [ ] Verify correct starter is matched
- [ ] Request blog
- [ ] Verify blog starter is matched
- [ ] Check logs for scoring

### Issue #4 Testing:
- [ ] Clone a GitHub repo
- [ ] Watch for "Step 7" message
- [ ] Verify it doesn't hang
- [ ] Verify dev server starts in background
- [ ] Check terminal output

### Issue #5 Testing:
- [ ] Click "Browse Templates" button
- [ ] Verify list loads
- [ ] Select a starter
- [ ] Verify it loads into workbench

---

## 📝 Files to Modify

1. `app/lib/persistence/useChatHistory.ts` (Issue #1)
2. `app/routes/api.chat.ts` (Issue #2)
3. `app/lib/.server/llm/starter-search.ts` (Issue #3)
4. `app/lib/runtime/action-runner.ts` (Issue #4)
5. `app/lib/.server/llm/prompts.ts` (Issue #4)
6. `app/components/chat/StarterBrowser.tsx` (NEW - Issue #5)
7. `app/routes/api.starters.ts` (Issue #5)
8. `app/components/chat/BaseChat.tsx` (Issue #5)

---

## 🎯 Expected Results

After all fixes:

1. ✅ Old chats load with all messages and files
2. ✅ AI only builds what user requests
3. ✅ Correct starters match for user intent
4. ✅ No hanging at "Step 7"
5. ✅ Users can browse and manually load starters
6. ✅ GitHub cloning continues to work

---

**Next Steps:**
1. Review this plan
2. Approve fixes
3. Implement in priority order
4. Test thoroughly
5. Deploy

**Estimated Total Time:** 4-5 hours
