# Recoder.xyz Implementation Plan
## Transforming Bolt.new into a Production-Ready AI Coding Platform

---

## 🎯 PROJECT GOALS

1. **Smart AI Model Selection** - Use Claude Sonnet 4 for complex coding, free models for simple tasks
2. **Complex Project Support** - Enable building full-stack apps with backend, APIs, databases
3. **Rebranding** - Remove Bolt branding, replace with Recoder.xyz

---

## 📋 TASK BREAKDOWN

### PHASE 1: Fix Current Issues ✅

#### Task 1.1: Fix TypeScript Errors in stream-text.ts
**Status:** IN PROGRESS
**Files:**
- `app/lib/.server/llm/stream-text.ts` - Type errors with optimizationResult

**Issues:**
- Lines 138-186: References to `optimizationResult` properties when it can be null
- Optimization code is commented out but still referenced
- Need to properly handle null case or enable optimization

**Solution:**
Enable the smart optimization system that's already built but commented out.

---

### PHASE 2: Implement Smart Model Selection ⏳

#### Task 2.1: Enable Smart Optimization System
**Status:** READY
**Files:**
- `app/lib/.server/llm/stream-text.ts` - Uncomment and fix optimization
- `app/lib/.server/llm/model-router.ts` - Already implemented
- `app/lib/.server/llm/smart-optimizer.ts` - Already implemented

**Implementation:**
1. Uncomment optimization code in stream-text.ts (lines 60-80)
2. Update model selection to use Claude Sonnet 4 for complex tasks
3. Ensure free models for simple tasks
4. Fix all TypeScript errors

**Key Logic:**
```typescript
// Simple tasks (CSS, text changes) → Free models (Gemini, DeepSeek)
// Complex coding (files, APIs, backend) → Claude Sonnet 4
// Template-based (todo app, dashboard) → Free model + template
```

#### Task 2.2: Update Model Configuration
**Status:** READY
**Files:**
- `app/lib/.server/llm/model-router.ts`

**Changes Needed:**
- Ensure `claude-sonnet-4` is properly referenced (not 3.5)
- Update to use latest Claude Sonnet 4 model ID
- Verify model IDs match provider expectations

---

### PHASE 3: Complex Project Support 🎯

#### Task 3.1: Enhanced System Prompts
**Status:** TODO
**Files:**
- `app/lib/.server/llm/prompts.ts`
- Create new `prompts-advanced.ts` for complex scenarios

**Implementation:**
Add specialized prompts for:
- Backend API development (Express, FastAPI, etc.)
- Database integration (PostgreSQL, MongoDB, etc.)
- Authentication/authorization systems
- Multi-file project structures
- Full-stack applications
- Real-time features (WebSockets, SSE)

#### Task 3.2: Project Structure Templates
**Status:** TODO
**Files:**
- Create `app/lib/.server/llm/project-templates/`
- Add backend templates (Node.js, Python, etc.)
- Add database templates
- Add auth templates

**Templates to Create:**
1. Full-stack Next.js + Express + PostgreSQL
2. React + FastAPI + MongoDB
3. Vue + Node.js + MySQL
4. MERN stack (MongoDB, Express, React, Node)
5. PERN stack (PostgreSQL, Express, React, Node)
6. Django full-stack
7. Ruby on Rails full-stack

#### Task 3.3: Multi-File Support Enhancement
**Status:** TODO
**Files:**
- `app/lib/.server/llm/prompts.ts` - Add instructions for complex file structures
- Review file creation logic

**Enhancements:**
- Better folder structure generation
- Package.json with proper dependencies
- Environment file templates (.env)
- Docker configuration files
- README with setup instructions
- Testing file scaffolds

#### Task 3.4: Code Quality & Best Practices
**Status:** TODO
**Files:**
- `app/lib/.server/llm/prompts.ts`

**Add guidance for:**
- Error handling patterns
- Security best practices
- API rate limiting
- Input validation
- Logging and monitoring
- Testing strategies

---

### PHASE 4: Rebranding to Recoder.xyz 🎨

#### Task 4.1: Logo & Branding Assets
**Status:** TODO
**Files:**
- `public/` - Replace logo files
- `app/components/header/` - Update header logo
- `app/components/` - Find all Bolt references

**Changes:**
- Replace Bolt.new logo with Recoder.xyz logo
- Update favicon
- Update og:image for social sharing
- Update app manifest

#### Task 4.2: Text & Content Updates
**Status:** TODO
**Files to Search/Replace:**
- All `.tsx`, `.ts`, `.md` files
- `package.json` - Update name, description
- `README.md` - Complete rewrite
- `public/index.html` or equivalent

**Find/Replace:**
- "Bolt" → "Recoder"
- "bolt.new" → "recoder.xyz"
- Update taglines and descriptions
- Update documentation

#### Task 4.3: Metadata & SEO
**Status:** TODO
**Files:**
- `app/root.tsx` - Meta tags
- `app/routes/` - Page titles
- `public/manifest.json` or equivalent

**Updates:**
- Site title
- Meta descriptions
- OpenGraph tags
- Twitter card tags
- Apple touch icons
- Theme colors

#### Task 4.4: Legal & Links
**Status:** TODO
**Files:**
- Create new docs: Terms of Service, Privacy Policy
- Update footer links
- Update external links

---

### PHASE 5: Production Polish 🚀

#### Task 5.1: Error Handling & User Feedback
**Status:** TODO
**Files:**
- Create `app/components/error-boundary.tsx`
- Enhance error messages

**Features:**
- Better error messages for users
- "Fix automatically" buttons for common errors
- Retry mechanisms
- Fallback to alternative models on failure

#### Task 5.2: Analytics & Monitoring
**Status:** PARTIAL (analytics.ts exists)
**Files:**
- `app/lib/.server/llm/analytics.ts`
- Add user-facing dashboard

**Enhancements:**
- Track model usage and costs
- Monitor response quality
- Track user satisfaction
- A/B test results display

#### Task 5.3: Performance Optimization
**Status:** TODO
**Files:**
- Review all LLM calls
- Optimize bundle size

**Optimizations:**
- Lazy load heavy components
- Implement request coalescing
- Add response streaming indicators
- Cache static assets aggressively

#### Task 5.4: Documentation
**Status:** TODO
**Files:**
- Rewrite `README.md`
- Create `CONTRIBUTING.md`
- Create `DEPLOYMENT.md`
- Add API documentation

---

## 🎯 IMMEDIATE NEXT STEPS (NOW)

1. ✅ **Fix stream-text.ts TypeScript errors**
   - Enable smart optimization system
   - Handle null cases properly
   - Test model routing

2. **Test model selection with various prompts**
   - Simple CSS change → Should use free model
   - Create API endpoint → Should use Claude Sonnet 4
   - Create file structure → Should use Claude Sonnet 4

3. **Update model router for Claude Sonnet 4**
   - Verify model ID is correct (`claude-sonnet-4`)
   - Ensure it's used for complex tasks

4. **Start rebranding**
   - Find all "Bolt" references
   - Create Recoder.xyz logo/assets
   - Update package.json

---

## 📊 SUCCESS METRICS

### Cost Optimization
- 60%+ of requests use free models
- Average cost per request < $0.10
- Complex coding tasks use Claude Sonnet 4 (worth the cost)

### Quality
- Code generation success rate > 90%
- File structure creation works reliably
- Backend/API generation works properly

### User Experience
- Fast responses for simple tasks (<2s)
- Accurate model selection
- Clear error messages with solutions

---

## 🔧 TECHNICAL NOTES

### Model Selection Strategy
```
Template-based (30% of requests):
  - Todo apps, dashboards, landing pages
  - Clone from /starters/ directory
  - Use Gemini Flash Lite (FREE)
  - ~$0 cost, 95% savings

Simple tasks (20% of requests):
  - CSS/styling changes
  - Text updates, color changes
  - Simple UI tweaks
  - Use Gemini 2.5 Flash (FREE)
  - ~$0 cost, 100% savings

Moderate tasks (10% of requests):
  - Simple components
  - Basic debugging
  - Use DeepSeek V3 (FREE)
  - ~$0 cost, 100% savings

Complex coding (40% of requests):
  - File/folder creation ⭐
  - API development ⭐
  - Backend logic ⭐
  - Database integration ⭐
  - Full features ⭐
  - Use Claude Sonnet 4 ($3/$15 per M tokens)
  - ~$0.10-0.30 per generation
```

### Why Claude Sonnet 4 for Complex Tasks?
- Best coding model available
- Handles multi-file projects perfectly
- Understands complex requirements
- Generates production-ready code
- Worth the cost for quality

### Free Models for Simple Tasks
- Gemini 2.5 Flash - Fast, good for simple tasks
- DeepSeek V3 - Good reasoning, free
- Llama 4 - Large context window, free

---

## 🚀 DEPLOYMENT CHECKLIST

- [ ] All TypeScript errors fixed
- [ ] Model selection tested and working
- [ ] Claude Sonnet 4 used for complex tasks
- [ ] Free models used for simple tasks
- [ ] All "Bolt" references replaced with "Recoder"
- [ ] Logo and branding updated
- [ ] README updated
- [ ] Documentation complete
- [ ] Error handling robust
- [ ] Analytics tracking working
- [ ] Performance optimized
- [ ] Security reviewed
- [ ] Environment variables documented
- [ ] Deployment guide written

---

*Last Updated: $(date)*
*Status: Phase 1 - In Progress*
