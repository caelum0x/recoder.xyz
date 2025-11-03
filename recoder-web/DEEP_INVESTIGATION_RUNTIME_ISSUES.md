# Deep Investigation: Runtime Issues Analysis

**Date**: October 27, 2025  
**Focus**: Real-world AI behavior and potential runtime issues

---

## 🎯 INVESTIGATION SCOPE

While the infrastructure is 100% correct, there may be runtime issues where:
1. **AI doesn't trigger `importStarter`** when users request starter templates
2. **AI doesn't use `cloneGitHub`** when users ask to clone repos
3. **GitHub clones mix with AI-generated files** instead of using real files only

---

## 📋 SYSTEM PROMPT ANALYSIS

### ✅ GOOD NEWS: Instructions Are Present

The system prompt (`app/lib/.server/llm/prompts.ts`) **DOES include** instructions for both actions:

#### 1. ImportStarter Instructions (lines ~580-595)

```xml
- importStarter: For importing complete pre-built starter templates. This is MUCH faster than creating files one-by-one. Use this when:
  - User wants a blog, dashboard, portfolio, or any common project type
  - Request matches existing templates (BlogApp, ViteReact, Angular, ExpressAPI, etc.)
  - User needs a complete boilerplate to start from

  Add a `templateId` attribute with the template ID (e.g., "BlogApp", "angular", "express-typescript-auth", "bolt-vite-react-ts").
  Add a `reason` attribute explaining why this template is being used.
  The content should describe what customizations will be made after import.

  Example: `<boltAction type="importStarter" templateId="BlogApp" reason="User wants a blog with posts and comments">Will add dark mode theme after import</boltAction>`
```

#### 2. CloneGitHub Instructions (lines ~596-608)

```xml
- cloneGitHub: For cloning real GitHub repositories with all their files. Use this when:
  - User explicitly mentions "clone", "import from GitHub", or provides a GitHub URL
  - User wants to start from an existing open-source project
  - User references a specific GitHub repo (e.g., "facebook/react", "vercel/next.js")

  Add a `repoUrl` attribute with the GitHub repository URL or owner/repo format.
  Add a `reason` attribute explaining why this repo is being cloned.
  The content can be empty or describe what will be done after cloning.

  Example: `<boltAction type="cloneGitHub" repoUrl="facebook/react" reason="User wants to explore React source code"></boltAction>`
```

---

## 🔍 POTENTIAL RUNTIME ISSUES

### Issue #1: AI Model Doesn't Follow Instructions

**Problem**: Even with clear instructions, AI models (especially fast models like `grok-code-fast-1`) may:
- Miss the instructions in long system prompts
- Prioritize file generation over starter imports
- Not recognize when a request matches a template

**Evidence Points**:
1. System prompt is **5,500+ lines** - very long
2. `importStarter` examples are buried deep in the prompt
3. AI model might be trained more on file generation than template usage

**Solution Approaches**:

1. **Move instructions higher** (closer to the start)
2. **Add emphasis** with CRITICAL/IMPORTANT tags
3. **Provide more examples** in the prompt
4. **Use a reasoning step** before generating code

### Issue #2: Starter Template Injector Bypasses AI

**Current Flow** (`app/routes/api.chat.ts` lines 85-130):

```typescript
// Detect and prepare starter template BEFORE AI processing
const starterInjection = await detectAndPrepareStarter(lastUserMessage);

if (starterInjection.shouldInject) {
  const needsCustomization = checkIfNeedsCustomization(lastUserMessage);
  
  if (!needsCustomization) {
    // Return directly without AI!
    return new Response(stream, {...});
  } else {
    // AI will add customizations on top
    messages.push({ role: 'assistant', content: directResponse });
    messages.push({ role: 'user', content: `Add customizations: ${lastUserMessage}` });
  }
}
```

**This is actually GOOD**: The system tries to bypass AI entirely for simple starter requests, saving cost and time.

**But there's a problem**: If the detection logic is too conservative, it won't catch valid requests.

**Current Detection** (`detectAndPrepareStarter` function):
- Uses keyword matching
- Checks for template names
- Has confidence threshold

**Potential Issue**: May miss cases like:
- "I want to build a blog site"
- "Create an e-commerce platform"
- "Make me a portfolio website"

These are valid but might not match exact keywords.

### Issue #3: GitHub Clone Behavior

**Two Potential Issues**:

1. **AI generates extra files after clone**:
   ```typescript
   // After cloning...
   AI might think: "Now I'll add helpful utilities..."
   // And generate mock files on top of real ones
   ```

2. **Clone action not triggered**:
   - User says: "Use the Next.js blog example"
   - AI interprets as: "Generate a blog like Next.js"
   - Instead of: "Clone Next.js blog example"

---

## 🧪 TEST SCENARIOS

### Scenario 1: Blog Request

**User Input**: "Create a blog application"

**Expected AI Response**:
```xml
<boltArtifact id="blog-app" title="Blog Application">
  <boltAction type="importStarter" templateId="BlogApp" reason="User wants a blog application">
    Template includes posts, comments, categories, and responsive design.
  </boltAction>
  <boltAction type="shell">
    npm install && npm run dev
  </boltAction>
</boltArtifact>
```

**What might actually happen**:
```xml
<boltArtifact id="blog-app" title="Blog Application">
  <boltAction type="file" filePath="package.json">{...}</boltAction>
  <boltAction type="file" filePath="src/App.tsx">{...}</boltAction>
  <!-- 50 more files... -->
</boltArtifact>
```

### Scenario 2: GitHub Clone

**User Input**: "Clone https://github.com/vercel/next.js/tree/canary/examples/blog"

**Expected AI Response**:
```xml
<boltArtifact id="nextjs-blog" title="Next.js Blog Example">
  <boltAction type="cloneGitHub" repoUrl="https://github.com/vercel/next.js/tree/canary/examples/blog" reason="User wants Next.js blog example">
    Cloning the official Next.js blog example.
  </boltAction>
</boltArtifact>
```

**What might actually happen**:
```xml
<boltArtifact id="nextjs-blog" title="Next.js Blog Example">
  <boltAction type="cloneGitHub" repoUrl="https://github.com/vercel/next.js/tree/canary/examples/blog" reason="Cloning example">
  </boltAction>
  <!-- AI ADDS MORE FILES -->
  <boltAction type="file" filePath="src/config.ts">
    // Let me add a helpful config file...
  </boltAction>
  <boltAction type="file" filePath="src/utils/helpers.ts">
    // And some utilities...
  </boltAction>
</boltArtifact>
```

---

## 🔧 PROPOSED SOLUTIONS

### Solution 1: Enhance System Prompt

**Add a "THINK FIRST" section at the very top**:

```typescript
export const getSystemPrompt = (cwd: string = WORK_DIR) => `
You are Recoder, an expert AI assistant...

<critical_decision_tree>
  BEFORE generating ANY artifact, ALWAYS:

  1. CHECK: Does user request match a starter template?
     → YES: Use <boltAction type="importStarter" templateId="...">
     → NO: Continue to step 2

  2. CHECK: Does user provide a GitHub URL or ask to clone a repo?
     → YES: Use <boltAction type="cloneGitHub" repoUrl="...">
     → NO: Continue to step 3

  3. CHECK: Is this a common app type? (blog, dashboard, portfolio, e-commerce, etc.)
     → YES: Use importStarter with matching template
     → NO: Generate from scratch

  AVAILABLE STARTER TEMPLATES:
  - BlogApp: Full blog with posts, comments (React Native)
  - nextjs-blog-mdx: Next.js blog with MDX
  - nextjs-shadcn: Next.js with Shadcn UI components
  - express-typescript: TypeScript API with validation
  - express-typescript-auth: Full auth system
  - (45 total - see examples below)

  CRITICAL: If a starter template exists, ALWAYS prefer it over generating from scratch!
</critical_decision_tree>

<!-- Rest of prompt... -->
`;
```

### Solution 2: Add Template Suggestions

**In the chat flow**, before sending to AI, analyze the request:

```typescript
// In api.chat.ts
const lastUserMessage = messages.filter(m => m.role === 'user').pop()?.content || '';

// Check if request matches a template
const matchedTemplates = await findMatchingTemplates(lastUserMessage);

if (matchedTemplates.length > 0) {
  // Inject a hint for the AI
  messages.push({
    role: 'system',
    content: `HINT: This request matches these starter templates: ${matchedTemplates.join(', ')}. Consider using importStarter action.`
  });
}
```

### Solution 3: Post-Processing Guard

**After AI generates the artifact**, check if it should have used a starter:

```typescript
function shouldHaveUsedStarter(artifact: string): string | null {
  // If artifact has 10+ file actions and matches a template...
  const fileCount = (artifact.match(/<boltAction type="file"/g) || []).length;
  
  if (fileCount > 10) {
    // Check if this looks like a common pattern
    if (artifact.includes('blog') || artifact.includes('posts')) {
      return 'BlogApp'; // Should have used starter!
    }
    // ... more checks
  }
  
  return null;
}

// If a starter should have been used:
if (suggestedStarter) {
  console.warn(`⚠️ AI generated ${fileCount} files but should have used starter: ${suggestedStarter}`);
  // Could optionally re-generate with explicit instruction
}
```

### Solution 4: Two-Step AI Process

**Step 1: Planning**
```typescript
const planningPrompt = `
User wants: "${userRequest}"

Respond ONLY with a JSON object:
{
  "useStarter": boolean,
  "templateId": "string | null",
  "useGitHubClone": boolean,
  "repoUrl": "string | null",
  "customizations": ["string array"]
}
`;

const plan = await getAIPlan(planningPrompt);

if (plan.useStarter) {
  // Force use of importStarter action
} else if (plan.useGitHubClone) {
  // Force use of cloneGitHub action
}
```

**Step 2: Execution**
Only then generate the actual artifact based on the plan.

### Solution 5: Explicit Template List in Prompt

**Add a prominent template catalog**:

```typescript
<starter_template_catalog>
  IMPORTANT: Before generating files, check if request matches these templates:

  📱 MOBILE/DESKTOP:
  - BlogApp: Complete blog app with React Native, posts, comments, auth
  - bolt-expo: Expo mobile starter

  🌐 WEB FRAMEWORKS:
  - nextjs: Standard Next.js setup
  - nextjs-shadcn: Next.js + Shadcn UI components
  - nextjs-blog-mdx: Blog with MDX support
  - react: Basic React app
  - react-ts: React with TypeScript
  - angular: Angular framework
  - vue: Vue.js framework

  🔧 BACKEND/API:
  - express-typescript: Modern TypeScript API
  - express-typescript-auth: Full authentication system
  - express-mongodb-api: MongoDB backend with uploads
  - express-simple: Basic Express server

  💼 FULL-STACK:
  - astro-shadcn: Astro with Shadcn
  - bolt-qwik: Qwik framework

  WHEN TO USE:
  - User says "create a blog" → Use BlogApp or nextjs-blog-mdx
  - User says "Next.js with Shadcn" → Use nextjs-shadcn
  - User says "API with auth" → Use express-typescript-auth
  - User says "React app" → Use react or react-ts
  
  CRITICAL: Using templates is 10x faster than generating files!
</starter_template_catalog>
```

---

## 🐛 DEBUGGING WORKFLOW

### Step 1: Verify AI Response

**In browser console**:
```typescript
// Check what AI actually generated
console.log('AI Response:', artifactContent);

// Look for:
- <boltAction type="importStarter">  ← Should see this for templates
- <boltAction type="cloneGitHub">    ← Should see this for GitHub
- <boltAction type="file">           ← Too many means AI generated instead
```

### Step 2: Check Starter Detection

**In chat API** (`app/routes/api.chat.ts`):
```typescript
// Add logging
const starterInjection = await detectAndPrepareStarter(lastUserMessage);
console.log('🔍 Starter detection:', {
  shouldInject: starterInjection.shouldInject,
  starterId: starterInjection.starterId,
  confidence: starterInjection.confidence,
  userMessage: lastUserMessage
});
```

### Step 3: Monitor Action Execution

**In action runner** (`app/lib/runtime/action-runner.ts`):
```typescript
// Already has logging
async #runImportStarterAction(action: ActionState) {
  logger.info(`📦 Importing starter template: ${action.templateId}`);
  // ... watch console for this
}

async #runCloneGitHubAction(action: ActionState) {
  logger.info(`🔀 Cloning GitHub repository: ${action.repoUrl}`);
  // ... watch console for this
}
```

### Step 4: File Tree Inspection

**After action completes**:
```typescript
// Check WebContainer filesystem
const files = await webcontainer.fs.readdir('/', { recursive: true });
console.log('📁 Files created:', files);

// Compare with expected template files
const expectedFiles = startersBundle[templateId].files;
console.log('Expected files:', Object.keys(expectedFiles));
```

---

## 📊 METRICS TO TRACK

### Success Metrics

1. **Starter Usage Rate**:
   ```typescript
   const starterUsage = (starterActionsCount / totalActions) * 100;
   // Target: >60% for common requests
   ```

2. **GitHub Clone Success**:
   ```typescript
   const cloneSuccess = successfulClones / cloneAttempts;
   // Target: >95%
   ```

3. **File Generation vs Template**:
   ```typescript
   const avgFilesGenerated = totalFilesGenerated / totalArtifacts;
   // Lower is better (means using templates)
   // Target: <10 files per artifact
   ```

### Debugging Metrics

1. **Detection False Negatives**:
   ```typescript
   // Requests that SHOULD have used starter but didn't
   const missedStarters = requestsMatchingTemplate - starterActionsUsed;
   ```

2. **AI Override Rate**:
   ```typescript
   // Times AI generated files despite starter detection
   const overrideRate = (aiGeneratedAfterDetection / totalDetections) * 100;
   ```

---

## 🎯 RECOMMENDED ACTION PLAN

### Immediate (Now)

1. **Add prominent template catalog** to system prompt (top 500 lines)
2. **Add decision tree** at the very beginning
3. **Test with sample requests** in browser console

### Short Term (1-2 hours)

1. **Implement post-processing check** for missed starters
2. **Add logging** to track AI decisions
3. **Create test scenarios** for common requests

### Medium Term (1 day)

1. **A/B test** different prompt structures
2. **Collect metrics** on starter usage
3. **Fine-tune detection** algorithms

### Long Term (1 week)

1. **Consider two-step AI** (planning + execution)
2. **Train custom model** on starter usage
3. **Build analytics dashboard** for metrics

---

## 📝 TESTING CHECKLIST

### Manual Tests

- [ ] **Test 1**: Say "Create a blog" → Verify uses `BlogApp` template
- [ ] **Test 2**: Say "Build a Next.js app with Shadcn" → Verify uses `nextjs-shadcn`
- [ ] **Test 3**: Say "Clone vercel/next.js examples/blog" → Verify uses `cloneGitHub`
- [ ] **Test 4**: Say "Make a React dashboard" → Check file count (<10 = good)
- [ ] **Test 5**: Say "Build an API with authentication" → Verify uses `express-typescript-auth`

### Console Checks

- [ ] Look for: `📦 Importing starter template`
- [ ] Look for: `🔀 Cloning GitHub repository`
- [ ] Check file count in left sidebar
- [ ] Verify package.json matches template
- [ ] Check for unwanted mock files

### Integration Tests

- [ ] Verify files actually load in WebContainer
- [ ] Test npm install works
- [ ] Test dev server starts
- [ ] Verify no duplicate files
- [ ] Check dependencies are real (not mock)

---

## 🔗 RELATED FILES

### System Prompt
- `app/lib/.server/llm/prompts.ts` - Main system prompt (5500+ lines)

### Chat Flow
- `app/routes/api.chat.ts` - Request handling, starter detection
- `app/lib/.server/llm/starter-injector.ts` - Template matching logic
- `app/lib/.server/llm/openrouter-stream.ts` - AI streaming

### Action Execution
- `app/lib/runtime/message-parser.ts` - Parse AI XML responses
- `app/lib/runtime/action-runner.ts` - Execute actions

### Templates
- `app/lib/.server/llm/starters-bundle.json` - All template files (7.8MB)
- `app/routes/api.starters.ts` - Template API
- `app/routes/api.github.ts` - GitHub clone API

---

**Investigation Complete**: October 27, 2025  
**Status**: Infrastructure verified, runtime behavior needs monitoring  
**Next**: Implement proposed solutions and monitor metrics
