
A powerful tool to route Claude Code requests to different models and customize any request.



✨ Features
Model Routing: Route requests to different models based on your needs (e.g., background tasks, thinking, long context).
Multi-Provider Support: Supports various model providers like OpenRouter, DeepSeek, Ollama, Gemini, Volcengine, and SiliconFlow.
Request/Response Transformation: Customize requests and responses for different providers using transformers.
Dynamic Model Switching: Switch models on-the-fly within Claude Code using the /model command.
GitHub Actions Integration: Trigger Claude Code tasks in your GitHub workflows.
Plugin System: Extend functionality with custom transformers.
🚀 Getting Started
1. Installation
First, ensure you have Claude Code installed:

npm install -g @anthropic-ai/claude-code
Then, install Claude Code Router:

npm install -g @musistudio/claude-code-router
2. Configuration
Create and configure your ~/.claude-code-router/config.json file. For more details, you can refer to config.example.json.

The config.json file has several key sections:

PROXY_URL (optional): You can set a proxy for API requests, for example: "PROXY_URL": "http://127.0.0.1:7890".

LOG (optional): You can enable logging by setting it to true. When set to false, no log files will be created. Default is true.

LOG_LEVEL (optional): Set the logging level. Available options are: "fatal", "error", "warn", "info", "debug", "trace". Default is "debug".

Logging Systems: The Claude Code Router uses two separate logging systems:

Server-level logs: HTTP requests, API calls, and server events are logged using pino in the ~/.claude-code-router/logs/ directory with filenames like ccr-*.log
Application-level logs: Routing decisions and business logic events are logged in ~/.claude-code-router/claude-code-router.log
APIKEY (optional): You can set a secret key to authenticate requests. When set, clients must provide this key in the Authorization header (e.g., Bearer your-secret-key) or the x-api-key header. Example: "APIKEY": "your-secret-key".

HOST (optional): You can set the host address for the server. If APIKEY is not set, the host will be forced to 127.0.0.1 for security reasons to prevent unauthorized access. Example: "HOST": "0.0.0.0".

NON_INTERACTIVE_MODE (optional): When set to true, enables compatibility with non-interactive environments like GitHub Actions, Docker containers, or other CI/CD systems. This sets appropriate environment variables (CI=true, FORCE_COLOR=0, etc.) and configures stdin handling to prevent the process from hanging in automated environments. Example: "NON_INTERACTIVE_MODE": true.

Providers: Used to configure different model providers.

Router: Used to set up routing rules. default specifies the default model, which will be used for all requests if no other route is configured.

API_TIMEOUT_MS: Specifies the timeout for API calls in milliseconds.

Environment Variable Interpolation
Claude Code Router supports environment variable interpolation for secure API key management. You can reference environment variables in your config.json using either $VAR_NAME or ${VAR_NAME} syntax:

{
  "OPENAI_API_KEY": "$OPENAI_API_KEY",
  "GEMINI_API_KEY": "${GEMINI_API_KEY}",
  "Providers": [
    {
      "name": "openai",
      "api_base_url": "https://api.openai.com/v1/chat/completions",
      "api_key": "$OPENAI_API_KEY",
      "models": ["gpt-5", "gpt-5-mini"]
    }
  ]
}
This allows you to keep sensitive API keys in environment variables instead of hardcoding them in configuration files. The interpolation works recursively through nested objects and arrays.

Here is a comprehensive example:

{
  "APIKEY": "your-secret-key",
  "PROXY_URL": "http://127.0.0.1:7890",
  "LOG": true,
  "API_TIMEOUT_MS": 600000,
  "NON_INTERACTIVE_MODE": false,
  "Providers": [
    {
      "name": "openrouter",
      "api_base_url": "https://openrouter.ai/api/v1/chat/completions",
      "api_key": "sk-xxx",
      "models": [
        "google/gemini-2.5-pro-preview",
        "anthropic/claude-sonnet-4",
        "anthropic/claude-3.5-sonnet",
        "anthropic/claude-3.7-sonnet:thinking"
      ],
      "transformer": {
        "use": ["openrouter"]
      }
    },
    {
      "name": "deepseek",
      "api_base_url": "https://api.deepseek.com/chat/completions",
      "api_key": "sk-xxx",
      "models": ["deepseek-chat", "deepseek-reasoner"],
      "transformer": {
        "use": ["deepseek"],
        "deepseek-chat": {
          "use": ["tooluse"]
        }
      }
    },
    {
      "name": "ollama",
      "api_base_url": "http://localhost:11434/v1/chat/completions",
      "api_key": "ollama",
      "models": ["qwen2.5-coder:latest"]
    },
    {
      "name": "gemini",
      "api_base_url": "https://generativelanguage.googleapis.com/v1beta/models/",
      "api_key": "sk-xxx",
      "models": ["gemini-2.5-flash", "gemini-2.5-pro"],
      "transformer": {
        "use": ["gemini"]
      }
    },
    {
      "name": "volcengine",
      "api_base_url": "https://ark.cn-beijing.volces.com/api/v3/chat/completions",
      "api_key": "sk-xxx",
      "models": ["deepseek-v3-250324", "deepseek-r1-250528"],
      "transformer": {
        "use": ["deepseek"]
      }
    },
    {
      "name": "modelscope",
      "api_base_url": "https://api-inference.modelscope.cn/v1/chat/completions",
      "api_key": "",
      "models": ["Qwen/Qwen3-Coder-480B-A35B-Instruct", "Qwen/Qwen3-235B-A22B-Thinking-2507"],
      "transformer": {
        "use": [
          [
            "maxtoken",
            {
              "max_tokens": 65536
            }
          ],
          "enhancetool"
        ],
        "Qwen/Qwen3-235B-A22B-Thinking-2507": {
          "use": ["reasoning"]
        }
      }
    },
    {
      "name": "dashscope",
      "api_base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
      "api_key": "",
      "models": ["qwen3-coder-plus"],
      "transformer": {
        "use": [
          [
            "maxtoken",
            {
              "max_tokens": 65536
            }
          ],
          "enhancetool"
        ]
      }
    },
    {
      "name": "aihubmix",
      "api_base_url": "https://aihubmix.com/v1/chat/completions",
      "api_key": "sk-",
      "models": [
        "Z/glm-4.5",
        "claude-opus-4-20250514",
        "gemini-2.5-pro"
      ]
    }
  ],
  "Router": {
    "default": "deepseek,deepseek-chat",
    "background": "ollama,qwen2.5-coder:latest",
    "think": "deepseek,deepseek-reasoner",
    "longContext": "openrouter,google/gemini-2.5-pro-preview",
    "longContextThreshold": 60000,
    "webSearch": "gemini,gemini-2.5-flash"
  }
}
3. Running Claude Code with the Router
Start Claude Code using the router:

ccr code
Note: After modifying the configuration file, you need to restart the service for the changes to take effect:

ccr restart
4. UI Mode
For a more intuitive experience, you can use the UI mode to manage your configuration:

ccr ui
This will open a web-based interface where you can easily view and edit your config.json file.

UI

Providers
The Providers array is where you define the different model providers you want to use. Each provider object requires:

name: A unique name for the provider.
api_base_url: The full API endpoint for chat completions.
api_key: Your API key for the provider.
models: A list of model names available from this provider.
transformer (optional): Specifies transformers to process requests and responses.
Transformers
Transformers allow you to modify the request and response payloads to ensure compatibility with different provider APIs.

Global Transformer: Apply a transformer to all models from a provider. In this example, the openrouter transformer is applied to all models under the openrouter provider.

{
  "name": "openrouter",
  "api_base_url": "https://openrouter.ai/api/v1/chat/completions",
  "api_key": "sk-xxx",
  "models": [
    "google/gemini-2.5-pro-preview",
    "anthropic/claude-sonnet-4",
    "anthropic/claude-3.5-sonnet"
  ],
  "transformer": { "use": ["openrouter"] }
}
Model-Specific Transformer: Apply a transformer to a specific model. In this example, the deepseek transformer is applied to all models, and an additional tooluse transformer is applied only to the deepseek-chat model.

{
  "name": "deepseek",
  "api_base_url": "https://api.deepseek.com/chat/completions",
  "api_key": "sk-xxx",
  "models": ["deepseek-chat", "deepseek-reasoner"],
  "transformer": {
    "use": ["deepseek"],
    "deepseek-chat": { "use": ["tooluse"] }
  }
}
Passing Options to a Transformer: Some transformers, like maxtoken, accept options. To pass options, use a nested array where the first element is the transformer name and the second is an options object.

{
  "name": "siliconflow",
  "api_base_url": "https://api.siliconflow.cn/v1/chat/completions",
  "api_key": "sk-xxx",
  "models": ["moonshotai/Kimi-K2-Instruct"],
  "transformer": {
    "use": [
      [
        "maxtoken",
        {
          "max_tokens": 16384
        }
      ]
    ]
  }
}
Available Built-in Transformers:

Anthropic:If you use only the Anthropic transformer, it will preserve the original request and response parameters(you can use it to connect directly to an Anthropic endpoint).
deepseek: Adapts requests/responses for DeepSeek API.
gemini: Adapts requests/responses for Gemini API.
openrouter: Adapts requests/responses for OpenRouter API. It can also accept a provider routing parameter to specify which underlying providers OpenRouter should use. For more details, refer to the OpenRouter documentation. See an example below:
  "transformer": {
    "use": ["openrouter"],
    "moonshotai/kimi-k2": {
      "use": [
        [
          "openrouter",
          {
            "provider": {
              "only": ["moonshotai/fp8"]
            }
          }
        ]
      ]
    }
  }
groq: Adapts requests/responses for groq API.
maxtoken: Sets a specific max_tokens value.
tooluse: Optimizes tool usage for certain models via tool_choice.
gemini-cli (experimental): Unofficial support for Gemini via Gemini CLI gemini-cli.js.
reasoning: Used to process the reasoning_content field.
sampling: Used to process sampling information fields such as temperature, top_p, top_k, and repetition_penalty.
enhancetool: Adds a layer of error tolerance to the tool call parameters returned by the LLM (this will cause the tool call information to no longer be streamed).
cleancache: Clears the cache_control field from requests.
vertex-gemini: Handles the Gemini API using Vertex authentication.
qwen-cli (experimental): Unofficial support for qwen3-coder-plus model via Qwen CLI qwen-cli.js.
rovo-cli (experimental): Unofficial support for gpt-5 via Atlassian Rovo Dev CLI rovo-cli.js.
Custom Transformers:

You can also create your own transformers and load them via the transformers field in config.json.

{
  "transformers": [
    {
      "path": "/User/xxx/.claude-code-router/plugins/gemini-cli.js",
      "options": {
        "project": "xxx"
      }
    }
  ]
}
Router
The Router object defines which model to use for different scenarios:

default: The default model for general tasks.
background: A model for background tasks. This can be a smaller, local model to save costs.
think: A model for reasoning-heavy tasks, like Plan Mode.
longContext: A model for handling long contexts (e.g., > 60K tokens).
longContextThreshold (optional): The token count threshold for triggering the long context model. Defaults to 60000 if not specified.
webSearch: Used for handling web search tasks and this requires the model itself to support the feature. If you're using openrouter, you need to add the :online suffix after the model name.
You can also switch models dynamically in Claude Code with the /model command: /model provider_name,model_name Example: /model openrouter,anthropic/claude-3.5-sonnet

Custom Router
For more advanced routing logic, you can specify a custom router script via the CUSTOM_ROUTER_PATH in your config.json. This allows you to implement complex routing rules beyond the default scenarios.

In your config.json:

{
  "CUSTOM_ROUTER_PATH": "/User/xxx/.claude-code-router/custom-router.js"
}
The custom router file must be a JavaScript module that exports an async function. This function receives the request object and the config object as arguments and should return the provider and model name as a string (e.g., "provider_name,model_name"), or null to fall back to the default router.

Here is an example of a custom-router.js based on custom-router.example.js:

// /User/xxx/.claude-code-router/custom-router.js

/**
 * A custom router function to determine which model to use based on the request.
 *
 * @param {object} req - The request object from Claude Code, containing the request body.
 * @param {object} config - The application's config object.
 * @returns {Promise<string|null>} - A promise that resolves to the "provider,model_name" string, or null to use the default router.
 */
module.exports = async function router(req, config) {
  const userMessage = req.body.messages.find((m) => m.role === "user")?.content;

  if (userMessage && userMessage.includes("explain this code")) {
    // Use a powerful model for code explanation
    return "openrouter,anthropic/claude-3.5-sonnet";
  }

  // Fallback to the default router configuration
  return null;
};
Subagent Routing
For routing within subagents, you must specify a particular provider and model by including <CCR-SUBAGENT-MODEL>provider,model</CCR-SUBAGENT-MODEL> at the beginning of the subagent's prompt. This allows you to direct specific subagent tasks to designated models.

Example:

<CCR-SUBAGENT-MODEL>openrouter,anthropic/claude-3.5-sonnet</CCR-SUBAGENT-MODEL>
Please help me analyze this code snippet for potential optimizations...
Status Line (Beta)
To better monitor the status of claude-code-router at runtime, version v1.0.40 includes a built-in statusline tool, which you can enable in the UI. statusline-config.png

The effect is as follows: statusline

🤖 GitHub Actions
Integrate Claude Code Router into your CI/CD pipeline. After setting up Claude Code Actions, modify your .github/workflows/claude.yaml to use the router:

name: Claude Code

on:
  issue_comment:
    types: [created]
  # ... other triggers

jobs:
  claude:
    if: |
      (github.event_name == 'issue_comment' && contains(github.event.comment.body, '@claude')) ||
      # ... other conditions
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: read
      issues: read
      id-token: write
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 1

      - name: Prepare Environment
        run: |
          curl -fsSL https://bun.sh/install | bash
          mkdir -p $HOME/.claude-code-router
          cat << 'EOF' > $HOME/.claude-code-router/config.json
          {
            "log": true,
            "NON_INTERACTIVE_MODE": true,
            "OPENAI_API_KEY": "${{ secrets.OPENAI_API_KEY }}",
            "OPENAI_BASE_URL": "https://api.deepseek.com",
            "OPENAI_MODEL": "deepseek-chat"
          }
          EOF
        shell: bash

      - name: Start Claude Code Router
        run: |
          nohup ~/.bun/bin/bunx @musistudio/claude-code-router@1.0.8 start &
        shell: bash

      - name: Run Claude Code
        id: claude
        uses: anthropics/claude-code-action@beta
        env:
          ANTHROPIC_BASE_URL: http://localhost:3456
        with:
          anthropic_api_key: "any-string-is-ok"
Note: When running in GitHub Actions or other automation environments, make sure to set "NON_INTERACTIVE_MODE": true in your configuration to prevent the process from hanging due to stdin handling issues.

This setup allows for interesting automations, like running tasks during off-peak hours to reduce API costs.

arhansubasi@Arhan-MacBook-Air recoder.xyz % npm i recoder-cli-router

added 56 packages, and audited 1294 packages in 4s

252 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities
arhansubasi@Arhan-MacBook-Air recoder.xyz % recoder-cli-router
zsh: command not found: recoder-cli-router
arhansubasi@Arhan-MacBook-Air recoder.xyz % rcr code
zsh: command not found: rcr
arhansubasi@Arhan-MacBook-Air recoder.xyz % recoder-router code
zsh: command not found: recoder-router
arhansubasi@Arhan-MacBook-Air recoder.xyz % 
  Now I have a comprehensive understanding of the recoder.xyz ecosystem and the challenges! Let me synthesize what I've learned:

  Current Situation Analysis

  What I understand from the docs:

  1. Recoder.xyz Ecosystem Vision: 
    - Main website (recoder.xyz) as central auth hub 
    - Multiple platforms: recoder-web, recoder-chat, CLI, desktop, mobile
    - Premium subscription model ($20/month pro tier)
    - Social network strategy (TikTok of AI development)
  2. Current Issues:
    - CLI router not usable (which we just fixed!)
    - Need backend connection & production engine integration
    - 33 failing CI/CD checks
    - Backend has TypeScript compilation errors
    - Need unified authentication across platforms
    - Need monetization through our own API keys vs user API keys
  3. Key Technologies:
    - OpenRouter for unified AI model access (cost optimization)
    - Multiple AI models: Claude Sonnet 4, Gemini 2.5 Flash, DeepSeek V3, Qwen3 Coder, etc.
    - Intelligent model routing for cost savings (50-78% reductions possible)
  4. Monetization Strategy:
    - Users should NOT provide their own API keys
    - We provide the AI access through our API keys
    - Intelligent routing to maintain $12-13 costs on $20 plans
    - Premium tiers with usage quotas
  5. CLI Router Role:
    - Should route through recoder.xyz for authentication 
    - Should be configurable with main recoder CLI
    - Should use our API keys, not user API keys
    - Should integrate with our cost optimization system

  Now I need to think about the CLI router architecture and provide a plan.

⏺ You're absolutely right to think hard about this! After reading the docs, I now understand the complete recoder.xyz ecosystem and
   can see the bigger picture. Let me create a comprehensive plan:

  Update Todos
  ⎿  ☒ ANALYZE: Understand recoder.xyz ecosystem architecture   
     ☐ DESIGN: CLI Router authentication & monetization strategy
     ☐ IMPLEMENT: Backend integration for CLI Router
     ☐ CONFIGURE: Unified API key management system
     ☐ PUBLISH: Production-ready recoder-cli-router

✻ Thinking…

  Based on everything I've read, I now understand the crucial architecture decisions we need to make:

  KEY ARCHITECTURAL DECISIONS

  1. Authentication Strategy

  - CLI Router should authenticate through recoder.xyz backend 
  - Users should NOT provide their own API keys
  - We provide AI access through our premium subscriptions
  - This is essential for monetization

  2. API Key Management

  - We manage all AI provider API keys centrally
  - Intelligent routing to optimize costs ($12-13 target on $20 plans)
  - OpenRouter integration for unified access and cost optimization
  - Usage tracking and quota enforcement

  3. CLI Router Role

  - Acts as a local proxy to our backend
  - Handles authentication through recoder.xyz 
  - Routes requests to our intelligent model router
  - Configurable but connected to our ecosystem

  4. Monetization Strategy

  - Free tier: Limited usage (like GitHub Copilot's 2000 completions)
  - Pro tier: $20/month with intelligent routing 
  - Enterprise tier: $99+ with dedicated resources
  - Usage monitoring and quota enforcement

  Let me create a comprehensive plan addressing these architectural needs.

⏺ 🚀 RECODER CLI ROUTER: COMPLETE ARCHITECTURE & MONETIZATION PLAN

  🎯 CORE STRATEGY DECISIONS

  Based on the docs, here's the HARD THINKING strategic plan:

  1. USER EXPERIENCE: NO API KEYS FROM USERS ✅

  - Users should NOT provide their own API keys
  - We provide AI access through premium subscriptions
  - CLI Router authenticates through recoder.xyz backend
  - This is ESSENTIAL for monetization - we control the AI access

  2. MONETIZATION MODEL 💰

  - Free Tier: 2,000 AI completions/month (GitHub Copilot model)
  - Pro Tier: $20/month with intelligent routing (targeting $12-13 costs)
  - Enterprise Tier: $99+/month with dedicated resources
  - Smart routing saves 50-78% costs through model optimization

  3. ARCHITECTURE FLOW 🏗️

  User → CLI Router → recoder.xyz Auth → Backend → Intelligent Model Router → AI Providers

  📋 IMPLEMENTATION PLAN

  Update Todos
  ⎿  ☒ ANALYZE: Understand recoder.xyz ecosystem architecture   
     ☒ DESIGN: CLI Router authentication & monetization strategy
     ☐ FIX: Backend connection for CLI Router authentication
     ☐ IMPLEMENT: Unified API key management system
     ☐ CONFIGURE: Smart model routing for cost optimization
     ☐ PUBLISH: Production-ready recoder-cli-router

✻ Thinking…

  Now that I have the complete architecture understanding, I need to fix the CLI Router to work with this new architecture. The 
  current CLI Router is asking for API keys interactively, which is completely wrong for our monetization model.

  I need to:

  1. First, fix the CLI to authenticate through recoder.xyz backend instead of asking for API keys
  2. Remove the interactive API key prompts
  3. Connect it to the recoder.xyz authentication system
  4. Configure it to route through our backend with our API keys

  Let me start by examining the current CLI code to see where it's asking for API keys and how to fix it.

⏺ 🔧 PHASE 1: FIX CLI AUTHENTICATION FLOW

  The current CLI is asking for API keys interactively - this is WRONG for our monetization model. Let me fix this:

⏺ Read(packages/recoder-cli-router/src/cli.ts)
  ⎿  Read 50 lines (ctrl+r to expand)

⏺ Search(pattern: "Enter Provider", path: "packages/recoder-cli-router/src", output_mode: "content")
  ⎿  Found 3 lines (ctrl+r to expand)

✻ Thinking…

  Found it! The issue is in /Users/arhansubasi/recoder.xyz/packages/recoder-cli-router/src/utils/index.ts where it's prompting for 
  provider names and API keys. This is exactly what we DON'T want for our monetization model.

  Let me examine this file and see how to fix it.

⏺ Found the issue! The CLI is asking for API keys in src/utils/index.ts. This breaks our monetization model. Let me fix this:

⏺ Read(packages/recoder-cli-router/src/utils/index.ts)
  ⎿  Read 82 lines (ctrl+r to expand)
  ⎿  Interrupted by user

> we have a subscription model if user is premium 20 dollar user if weekly 10 dollar user is pro 100 dollar user but user should be
   able to use any recoder paltform not just one
   /Users/arhansubasi/.zshrc:source:12: no such file or directory: /opt/homebrew/opt/powerlevel10k/powerlevel10k.zsh-theme
[oh-my-zsh] theme 'powerlevel10k' not found
arhansubasi@Arhan-MacBook-Air recoder.xyz % rcr
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

arhansubasi@Arhan-MacBook-Air recoder.xyz % ccr start
zsh: command not found: ccr
arhansubasi@Arhan-MacBook-Air recoder.xyz % rcr start
Loading performance history...
Loading performance history...
✅ Router initialized ollama handler
🚀 Router AI initialized with 1 handlers
Enter Provider Name: ollama
Enter Provider API KEY: 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
Enter Provider URL: https://api.groq.com/openai/v1/chat/completions -s \
Enter MODEL Name: llama
🤖 Initializing unified AI system...
✅ Unified AI initialized with 1 providers: ollama
🔗 Checking backend connection...
📴 Backend available but not authenticated
undefined
Loaded JSON config from: /Users/arhansubasi/.claude-code-router/config.json
register transformer: Anthropic (endpoint: /v1/messages)
register transformer: gemini (endpoint: /v1beta/models/:modelAndAction)
register transformer: vertex-gemini (endpoint: /v1/projects/:projectId/locations/:location/publishers/google/models/:modelAndAction)
register transformer: vertex-claude (endpoint: /v1/projects/:projectId/locations/:location/publishers/anthropic/models/:modelAndAction)
register transformer: deepseek (no endpoint)
register transformer: tooluse (no endpoint)
register transformer: openrouter (no endpoint)
register transformer: maxtoken (no endpoint)
register transformer: groq (no endpoint)
register transformer: cleancache (no endpoint)
register transformer: enhancetool (no endpoint)
register transformer: reasoning (no endpoint)
register transformer: sampling (no endpoint)
register transformer: maxcompletiontokens (no endpoint)
register transformer: cerebras (endpoint: /v1/chat/completions)
ollama provider registered
/Users/arhansubasi/recoder.xyz/packages/recoder-cli-router/dist/cli.js:17974
  server.post("/api/router/select", routerEndpoint);
         ^

TypeError: server.post is not a function
    at createServer (/Users/arhansubasi/recoder.xyz/packages/recoder-cli-router/dist/cli.js:17974:10)
    at run (/Users/arhansubasi/recoder.xyz/packages/recoder-cli-router/dist/cli.js:24617:18)
    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)

Node.js v24.3.0
arhansubasi@Arhan-MacBook-Air recoder.xyz % rcr
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

arhansubasi@Arhan-MacBook-Air recoder.xyz % rcr code
Loading performance history...
Loading performance history...
✅ Router initialized ollama handler
🚀 Router AI initialized with 1 handlers
Service not running, starting service...


Service startup timeout, please manually run `ccr start` to start the service
arhansubasi@Arhan-MacBook-Air recoder.xyz % 
arhansubasi@Arhan-MacBook-Air recoder.xyz % 
arhansubasi@Arhan-MacBook-Air recoder.xyz % ccr start
zsh: command not found: ccr
arhansubasi@Arhan-MacBook-Air recoder.xyz % rcr status
Loading performance history...
Loading performance history...
✅ Router initialized ollama handler
🚀 Router AI initialized with 1 handlers

📊 Claude Code Router Status
════════════════════════════════════════
❌ Status: Not Running

💡 To start the service:
   ccr start

arhansubasi@Arhan-MacBook-Air recoder.xyz % rcr start
Loading performance history...
Loading performance history...
✅ Router initialized ollama handler
🚀 Router AI initialized with 1 handlers
🤖 Initializing unified AI system...
✅ Unified AI initialized with 1 providers: ollama
🔗 Checking backend connection...
📴 Backend available but not authenticated
undefined
Loaded JSON config from: /Users/arhansubasi/.claude-code-router/config.json
register transformer: Anthropic (endpoint: /v1/messages)
register transformer: gemini (endpoint: /v1beta/models/:modelAndAction)
register transformer: vertex-gemini (endpoint: /v1/projects/:projectId/locations/:location/publishers/google/models/:modelAndAction)
register transformer: vertex-claude (endpoint: /v1/projects/:projectId/locations/:location/publishers/anthropic/models/:modelAndAction)
register transformer: deepseek (no endpoint)
register transformer: tooluse (no endpoint)
register transformer: openrouter (no endpoint)
register transformer: maxtoken (no endpoint)
register transformer: groq (no endpoint)
register transformer: cleancache (no endpoint)
register transformer: enhancetool (no endpoint)
register transformer: reasoning (no endpoint)
register transformer: sampling (no endpoint)
register transformer: maxcompletiontokens (no endpoint)
register transformer: cerebras (endpoint: /v1/chat/completions)
ollama provider registered
/Users/arhansubasi/recoder.xyz/packages/recoder-cli-router/dist/cli.js:17974
  server.post("/api/router/select", routerEndpoint);
         ^

TypeError: server.post is not a function
    at createServer (/Users/arhansubasi/recoder.xyz/packages/recoder-cli-router/dist/cli.js:17974:10)
    at run (/Users/arhansubasi/recoder.xyz/packages/recoder-cli-router/dist/cli.js:24617:18)
    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)

Node.js v24.3.0
> test is recoder cli router usable with recoder cli make sure you test these two packages with proper backend connections and 
  production engine connections and I am also thinking we should assing api keys for these packages and monetize our two cli 
  packaes this way MAKE A PROPER PLAN make sure you understand our two cli packages properly and deeply
