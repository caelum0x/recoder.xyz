/**
 * Planning step enforcer for agentic AI behavior
 * Forces the AI to explore and plan before writing code
 *
 * Enhanced with intelligent request classification and code quality enforcement
 */

/**
 * Request classification types
 */
export type RequestType =
  | 'new_project'
  | 'new_project_complex'
  | 'feature_add'
  | 'bug_fix'
  | 'refactor'
  | 'ui_change'
  | 'question'
  | 'unknown';

/**
 * Classify the user's request for appropriate handling
 */
export function classifyRequest(message: string): RequestType {
  const lowerMessage = message.toLowerCase();

  // New project patterns
  if (
    lowerMessage.includes('create a') ||
    lowerMessage.includes('build a') ||
    lowerMessage.includes('make a') ||
    lowerMessage.includes('build me') ||
    lowerMessage.includes('create me') ||
    lowerMessage.includes('make me') ||
    lowerMessage.includes('new project') ||
    lowerMessage.includes('new app') ||
    lowerMessage.includes('from scratch') ||
    lowerMessage.includes('start fresh')
  ) {
    // Count complexity keywords to distinguish simple vs complex
    const complexityKeywords = [
      'authentication', 'auth', 'login', 'signup', 'sign up', 'sign-up',
      'database', 'backend', 'api', 'crud', 'rest',
      'payment', 'stripe', 'checkout', 'billing', 'subscription',
      'dashboard', 'admin panel', 'admin',
      'real-time', 'realtime', 'websocket', 'chat', 'messaging',
      'e-commerce', 'ecommerce', 'marketplace', 'shop', 'cart',
      'multi-page', 'routing', 'multiple pages',
      'file upload', 'image upload',
      'search', 'filter', 'sorting',
      'notification', 'email',
      'analytics', 'reports', 'charts',
      'user management', 'roles', 'permissions',
      'settings', 'profile', 'preferences',
    ];
    const complexityConnectors = [' and ', ' with ', ' plus ', ' & ', ' + ', ' along with ', ' including '];

    const keywordCount = complexityKeywords.filter(kw => lowerMessage.includes(kw)).length;
    const connectorCount = complexityConnectors.filter(c => lowerMessage.includes(c)).length;
    const hasConnectors = connectorCount > 0;

    // Complex if:
    // - 3+ complexity keywords (high inherent complexity), OR
    // - 2+ keywords with connectors (combining multiple features), OR
    // - connectors present with at least 1 keyword (user describes compound app)
    if (keywordCount >= 3 || (keywordCount >= 2 && hasConnectors) || (hasConnectors && keywordCount >= 1 && connectorCount >= 2)) {
      return 'new_project_complex';
    }
    return 'new_project';
  }

  // Bug fix patterns
  if (
    lowerMessage.includes('fix') ||
    lowerMessage.includes('error') ||
    lowerMessage.includes('bug') ||
    lowerMessage.includes('failed') ||
    lowerMessage.includes('cannot find') ||
    lowerMessage.includes('not defined') ||
    lowerMessage.includes('not found') ||
    lowerMessage.includes('undefined') ||
    lowerMessage.includes('broken') ||
    lowerMessage.includes("doesn't work") ||
    lowerMessage.includes("isn't working") ||
    lowerMessage.includes('crash')
  ) {
    return 'bug_fix';
  }

  // UI change patterns
  if (
    lowerMessage.includes('style') ||
    lowerMessage.includes('color') ||
    lowerMessage.includes('font') ||
    lowerMessage.includes('layout') ||
    lowerMessage.includes('responsive') ||
    lowerMessage.includes('dark mode') ||
    lowerMessage.includes('theme') ||
    lowerMessage.includes('animation') ||
    lowerMessage.includes('ui') ||
    lowerMessage.includes('design') ||
    lowerMessage.includes('look')
  ) {
    return 'ui_change';
  }

  // Refactoring patterns
  if (
    lowerMessage.includes('refactor') ||
    lowerMessage.includes('clean up') ||
    lowerMessage.includes('optimize') ||
    lowerMessage.includes('reorganize') ||
    lowerMessage.includes('restructure') ||
    lowerMessage.includes('split') ||
    lowerMessage.includes('extract')
  ) {
    return 'refactor';
  }

  // Feature addition patterns
  if (
    lowerMessage.includes('add') ||
    lowerMessage.includes('implement') ||
    lowerMessage.includes('include') ||
    lowerMessage.includes('integrate') ||
    lowerMessage.includes('new feature') ||
    lowerMessage.includes('update') ||
    lowerMessage.includes('change') ||
    lowerMessage.includes('modify')
  ) {
    return 'feature_add';
  }

  // Question patterns
  if (
    lowerMessage.includes('how do') ||
    lowerMessage.includes('what is') ||
    lowerMessage.includes('explain') ||
    lowerMessage.includes('why') ||
    lowerMessage.includes('can you tell') ||
    lowerMessage.includes('?') && !lowerMessage.includes('can you')
  ) {
    return 'question';
  }

  return 'unknown';
}

/**
 * Detect if a message is asking to fix errors
 */
export function isErrorFixRequest(message: string): boolean {
  return classifyRequest(message) === 'bug_fix';
}

/**
 * Detect if a message is asking to modify existing code
 */
export function isModificationRequest(message: string): boolean {
  const type = classifyRequest(message);
  return type === 'feature_add' || type === 'ui_change' || type === 'refactor';
}

/**
 * Detect if this is a brand new project request
 */
export function isNewProjectRequest(message: string): boolean {
  const type = classifyRequest(message);
  return type === 'new_project' || type === 'new_project_complex';
}

/**
 * Generate a planning prompt that forces exploration
 */
export function getPlanningPrompt(userMessage: string, hasExistingFiles: boolean): string | null {
  const requestType = classifyRequest(userMessage);

  // For new projects, no planning needed - just build
  if ((requestType === 'new_project' || requestType === 'new_project_complex') && !hasExistingFiles) {
    return null;
  }

  // For questions, no planning needed
  if (requestType === 'question') {
    return null;
  }

  // For error fixes, provide structured debugging guidance
  if (requestType === 'bug_fix') {
    return `🔍 SYSTEMATIC DEBUG PROCESS

Before fixing this error, follow this diagnostic approach:

STEP 1 - GATHER INFORMATION:
<recoderAction type="readFile" filePath="[error-file]">Read the file causing the error</recoderAction>
<recoderAction type="readFile" filePath="package.json">Check dependencies</recoderAction>

STEP 2 - ANALYZE (after reading files):
- Identify the exact line/location of the error
- Check if it's a missing import, type error, or logic bug
- Look for related files that might be affected

STEP 3 - FIX PRECISELY:
- Make the MINIMUM change needed to fix the issue
- Don't rewrite entire files for small bugs
- Use str_replace for targeted edits when possible

STEP 4 - VERIFY:
- Ensure the fix doesn't break other functionality
- Check that imports/exports are consistent

User's request: ${userMessage}`;
  }

  // For UI changes, provide visual guidance
  if (requestType === 'ui_change') {
    return `🎨 UI MODIFICATION PROCESS

Before changing the UI, understand the current implementation:

STEP 1 - EXPLORE CURRENT STATE:
<recoderAction type="readFile" filePath="src/App.tsx">Read main component</recoderAction>
<recoderAction type="listFiles" path="src/components" recursive="true">See existing components</recoderAction>
<recoderAction type="searchFiles" query="className" filePattern="*.tsx">Find styling patterns</recoderAction>

STEP 2 - UNDERSTAND THE DESIGN SYSTEM:
- Check for existing color themes
- Look for consistent spacing/typography
- Find reusable UI components

STEP 3 - MAKE COHESIVE CHANGES:
- Match existing design patterns
- Use Tailwind classes consistently
- Ensure dark mode support if present
- Maintain responsive design

User's request: ${userMessage}`;
  }

  // For feature additions with existing files
  if ((requestType === 'feature_add' || requestType === 'refactor') && hasExistingFiles) {
    return `🛠️ FEATURE IMPLEMENTATION PROCESS

Before adding/modifying features, understand the codebase:

STEP 1 - EXPLORE PROJECT STRUCTURE:
<recoderAction type="listFiles" path="src" recursive="true">See file organization</recoderAction>
<recoderAction type="readFile" filePath="package.json">Check available packages</recoderAction>
<recoderAction type="readFile" filePath="src/App.tsx">Read entry point</recoderAction>

STEP 2 - FIND RELATED CODE:
<recoderAction type="searchFiles" query="[relevant-term]" filePattern="*.tsx">Find where to integrate</recoderAction>

STEP 3 - PLAN INTEGRATION:
- Identify which files need changes
- Plan new files that need to be created
- Consider state management approach
- Plan component hierarchy

STEP 4 - IMPLEMENT SYSTEMATICALLY:
- Create types/interfaces first
- Build from bottom up (utils → hooks → components → pages)
- Match existing code patterns
- Include error handling and loading states

User's request: ${userMessage}`;
  }

  return null;
}

/**
 * Get code quality enforcement prompt based on request type
 */
export function getQualityEnforcementPrompt(requestType: RequestType): string {
  const baseRules = `
CODE QUALITY REQUIREMENTS:
- COMPLETE code only - no stubs, no TODOs, no placeholders
- All imports must be included
- TypeScript types for all props/state
- Error handling with try-catch for async operations
- Loading states for data fetching
- Proper accessibility (aria-labels, keyboard support)
`;

  switch (requestType) {
    case 'new_project':
      return `${baseRules}
NEW PROJECT SPECIFICS:
- Create package.json FIRST with every dependency listed
- All imports must resolve to created files or installed packages
- Default stack: Vite + React + TypeScript + Tailwind CSS
- Use HashRouter (not BrowserRouter) for routing
- Include all config files (vite.config.ts, tailwind.config.js, tsconfig.json, postcss.config.js)
- Proper folder structure (src/components/, src/hooks/ for multi-component apps)
- End with shell command: npm install && npm run dev
- Self-check: Does every import have a matching file? Does package.json have every package?

<new_project_quality_check>
Before submitting your response, verify:
- package.json lists EVERY npm package imported in any file
- Every local import (from './...' or from '../...') has a matching file you created
- vite.config.ts uses @vitejs/plugin-react
- tsconfig.json has proper jsx: "react-jsx" setting
- index.html has <div id="root"></div> and <script type="module" src="/src/main.tsx">
- src/main.tsx renders App into #root
- All components are complete — no TODO comments, no stub functions
- npm install && npm run dev will work without errors
</new_project_quality_check>
`;

    case 'new_project_complex':
      return `${baseRules}
COMPLEX NEW PROJECT SPECIFICS:
- Create package.json FIRST with every dependency listed
- All imports must resolve to created files or installed packages
- Default stack: Vite + React + TypeScript + Tailwind CSS
- Use HashRouter (not BrowserRouter) for routing
- Include all config files (vite.config.ts, tailwind.config.js, tsconfig.json, postcss.config.js)
- REQUIRED folder structure:
  src/components/ - Reusable UI components
  src/pages/      - Route-level page components
  src/hooks/      - Custom React hooks
  src/lib/        - Utility functions and helpers
  src/types/      - TypeScript type definitions
  src/context/    - React context providers
- End with shell command: npm install && npm run dev
- Self-check: Does every import have a matching file? Does package.json have every package?
- Complete, working app in one response — no follow-up needed

<new_project_quality_check>
Before submitting your response, verify:
- package.json lists EVERY npm package imported in any file
- Every local import (from './...' or from '../...') has a matching file you created
- vite.config.ts uses @vitejs/plugin-react
- tsconfig.json has proper jsx: "react-jsx" setting
- index.html has <div id="root"></div> and <script type="module" src="/src/main.tsx">
- src/main.tsx renders App into #root
- All components are complete — no TODO comments, no stub functions
- npm install && npm run dev will work without errors
</new_project_quality_check>
`;

    case 'ui_change':
      return `${baseRules}
UI CHANGE SPECIFICS:
- Maintain visual consistency
- Use existing color palette
- Preserve responsive breakpoints
- Add smooth transitions (transition-all duration-200)
- Test both light and dark mode if present
`;

    case 'bug_fix':
      return `${baseRules}
BUG FIX SPECIFICS:
- Make minimal, targeted changes
- Don't refactor unrelated code
- Add error boundary if crash was severe
- Consider adding validation to prevent similar bugs
`;

    case 'feature_add':
      return `${baseRules}
FEATURE ADDITION SPECIFICS:
- Match existing architecture patterns
- Reuse existing UI components
- Add proper TypeScript types
- Include loading and error states
- Write clean, modular code
`;

    default:
      return baseRules;
  }
}

/**
 * Check if AI response contains exploration actions
 */
export function hasExplorationActions(response: string): boolean {
  return (
    response.includes('type="readFile"') ||
    response.includes('type="listFiles"') ||
    response.includes('type="searchFiles"')
  );
}

/**
 * Check if AI response contains file write actions
 */
export function hasWriteActions(response: string): boolean {
  return (
    response.includes('type="file"') ||
    response.includes('type="shell"')
  );
}

/**
 * Validate that AI followed the planning pattern
 * Returns warning message if AI skipped exploration
 */
export function validateAgenticResponse(
  response: string, 
  wasErrorFix: boolean,
  wasModification: boolean
): string | null {
  // If this was an error fix or modification, AI should have explored first
  if ((wasErrorFix || wasModification) && hasWriteActions(response) && !hasExplorationActions(response)) {
    return `⚠️ Warning: AI wrote code without exploring first. This may cause issues.`;
  }
  return null;
}

/**
 * Generate a specialized one-shot prompt for new project generation.
 * This tells the AI exactly how to produce a complete, working app in a single response.
 */
export function getOneShotPrompt(userMessage: string, isComplex: boolean): string {
  const basePrompt = `
<one_shot_generation>
You are generating a COMPLETE, WORKING application from scratch. Follow this EXACT order:

1. **package.json** — List ALL dependencies. Common ones:
   - React app: react, react-dom, @types/react, @types/react-dom, typescript, vite, @vitejs/plugin-react, tailwindcss, postcss, autoprefixer
   - Icons: lucide-react
   - Routing: react-router-dom
   - Charts: recharts
   - Date handling: date-fns
   - Forms: react-hook-form
   - State: zustand
   - HTTP: axios
   - Animations: framer-motion
   - Class merging: clsx

2. **Config files** — vite.config.ts, tsconfig.json, tsconfig.app.json, tailwind.config.js, postcss.config.js (use standard templates, don't get creative)

3. **index.html** — Standard Vite entry point referencing /src/main.tsx

4. **src/main.tsx** — ReactDOM.createRoot with App import

5. **src/index.css** — Tailwind directives (@tailwind base/components/utilities) + any custom styles

6. **src/App.tsx** — Main application component. Use HashRouter (NOT BrowserRouter).

7. **Additional components** — Create in src/components/, src/hooks/, src/utils/ as needed

8. **Shell command** — End with: npm install && npm run dev

CRITICAL RULES:
- COMPLETE CODE ONLY — every file must be fully implemented, no stubs, no TODOs, no "add more here"
- EVERY import must resolve to a file you create or a package in package.json
- NO placeholder content — real UI with real functionality
- Use Tailwind CSS for ALL styling
- Make it beautiful — use gradients, shadows, rounded corners, transitions, responsive design
- Use lucide-react for icons
- TypeScript for all .ts/.tsx files
</one_shot_generation>`;

  const complexAddition = isComplex ? `
<complex_app_structure>
This is a complex application. Use this folder structure:
src/
  components/
    layout/     — Header, Sidebar, Footer, Layout
    ui/         — Button, Card, Input, Modal, Badge
    features/   — Feature-specific components grouped by domain
  hooks/        — Custom React hooks
  utils/        — Helper functions, constants
  types/        — TypeScript interfaces and types
  lib/          — Service clients, API helpers
  pages/        — Page-level components (if using routing)
  context/      — React context providers

For multi-page apps, set up react-router-dom routes in App.tsx with HashRouter.
Create a shared Layout component with navigation between pages.
Each feature area should be self-contained with its own components, hooks, and types where needed.
</complex_app_structure>` : '';

  return basePrompt + complexAddition;
}

/**
 * Inject planning context into messages
 */
export function injectPlanningContext(
  messages: Array<{ role: string; content: string }>,
  hasExistingFiles: boolean
): Array<{ role: string; content: string }> {
  // Find the last user message
  const lastUserIdx = messages.map((m, i) => m.role === 'user' ? i : -1).filter(i => i >= 0).pop();
  
  if (lastUserIdx === undefined) {
    return messages;
  }
  
  const lastUserMessage = messages[lastUserIdx].content;
  const planningPrompt = getPlanningPrompt(lastUserMessage, hasExistingFiles);
  
  if (!planningPrompt) {
    return messages;
  }
  
  // Insert planning prompt before the last user message
  const result = [...messages];
  result.splice(lastUserIdx, 0, {
    role: 'system',
    content: planningPrompt
  });
  
  return result;
}
