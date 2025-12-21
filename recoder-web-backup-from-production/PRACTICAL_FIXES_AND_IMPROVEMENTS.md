# Practical Fixes & Improvements

**Date**: October 27, 2025  
**Purpose**: Actionable improvements to enhance starter and GitHub clone detection

---

## 🎯 PRIORITY 1: Improve System Prompt (HIGH IMPACT)

### Fix #1: Add Critical Decision Tree at Top

**Location**: `app/lib/.server/llm/prompts.ts` (add after line 5)

```typescript
export const getSystemPrompt = (cwd: string = WORK_DIR) => `
You are Recoder, an expert AI assistant and exceptional senior software developer with vast knowledge across multiple programming languages, frameworks, and best practices.

<critical_first_step>
  ⚠️ CRITICAL: Before generating ANY artifact, follow this decision tree:

  STEP 1: Check for Starter Template Match
  ────────────────────────────────────────
  Does the request match a common project type?
  
  ✅ Blog/CMS → Use templateId="BlogApp" or "nextjs-blog-mdx"
  ✅ Next.js + Shadcn → Use templateId="nextjs-shadcn"
  ✅ React App → Use templateId="react" or "react-ts"
  ✅ API with Auth → Use templateId="express-typescript-auth"
  ✅ Express API → Use templateId="express-typescript"
  ✅ Angular App → Use templateId="angular"
  ✅ Vue App → Use templateId="vue"
  
  If YES → Use: <boltAction type="importStarter" templateId="...">
  If NO → Continue to Step 2

  STEP 2: Check for GitHub Clone Request
  ────────────────────────────────────────
  Does the user:
  - Mention "clone" or "import from GitHub"?
  - Provide a GitHub URL (github.com/...)?
  - Reference an existing repo (facebook/react)?
  
  If YES → Use: <boltAction type="cloneGitHub" repoUrl="...">
  If NO → Continue to Step 3

  STEP 3: Generate from Scratch
  ────────────────────────────────────────
  Only if Steps 1 & 2 are NO, then generate files manually.
  
  WHY THIS MATTERS:
  - Starters are 10x faster than generating files
  - GitHub clones provide real, tested code
  - Users get better quality results
  - You save processing time
</critical_first_step>

<!-- Rest of existing prompt... -->
`;
```

### Fix #2: Make Template List More Prominent

**Add after critical_first_step section**:

```typescript
<available_starter_templates>
  YOU HAVE ACCESS TO 45 PRE-BUILT STARTER TEMPLATES!
  
  🎯 MOST COMMONLY USED:
  ═══════════════════════════════════════════════════════════
  
  📱 MOBILE/WEB APPS:
  - "BlogApp"           → Full React Native blog (posts, comments, auth)
  - "nextjs"            → Standard Next.js setup
  - "nextjs-shadcn"     → Next.js + Shadcn UI components
  - "nextjs-blog-mdx"   → Blog with MDX support
  - "react"             → Basic React app
  - "react-ts"          → React with TypeScript
  - "bolt-vite-react-ts" → Vite + React + TypeScript
  - "angular"           → Angular framework
  - "vue"               → Vue.js framework
  
  🔧 BACKEND/API:
  - "express-typescript"      → Modern TypeScript API (validation, docs)
  - "express-typescript-auth" → Full auth system (JWT, email verify)
  - "express-mongodb-api"     → MongoDB backend (uploads, caching)
  - "express-simple"          → Basic Express server
  
  💼 FULL-STACK:
  - "astro-shadcn"   → Astro + Shadcn
  - "bolt-qwik"      → Qwik framework
  - "bolt-expo"      → Expo mobile starter
  
  🎨 UI FRAMEWORKS:
  - "bootstrap-5"    → Bootstrap 5 starter
  - "vite-shadcn"    → Vite + Shadcn UI
  
  📊 DATABASES:
  - Use "express-mongodb-api" for MongoDB projects
  - Use "express-typescript" with SQLite for SQL projects
  
  USAGE EXAMPLES:
  ═══════════════════════════════════════════════════════════
  
  User: "Create a blog"
  You:  <boltAction type="importStarter" templateId="BlogApp" reason="Blog app request">
  
  User: "Build a Next.js site with Shadcn UI"
  You:  <boltAction type="importStarter" templateId="nextjs-shadcn" reason="Next.js + Shadcn request">
  
  User: "Make an API with authentication"
  You:  <boltAction type="importStarter" templateId="express-typescript-auth" reason="Auth API needed">
  
  User: "React TypeScript app"
  You:  <boltAction type="importStarter" templateId="react-ts" reason="React TS request">
  
  ⚠️ CRITICAL: If a template matches, ALWAYS use it instead of generating files!
</available_starter_templates>
```

---

## 🎯 PRIORITY 2: Enhance Starter Detection (MEDIUM IMPACT)

### Fix #3: Improve Pattern Matching

**Location**: `app/lib/.server/llm/starter-injector.ts`

**Add more keyword patterns**:

```typescript
// Enhanced pattern matching
const ENHANCED_PATTERNS = {
  // Blog patterns
  blog: {
    keywords: ['blog', 'blogging', 'posts', 'articles', 'cms', 'content management'],
    templateId: 'nextjs-blog-mdx',
    confidence: 0.9
  },
  
  // Next.js patterns
  nextjs_shadcn: {
    keywords: ['nextjs shadcn', 'next.js shadcn', 'next shadcn', 'shadcn next'],
    templateId: 'nextjs-shadcn',
    confidence: 0.95
  },
  
  // React patterns
  react: {
    keywords: ['react app', 'react application', 'react project'],
    templateId: 'react-ts',
    confidence: 0.8
  },
  
  // API patterns
  api_auth: {
    keywords: ['api auth', 'api authentication', 'auth api', 'authentication api', 'backend auth'],
    templateId: 'express-typescript-auth',
    confidence: 0.9
  },
  
  api_basic: {
    keywords: ['express api', 'rest api', 'api server', 'backend api'],
    templateId: 'express-typescript',
    confidence: 0.8
  },
  
  // Mobile patterns
  mobile: {
    keywords: ['mobile app', 'react native', 'expo app'],
    templateId: 'bolt-expo',
    confidence: 0.85
  },
  
  // Dashboard patterns
  dashboard: {
    keywords: ['dashboard', 'admin panel', 'analytics dashboard'],
    templateId: 'nextjs-shadcn',
    confidence: 0.7
  },
  
  // E-commerce patterns
  ecommerce: {
    keywords: ['e-commerce', 'ecommerce', 'online store', 'shop', 'shopping cart'],
    templateId: 'nextjs-shadcn', // Can be customized
    confidence: 0.7
  }
};

export async function detectAndPrepareStarter(userMessage: string) {
  const lowerMessage = userMessage.toLowerCase();
  
  // Check each pattern
  for (const [key, pattern] of Object.entries(ENHANCED_PATTERNS)) {
    for (const keyword of pattern.keywords) {
      if (lowerMessage.includes(keyword)) {
        return {
          shouldInject: true,
          starterId: pattern.templateId,
          confidence: pattern.confidence,
          matchedKeyword: keyword
        };
      }
    }
  }
  
  // Fall back to existing logic
  return { shouldInject: false };
}
```

---

## 🎯 PRIORITY 3: Add Post-Generation Validation (MEDIUM IMPACT)

### Fix #4: Detect Missed Opportunities

**Location**: Create new file `app/lib/.server/llm/artifact-validator.ts`

```typescript
/**
 * Validates AI-generated artifacts and detects missed template opportunities
 */

export interface ValidationResult {
  shouldHaveUsedStarter: boolean;
  suggestedTemplateId?: string;
  reason?: string;
  fileCount: number;
}

export function validateArtifact(artifactContent: string): ValidationResult {
  // Count file actions
  const fileActions = (artifactContent.match(/<boltAction type="file"/g) || []).length;
  
  // If too many files, probably should have used a template
  if (fileActions > 15) {
    // Check for common patterns
    if (artifactContent.match(/blog|post|article/i)) {
      return {
        shouldHaveUsedStarter: true,
        suggestedTemplateId: 'nextjs-blog-mdx',
        reason: 'Blog-related keywords detected with 15+ files',
        fileCount: fileActions
      };
    }
    
    if (artifactContent.match(/shadcn|ui\/.*\.tsx/i)) {
      return {
        shouldHaveUsedStarter: true,
        suggestedTemplateId: 'nextjs-shadcn',
        reason: 'Shadcn UI components detected',
        fileCount: fileActions
      };
    }
    
    if (artifactContent.match(/express.*auth|jwt|authentication/i)) {
      return {
        shouldHaveUsedStarter: true,
        suggestedTemplateId: 'express-typescript-auth',
        reason: 'Authentication API detected',
        fileCount: fileActions
      };
    }
    
    if (artifactContent.match(/package\.json.*express/i)) {
      return {
        shouldHaveUsedStarter: true,
        suggestedTemplateId: 'express-typescript',
        reason: 'Express API detected',
        fileCount: fileActions
      };
    }
  }
  
  return {
    shouldHaveUsedStarter: false,
    fileCount: fileActions
  };
}

// In api.chat.ts, add validation
import { validateArtifact } from '~/lib/.server/llm/artifact-validator';

// After AI generates response...
const validation = validateArtifact(aiResponse);

if (validation.shouldHaveUsedStarter) {
  console.warn('⚠️ MISSED OPPORTUNITY:', {
    template: validation.suggestedTemplateId,
    reason: validation.reason,
    fileCount: validation.fileCount
  });
  
  // Could optionally log to analytics
  // trackMissedTemplate(validation);
}
```

---

## 🎯 PRIORITY 4: Improve GitHub Clone Detection (HIGH IMPACT)

### Fix #5: Better URL Detection

**Location**: `app/lib/runtime/message-parser.ts`

**Add explicit GitHub URL parsing before AI**:

```typescript
export function detectGitHubUrl(message: string): string | null {
  // Match various GitHub URL formats
  const patterns = [
    /https?:\/\/github\.com\/([a-zA-Z0-9-]+\/[a-zA-Z0-9-._]+)/,
    /github\.com\/([a-zA-Z0-9-]+\/[a-zA-Z0-9-._]+)/,
    /^([a-zA-Z0-9-]+\/[a-zA-Z0-9-._]+)$/ // owner/repo format
  ];
  
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match) {
      return match[1] || match[0];
    }
  }
  
  return null;
}

// In chat API, before sending to AI:
const githubUrl = detectGitHubUrl(lastUserMessage);

if (githubUrl) {
  // Add explicit instruction to AI
  messages.push({
    role: 'system',
    content: `IMPORTANT: User provided GitHub URL: ${githubUrl}. Use <boltAction type="cloneGitHub" repoUrl="${githubUrl}"> instead of generating files.`
  });
}
```

### Fix #6: Prevent File Generation After Clone

**Location**: `app/lib/runtime/action-runner.ts`

**Add a flag to prevent additional file actions after clone**:

```typescript
private _isCloning: boolean = false;
private _cloneComplete: boolean = false;

async #runCloneGitHubAction(action: ActionState) {
  this._isCloning = true;
  logger.info(`🔀 Cloning GitHub repository: ${action.repoUrl}`);
  
  try {
    // ... existing clone logic ...
    
    this._cloneComplete = true;
    logger.info(`✅ Clone complete. Preventing additional file generation.`);
  } finally {
    this._isCloning = false;
  }
}

async #runFileAction(action: ActionState) {
  // Prevent file generation if we just cloned
  if (this._cloneComplete) {
    logger.warn('⚠️ Skipping file action - repository was cloned');
    return;
  }
  
  // ... existing file logic ...
}
```

---

## 🎯 PRIORITY 5: Add User Feedback (LOW IMPACT, HIGH VALUE)

### Fix #7: Show Template Usage Notifications

**Location**: `app/components/chat/AssistantMessage.tsx`

**Add visual indicators when templates are used**:

```typescript
// Detect template usage in message
function detectTemplateUsage(content: string): {isTemplate: boolean, templateId?: string} {
  const importMatch = content.match(/type="importStarter".*templateId="([^"]+)"/);
  if (importMatch) {
    return { isTemplate: true, templateId: importMatch[1] };
  }
  return { isTemplate: false };
}

// In component:
const templateInfo = detectTemplateUsage(content);

return (
  <div>
    {templateInfo.isTemplate && (
      <div className="mb-4 p-3 bg-blue-50 border-l-4 border-blue-500 rounded">
        <div className="flex items-center gap-2">
          <span className="text-blue-600 text-xl">📦</span>
          <div>
            <p className="font-semibold text-blue-900">Using Starter Template</p>
            <p className="text-sm text-blue-700">
              Loaded <code>{templateInfo.templateId}</code> - Complete, production-ready code!
            </p>
          </div>
        </div>
      </div>
    )}
    {/* Rest of message */}
  </div>
);
```

### Fix #8: Show GitHub Clone Status

**Similar notification for GitHub clones**:

```typescript
const cloneInfo = detectGitHubClone(content);

{cloneInfo.isClone && (
  <div className="mb-4 p-3 bg-green-50 border-l-4 border-green-500 rounded">
    <div className="flex items-center gap-2">
      <span className="text-green-600 text-xl">🔀</span>
      <div>
        <p className="font-semibold text-green-900">Repository Cloned</p>
        <p className="text-sm text-green-700">
          Imported real code from <code>{cloneInfo.repoUrl}</code>
        </p>
      </div>
    </div>
  </div>
)}
```

---

## 🎯 PRIORITY 6: Add Analytics Tracking (OPTIONAL)

### Fix #9: Track Template Usage Metrics

**Location**: Create `app/lib/.server/analytics/template-metrics.ts`

```typescript
interface TemplateMetric {
  timestamp: number;
  templateId: string;
  userRequest: string;
  confidence: number;
  wasSuccessful: boolean;
}

class TemplateMetrics {
  private metrics: TemplateMetric[] = [];
  
  track(metric: TemplateMetric) {
    this.metrics.push(metric);
    
    // Log to console for now
    console.log('📊 Template Metric:', {
      template: metric.templateId,
      confidence: metric.confidence.toFixed(2),
      success: metric.wasSuccessful
    });
  }
  
  getUsageRate() {
    const last100 = this.metrics.slice(-100);
    const templatesUsed = last100.filter(m => m.wasSuccessful).length;
    return (templatesUsed / last100.length) * 100;
  }
  
  getMostUsed() {
    const counts: Record<string, number> = {};
    this.metrics.forEach(m => {
      counts[m.templateId] = (counts[m.templateId] || 0) + 1;
    });
    return Object.entries(counts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5);
  }
}

export const templateMetrics = new TemplateMetrics();
```

---

## 📝 IMPLEMENTATION CHECKLIST

### High Priority (Do First)

- [ ] **Fix #1**: Add critical decision tree to system prompt
- [ ] **Fix #2**: Make template list more prominent in prompt
- [ ] **Fix #5**: Better GitHub URL detection before AI
- [ ] **Fix #6**: Prevent file generation after clone

### Medium Priority (Do Next)

- [ ] **Fix #3**: Enhance pattern matching in starter detection
- [ ] **Fix #4**: Add artifact validation for missed opportunities
- [ ] **Fix #7**: Show template usage notifications in UI
- [ ] **Fix #8**: Show GitHub clone status in UI

### Low Priority (Nice to Have)

- [ ] **Fix #9**: Add analytics tracking for metrics
- [ ] Add A/B testing for different prompt versions
- [ ] Build analytics dashboard

---

## 🧪 TESTING AFTER FIXES

### Test Suite 1: Template Detection

```bash
# Test each fix
1. "Create a blog" → Should use BlogApp
2. "Build Next.js with Shadcn" → Should use nextjs-shadcn
3. "Make an API with auth" → Should use express-typescript-auth
4. "React TypeScript app" → Should use react-ts
5. "Express API server" → Should use express-typescript
```

### Test Suite 2: GitHub Clone

```bash
# Test GitHub detection
1. "Clone https://github.com/vercel/next.js" → Should use cloneGitHub
2. "Import facebook/react" → Should use cloneGitHub
3. "Use the tailwind example from Next.js" → Should use cloneGitHub
```

### Test Suite 3: Prevention

```bash
# Make sure these DON'T generate 50+ files
1. "Build a blog platform" → Should use template (<10 files)
2. "Create a dashboard" → Should use template (<10 files)
3. "Make an e-commerce site" → Should use template and customize
```

---

## 📊 SUCCESS METRICS

### Target Metrics After Fixes

| Metric | Before | Target | Measure |
|--------|--------|--------|---------|
| Template Usage Rate | Unknown | >70% | % of requests using templates |
| Avg Files Generated | Unknown | <10 | Files per artifact |
| GitHub Clone Success | Unknown | >95% | % of clones working |
| Missed Opportunities | Unknown | <10% | Should have used template |

---

## 🎯 ROLLOUT PLAN

### Phase 1: Core Prompt Improvements (1 hour)
1. Update system prompt with decision tree
2. Make template list prominent
3. Test with 10 sample requests

### Phase 2: Detection Enhancements (2 hours)
1. Improve pattern matching
2. Add GitHub URL detection
3. Prevent post-clone file generation

### Phase 3: User Experience (2 hours)
1. Add template usage notifications
2. Add clone status indicators
3. Improve error messages

### Phase 4: Monitoring (1 hour)
1. Add basic analytics
2. Track template usage
3. Monitor missed opportunities

**Total Time**: ~6 hours for complete implementation

---

**Document Created**: October 27, 2025  
**Status**: Ready for implementation  
**Estimated Impact**: 3-5x improvement in template usage
