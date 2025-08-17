/Users/arhansubasi/.zshrc:source:12: no such file or directory: /opt/homebrew/opt/powerlevel10k/powerlevel10k.zsh-theme
[oh-my-zsh] theme 'powerlevel10k' not found
arhansubasi@Arhan-MacBook-Air recoder.xyz % cd packages
arhansubasi@Arhan-MacBook-Air packages % cd cli
arhansubasi@Arhan-MacBook-Air cli % npm run build

> @recoder/cli@1.0.0 build
> tsc -p tsconfig.build.json

arhansubasi@Arhan-MacBook-Air cli % npm run dev

> @recoder/cli@1.0.0 dev
> tsx watch src/index.ts

[WARN] Configuration warnings: No API keys configured. Only Ollama local models will be available.
[INFO] Configuration recommendations: Configure OPENROUTER_API_KEY for access to all models through a single API
[INFO] ✅ Recoder AI configured: 0 providers, $10 daily budget, quality threshold 7.5
[INFO] ✅ Initialized ollama API handler
[INFO] 🚀 Unified API adapter initialized with 1 handlers
ℹ Initialized tracking for 8 models
ℹ Initialized availability tracking for 8 models across 4 regions
ℹ Initialized latency monitoring for 8 models
ℹ Initialized pricing data for 6 models
ℹ Initialized 2 default budget configurations
ℹ Initialized error tracking for 8 models
ℹ Initialized retry policies for 1 models
ℹ Initialized 4 notification channels
ℹ Initialized 3 notification templates
ℹ Initialized 3 default escalation policies
ℹ Initialized 1 on-call schedules
ℹ Initialized 4 notification channels
ℹ Initialized 3 notification templates
ℹ Initialized 3 default escalation policies
ℹ Initialized 1 on-call schedules
ℹ Initialized 4 default alert rules
ℹ Initialized tracking for 8 models
ℹ Initialized availability tracking for 8 models across 4 regions
ℹ Initialized latency monitoring for 8 models
ℹ Initialized pricing data for 6 models
ℹ Initialized 2 default budget configurations
ℹ Initialized error tracking for 8 models
ℹ Initialized retry policies for 1 models
ℹ Initialized 4 notification channels
ℹ Initialized 3 notification templates
ℹ Initialized 3 default escalation policies
ℹ Initialized 1 on-call schedules
ℹ Initialized 4 default alert rules
ℹ Model health monitoring components initialized
[INFO] 🔧 Initializing package integrations...
[INFO] ✅ Recoder CLI Router initialized successfully
[INFO] 🚀 Initialized with latest AI model rankings:
[INFO]    Claude Sonnet 4: 594B tokens, 28% improvement, 10/10 coding
[INFO]    Gemini 2.5 Flash: 308B tokens, 17% improvement, 8/10 coding (FREE)
[INFO]    DeepSeek V3: 213B tokens, 7% improvement, 9/10 coding (FREE)
[INFO]    Qwen3 Coder: 89.9B tokens, perfect 10/10 coding score (FREE)
[INFO]    Kimi K2: 45.1B tokens, 17% improvement, 7/10 coding
[INFO] ✅ Initialized ollama provider
[WARN] ⚠️ claude provider not available (missing API key)
[WARN] ⚠️ gemini provider not available (missing API key)
[WARN] ⚠️ groq provider not available (missing API key)
[WARN] ⚠️ mistral provider not available (missing API key)
[WARN] ⚠️ perplexity provider not available (missing API key)
[WARN] ⚠️ cohere provider not available (missing API key)
[WARN] ⚠️ huggingface provider not available (missing API key)
[WARN] ⚠️ openrouter provider not available (missing API key)
[WARN] ⚠️ together provider not available (missing API key)
[INFO] ✅ AI Hub initialized with 1 providers: ollama
[INFO] ✅ Initialized unified API handler: ollama
[INFO] ✅ Unified API initialized with 1 handlers
██████  ███████  ██████  ██████  ██████  ███████ ██████ 
██   ██ ██      ██      ██    ██ ██   ██ ██      ██   ██
██████  █████   ██      ██    ██ ██   ██ █████   ██████ 
██   ██ ██      ██      ██    ██ ██   ██ ██      ██   ██
██   ██ ███████  ██████  ██████  ██████  ███████ ██   ██

   ╭──────────────────────────────────────────────────────────────────────────────╮
   │                                                                              │
   │   🚀 AI-powered development platform with production-ready code generation   │
   │             Generate real working code, not mock implementations             │
   │                                                                              │
   ╰──────────────────────────────────────────────────────────────────────────────╯

[INFO] 🤖 Initialized Blockchain Agent
[INFO] 🤖 Initialized Web Agent
[INFO] 🤖 Initialized Mobile Agent
[INFO] 🤖 Initialized Backend Agent
[INFO] 🤖 Initialized AI Agent
[INFO] 🤖 Initialized Security Agent
[INFO] 🤖 Initialized DevOps Agent
[INFO] ✅ Initialized 7 specialized AI agents
[INFO] Initializing AI Model Hub...
[ERROR] Failed to initialize AI Model Hub {
  error: Error: No providers were successfully initialized
      at AIModelHub.initializeProviders (/Users/arhansubasi/recoder.xyz/packages/cli/src/services/ai-models/ai-hub.ts:709:13)
      at AIModelHub.initialize (/Users/arhansubasi/recoder.xyz/packages/cli/src/services/ai-models/ai-hub.ts:91:18)
      at setupProductionCommands (/Users/arhansubasi/recoder.xyz/packages/cli/src/index.ts:118:22)
      at main (/Users/arhansubasi/recoder.xyz/packages/cli/src/index.ts:1247:11)
      at chalk (/Users/arhansubasi/recoder.xyz/packages/cli/src/index.ts:1371:3)
      at Object.<anonymous> (/Users/arhansubasi/recoder.xyz/packages/cli/src/index.ts:1377:16)
      at Module._compile (node:internal/modules/cjs/loader:1692:14)
      at Object.transformer (/Users/arhansubasi/recoder.xyz/node_modules/.pnpm/tsx@4.20.3/node_modules/tsx/dist/register-D46fvsV_.cjs:3:1104)
      at Module.load (node:internal/modules/cjs/loader:1427:32)
      at Module._load (node:internal/modules/cjs/loader:1250:12)
}
⚠ AI Model Hub initialization failed:
warn: AI Model Hub initialization failed: No providers were successfully initialized {"stack":"Error: No providers were successfully initialized\n    at AIModelHub.initializeProviders (/Users/arhansubasi/recoder.xyz/packages/cli/src/services/ai-models/ai-hub.ts:709:13)\n    at AIModelHub.initialize (/Users/arhansubasi/recoder.xyz/packages/cli/src/services/ai-models/ai-hub.ts:91:18)\n    at setupProductionCommands (/Users/arhansubasi/recoder.xyz/packages/cli/src/index.ts:118:22)\n    at main (/Users/arhansubasi/recoder.xyz/packages/cli/src/index.ts:1247:11)\n    at chalk (/Users/arhansubasi/recoder.xyz/packages/cli/src/index.ts:1371:3)\n    at Object.<anonymous> (/Users/arhansubasi/recoder.xyz/packages/cli/src/index.ts:1377:16)\n    at Module._compile (node:internal/modules/cjs/loader:1692:14)\n    at Object.transformer (/Users/arhansubasi/recoder.xyz/node_modules/.pnpm/tsx@4.20.3/node_modules/tsx/dist/register-D46fvsV_.cjs:3:1104)\n    at Module.load (node:internal/modules/cjs/loader:1427:32)\n    at Module._load (node:internal/modules/cjs/loader:1250:12)","timestamp":"2025-08-17T21:46:36.521Z"}
ℹ AI Collaboration Agent created: Claude Reviewer (ai-agent-8c6b5653-e053-472b-b76d-e26ff213d0b5)
[INFO] AI Agent registered: Claude Reviewer (ai-agent-8c6b5653-e053-472b-b76d-e26ff213d0b5) 
ℹ AI Collaboration Agent created: GPT Assistant (ai-agent-18ae982c-5730-402c-bb79-f21f44f96a10)
[INFO] AI Agent registered: GPT Assistant (ai-agent-18ae982c-5730-402c-bb79-f21f44f96a10) 
ℹ AI Collaboration Agent created: DeepSeek Optimizer (ai-agent-e2322a03-9579-4375-bc26-8569ef2f1769)
[INFO] AI Agent registered: DeepSeek Optimizer (ai-agent-e2322a03-9579-4375-bc26-8569ef2f1769) 
ℹ AI Collaboration Agent created: Security Sentinel (ai-agent-69f2550c-fa70-424b-96de-a370aedb2129)
[INFO] AI Agent registered: Security Sentinel (ai-agent-69f2550c-fa70-424b-96de-a370aedb2129) 
[INFO] AI Agent team created: Full Stack Team with 3 agents 
[INFO] AI Agent team created: Security Team with 2 agents 
[INFO] AI Agent Manager initialized 
🚀 Initializing Recoder Model Health Monitoring System...
📁 Loaded 7 cache entries from disk
ℹ Starting comprehensive model health monitoring...
ℹ Starting availability monitoring...
ℹ Starting latency monitoring...
ℹ Latency monitoring started successfully
ℹ Starting cost tracking...
ℹ Starting error detection...
ℹ Error detection started successfully
ℹ Starting availability monitoring...
ℹ Starting latency monitoring...
ℹ Latency monitoring started successfully
ℹ Starting cost tracking...
ℹ Starting error detection...
ℹ Error detection started successfully
ℹ Starting alert management system...
ℹ Starting notification service...
ℹ Cost tracking started successfully
ℹ Cost tracking started successfully
ℹ Notification service started successfully
ℹ Starting escalation policy management...
ℹ Escalation policy management started successfully
ℹ Alert management system started successfully
✗ Uncaught Exception: listen EADDRINUSE: address already in use :::8081
ℹ Quality assessor initialized successfully
ℹ Quality assessor initialized successfully
ℹ Availability monitoring started successfully
ℹ Model health monitoring started successfully
ℹ Availability monitoring started successfully
✅ Model Health Monitoring System initialized successfully
📊 Monitoring Features:
  • Real-time availability monitoring across regions
  • Latency tracking with percentile analysis
  • Cost monitoring with budget alerts
  • Error pattern detection with circuit breakers
  • Predictive failure detection
  • Multi-channel alerting with escalation
  • Comprehensive health scoring
ℹ Analytics and monitoring system initialized
Usage: recoder [options] [command]

AI-powered development platform with production-ready code generation

Options:
  -v, --version                         display version number
  --verbose                             enable verbose logging
  --no-color                            disable colored output
  -h, --help                            display help for command

Commands:
  generate|gen [options] <description>  Generate REAL, production-ready code using AI (not mock!)
  plan [options] <description>          Create a detailed project plan with real architecture
  validate [options] <project-path>     Validate that generated code has REAL functionality
  chat|c [options]                      Interactive AI chat for development assistance
  agent [options] [task]                Work with specialized AI agents
  orchestrate [options] <description>   🧠 Test the Master AI Orchestrator for intelligent model selection
  context [options]                     Analyze and manage project context
  auth                                  Manage user authentication across all recoder.xyz platforms
  ollama                                🦙 Manage local AI models with Ollama
  integration-status|status [options]   📊 Show integration status of all monorepo packages
  web                                   Manage recoder web dashboard
  assistant|ai                          AI-powered development assistant
  plugins|plugin                        Manage recoder plugins
  ai [options]                          🤖 AI-powered development tools with intelligent model selection
  generate|gen [options] <description>  🚀 Quick code generation with optimal AI model selection
  chat [options] [message]              💬 Quick AI chat with intelligent context awareness
  explain|ex [options] <code-or-file>   💡 Explain code with AI assistance
  review|rv [options] [files...]        🔍 AI-powered code review
  consensus [options] <prompt>          🏆 Generate code with multi-model consensus (Triple-Verified AI)
  collaborate [options]                 🤝 Start real-time collaborative development (KILLER FEATURE vs Cursor!)
  auto-code|ac [options] [objective]    🚀 Revolutionary auto-coding with AI orchestration (KILLER FEATURE)
  vibe                                  🎯 Vibe Code Mode - AI-powered live coding assistance
  port-fix [options]                    🔧 Detect and resolve port conflicts automatically
  refactor [options] <description>      🔄 Repository-wide refactoring with 1M+ token context (beats Cursor!)
  analytics|stats [options]             View system analytics and performance metrics
  scan|security [options] [path]        Security scanning and vulnerability assessment
  help [command]                        display help for command
^R  
^R
arhansubasi@Arhan-MacBook-Air cli % npm run
Lifecycle scripts included in @recoder/cli@1.0.0:
  start
    node dist/packages/cli/src/index.js
  test
    jest
  prepublishOnly
    npm run build
available via `npm run`:
  build
    tsc -p tsconfig.build.json
  build:watch
    tsc --watch
  dev
    tsx watch src/index.ts
  test:watch
    jest --watch
  test:coverage
    jest --coverage
  lint
    eslint src/**/*.ts
  lint:fix
    eslint src/**/*.ts --fix
  typecheck
    tsc --noEmit
  clean
    rimraf dist
arhansubasi@Arhan-MacBook-Air cli % npm run start

> @recoder/cli@1.0.0 start
> node dist/packages/cli/src/index.js

[WARN] Configuration warnings: No API keys configured. Only Ollama local models will be available.
[INFO] Configuration recommendations: Configure OPENROUTER_API_KEY for access to all models through a single API
[INFO] ✅ Recoder AI configured: 0 providers, $10 daily budget, quality threshold 7.5
[INFO] ✅ Initialized ollama API handler
[INFO] 🚀 Unified API adapter initialized with 1 handlers
ℹ Initialized tracking for 8 models
ℹ Initialized availability tracking for 8 models across 4 regions
ℹ Initialized latency monitoring for 8 models
ℹ Initialized pricing data for 6 models
ℹ Initialized 2 default budget configurations
ℹ Initialized error tracking for 8 models
ℹ Initialized retry policies for 1 models
ℹ Initialized 4 notification channels
ℹ Initialized 3 notification templates
ℹ Initialized 3 default escalation policies
ℹ Initialized 1 on-call schedules
ℹ Initialized 4 notification channels
ℹ Initialized 3 notification templates
ℹ Initialized 3 default escalation policies
ℹ Initialized 1 on-call schedules
ℹ Initialized 4 default alert rules
ℹ Initialized tracking for 8 models
ℹ Initialized availability tracking for 8 models across 4 regions
ℹ Initialized latency monitoring for 8 models
ℹ Initialized pricing data for 6 models
ℹ Initialized 2 default budget configurations
ℹ Initialized error tracking for 8 models
ℹ Initialized retry policies for 1 models
ℹ Initialized 4 notification channels
ℹ Initialized 3 notification templates
ℹ Initialized 3 default escalation policies
ℹ Initialized 1 on-call schedules
ℹ Initialized 4 default alert rules
ℹ Model health monitoring components initialized
node:internal/modules/cjs/loader:657
      throw e;
      ^

Error [ERR_PACKAGE_PATH_NOT_EXPORTED]: Package subpath './types/ai-models' is not defined by "exports" in /Users/arhansubasi/recoder.xyz/packages/cli/node_modules/@recoder/shared/package.json
    at exportsNotFound (node:internal/modules/esm/resolve:313:10)
    at packageExportsResolve (node:internal/modules/esm/resolve:660:9)
    at resolveExports (node:internal/modules/cjs/loader:650:36)
    at Module._findPath (node:internal/modules/cjs/loader:717:31)
    at Module._resolveFilename (node:internal/modules/cjs/loader:1355:27)
    at defaultResolveImpl (node:internal/modules/cjs/loader:1025:19)
    at resolveForCJSWithHooks (node:internal/modules/cjs/loader:1030:22)
    at Module._load (node:internal/modules/cjs/loader:1179:37)
    at TracingChannel.traceSync (node:diagnostics_channel:322:14)
    at wrapModuleLoad (node:internal/modules/cjs/loader:235:24) {
  code: 'ERR_PACKAGE_PATH_NOT_EXPORTED'
}

arhansubasi@Arhan-MacBook-Air recoder-cli-router % npm run build

> recoder-cli-router@1.1.5 build
> npm-run-all build:esbuild build:copy


> recoder-cli-router@1.1.5 build:esbuild
> esbuild src/cli.ts --bundle --platform=node --outfile=dist/cli.js --external:vscode --external:@recoder/shared --external:@roo-code/types --external:@musistudio/llms --external:tiktoken --external:node-cache --external:sanitize-filename --external:axios --external:openai --external:@anthropic-ai/sdk --external:@anthropic-ai/vertex-sdk --external:google-auth-library --external:@cerebras/cerebras_cloud_sdk --external:@aws-sdk/client-bedrock-runtime --external:@aws-sdk/credential-providers --external:@mistralai/mistralai --external:@google/genai --external:@lmstudio/sdk --external:@dotenvx/dotenvx --external:dotenv --external:uuid --external:fastify --external:zod


  dist/cli.js  271.7kb

⚡ Done in 35ms

> recoder-cli-router@1.1.5 build:copy
> shx cp ../../node_modules/tiktoken/tiktoken_bg.wasm dist/tiktoken_bg.wasm || shx cp node_modules/tiktoken/tiktoken_bg.wasm dist/tiktoken_bg.wasm || echo 'Warning: tiktoken WASM file not found, skipping copy'

cp: no such file or directory: ../../node_modules/tiktoken/tiktoken_bg.wasm
arhansubasi@Arhan-MacBook-Air recoder-cli-router % npm run dev
npm error Missing script: "dev"
npm error
npm error To see a list of scripts, run:
npm error   npm run
npm error A complete log of this run can be found in: /Users/arhansubasi/.npm/_logs/2025-08-17T21_45_39_537Z-debug-0.log
arhansubasi@Arhan-MacBook-Air recoder-cli-router % npm run start
npm error Missing script: "start"
npm error
npm error Did you mean one of these?
npm error   npm star # Mark your favorite packages
npm error   npm stars # View packages marked as favorites
npm error
npm error To see a list of scripts, run:
npm error   npm run
npm error A complete log of this run can be found in: /Users/arhansubasi/.npm/_logs/2025-08-17T21_45_45_371Z-debug-0.log
arhansubasi@Arhan-MacBook-Air recoder-cli-router % npm run
Lifecycle scripts included in recoder-cli-router@1.1.5:
  publish
    npm publish --access public
available via `npm run`:
  build
    npm-run-all build:esbuild build:copy
  build:esbuild
    esbuild src/cli.ts --bundle --platform=node --outfile=dist/cli.js --external:vscode --external:@recoder/shared --external:@roo-code/types --external:@musistudio/llms --external:tiktoken --external:node-cache --external:sanitize-filename --external:axios --external:openai --external:@anthropic-ai/sdk --external:@anthropic-ai/vertex-sdk --external:google-auth-library --external:@cerebras/cerebras_cloud_sdk --external:@aws-sdk/client-bedrock-runtime --external:@aws-sdk/credential-providers --external:@mistralai/mistralai --external:@google/genai --external:@lmstudio/sdk --external:@dotenvx/dotenvx --external:dotenv --external:uuid --external:fastify --external:zod
  build:copy
    shx cp ../../node_modules/tiktoken/tiktoken_bg.wasm dist/tiktoken_bg.wasm || shx cp node_modules/tiktoken/tiktoken_bg.wasm dist/tiktoken_bg.wasm || echo 'Warning: tiktoken WASM file not found, skipping copy'
  release
    npm-run-all build test:build publish
  test:build
    node dist/cli.js --help || echo 'Build test passed'
arhansubasi@Arhan-MacBook-Air recoder-cli-router % npm run build:esbuild

> recoder-cli-router@1.1.5 build:esbuild
> esbuild src/cli.ts --bundle --platform=node --outfile=dist/cli.js --external:vscode --external:@recoder/shared --external:@roo-code/types --external:@musistudio/llms --external:tiktoken --external:node-cache --external:sanitize-filename --external:axios --external:openai --external:@anthropic-ai/sdk --external:@anthropic-ai/vertex-sdk --external:google-auth-library --external:@cerebras/cerebras_cloud_sdk --external:@aws-sdk/client-bedrock-runtime --external:@aws-sdk/credential-providers --external:@mistralai/mistralai --external:@google/genai --external:@lmstudio/sdk --external:@dotenvx/dotenvx --external:dotenv --external:uuid --external:fastify --external:zod


  dist/cli.js  271.7kb

⚡ Done in 25ms
arhansubasi@Arhan-MacBook-Air recoder-cli-router % npm run release

> recoder-cli-router@1.1.5 release
> npm-run-all build test:build publish


> recoder-cli-router@1.1.5 build
> npm-run-all build:esbuild build:copy


> recoder-cli-router@1.1.5 build:esbuild
> esbuild src/cli.ts --bundle --platform=node --outfile=dist/cli.js --external:vscode --external:@recoder/shared --external:@roo-code/types --external:@musistudio/llms --external:tiktoken --external:node-cache --external:sanitize-filename --external:axios --external:openai --external:@anthropic-ai/sdk --external:@anthropic-ai/vertex-sdk --external:google-auth-library --external:@cerebras/cerebras_cloud_sdk --external:@aws-sdk/client-bedrock-runtime --external:@aws-sdk/credential-providers --external:@mistralai/mistralai --external:@google/genai --external:@lmstudio/sdk --external:@dotenvx/dotenvx --external:dotenv --external:uuid --external:fastify --external:zod


  dist/cli.js  271.7kb

⚡ Done in 28ms

> recoder-cli-router@1.1.5 build:copy
> shx cp ../../node_modules/tiktoken/tiktoken_bg.wasm dist/tiktoken_bg.wasm || shx cp node_modules/tiktoken/tiktoken_bg.wasm dist/tiktoken_bg.wasm || echo 'Warning: tiktoken WASM file not found, skipping copy'

cp: no such file or directory: ../../node_modules/tiktoken/tiktoken_bg.wasm

> recoder-cli-router@1.1.5 test:build
> node dist/cli.js --help || echo 'Build test passed'

Loading performance history...
Loading performance history...
✅ Router initialized ollama handler
🚀 Router AI initialized with 1 handlers

Usage: rcr [command] (Recoder CLI Router)

Commands:
  start         Start Recoder router server 
  stop          Stop Recoder router server
  restart       Restart server
  status        Show server status
  code          Execute claude command
  auth          Manage authentication
  -v, version   Show version information
  -h, help      Show help information

Auth Commands:
  ccr auth login     Login to recoder.xyz
  ccr auth register  Register new account
  ccr auth status    Show auth status
  ccr auth logout    Logout

Example:
  ccr start
  ccr code "Write a Hello World"
  ccr auth login

Build test passed

> recoder-cli-router@1.1.5 publish
> npm publish --access public

npm notice
npm notice 📦  recoder-cli-router@1.1.5
npm notice Tarball Contents
npm notice 619B .dockerignore
npm notice 6.5kB .env.example
npm notice 8.5kB .env.local
npm notice 8.5kB .env.production
npm notice 2.6kB CLAUDE.md
npm notice 1.1kB LICENSE
npm notice 13.3kB README_zh.md
npm notice 12.1kB README.md
npm notice 6.8kB blog/en/maybe-we-can-do-more-with-the-route.md
npm notice 7.1kB blog/en/project-motivation-and-how-it-works.md
npm notice 339.9kB blog/images/alipay.jpg
npm notice 936.8kB blog/images/chrome-devtools.png
npm notice 245.9kB blog/images/chrome-inspect.png
npm notice 361.4kB blog/images/claude-code.png
npm notice 1.0MB blog/images/search.png
npm notice 1.0MB blog/images/webstorm-formate-file.png
npm notice 236.8kB blog/images/wechat_group.jpg
npm notice 111.9kB blog/images/wechat.jpg
npm notice 6.7kB blog/zh/或许我们能在Router中做更多事情.md
npm notice 7.4kB blog/zh/项目初衷及原理.md
npm notice 2.8kB config.example.json
npm notice 92B custom-router.example.js
npm notice 278.2kB dist/cli.js
npm notice 5.6MB dist/tiktoken_bg.wasm
npm notice 1.4kB docker-compose.yml
npm notice 1.5kB dockerfile
npm notice 2.6kB package.json
npm notice 4.0kB src/api/index.ts
npm notice 20.5kB src/api/providers/__tests__/anthropic-vertex.spec.ts
npm notice 8.2kB src/api/providers/__tests__/anthropic.spec.ts
npm notice 9.6kB src/api/providers/__tests__/bedrock-custom-arn.spec.ts
npm notice 16.4kB src/api/providers/__tests__/bedrock-error-handling.spec.ts
npm notice 9.0kB src/api/providers/__tests__/bedrock-inference-profiles.spec.ts
npm notice 9.6kB src/api/providers/__tests__/bedrock-invokedModelId.spec.ts
npm notice 8.7kB src/api/providers/__tests__/bedrock-reasoning.spec.ts
npm notice 6.1kB src/api/providers/__tests__/bedrock-vpc-endpoint.spec.ts
npm notice 18.7kB src/api/providers/__tests__/bedrock.spec.ts
npm notice 4.9kB src/api/providers/__tests__/cerebras.test.ts
npm notice 9.0kB src/api/providers/__tests__/chutes.spec.ts
npm notice 8.6kB src/api/providers/__tests__/claude-code-caching.spec.ts
npm notice 15.7kB src/api/providers/__tests__/claude-code.spec.ts
npm notice 2.0kB src/api/providers/__tests__/constants.spec.ts
npm notice 8.8kB src/api/providers/__tests__/deepseek.spec.ts
npm notice 22.5kB src/api/providers/__tests__/fireworks.test.ts
npm notice 10.1kB src/api/providers/__tests__/gemini-cli.spec.ts
npm notice 8.9kB src/api/providers/__tests__/gemini.spec.ts
npm notice 6.1kB src/api/providers/__tests__/glama.spec.ts
npm notice 4.8kB src/api/providers/__tests__/groq.spec.ts
npm notice 4.4kB src/api/providers/__tests__/lmstudio.spec.ts
npm notice 3.4kB src/api/providers/__tests__/mistral.spec.ts
npm notice 4.2kB src/api/providers/__tests__/ollama.spec.ts
npm notice 13.1kB src/api/providers/__tests__/openai-native.spec.ts
npm notice 5.9kB src/api/providers/__tests__/openai-usage-tracking.spec.ts
npm notice 23.7kB src/api/providers/__tests__/openai.spec.ts
npm notice 9.6kB src/api/providers/__tests__/openrouter.spec.ts
npm notice 6.0kB src/api/providers/__tests__/requesty.spec.ts
npm notice 8.4kB src/api/providers/__tests__/unbound.spec.ts
npm notice 4.5kB src/api/providers/__tests__/vertex.spec.ts
npm notice 8.3kB src/api/providers/__tests__/vscode-lm.spec.ts
npm notice 7.6kB src/api/providers/__tests__/xai.spec.ts
npm notice 6.3kB src/api/providers/anthropic-vertex.ts
npm notice 9.4kB src/api/providers/anthropic.ts
npm notice 3.5kB src/api/providers/base-openai-compatible-provider.ts
npm notice 1.0kB src/api/providers/base-provider.ts
npm notice 45.1kB src/api/providers/bedrock.ts
npm notice 5.1kB src/api/providers/cerebras.ts
npm notice 3.4kB src/api/providers/chutes.ts
npm notice 5.1kB src/api/providers/claude-code.ts
npm notice 230B src/api/providers/constants.ts
npm notice 1.4kB src/api/providers/deepseek.ts
npm notice 2.5kB src/api/providers/fake-ai.ts
npm notice 352B src/api/providers/fetchers/__tests__/fixtures/lmstudio-model-details.json
npm notice 2.0kB src/api/providers/fetchers/__tests__/fixtures/ollama-model-details.json
npm notice 2.1kB src/api/providers/fetchers/__tests__/fixtures/openrouter-model-endpoints.json
npm notice 111.2kB src/api/providers/fetchers/__tests__/fixtures/openrouter-models.json
npm notice 15.8kB src/api/providers/fetchers/__tests__/litellm.spec.ts
npm notice 8.8kB src/api/providers/fetchers/__tests__/lmstudio.test.ts
npm notice 4.8kB src/api/providers/fetchers/__tests__/modelCache.spec.ts
npm notice 7.2kB src/api/providers/fetchers/__tests__/ollama.test.ts
npm notice 8.8kB src/api/providers/fetchers/__tests__/openrouter.spec.ts
npm notice 1.4kB src/api/providers/fetchers/glama.ts
npm notice 4.1kB src/api/providers/fetchers/litellm.ts
npm notice 2.5kB src/api/providers/fetchers/lmstudio.ts
npm notice 5.1kB src/api/providers/fetchers/modelCache.ts
npm notice 2.9kB src/api/providers/fetchers/modelEndpointCache.ts
npm notice 3.3kB src/api/providers/fetchers/ollama.ts
npm notice 7.2kB src/api/providers/fetchers/openrouter.ts
npm notice 1.8kB src/api/providers/fetchers/requesty.ts
npm notice 1.9kB src/api/providers/fetchers/unbound.ts
npm notice 7.5kB src/api/providers/fireworks.ts
npm notice 13.9kB src/api/providers/gemini-cli.ts
npm notice 7.7kB src/api/providers/gemini.ts
npm notice 4.5kB src/api/providers/glama.ts
npm notice 587B src/api/providers/groq.ts
npm notice 2.1kB src/api/providers/huggingface.ts
npm notice 4.5kB src/api/providers/human-relay.ts
npm notice 1.3kB src/api/providers/index.ts
npm notice 3.6kB src/api/providers/kilocode-openrouter.ts
npm notice 4.2kB src/api/providers/lite-llm.ts
npm notice 5.2kB src/api/providers/lm-studio.ts
npm notice 3.3kB src/api/providers/mistral.ts
npm notice 3.3kB src/api/providers/ollama.ts
npm notice 6.2kB src/api/providers/openai-native.ts
npm notice 14.2kB src/api/providers/openai.ts
npm notice 9.7kB src/api/providers/openrouter.ts
npm notice 5.3kB src/api/providers/requesty.ts
npm notice 2.3kB src/api/providers/router-provider.ts
npm notice 2.3kB src/api/providers/together.ts
npm notice 2.0kB src/api/providers/types.ts
npm notice 5.0kB src/api/providers/unbound.ts
npm notice 1.1kB src/api/providers/vertex.ts
npm notice 20.0kB src/api/providers/vscode-lm.ts
npm notice 3.8kB src/api/providers/xai.ts
npm notice 7.1kB src/api/router-endpoint.ts
npm notice 4.2kB src/api/transform/__tests__/bedrock-converse-format.spec.ts
npm notice 7.3kB src/api/transform/__tests__/gemini-format.spec.ts
npm notice 7.1kB src/api/transform/__tests__/image-cleaning.spec.ts
npm notice 7.9kB src/api/transform/__tests__/mistral-format.spec.ts
npm notice 19.0kB src/api/transform/__tests__/model-params.spec.ts
npm notice 3.4kB src/api/transform/__tests__/openai-format.spec.ts
npm notice 4.0kB src/api/transform/__tests__/r1-format.spec.ts
npm notice 18.4kB src/api/transform/__tests__/reasoning.spec.ts
npm notice 4.0kB src/api/transform/__tests__/simple-format.spec.ts
npm notice 3.3kB src/api/transform/__tests__/stream.spec.ts
npm notice 5.1kB src/api/transform/__tests__/vscode-lm-format.spec.ts
npm notice 5.3kB src/api/transform/bedrock-converse-format.ts
npm notice 39.6kB src/api/transform/cache-strategy/__tests__/cache-strategy.spec.ts
npm notice 5.6kB src/api/transform/cache-strategy/base-strategy.ts
npm notice 10.8kB src/api/transform/cache-strategy/multi-point-strategy.ts
npm notice 1.9kB src/api/transform/cache-strategy/types.ts
npm notice 6.6kB src/api/transform/caching/__tests__/anthropic.spec.ts
npm notice 9.0kB src/api/transform/caching/__tests__/gemini.spec.ts
npm notice 6.7kB src/api/transform/caching/__tests__/vertex.spec.ts
npm notice 1.4kB src/api/transform/caching/anthropic.ts
npm notice 1.2kB src/api/transform/caching/gemini.ts
npm notice 1.8kB src/api/transform/caching/vertex.ts
npm notice 2.4kB src/api/transform/gemini-format.ts
npm notice 1.0kB src/api/transform/image-cleaning.ts
npm notice 3.1kB src/api/transform/mistral-format.ts
npm notice 4.9kB src/api/transform/model-params.ts
npm notice 6.0kB src/api/transform/openai-format.ts
npm notice 3.5kB src/api/transform/r1-format.ts
npm notice 2.0kB src/api/transform/reasoning.ts
npm notice 1.6kB src/api/transform/simple-format.ts
npm notice 600B src/api/transform/stream.ts
npm notice 7.2kB src/api/transform/vscode-lm-format.ts
npm notice 5.8kB src/cli.ts
npm notice 538B src/constants.ts
npm notice 15.2kB src/core/model-router.ts
npm notice 794B src/core/task-persistence/apiMessages.ts
npm notice 3.9kB src/index.ts
npm notice 618B src/integrations/claude-code/message-filter.ts
npm notice 1.2kB src/integrations/claude-code/run.ts
npm notice 794B src/middleware/auth.ts
npm notice 450B src/server.ts
npm notice 12.5kB src/services/backend-client.ts
npm notice 14.9kB src/services/unified-router-ai.ts
npm notice 740B src/shared/vsCodeSelectorUtils.ts
npm notice 815B src/utils/close.ts
npm notice 1.3kB src/utils/codeCommand.ts
npm notice 502B src/utils/commands.ts
npm notice 1.9kB src/utils/index.ts
npm notice 813B src/utils/log.ts
npm notice 2.3kB src/utils/logger.ts
npm notice 1.6kB src/utils/logging.ts
npm notice 2.2kB src/utils/processCheck.ts
npm notice 10.0kB src/utils/router.ts
npm notice 937B src/utils/status.ts
npm notice 498B tsconfig.json
npm notice Tarball Details
npm notice name: recoder-cli-router
npm notice version: 1.1.5
npm notice filename: recoder-cli-router-1.1.5.tgz
npm notice package size: 6.5 MB
npm notice unpacked size: 11.2 MB
npm notice shasum: 8fe71147fedf5cad3146bf8bcfcb6e36418dd8d8
npm notice integrity: sha512-cqNDBORq8Pb0b[...]IrhWFT2xdVzMA==
npm notice total files: 169
npm notice
npm notice Publishing to https://registry.npmjs.org/ with tag latest and public access

> recoder-cli-router@1.1.5 publish
> npm publish --access public

npm notice
npm notice 📦  recoder-cli-router@1.1.5
npm notice Tarball Contents
npm notice 619B .dockerignore
npm notice 6.5kB .env.example
npm notice 8.5kB .env.local
npm notice 8.5kB .env.production
npm notice 2.6kB CLAUDE.md
npm notice 1.1kB LICENSE
npm notice 13.3kB README_zh.md
npm notice 12.1kB README.md
npm notice 6.8kB blog/en/maybe-we-can-do-more-with-the-route.md
npm notice 7.1kB blog/en/project-motivation-and-how-it-works.md
npm notice 339.9kB blog/images/alipay.jpg
npm notice 936.8kB blog/images/chrome-devtools.png
npm notice 245.9kB blog/images/chrome-inspect.png
npm notice 361.4kB blog/images/claude-code.png
npm notice 1.0MB blog/images/search.png
npm notice 1.0MB blog/images/webstorm-formate-file.png
npm notice 236.8kB blog/images/wechat_group.jpg
npm notice 111.9kB blog/images/wechat.jpg
npm notice 6.7kB blog/zh/或许我们能在Router中做更多事情.md
npm notice 7.4kB blog/zh/项目初衷及原理.md
npm notice 2.8kB config.example.json
npm notice 92B custom-router.example.js
npm notice 278.2kB dist/cli.js
npm notice 5.6MB dist/tiktoken_bg.wasm
npm notice 1.4kB docker-compose.yml
npm notice 1.5kB dockerfile
npm notice 2.6kB package.json
npm notice 4.0kB src/api/index.ts
npm notice 20.5kB src/api/providers/__tests__/anthropic-vertex.spec.ts
npm notice 8.2kB src/api/providers/__tests__/anthropic.spec.ts
npm notice 9.6kB src/api/providers/__tests__/bedrock-custom-arn.spec.ts
npm notice 16.4kB src/api/providers/__tests__/bedrock-error-handling.spec.ts
npm notice 9.0kB src/api/providers/__tests__/bedrock-inference-profiles.spec.ts
npm notice 9.6kB src/api/providers/__tests__/bedrock-invokedModelId.spec.ts
npm notice 8.7kB src/api/providers/__tests__/bedrock-reasoning.spec.ts
npm notice 6.1kB src/api/providers/__tests__/bedrock-vpc-endpoint.spec.ts
npm notice 18.7kB src/api/providers/__tests__/bedrock.spec.ts
npm notice 4.9kB src/api/providers/__tests__/cerebras.test.ts
npm notice 9.0kB src/api/providers/__tests__/chutes.spec.ts
npm notice 8.6kB src/api/providers/__tests__/claude-code-caching.spec.ts
npm notice 15.7kB src/api/providers/__tests__/claude-code.spec.ts
npm notice 2.0kB src/api/providers/__tests__/constants.spec.ts
npm notice 8.8kB src/api/providers/__tests__/deepseek.spec.ts
npm notice 22.5kB src/api/providers/__tests__/fireworks.test.ts
npm notice 10.1kB src/api/providers/__tests__/gemini-cli.spec.ts
npm notice 8.9kB src/api/providers/__tests__/gemini.spec.ts
npm notice 6.1kB src/api/providers/__tests__/glama.spec.ts
npm notice 4.8kB src/api/providers/__tests__/groq.spec.ts
npm notice 4.4kB src/api/providers/__tests__/lmstudio.spec.ts
npm notice 3.4kB src/api/providers/__tests__/mistral.spec.ts
npm notice 4.2kB src/api/providers/__tests__/ollama.spec.ts
npm notice 13.1kB src/api/providers/__tests__/openai-native.spec.ts
npm notice 5.9kB src/api/providers/__tests__/openai-usage-tracking.spec.ts
npm notice 23.7kB src/api/providers/__tests__/openai.spec.ts
npm notice 9.6kB src/api/providers/__tests__/openrouter.spec.ts
npm notice 6.0kB src/api/providers/__tests__/requesty.spec.ts
npm notice 8.4kB src/api/providers/__tests__/unbound.spec.ts
npm notice 4.5kB src/api/providers/__tests__/vertex.spec.ts
npm notice 8.3kB src/api/providers/__tests__/vscode-lm.spec.ts
npm notice 7.6kB src/api/providers/__tests__/xai.spec.ts
npm notice 6.3kB src/api/providers/anthropic-vertex.ts
npm notice 9.4kB src/api/providers/anthropic.ts
npm notice 3.5kB src/api/providers/base-openai-compatible-provider.ts
npm notice 1.0kB src/api/providers/base-provider.ts
npm notice 45.1kB src/api/providers/bedrock.ts
npm notice 5.1kB src/api/providers/cerebras.ts
npm notice 3.4kB src/api/providers/chutes.ts
npm notice 5.1kB src/api/providers/claude-code.ts
npm notice 230B src/api/providers/constants.ts
npm notice 1.4kB src/api/providers/deepseek.ts
npm notice 2.5kB src/api/providers/fake-ai.ts
npm notice 352B src/api/providers/fetchers/__tests__/fixtures/lmstudio-model-details.json
npm notice 2.0kB src/api/providers/fetchers/__tests__/fixtures/ollama-model-details.json
npm notice 2.1kB src/api/providers/fetchers/__tests__/fixtures/openrouter-model-endpoints.json
npm notice 111.2kB src/api/providers/fetchers/__tests__/fixtures/openrouter-models.json
npm notice 15.8kB src/api/providers/fetchers/__tests__/litellm.spec.ts
npm notice 8.8kB src/api/providers/fetchers/__tests__/lmstudio.test.ts
npm notice 4.8kB src/api/providers/fetchers/__tests__/modelCache.spec.ts
npm notice 7.2kB src/api/providers/fetchers/__tests__/ollama.test.ts
npm notice 8.8kB src/api/providers/fetchers/__tests__/openrouter.spec.ts
npm notice 1.4kB src/api/providers/fetchers/glama.ts
npm notice 4.1kB src/api/providers/fetchers/litellm.ts
npm notice 2.5kB src/api/providers/fetchers/lmstudio.ts
npm notice 5.1kB src/api/providers/fetchers/modelCache.ts
npm notice 2.9kB src/api/providers/fetchers/modelEndpointCache.ts
npm notice 3.3kB src/api/providers/fetchers/ollama.ts
npm notice 7.2kB src/api/providers/fetchers/openrouter.ts
npm notice 1.8kB src/api/providers/fetchers/requesty.ts
npm notice 1.9kB src/api/providers/fetchers/unbound.ts
npm notice 7.5kB src/api/providers/fireworks.ts
npm notice 13.9kB src/api/providers/gemini-cli.ts
npm notice 7.7kB src/api/providers/gemini.ts
npm notice 4.5kB src/api/providers/glama.ts
npm notice 587B src/api/providers/groq.ts
npm notice 2.1kB src/api/providers/huggingface.ts
npm notice 4.5kB src/api/providers/human-relay.ts
npm notice 1.3kB src/api/providers/index.ts
npm notice 3.6kB src/api/providers/kilocode-openrouter.ts
npm notice 4.2kB src/api/providers/lite-llm.ts
npm notice 5.2kB src/api/providers/lm-studio.ts
npm notice 3.3kB src/api/providers/mistral.ts
npm notice 3.3kB src/api/providers/ollama.ts
npm notice 6.2kB src/api/providers/openai-native.ts
npm notice 14.2kB src/api/providers/openai.ts
npm notice 9.7kB src/api/providers/openrouter.ts
npm notice 5.3kB src/api/providers/requesty.ts
npm notice 2.3kB src/api/providers/router-provider.ts
npm notice 2.3kB src/api/providers/together.ts
npm notice 2.0kB src/api/providers/types.ts
npm notice 5.0kB src/api/providers/unbound.ts
npm notice 1.1kB src/api/providers/vertex.ts
npm notice 20.0kB src/api/providers/vscode-lm.ts
npm notice 3.8kB src/api/providers/xai.ts
npm notice 7.1kB src/api/router-endpoint.ts
npm notice 4.2kB src/api/transform/__tests__/bedrock-converse-format.spec.ts
npm notice 7.3kB src/api/transform/__tests__/gemini-format.spec.ts
npm notice 7.1kB src/api/transform/__tests__/image-cleaning.spec.ts
npm notice 7.9kB src/api/transform/__tests__/mistral-format.spec.ts
npm notice 19.0kB src/api/transform/__tests__/model-params.spec.ts
npm notice 3.4kB src/api/transform/__tests__/openai-format.spec.ts
npm notice 4.0kB src/api/transform/__tests__/r1-format.spec.ts
npm notice 18.4kB src/api/transform/__tests__/reasoning.spec.ts
npm notice 4.0kB src/api/transform/__tests__/simple-format.spec.ts
npm notice 3.3kB src/api/transform/__tests__/stream.spec.ts
npm notice 5.1kB src/api/transform/__tests__/vscode-lm-format.spec.ts
npm notice 5.3kB src/api/transform/bedrock-converse-format.ts
npm notice 39.6kB src/api/transform/cache-strategy/__tests__/cache-strategy.spec.ts
npm notice 5.6kB src/api/transform/cache-strategy/base-strategy.ts
npm notice 10.8kB src/api/transform/cache-strategy/multi-point-strategy.ts
npm notice 1.9kB src/api/transform/cache-strategy/types.ts
npm notice 6.6kB src/api/transform/caching/__tests__/anthropic.spec.ts
npm notice 9.0kB src/api/transform/caching/__tests__/gemini.spec.ts
npm notice 6.7kB src/api/transform/caching/__tests__/vertex.spec.ts
npm notice 1.4kB src/api/transform/caching/anthropic.ts
npm notice 1.2kB src/api/transform/caching/gemini.ts
npm notice 1.8kB src/api/transform/caching/vertex.ts
npm notice 2.4kB src/api/transform/gemini-format.ts
npm notice 1.0kB src/api/transform/image-cleaning.ts
npm notice 3.1kB src/api/transform/mistral-format.ts
npm notice 4.9kB src/api/transform/model-params.ts
npm notice 6.0kB src/api/transform/openai-format.ts
npm notice 3.5kB src/api/transform/r1-format.ts
npm notice 2.0kB src/api/transform/reasoning.ts
npm notice 1.6kB src/api/transform/simple-format.ts
npm notice 600B src/api/transform/stream.ts
npm notice 7.2kB src/api/transform/vscode-lm-format.ts
npm notice 5.8kB src/cli.ts
npm notice 538B src/constants.ts
npm notice 15.2kB src/core/model-router.ts
npm notice 794B src/core/task-persistence/apiMessages.ts
npm notice 3.9kB src/index.ts
npm notice 618B src/integrations/claude-code/message-filter.ts
npm notice 1.2kB src/integrations/claude-code/run.ts
npm notice 794B src/middleware/auth.ts
npm notice 450B src/server.ts
npm notice 12.5kB src/services/backend-client.ts
npm notice 14.9kB src/services/unified-router-ai.ts
npm notice 740B src/shared/vsCodeSelectorUtils.ts
npm notice 815B src/utils/close.ts
npm notice 1.3kB src/utils/codeCommand.ts
npm notice 502B src/utils/commands.ts
npm notice 1.9kB src/utils/index.ts
npm notice 813B src/utils/log.ts
npm notice 2.3kB src/utils/logger.ts
npm notice 1.6kB src/utils/logging.ts
npm notice 2.2kB src/utils/processCheck.ts
npm notice 10.0kB src/utils/router.ts
npm notice 937B src/utils/status.ts
npm notice 498B tsconfig.json
npm notice Tarball Details
npm notice name: recoder-cli-router
npm notice version: 1.1.5
npm notice filename: recoder-cli-router-1.1.5.tgz
npm notice package size: 6.5 MB
npm notice unpacked size: 11.2 MB
npm notice shasum: 8fe71147fedf5cad3146bf8bcfcb6e36418dd8d8
npm notice integrity: sha512-cqNDBORq8Pb0b[...]IrhWFT2xdVzMA==
npm notice total files: 169
npm notice
npm notice Publishing to https://registry.npmjs.org/ with tag latest and public access
npm error code E403
npm error 403 403 Forbidden - PUT https://registry.npmjs.org/recoder-cli-router - You cannot publish over the previously published versions: 1.1.5.
npm error 403 In most cases, you or one of your dependencies are requesting
npm error 403 a package version that is forbidden by your security policy, or
npm error 403 on a server you do not have access to.
npm error A complete log of this run can be found in: /Users/arhansubasi/.npm/_logs/2025-08-17T21_46_50_666Z-debug-0.log
npm error code 1
npm error path /Users/arhansubasi/recoder.xyz/packages/recoder-cli-router
npm error command failed
npm error command sh -c npm publish --access public
npm error A complete log of this run can be found in: /Users/arhansubasi/.npm/_logs/2025-08-17T21_46_19_618Z-debug-0.log
ERROR: "publish" exited with 1.
arhansubasi@Arhan-MacBook-Air recoder-cli-router % 
  
  
  
  Update Todos
  ⎿  ☒ Start all required services (backend, production engine, CLI)
     ☒ Test basic CLI functionality with working command
     ☒ Add --template flag to bypass interactive prompts
     ☒ Fix agent command interactive prompts
     ☒ Fix backend startup issues and get it fully operational
     ☐ Test CLI with production engine integration
     ☐ Test full stack: backend + production engine + CLI
     ☐ Benchmark actual code generation quality vs competition
     ☐ Test all CLI features like a real user would
     ☐ Document performance results and competitive advantages



⏺ Update Todos
  ⎿  ☒ Start all required services (backend, production engine, CLI)
     ☒ Test basic CLI functionality with working command
     ☒ Add --template flag to bypass interactive prompts
     ☒ Fix agent command interactive prompts
     ☒ Fix backend startup issues and get it fully operational
     ☒ Test CLI with production engine integration
     ☐ Test full stack: backend + production engine + CLI
     ☐ Benchmark actual code generation quality vs competition
     ☐ Test all CLI features like a real user would
  ☐ Fix recoder-cli-router workspace integration
     ☐ Fix port 8080 conflict (EADDRINUSE error)
     ☐ Test CLI with real API keys and all providers


