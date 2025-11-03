# ROOT CAUSE ANALYSIS - End-to-End Problems

**Date**: 2025-10-30
**Analyst**: Claude Code
**Status**: CRITICAL - Multiple System Failures

---

## 🔴 ACTUAL PROBLEMS (Not Surface Issues)

### 1. TEMPLATE SEARCH IS COMPLETELY BROKEN

**Symptom**: User asks for "Angular Starter" but gets "nextjs-ecommerce-stripe"

**Root Cause Analysis**:
```
User Query: "Create a Angular Starter project..."
Expected Match: angular template (100% confidence)
Actual Match: nextjs-ecommerce-stripe (score: 2.238)

Why This Is INSANE:
- "Angular" appears in query → should match angular keywords ['angular', 'ng']
- E-commerce has NO keywords matching the query
- Yet e-commerce wins!
```

**Deep Investigation Findings**:

1. **Scoring Algorithm Has Multiple Issues**:
   - TF-IDF gives low scores even for exact matches
   - Fuzzy matching dilutes exact keyword matches
   - Primary intent detection exists but Angular not in intent list
   - Final scores are combinations that don't make sense

2. **Missing Primary Intent for Frameworks**:
   ```typescript
   // In detectPrimaryIntent(), only these intents exist:
   - blog, ecommerce, dashboard, portfolio, landing
   // MISSING: angular, react, vue, nextjs, etc.
   ```

3. **Tokenization May Skip Important Words**:
   - Filter: `w.length > 2` might skip "ng" (length 2)
   - But "angular" should still match

**ACTION REQUIRED**:
- Add framework-specific primary intents
- Prioritize exact keyword matches over TF-IDF
- Simplify scoring: exact match should ALWAYS win

---

### 2. CHAT PERSISTENCE ARCHITECTURE IS CHAOS

**Symptom**: urlId='crypto-exchange' but artifactId='angular-starter'

**Root Cause**: Session management doesn't properly isolate chats

**Evidence from Logs**:
```javascript
💾 [api.chat-history.action] Save request received: {
  userId: undefined,
  anonymousId: 'anon_1760387698383_zr88t2k8ax',
  urlId: 'crypto-exchange',  // ← OLD session
  title: 'Basic Crypto Exchange Application',  // ← OLD title
  messageCount: 2,
  artifactId: 'angular-starter',  // ← NEW artifact
  fileCount: 14
}
```

**Problems Identified**:

1. **URL ID Not Generated Properly**:
   - Should create new urlId for new conversation
   - Instead reusing old urlId from previous session

2. **Context Bleeding**:
   - User starts new conversation (Angular)
   - System carries over previous session ID (crypto-exchange)
   - Title doesn't update
   - Creates data inconsistency

3. **Chat ID Missing Error**:
   ```
   useChatHistory.ts:331 ❌ [useChatHistory] Cannot save: missing chat ID or URL ID
   ```
   - Sometimes chat ID not generated at all
   - Happens in useChatHistory.ts lines 326-336

**ACTION REQUIRED**:
- Fix chat ID generation in useChatHistory
- Ensure each new conversation gets unique urlId
- Clear artifact context between conversations

---

### 3. CHAT HISTORY NAVIGATION BROKEN

**Symptom**: History loads (9 chats) but clicking doesn't open them

**Root Cause**: Router navigation vs. file restoration timing

**Evidence**:
```
📋 [Menu.loadEntries] Load complete.
// Shows 9 chats
// User clicks → navigation happens → files don't load
```

**Problems Identified**:

1. **Link Component Works** (already using Remix Link)
2. **Route Changes** (header shows old chat name)
3. **Files Don't Restore** (fileCount: 0)

**Why Files Don't Load**:
- Navigation to `/chat/${urlId}` happens immediately
- useChat History hook runs
- loadChatFromDatabase() retrieves chat
- BUT files are loaded with 100ms setTimeout
- WebContainer might not be ready
- Files store update fails silently

**From useChatHistory.ts:202-226**:
```typescript
setTimeout(() => {
  console.log('🔄 [useChatHistory] Restoring files to workbench...');
  // Update files store directly
  const currentFiles = workbenchStore.files.get();
  const updatedFiles = { ...currentFiles };

  Object.entries(dbChat.fileSnapshot!).forEach(([path, content]) => {
    updatedFiles[path] = {
      type: 'file',
      content: content as string,
      isBinary: false,
    };
  });

  workbenchStore.files.set(updatedFiles);
  workbenchStore.setDocuments(updatedFiles);
  workbenchStore.showWorkbench.set(true);
}, 100); // ← 100ms not enough?
```

**ACTION REQUIRED**:
- Increase timeout to 500ms or wait for WebContainer ready
- Add error handling if file restoration fails
- Show loading state during restoration

---

### 4. STEP 7 HANGING (Still Happens)

**Symptom**: Projects stuck at "Step 7 of 7" forever

**Root Cause**: AI IGNORES all warnings about dev servers

**Evidence**: Despite 3 layers of protection:
1. ✅ Ultra-strong prompts with 🚨🚨🚨 warnings
2. ✅ 5-minute timeout on shell commands
3. ✅ Dev server detection in action-runner

**AI STILL generates code with dev server commands because**:
- System prompt is 15,000+ tokens
- Dev server warning buried in middle (line 487)
- AI prioritizes code examples over warnings
- Examples in prompt might still show dev commands

**Why Timeout Doesn't Help**:
- 5 minutes is too long (user sees hang)
- Should be 30 seconds for npm install max
- Need immediate prevention, not timeout

**ACTION REQUIRED**:
- Move dev server warning to TOP of prompt (first 500 tokens)
- Remove ALL examples that show any shell commands
- Validate AI response BEFORE executing
- Reject responses containing forbidden commands

---

### 5. BUILD PHILOSOPHY NOT ENFORCED

**Symptom**: User asks for e-commerce → AI adds authentication

**Root Cause**: Build philosophy exists but AI ignores it

**Current Prompt (lines 90-123)**:
```
<critical_build_philosophy>
  🚨 CARDINAL RULE: BUILD ONLY WHAT THE USER EXPLICITLY REQUESTS 🚨

  DO NOT add features the user didn't ask for:
  ❌ User asks for "blog" → DO NOT add authentication
  ❌ User asks for "e-commerce" → DO NOT add payment processing
</critical_build_philosophy>
```

**Why AI Ignores This**:
- Buried in 15k token prompt
- AI thinks it's being "helpful" by adding features
- No validation/enforcement mechanism
- Examples elsewhere in prompt may contradict this

**ACTION REQUIRED**:
- Add validation layer that rejects responses with extra features
- Make build philosophy a SYSTEM constraint, not a suggestion
- Reduce prompt to focus on critical rules only

---

## 🎯 COMPLETE FIX PLAN (End-to-End)

### Phase 1: Template Search (CRITICAL)
1. **Add framework primary intents**:
   ```typescript
   const intents = [
     { name: 'angular', patterns: [/\bangular\b/i, /\bng\b/i] },
     { name: 'react', patterns: [/\breact\b/i, /\breactjs\b/i] },
     { name: 'vue', patterns: [/\bvue\b/i, /\bvuejs\b/i] },
     { name: 'nextjs', patterns: [/next\.?js/i, /\bnext\b/i] },
     // ... existing intents
   ];
   ```

2. **Simplify scoring**:
   - If framework detected in query → framework template gets +100 score
   - If exact keyword match → +50 score
   - Everything else → normal scoring

3. **Test with real queries**:
   - "Create Angular app" → should match angular
   - "Build React project" → should match react
   - "E-commerce site" → should match nextjs-ecommerce-stripe

### Phase 2: Chat Persistence (HIGH)
1. **Fix chat ID generation**:
   - Ensure urlId generated for EVERY new conversation
   - Never reuse old urlId
   - Clear previous artifact context

2. **Fix file restoration**:
   - Increase timeout to 500ms
   - Wait for WebContainer initialization
   - Add error handling + retry logic

3. **Fix navigation**:
   - Add loading state during restoration
   - Show error if files can't be restored
   - Fallback to empty project if needed

### Phase 3: Dev Server Prevention (HIGH)
1. **Move warning to TOP of prompt**
2. **Add response validation**:
   ```typescript
   function validateAIResponse(response: string): boolean {
     const forbidden = ['npm run dev', 'npm start', 'vite', 'next dev'];
     for (const cmd of forbidden) {
       if (response.includes(cmd)) {
         throw new Error(`Forbidden command detected: ${cmd}`);
       }
     }
   }
   ```
3. **Reduce timeout to 30 seconds**

### Phase 4: Build Philosophy (MEDIUM)
1. **Shrink prompt to critical rules only**
2. **Add feature detection validation**
3. **Reject responses that add unrequested features**

---

## 📊 SUCCESS METRICS

After fixes, these should work:

1. ✅ "Create Angular app" → matches angular template with score > 50
2. ✅ "Build e-commerce site" → matches nextjs-ecommerce-stripe
3. ✅ Click chat history → files restore within 1 second
4. ✅ New conversation → gets new unique urlId
5. ✅ AI response → never contains dev server commands
6. ✅ User asks for blog → AI doesn't add auth

---

## 🔧 IMMEDIATE ACTIONS

**What I Did Right Now**:
1. ✅ Enabled verbose logging to see ALL template scores
2. ✅ Log ALL search results (not just top 3)
3. ✅ This will show exact scores when you test again

**What You Should Test Next**:
1. Ask for "Create Angular Starter project"
2. Check console logs for ALL template scores
3. Share the full log output showing all scores
4. We'll see why e-commerce scored higher than Angular

**Then We Fix It Properly** (not surface patches).
