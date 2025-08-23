dude all recoder packages are deployed to npm first fix main app project '/Users/arhansubasi/recoder.xyz/app' then fix backend  10 
  packages
  Packages List
  recoder-cli-router
  Route Recoder CLI requests to different LLM providers including Kimi K2, Qwen 3, and DeepSeek R1

  recoder.xyz
  published 2.3.1 • 6 hours ago
  published version 2.3.1, 6 hours ago
  recoder-cli
  Recoder CLI - AI-powered development platform with production-ready code generation

  recoder.xyz
  published 1.0.1 • a day ago
  published version 1.0.1, a day ago
  recoder-shared
  Shared types, utilities, and configurations for Recoder

  recoder.xyz
  published 1.0.0 • a day ago
  published version 1.0.0, a day ago
  recoder-analytics
  Comprehensive analytics and monitoring for the Recoder.xyz ecosystem

  recoder.xyz
  published 1.0.0 • a day ago
  published version 1.0.0, a day ago
  recoder-intelligence
  Adaptive AI intelligence and learning layer for CodeCraft CLI

  recoder.xyz
  published 1.0.0 • a day ago
  published version 1.0.0, a day ago
  recoder-plugins
  Plugin system for Recoder.xyz extensibility

  recoder.xyz
  published 1.0.0 • a day ago
  published version 1.0.0, a day ago
  recoder-security
  Enterprise-grade security and compliance layer for CodeCraft CLI

  recoder.xyz
  published 1.0.0 • a day ago
  published version 1.0.0, a day ago
  roo-code-types
  First authenticate with NPM:

  recoder.xyz
  published 1.0.1 • a day ago
  published version 1.0.1, a day ago
  recoder-performance
  High-performance monitoring, caching, and optimization utilities for Recoder.xyz

  recoder.xyz
  published 1.0.0 • a day ago
  published version 1.0.0, a day ago
  recoder-web-ai-assistant
  Advanced AI assistant for web development with intelligent completion, refactoring, and analysis

  recoder.xyz
  published 1.0.0 • a day ago                recoder-main-app@1.0.0 build
  > next build
  ⚠ No build cache found. Please configure build caching for faster rebuilds. Read more: https://nextjs.org/docs/messages/no-cache
     ▲ Next.js 15.5.0
     Creating an optimized production build ...
   ✓ Compiled successfully in 9.9s
     Skipping linting
     Checking validity of types ...
  It looks like you're trying to use TypeScript but do not have the required package(s) installed.
  Please install @types/node by running:
      npm install --save-dev @types/node
  If you are not trying to use TypeScript, please remove the tsconfig.json file from your package root (and any TypeScript files in 
  your app and pages directories).
  Next.js build worker exited with code: 1 and signal: null     found 0 vulnerabilities
  > backend@1.0.0 build
  > tsc
  src/middleware/auth.ts(197,13): error TS2339: Property 'ip' does not exist on type 'AuthenticatedRequest'.
  src/middleware/auth.ts(198,20): error TS2339: Property 'get' does not exist on type 'AuthenticatedRequest'.
  src/routes/auth.ts(358,15): error TS2339: Property 'ip' does not exist on type 'AuthenticatedRequest'.
  src/routes/auth.ts(393,35): error TS2339: Property 'body' does not exist on type 'AuthenticatedRequest'.
  src/routes/auth.ts(434,17): error TS2339: Property 'ip' does not exist on type 'AuthenticatedRequest'.
  src/routes/auth.ts(447,17): error TS2339: Property 'ip' does not exist on type 'AuthenticatedRequest'.
  src/routes/auth.ts(470,52): error TS2339: Property 'body' does not exist on type 'AuthenticatedRequest'.
  src/routes/auth.ts(512,17): error TS2339: Property 'ip' does not exist on type 'AuthenticatedRequest'.
  src/routes/auth.ts(524,17): error TS2339: Property 'ip' does not exist on type 'AuthenticatedRequest'.
  src/routes/auth.ts(552,15): error TS2339: Property 'ip' does not exist on type 'AuthenticatedRequest'.
  src/routes/auth.ts(564,15): error TS2339: Property 'ip' does not exist on type 'AuthenticatedRequest'.
  src/routes/database-backup.ts(8,24): error TS2307: Cannot find module '@recoder/shared' or its corresponding type declarations.
  src/routes/enhanced-analytics.ts(8,24): error TS2307: Cannot find module '@recoder/shared' or its corresponding type declarations.
  src/routes/rag.ts(189,42): error TS2694: Namespace 'global.Express' has no exported member 'Multer'.
  src/routes/soc2-compliance.ts(8,24): error TS2307: Cannot find module '@recoder/shared' or its corresponding type declarations.
  src/services/analytics-service.ts(9,24): error TS2307: Cannot find module '@recoder/shared' or its corresponding type declarations.
  src/services/database-backup.ts(14,24): error TS2307: Cannot find module '@recoder/shared' or its corresponding type declarations.
  src/services/i18n-service.ts(8,24): error TS2307: Cannot find module '@recoder/shared' or its corresponding type declarations.
  src/services/responsive-design.ts(8,24): error TS2307: Cannot find module '@recoder/shared' or its corresponding type declarations.
  src/services/theme-preferences.ts(8,24): error TS2307: Cannot find module '@recoder/shared' or its corresponding type declarations.
  src/utils/logging.ts(5,24): error TS2307: Cannot find module '@recoder/shared' or its corresponding type declarations.
  ../packages/shared/src/api.ts(6,27): error TS2307: Cannot find module '@anthropic-ai/sdk' or its corresponding type declarations.
  ../packages/shared/src/logger.ts(1,21): error TS2307: Cannot find module 'winston' or its corresponding type declarations.
  ../packages/shared/src/logger.ts(2,19): error TS2307: Cannot find module 'chalk' or its corresponding type declarations.
  ../packages/shared/src/reasoning.ts(6,50): error TS2307: Cannot find module '@roo-code/types' or its corresponding type 
  declarations.
  ==> Cloning from https://github.com/caelum0x/recoder.xyz
==> Checking out commit c2ac58c3a97ae8f8239ffdd8fcbb6b5e9668447e in branch main
==> Using Node.js version 22.16.0 (default)
==> Docs on specifying a Node.js version: https://render.com/docs/node-version
==> Running build command 'pnpm install --no-frozen-lockfile && pnpm build'...
/opt/render/project/src/recoder-web:
 ERR_PNPM_FETCH_404  GET https://registry.npmjs.org/@recoder%2Fweb-ai-assistant: Not Found - 404
This error happened while installing a direct dependency of /opt/render/project/src/recoder-web
@recoder/web-ai-assistant is not in the npm registry, or you have no permission to fetch it.
No authorization header was set for the request.
==> Build failed 😞
==> Common ways to troubleshoot your deploy: https://render.com/docs/troubleshooting-deploys
==> Cloning from https://github.com/caelum0x/recoder.xyz
==> Checking out commit c2ac58c3a97ae8f8239ffdd8fcbb6b5e9668447e in branch main
==> Using Node.js version 22.16.0 (default)
==> Docs on specifying a Node.js version: https://render.com/docs/node-version
==> Running build command 'pnpm install --no-frozen-lockfile && pnpm build'...
 ERR_PNPM_FETCH_404  GET https://registry.npmjs.org/@recoder%2Fweb-ai-assistant: Not Found - 404
This error happened while installing a direct dependency of /opt/render/project/src/recoder-web
@recoder/web-ai-assistant is not in the npm registry, or you have no permission to fetch it.
No authorization header was set for the request.
==> Build failed 😞
