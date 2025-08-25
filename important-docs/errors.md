oh-my-zsh] theme 'powerlevel10k' not found
arhansubasi@192 recoder.xyz % npm run dev

> recoder@1.0.0 dev
> pnpm run dev:all


> recoder@1.0.0 dev:all /Users/arhansubasi/recoder.xyz
> concurrently "pnpm run dev:backend" "pnpm run dev:engine" "pnpm run dev:web" "pnpm run dev:chat" "pnpm run dev:mobile" "pnpm run dev:desktop" "pnpm run dev:collaboration" --names "backend,engine,web,chat,mobile,desktop,collab" --prefix-colors "blue,green,magenta,yellow,cyan,red,white"

[engine] 
[engine] > recoder@1.0.0 dev:engine /Users/arhansubasi/recoder.xyz
[engine] > cd production-engine && pnpm dev || node src/server.js
[engine] 
[desktop] 
[desktop] > recoder@1.0.0 dev:desktop /Users/arhansubasi/recoder.xyz
[desktop] > cd recoder-desktop && pnpm dev || npm run dev
[desktop] 
[web] 
[web] > recoder@1.0.0 dev:web /Users/arhansubasi/recoder.xyz
[web] > cd recoder-web && pnpm dev
[web] 
[collab] 
[collab] > recoder@1.0.0 dev:collaboration /Users/arhansubasi/recoder.xyz
[collab] > cd packages/cli && ts-node src/bin/collaboration-server.ts
[collab] 
[mobile] 
[mobile] > recoder@1.0.0 dev:mobile /Users/arhansubasi/recoder.xyz
[mobile] > cd recoder-chat-mobile && pnpm start || npx expo start
[mobile] 
[chat] 
[chat] > recoder@1.0.0 dev:chat /Users/arhansubasi/recoder.xyz
[chat] > cd recoder-chat && pnpm dev
[chat] 
[collab] sh: ts-node: command not found
[backend] 
[backend] > recoder@1.0.0 dev:backend /Users/arhansubasi/recoder.xyz
[backend] > cd backend && pnpm dev || node src/server.js
[backend] 
[collab]  ELIFECYCLE  Command failed.
[collab] pnpm run dev:collaboration exited with code 1
[mobile] 
[mobile] > recoder-chat-mobile@1.0.0 start /Users/arhansubasi/recoder.xyz/recoder-chat-mobile
[mobile] > expo start
[mobile] 
[desktop] 
[desktop] > recoder-desktop@1.0.0 dev /Users/arhansubasi/recoder.xyz/recoder-desktop
[desktop] > electron . --dev
[desktop] 
[engine] 
[engine] > @recoder/production-engine@2.0.0 dev /Users/arhansubasi/recoder.xyz/production-engine
[engine] > npx tsx src/server.ts
[engine] 
[chat] 
[chat] > ai-chatbot@3.1.0 dev /Users/arhansubasi/recoder.xyz/recoder-chat
[chat] > next dev
[chat] 
[backend] 
[backend] > backend@1.0.0 dev /Users/arhansubasi/recoder.xyz/backend
[backend] > tsx watch src/server.ts
[backend] 
[web] 
[web] > recoder-web-platform@1.0.0 dev /Users/arhansubasi/recoder.xyz/recoder-web
[web] > next dev
[web] 
[engine] npm warn Unknown env config "verify-deps-before-run". This will stop working in the next major version of npm.
[engine] npm warn Unknown env config "_jsr-registry". This will stop working in the next major version of npm.
[mobile] env: load .env.local
[mobile] env: export DATABASE_URL DIRECT_URL POSTGRES_URL NEXTAUTH_URL NEXTAUTH_SECRET AUTH_SECRET NEXTAUTH_URL_CHAT UNIFIED_AUTH_SECRET JWT_SECRET DODO_PAYMENTS_API_KEY DODO_API_BASE_URL DODO_WEBHOOK_SECRET NEXT_PUBLIC_RETURN_URL NEXT_PUBLIC_CANCEL_URL ANTHROPIC_API_KEY ANTHROPIC_BASE_URL GROQ_API_KEY GROQ_BASE_URL GOOGLE_API_KEY GOOGLE_AI_API_KEY OPENAI_API_KEY OPENAI_BASE_URL MISTRAL_API_KEY TOGETHER_API_KEY OPENROUTER_API_KEY DEEPSEEK_API_KEY DEEPSEEK_BASE_URL XAI_API_KEY FIREWORKS_API_KEY CEREBRAS_API_KEY OLLAMA_BASE_URL LM_STUDIO_BASE_URL AWS_REGION GOOGLE_APPLICATION_CREDENTIALS GOOGLE_REGION SECURITY_SCAN_ENABLED VULNERABILITY_CHECK_ENABLED RATE_LIMIT_REQUESTS_PER_MINUTE RATE_LIMIT_ENABLED ANALYTICS_ENABLED NEXT_PUBLIC_WEB_URL NEXT_PUBLIC_CHAT_URL NEXT_PUBLIC_API_URL NEXT_PUBLIC_ENGINE_URL WEB_PLATFORM_PORT CHAT_PLATFORM_PORT BACKEND_API_PORT PRODUCTION_ENGINE_PORT SKIP_ENV_VALIDATION BUILD_ANALYZE LOG_LEVEL FEATURE_REASONING_ENGINE FEATURE_BLOCKCHAIN_AGENT FEATURE_MOBILE_AGENT FEATURE_DEPLOYMENT_PIPELINE EXTENSION_API_BASE_URL EXTENSION_AUTH_PROVIDER EXTENSION_TELEMETRY_ENABLED DOCKER_REGISTRY KUBERNETES_NAMESPACE DEPLOYMENT_ENVIRONMENT HEALTH_CHECK_ENABLED METRICS_ENDPOINT STATUS_ENDPOINT USAGE_TRACKING_ENABLED COST_MONITORING_ENABLED BILLING_CYCLE FREE_TIER_REQUESTS LAUNCH_READY WEB_PLATFORM_READY CHAT_PLATFORM_READY DATABASE_READY AUTH_READY PAYMENTS_READY AI_PROVIDERS_READY SECURITY_READY MONITORING_READY
[desktop] /Users/arhansubasi/recoder.xyz/node_modules/.pnpm/electron@28.3.3/node_modules/electron/index.js:17
[desktop]     throw new Error('Electron failed to install correctly, please delete node_modules/electron and try installing again');
[desktop]     ^
[desktop] 
[desktop] Error: Electron failed to install correctly, please delete node_modules/electron and try installing again
[desktop]     at getElectronPath (/Users/arhansubasi/recoder.xyz/node_modules/.pnpm/electron@28.3.3/node_modules/electron/index.js:17:11)
[desktop]     at Object.<anonymous> (/Users/arhansubasi/recoder.xyz/node_modules/.pnpm/electron@28.3.3/node_modules/electron/index.js:21:18)
[desktop]     at Module._compile (node:internal/modules/cjs/loader:1692:14)
[desktop]     at Object..js (node:internal/modules/cjs/loader:1824:10)
[desktop]     at Module.load (node:internal/modules/cjs/loader:1427:32)
[desktop]     at Module._load (node:internal/modules/cjs/loader:1250:12)
[desktop]     at TracingChannel.traceSync (node:diagnostics_channel:322:14)
[desktop]     at wrapModuleLoad (node:internal/modules/cjs/loader:235:24)
[desktop]     at Module.require (node:internal/modules/cjs/loader:1449:12)
[desktop]     at require (node:internal/modules/helpers:135:16)
[desktop] 
[desktop] Node.js v24.3.0
[desktop]  ELIFECYCLE  Command failed with exit code 1.
[mobile] Starting project at /Users/arhansubasi/recoder.xyz/recoder-chat-mobile
[desktop] npm warn Unknown env config "verify-deps-before-run". This will stop working in the next major version of npm.
[desktop] npm warn Unknown env config "_jsr-registry". This will stop working in the next major version of npm.
[desktop] 
[desktop] > recoder-desktop@1.0.0 dev
[desktop] > electron . --dev
[desktop] 
[desktop] /Users/arhansubasi/recoder.xyz/node_modules/.pnpm/electron@28.3.3/node_modules/electron/index.js:17
[desktop]     throw new Error('Electron failed to install correctly, please delete node_modules/electron and try installing again');
[desktop]     ^
[desktop] 
[desktop] Error: Electron failed to install correctly, please delete node_modules/electron and try installing again
[desktop]     at getElectronPath (/Users/arhansubasi/recoder.xyz/node_modules/.pnpm/electron@28.3.3/node_modules/electron/index.js:17:11)
[desktop]     at Object.<anonymous> (/Users/arhansubasi/recoder.xyz/node_modules/.pnpm/electron@28.3.3/node_modules/electron/index.js:21:18)
[desktop]     at Module._compile (node:internal/modules/cjs/loader:1692:14)
[desktop]     at Object..js (node:internal/modules/cjs/loader:1824:10)
[desktop]     at Module.load (node:internal/modules/cjs/loader:1427:32)
[desktop]     at Module._load (node:internal/modules/cjs/loader:1250:12)
[desktop]     at TracingChannel.traceSync (node:diagnostics_channel:322:14)
[desktop]     at wrapModuleLoad (node:internal/modules/cjs/loader:235:24)
[desktop]     at Module.require (node:internal/modules/cjs/loader:1449:12)
[desktop]     at require (node:internal/modules/helpers:135:16)
[desktop] 
[desktop] Node.js v24.3.0
[desktop]  ELIFECYCLE  Command failed with exit code 1.
[desktop] pnpm run dev:desktop exited with code 1
[chat]  ⚠ Warning: Next.js inferred your workspace root, but it may not be correct.
[chat]  We detected multiple lockfiles and selected the directory of /Users/arhansubasi/recoder.xyz/pnpm-lock.yaml as the root directory.
[chat]  To silence this warning, set `outputFileTracingRoot` in your Next.js config, or consider removing one of the lockfiles if it's not needed.
[chat]    See https://nextjs.org/docs/app/api-reference/config/next-config-js/output#caveats for more information.
[chat]  Detected additional lockfiles: 
[chat]    * /Users/arhansubasi/recoder.xyz/recoder-chat/package-lock.json
[chat] 
[web]  ⚠ Port 3000 is in use, trying 3001 instead.
[web]    ▲ Next.js 15.1.4
[web]    - Local:        http://localhost:3001
[web]    - Network:      http://192.168.1.7:3001
[web]    - Environments: .env.local, .env
[web]    - Experiments (use with caution):
[web]      · staleTimes
[web] 
[web]  ✓ Starting...
[chat]  ⚠ Port 3000 is in use by process 64800, using available port 3002 instead.
[engine] /Users/arhansubasi/recoder.xyz/production-engine/src/services/openrouter-service.ts:149
[engine]       throw new Error('OPENROUTER_API_KEY environment variable is required');
[engine]             ^
[engine] 
[engine] 
[engine] Error: OPENROUTER_API_KEY environment variable is required
[engine]     at OpenRouterService.loadConfig (/Users/arhansubasi/recoder.xyz/production-engine/src/services/openrouter-service.ts:149:13)
[engine]     at new OpenRouterService (/Users/arhansubasi/recoder.xyz/production-engine/src/services/openrouter-service.ts:141:24)
[engine]     at <anonymous> (/Users/arhansubasi/recoder.xyz/production-engine/src/services/openrouter-service.ts:586:34)
[engine]     at Object.<anonymous> (/Users/arhansubasi/recoder.xyz/production-engine/src/services/openrouter-service.ts:586:38)
[engine]     at Module._compile (node:internal/modules/cjs/loader:1692:14)
[engine]     at Object.transformer (/Users/arhansubasi/recoder.xyz/node_modules/.pnpm/tsx@4.20.3/node_modules/tsx/dist/register-D46fvsV_.cjs:3:1104)
[engine]     at Module.load (node:internal/modules/cjs/loader:1427:32)
[engine]     at Module._load (node:internal/modules/cjs/loader:1250:12)
[engine]     at TracingChannel.traceSync (node:diagnostics_channel:322:14)
[engine]     at wrapModuleLoad (node:internal/modules/cjs/loader:235:24)
[engine] 
[engine] Node.js v24.3.0
[engine]  ELIFECYCLE  Command failed with exit code 1.
[backend] [2025-08-25 03:40:45] info: Prisma initialized with optimized configuration {"service":"craft-code-backend"}
[backend] [2025-08-25 03:40:45] info: Database connection pools initialized successfully {"service":"craft-code-backend"}
[backend] [2025-08-25 03:40:45] info: Database metrics collection started {"service":"craft-code-backend"}
[engine] node:internal/modules/cjs/loader:1372
[engine]   throw err;
[engine]   ^
[engine] 
[engine] Error: Cannot find module '/Users/arhansubasi/recoder.xyz/production-engine/src/server.js'
[engine]     at Module._resolveFilename (node:internal/modules/cjs/loader:1369:15)
[engine]     at defaultResolveImpl (node:internal/modules/cjs/loader:1025:19)
[engine]     at resolveForCJSWithHooks (node:internal/modules/cjs/loader:1030:22)
[engine]     at Module._load (node:internal/modules/cjs/loader:1179:37)
[engine]     at TracingChannel.traceSync (node:diagnostics_channel:322:14)
[engine]     at wrapModuleLoad (node:internal/modules/cjs/loader:235:24)
[engine]     at Module.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:152:5)
[engine]     at node:internal/main/run_main_module:33:47 {
[engine]   code: 'MODULE_NOT_FOUND',
[engine]   requireStack: []
[engine] }
[engine] 
[engine] Node.js v24.3.0
[engine]  ELIFECYCLE  Command failed with exit code 1.
[engine] pnpm run dev:engine exited with code 1
[backend] [2025-08-25 03:40:45] info: Registered AI provider: OpenRouter {"service":"craft-code-backend","providerId":"openrouter","modelCount":5,"features":["streaming","functionCalling","imageAnalysis","codeGeneration","multimodal","reasoning","customModels"]}
[backend] [2025-08-25 03:40:45] info: Registered AI provider: Anthropic Claude {"service":"craft-code-backend","providerId":"anthropic","modelCount":2,"features":["streaming","functionCalling","imageAnalysis","codeGeneration","multimodal","reasoning"]}
[backend] [2025-08-25 03:40:45] info: Registered AI provider: Google Gemini {"service":"craft-code-backend","providerId":"gemini","modelCount":2,"features":["streaming","functionCalling","imageAnalysis","codeGeneration","multimodal","reasoning","fineTuning","customModels"]}
[backend] [2025-08-25 03:40:45] info: Registered AI provider: Groq {"service":"craft-code-backend","providerId":"groq","modelCount":2,"features":["streaming","functionCalling","codeGeneration"]}
[backend] [2025-08-25 03:40:45] info: Registered AI provider: DeepSeek {"service":"craft-code-backend","providerId":"deepseek","modelCount":1,"features":["streaming","codeGeneration","reasoning","fineTuning"]}
[backend] [2025-08-25 03:40:45] info: Registered AI provider: Ollama {"service":"craft-code-backend","providerId":"ollama","modelCount":2,"features":["streaming","codeGeneration","fineTuning","customModels"]}
[backend] [2025-08-25 03:40:45] info: Registered AI provider: OpenRouter {"service":"craft-code-backend","providerId":"openrouter","modelCount":3,"features":["streaming","functionCalling","imageAnalysis","codeGeneration","multimodal","reasoning","customModels"]}
[backend] [2025-08-25 03:40:45] info: Started health monitoring for AI providers {"service":"craft-code-backend"}
[backend] [2025-08-25 03:40:45] info: Cost tracking started {"service":"craft-code-backend"}
[backend] [2025-08-25 03:40:45] info: Budget monitoring started {"service":"craft-code-backend"}
[backend] [2025-08-25 03:40:45] info: Cost prediction models loaded {"service":"craft-code-backend"}
[backend] [2025-08-25 03:40:45] info: Routing AI request with cost optimization {"service":"craft-code-backend","userId":"health-check","taskType":"text-generation","complexity":"simple"}
[backend] [2025-08-25 03:40:45] info: Routing AI request with cost optimization {"service":"craft-code-backend","userId":"health-check","taskType":"text-generation","complexity":"simple"}
[backend] [2025-08-25 03:40:45] info: Routing AI request with cost optimization {"service":"craft-code-backend","userId":"health-check","taskType":"text-generation","complexity":"simple"}
[backend] [2025-08-25 03:40:45] info: Routing AI request with cost optimization {"service":"craft-code-backend","userId":"health-check","taskType":"text-generation","complexity":"simple"}
[backend] [2025-08-25 03:40:45] info: Routing AI request with cost optimization {"service":"craft-code-backend","userId":"health-check","taskType":"text-generation","complexity":"simple"}
[backend] [2025-08-25 03:40:45] info: Routing AI request with cost optimization {"service":"craft-code-backend","userId":"health-check","taskType":"text-generation","complexity":"simple"}
[backend] [2025-08-25 03:40:45] info: Intelligent failover monitoring started {"service":"craft-code-backend"}
[backend] [2025-08-25 03:40:45] info: Predictive analysis started {"service":"craft-code-backend"}
[chat]    ▲ Next.js 15.5.0
[chat]    - Local:        http://localhost:3002
[chat]    - Network:      http://192.168.1.7:3002
[chat]    - Environments: .env.local, .env
[chat] 
[chat]  ✓ Starting...
[backend] [2025-08-25 03:40:45] info: Cost optimization decision {"service":"craft-code-backend","userId":"health-check","provider":"deepseek","savings":0.00014900000000000002,"reasoning":"Applied \"Budget Protection Mode\" rule: Selected deepseek for 75000000.0% cost efficiency with 75.0% quality score"}
[backend] [2025-08-25 03:40:45] info: Cost optimization decision {"service":"craft-code-backend","userId":"health-check","provider":"deepseek","savings":0.00014900000000000002,"reasoning":"Applied \"Budget Protection Mode\" rule: Selected deepseek for 75000000.0% cost efficiency with 75.0% quality score"}
[backend] [2025-08-25 03:40:45] info: Cost optimization decision {"service":"craft-code-backend","userId":"health-check","provider":"deepseek","savings":0.00014900000000000002,"reasoning":"Applied \"Budget Protection Mode\" rule: Selected deepseek for 75000000.0% cost efficiency with 75.0% quality score"}
[backend] [2025-08-25 03:40:45] info: Cost optimization decision {"service":"craft-code-backend","userId":"health-check","provider":"deepseek","savings":0.00014900000000000002,"reasoning":"Applied \"Budget Protection Mode\" rule: Selected deepseek for 75000000.0% cost efficiency with 75.0% quality score"}
[backend] [2025-08-25 03:40:45] info: Cost optimization decision {"service":"craft-code-backend","userId":"health-check","provider":"deepseek","savings":0.00014900000000000002,"reasoning":"Applied \"Budget Protection Mode\" rule: Selected deepseek for 75000000.0% cost efficiency with 75.0% quality score"}
[backend] [2025-08-25 03:40:45] info: Cost optimization decision {"service":"craft-code-backend","userId":"health-check","provider":"deepseek","savings":0.00014900000000000002,"reasoning":"Applied \"Budget Protection Mode\" rule: Selected deepseek for 75000000.0% cost efficiency with 75.0% quality score"}
[mobile] Starting Metro Bundler
[backend] [2025-08-25 03:40:45] warn: Failed to store health data: {"service":"craft-code-backend"}
[backend] [2025-08-25 03:40:45] warn: Failed to store health data: {"service":"craft-code-backend"}
[backend] [2025-08-25 03:40:45] warn: Failed to store health data: {"service":"craft-code-backend"}
[backend] [2025-08-25 03:40:45] warn: Failed to store health data: {"service":"craft-code-backend"}
[backend] [2025-08-25 03:40:45] warn: Failed to store health data: {"service":"craft-code-backend"}
[backend] [2025-08-25 03:40:45] warn: Failed to store health data: {"service":"craft-code-backend"}
[backend] [2025-08-25 03:40:45] info: Failover event stored {"service":"craft-code-backend","eventId":"failover_1756082445881_oj82wu0va4","source":"openrouter","target":"anthropic","reason":"Rule: High Error Rate - Success rate 0.0% < 85%"}
[backend] [2025-08-25 03:40:45] info: Failover executed successfully {"service":"craft-code-backend","source":"openrouter","target":"anthropic","rule":"high-error-rate","eventId":"failover_1756082445881_oj82wu0va4"}
[backend] [2025-08-25 03:40:45] info: Failover event stored {"service":"craft-code-backend","eventId":"failover_1756082445882_eumhlwpf19b","source":"anthropic","target":"gemini","reason":"Rule: High Error Rate - Success rate 0.0% < 85%"}
[backend] [2025-08-25 03:40:45] info: Failover executed successfully {"service":"craft-code-backend","source":"anthropic","target":"gemini","rule":"high-error-rate","eventId":"failover_1756082445882_eumhlwpf19b"}
[backend] [2025-08-25 03:40:45] info: Failover event stored {"service":"craft-code-backend","eventId":"failover_1756082445882_v5msxzigzbd","source":"gemini","target":"anthropic","reason":"Rule: High Error Rate - Success rate 0.0% < 85%"}
[backend] [2025-08-25 03:40:45] info: Failover executed successfully {"service":"craft-code-backend","source":"gemini","target":"anthropic","rule":"high-error-rate","eventId":"failover_1756082445882_v5msxzigzbd"}
[backend] [2025-08-25 03:40:45] info: Failover event stored {"service":"craft-code-backend","eventId":"failover_1756082445882_bnyk1ptlike","source":"groq","target":"anthropic","reason":"Rule: High Error Rate - Success rate 0.0% < 85%"}
[backend] [2025-08-25 03:40:45] info: Failover executed successfully {"service":"craft-code-backend","source":"groq","target":"anthropic","rule":"high-error-rate","eventId":"failover_1756082445882_bnyk1ptlike"}
[backend] [2025-08-25 03:40:45] info: Failover event stored {"service":"craft-code-backend","eventId":"failover_1756082445883_190vx3yz8oo","source":"deepseek","target":"anthropic","reason":"Rule: High Error Rate - Success rate 0.0% < 85%"}
[backend] [2025-08-25 03:40:45] info: Failover executed successfully {"service":"craft-code-backend","source":"deepseek","target":"anthropic","rule":"high-error-rate","eventId":"failover_1756082445883_190vx3yz8oo"}
[backend] [2025-08-25 03:40:45] info: Failover event stored {"service":"craft-code-backend","eventId":"failover_1756082445883_lvi72j6bvmf","source":"ollama","target":"anthropic","reason":"Rule: High Error Rate - Success rate 0.0% < 85%"}
[backend] [2025-08-25 03:40:45] info: Failover executed successfully {"service":"craft-code-backend","source":"ollama","target":"anthropic","rule":"high-error-rate","eventId":"failover_1756082445883_lvi72j6bvmf"}
[backend] [2025-08-25 03:40:45] info: Failover event stored {"service":"craft-code-backend","eventId":"failover_1756082445883_m47318qsd3g","source":"openrouter","target":"deepseek","reason":"Rule: Cost Optimization - "}
[backend] [2025-08-25 03:40:45] info: Failover executed successfully {"service":"craft-code-backend","source":"openrouter","target":"deepseek","rule":"cost-optimization","eventId":"failover_1756082445883_m47318qsd3g"}
[backend] [2025-08-25 03:40:45] info: Failover event stored {"service":"craft-code-backend","eventId":"failover_1756082445883_aq8z8zy6hqv","source":"anthropic","target":"deepseek","reason":"Rule: Cost Optimization - "}
[backend] [2025-08-25 03:40:45] info: Failover executed successfully {"service":"craft-code-backend","source":"anthropic","target":"deepseek","rule":"cost-optimization","eventId":"failover_1756082445883_aq8z8zy6hqv"}
[backend] [2025-08-25 03:40:45] info: Failover event stored {"service":"craft-code-backend","eventId":"failover_1756082445883_r6ujtne2tu","source":"gemini","target":"deepseek","reason":"Rule: Cost Optimization - "}
[backend] [2025-08-25 03:40:45] info: Failover executed successfully {"service":"craft-code-backend","source":"gemini","target":"deepseek","rule":"cost-optimization","eventId":"failover_1756082445883_r6ujtne2tu"}
[backend] [2025-08-25 03:40:45] info: Failover event stored {"service":"craft-code-backend","eventId":"failover_1756082445884_6ugsey08zo","source":"groq","target":"deepseek","reason":"Rule: Cost Optimization - "}
[backend] [2025-08-25 03:40:45] info: Failover executed successfully {"service":"craft-code-backend","source":"groq","target":"deepseek","rule":"cost-optimization","eventId":"failover_1756082445884_6ugsey08zo"}
[backend] [2025-08-25 03:40:45] info: Failover event stored {"service":"craft-code-backend","eventId":"failover_1756082445884_qjvmp0z2xwl","source":"deepseek","target":"groq","reason":"Rule: Cost Optimization - "}
[backend] [2025-08-25 03:40:45] info: Failover executed successfully {"service":"craft-code-backend","source":"deepseek","target":"groq","rule":"cost-optimization","eventId":"failover_1756082445884_qjvmp0z2xwl"}
[backend] [2025-08-25 03:40:45] info: Failover event stored {"service":"craft-code-backend","eventId":"failover_1756082445884_06j4no05q5y2","source":"ollama","target":"deepseek","reason":"Rule: Cost Optimization - "}
[backend] [2025-08-25 03:40:45] info: Failover executed successfully {"service":"craft-code-backend","source":"ollama","target":"deepseek","rule":"cost-optimization","eventId":"failover_1756082445884_06j4no05q5y2"}
[backend] [2025-08-25 03:40:45] info: Failover event stored {"service":"craft-code-backend","eventId":"failover_1756082445884_5j7rx52c18t","source":"openrouter","target":"anthropic","reason":"Rule: Quality Degradation - "}
[backend] [2025-08-25 03:40:45] info: Failover executed successfully {"service":"craft-code-backend","source":"openrouter","target":"anthropic","rule":"quality-degradation","eventId":"failover_1756082445884_5j7rx52c18t"}
[backend] [2025-08-25 03:40:45] info: Failover event stored {"service":"craft-code-backend","eventId":"failover_1756082445894_yuwlw8hj7ig","source":"anthropic","target":"gemini","reason":"Rule: Quality Degradation - "}
[backend] [2025-08-25 03:40:45] info: Failover executed successfully {"service":"craft-code-backend","source":"anthropic","target":"gemini","rule":"quality-degradation","eventId":"failover_1756082445894_yuwlw8hj7ig"}
[backend] [2025-08-25 03:40:45] info: Failover event stored {"service":"craft-code-backend","eventId":"failover_1756082445894_4d0n2v9ovam","source":"gemini","target":"anthropic","reason":"Rule: Quality Degradation - "}
[backend] [2025-08-25 03:40:45] info: Failover executed successfully {"service":"craft-code-backend","source":"gemini","target":"anthropic","rule":"quality-degradation","eventId":"failover_1756082445894_4d0n2v9ovam"}
[backend] [2025-08-25 03:40:45] info: Failover event stored {"service":"craft-code-backend","eventId":"failover_1756082445894_yebtbkybyyj","source":"groq","target":"anthropic","reason":"Rule: Quality Degradation - "}
[backend] [2025-08-25 03:40:45] info: Failover executed successfully {"service":"craft-code-backend","source":"groq","target":"anthropic","rule":"quality-degradation","eventId":"failover_1756082445894_yebtbkybyyj"}
[backend] [2025-08-25 03:40:45] info: Failover event stored {"service":"craft-code-backend","eventId":"failover_1756082445894_ehjyhazesgh","source":"deepseek","target":"anthropic","reason":"Rule: Quality Degradation - "}
[backend] [2025-08-25 03:40:45] info: Failover executed successfully {"service":"craft-code-backend","source":"deepseek","target":"anthropic","rule":"quality-degradation","eventId":"failover_1756082445894_ehjyhazesgh"}
[backend] [2025-08-25 03:40:45] info: Failover event stored {"service":"craft-code-backend","eventId":"failover_1756082445894_0xjgjkpnus5","source":"ollama","target":"anthropic","reason":"Rule: Quality Degradation - "}
[backend] [2025-08-25 03:40:45] info: Failover executed successfully {"service":"craft-code-backend","source":"ollama","target":"anthropic","rule":"quality-degradation","eventId":"failover_1756082445894_0xjgjkpnus5"}
[backend] prisma:info Starting a postgresql pool with 17 connections.
[web]  ✓ Ready in 2.2s
[chat]  ✓ Ready in 2.3s
[mobile] Waiting on http://localhost:8081
[mobile] Logs for your project will appear below.
[mobile] Failed to construct transformer:  Error: TreeFS: Could not add directory ../recoder-chat/node_modules/@playwright/test, adding ../recoder-chat/node_modules/@playwright/test/cli.js. ../recoder-chat/node_modules/@playwright/test already exists in the file map as a file.
[mobile]     at TreeFS.bulkAddOrModify (/Users/arhansubasi/recoder.xyz/node_modules/.pnpm/metro-file-map@0.81.5/node_modules/metro-file-map/src/lib/TreeFS.js:301:17)
[mobile]     at FileMap._applyFileDelta (/Users/arhansubasi/recoder.xyz/node_modules/.pnpm/metro-file-map@0.81.5/node_modules/metro-file-map/src/index.js:444:16)
[mobile]     at processTicksAndRejections (node:internal/process/task_queues:105:5)
[mobile]     at /Users/arhansubasi/recoder.xyz/node_modules/.pnpm/metro-file-map@0.81.5/node_modules/metro-file-map/src/index.js:253:9
[mobile]     at DependencyGraph.ready (/Users/arhansubasi/recoder.xyz/node_modules/.pnpm/metro@0.81.5_bufferutil@4.0.9_utf-8-validate@5.0.10/node_modules/metro/src/node-haste/DependencyGraph.js:86:5)
[mobile]     at Bundler.ready (/Users/arhansubasi/recoder.xyz/node_modules/.pnpm/metro@0.81.5_bufferutil@4.0.9_utf-8-validate@5.0.10/node_modules/metro/src/Bundler.js:56:5)
[mobile]     at IncrementalBundler.ready (/Users/arhansubasi/recoder.xyz/node_modules/.pnpm/metro@0.81.5_bufferutil@4.0.9_utf-8-validate@5.0.10/node_modules/metro/src/IncrementalBundler.js:266:5)
[mobile]     at Server.ready (/Users/arhansubasi/recoder.xyz/node_modules/.pnpm/metro@0.81.5_bufferutil@4.0.9_utf-8-validate@5.0.10/node_modules/metro/src/Server.js:1151:5)
[mobile] 
[mobile] Metro error: Cannot read properties of undefined (reading 'get')
[mobile] 
[mobile]   TypeError: Cannot read properties of undefined (reading 'get')
[mobile]     at getOrCreateMap (/Users/arhansubasi/recoder.xyz/node_modules/.pnpm/metro@0.81.5_bufferutil@4.0.9_utf-8-validate@5.0.10/node_modules/metro/src/node-haste/DependencyGraph.js:20:20)
[mobile]     at DependencyGraph.resolveDependency (/Users/arhansubasi/recoder.xyz/node_modules/.pnpm/metro@0.81.5_bufferutil@4.0.9_utf-8-validate@5.0.10/node_modules/metro/src/node-haste/DependencyGraph.js:239:25)
[mobile]     at /Users/arhansubasi/recoder.xyz/node_modules/.pnpm/metro@0.81.5_bufferutil@4.0.9_utf-8-validate@5.0.10/node_modules/metro/src/lib/transformHelpers.js:165:21
[mobile]     at Server._resolveRelativePath (/Users/arhansubasi/recoder.xyz/node_modules/.pnpm/metro@0.81.5_bufferutil@4.0.9_utf-8-validate@5.0.10/node_modules/metro/src/Server.js:1104:12)
[mobile]     at MetroBundlerDevServer.resolveRelativePathAsync (/Users/arhansubasi/recoder.xyz/node_modules/.pnpm/@expo+cli@0.22.26_bufferutil@4.0.9_encoding@0.1.13_utf-8-validate@5.0.10/node_modules/@expo/cli/src/start/server/metro/MetroBundlerDevServer.ts:1750:12)
[mobile]     at MetroBundlerDevServer.metroLoadModuleContents (/Users/arhansubasi/recoder.xyz/node_modules/.pnpm/@expo+cli@0.22.26_bufferutil@4.0.9_encoding@0.1.13_utf-8-validate@5.0.10/node_modules/@expo/cli/src/start/server/metro/MetroBundlerDevServer.ts:516:35)
[mobile]     at MetroBundlerDevServer.ssrLoadModuleContents (/Users/arhansubasi/recoder.xyz/node_modules/.pnpm/@expo+cli@0.22.26_bufferutil@4.0.9_encoding@0.1.13_utf-8-validate@5.0.10/node_modules/@expo/cli/src/start/server/metro/MetroBundlerDevServer.ts:590:48)
[mobile]     at MetroBundlerDevServer.metroImportAsArtifactsAsync (/Users/arhansubasi/recoder.xyz/node_modules/.pnpm/@expo+cli@0.22.26_bufferutil@4.0.9_encoding@0.1.13_utf-8-validate@5.0.10/node_modules/@expo/cli/src/start/server/metro/MetroBundlerDevServer.ts:444:21)
[mobile]     at MetroBundlerDevServer.getStaticResourcesAsync (/Users/arhansubasi/recoder.xyz/node_modules/.pnpm/@expo+cli@0.22.26_bufferutil@4.0.9_encoding@0.1.13_utf-8-validate@5.0.10/node_modules/@expo/cli/src/start/server/metro/MetroBundlerDevServer.ts:325:12)
[mobile]     at async Promise.all (index 0)
[mobile] 
[mobile] Metro error: Cannot read properties of undefined (reading 'get')
[mobile] 
[mobile]   TypeError: Cannot read properties of undefined (reading 'get')
[mobile]     at getOrCreateMap (/Users/arhansubasi/recoder.xyz/node_modules/.pnpm/metro@0.81.5_bufferutil@4.0.9_utf-8-validate@5.0.10/node_modules/metro/src/node-haste/DependencyGraph.js:20:20)
[mobile]     at DependencyGraph.resolveDependency (/Users/arhansubasi/recoder.xyz/node_modules/.pnpm/metro@0.81.5_bufferutil@4.0.9_utf-8-validate@5.0.10/node_modules/metro/src/node-haste/DependencyGraph.js:239:25)
[mobile]     at /Users/arhansubasi/recoder.xyz/node_modules/.pnpm/metro@0.81.5_bufferutil@4.0.9_utf-8-validate@5.0.10/node_modules/metro/src/lib/transformHelpers.js:165:21
[mobile]     at Server._resolveRelativePath (/Users/arhansubasi/recoder.xyz/node_modules/.pnpm/metro@0.81.5_bufferutil@4.0.9_utf-8-validate@5.0.10/node_modules/metro/src/Server.js:1104:12)
[mobile]     at MetroBundlerDevServer.resolveRelativePathAsync (/Users/arhansubasi/recoder.xyz/node_modules/.pnpm/@expo+cli@0.22.26_bufferutil@4.0.9_encoding@0.1.13_utf-8-validate@5.0.10/node_modules/@expo/cli/src/start/server/metro/MetroBundlerDevServer.ts:1750:12)
[mobile]     at MetroBundlerDevServer.metroLoadModuleContents (/Users/arhansubasi/recoder.xyz/node_modules/.pnpm/@expo+cli@0.22.26_bufferutil@4.0.9_encoding@0.1.13_utf-8-validate@5.0.10/node_modules/@expo/cli/src/start/server/metro/MetroBundlerDevServer.ts:516:35)
[mobile]     at MetroBundlerDevServer.ssrLoadModuleContents (/Users/arhansubasi/recoder.xyz/node_modules/.pnpm/@expo+cli@0.22.26_bufferutil@4.0.9_encoding@0.1.13_utf-8-validate@5.0.10/node_modules/@expo/cli/src/start/server/metro/MetroBundlerDevServer.ts:590:48)
[mobile]     at MetroBundlerDevServer.metroImportAsArtifactsAsync (/Users/arhansubasi/recoder.xyz/node_modules/.pnpm/@expo+cli@0.22.26_bufferutil@4.0.9_encoding@0.1.13_utf-8-validate@5.0.10/node_modules/@expo/cli/src/start/server/metro/MetroBundlerDevServer.ts:444:21)
[mobile]     at MetroBundlerDevServer.getStaticResourcesAsync (/Users/arhansubasi/recoder.xyz/node_modules/.pnpm/@expo+cli@0.22.26_bufferutil@4.0.9_encoding@0.1.13_utf-8-validate@5.0.10/node_modules/@expo/cli/src/start/server/metro/MetroBundlerDevServer.ts:325:12)
[mobile]     at async Promise.all (index 0)
