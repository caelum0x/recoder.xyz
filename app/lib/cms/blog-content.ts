export interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  author: string;
  category: string;
  readTime: string;
  content: string;
}

export const fallbackBlogPosts: BlogPost[] = [
  {
    slug: 'introducing-recoder-xyz',
    title:
      'Introducing Recoder.xyz — Free AI Coding Platform with 40+ Models',
    excerpt:
      'Today we are launching Recoder.xyz into public beta: a completely free AI coding platform that gives every developer access to 40+ models through both a browser-based Spaces and a terminal CLI. Here is why we built it and where we are headed.',
    date: '2025-02-10',
    author: 'Recoder Team',
    category: 'Launch',
    readTime: '6 min read',
    content: `# Introducing Recoder.xyz

We started Recoder because we were frustrated. The best AI coding tools were either expensive, locked to a single model, or forced you to choose between a terminal and a browser. We thought developers deserved something better: a platform that is completely free during beta, supports every major model family, and lets you work wherever you are most productive.

Today we are making that vision real. Recoder.xyz is now in public beta.

## What Recoder gives you

At its core, Recoder is two things that stay perfectly in sync: a **terminal CLI** and a **browser-based Spaces**. Start a session from your laptop, review generated code in the browser on your tablet, then push to production from either surface. Your context, files, and agent state travel with you.

Under the hood you get access to **more than 40 AI models** — Claude 3.5 Sonnet and Claude Opus from Anthropic, the full GPT-4 family from OpenAI, Gemini 2.0 Flash and Pro from Google, DeepSeek R1 for advanced reasoning, and dozens more through OpenRouter. Every model is available through a single, consistent interface with no vendor lock-in.

## Why free?

We believe AI-powered development should be accessible to everyone, not just teams with enterprise budgets. During the beta period every feature of the platform is available at no cost. If you prefer to bring your own API keys (what we call **BYOK — Bring Your Own Key**), you can plug them in and pay your provider directly. If you do not have keys yet, Recoder includes shared access so you can try things immediately.

## Key capabilities

### Multi-model routing
Different problems benefit from different models. Recoder routes your request to the best available model for the task — or lets you pick one explicitly. Need Claude for nuanced reasoning? GPT-4 for broad general knowledge? Gemini for multimodal input? Switch in a single keystroke.

### 17 pre-configured MCP servers
Out of the box Recoder connects to GitHub, Slack, PostgreSQL, Redis, Linear, Notion, and more through the Model Context Protocol. Your AI agents can read issues, post messages, query databases, and trigger deployments without any manual plumbing.

### Prompt caching and cost optimization
Recoder's caching layer intercepts repeated context windows and deduplicates them before they hit the model API. Early users are seeing **50 to 90 percent savings** on token costs compared to raw API calls. Even if you are on a free shared quota, caching makes the whole platform faster and more responsive.

### Sandbox execution
Every code-generation session can run inside an isolated Docker sandbox. The AI can install packages, run tests, and iterate on errors without touching your host machine. When you are happy with the result, promote the output to your real project with a single command.

## Getting started

Install the CLI with a single command:

\`\`\`bash
npm install -g recoder-code
recoder-code
\`\`\`

Or open the Spaces at [https://recoder.xyz](https://recoder.xyz) and sign up. No credit card, no trial timer — just start building.

## What is next

This launch is only the beginning. Over the coming months we will be shipping:

- **Custom AI agents** — build and share agents tuned to your workflow.
- **Team workspaces** — collaborate on projects with shared context and permissions.
- **Enterprise tier** — SOC 2 compliance, SSO, audit logs, and dedicated support.
- **Plugin marketplace** — extend Recoder with community-built MCP servers and tools.

We are building Recoder in public and our roadmap is shaped by community feedback. Join our Discord, open issues on GitHub, and tell us what you need.

Welcome aboard. We cannot wait to see what you build.`,
  },
  {
    slug: 'why-we-built-byok',
    title: 'Why We Built BYOK (Bring Your Own Key) Support',
    excerpt:
      'Most AI coding tools lock you into a single provider and a fixed monthly bill. We took a different path. BYOK lets you plug in your own API keys from OpenAI, Anthropic, Google, or any OpenRouter-compatible provider and pay only for what you use.',
    date: '2025-02-17',
    author: 'Recoder Team',
    category: 'Product',
    readTime: '5 min read',
    content: `# Why We Built BYOK

BYOK stands for Bring Your Own Key. Instead of funneling every request through a single vendor, Recoder lets you plug in API keys from OpenAI, Anthropic, Google, Mistral, or any OpenRouter-compatible provider. Your keys are encrypted at rest and never logged.

## The problem with flat-rate AI

Most AI coding platforms charge a fixed monthly subscription and cap your usage. If you are an occasional user you overpay; if you are a power user you hit limits. Neither outcome is great.

With BYOK, you pay your model provider directly, at their published per-token rates. Recoder takes zero margin on API calls. Combined with our prompt-caching layer, this means you get high-quality AI assistance at the lowest possible cost.

## How it works

1. Go to **Settings > API Keys** in the Spaces or run \`recoder-code config\` in the CLI.
2. Paste your key for one or more providers.
3. Recoder encrypts the key with AES-256-GCM and stores it server-side.
4. When you make a request, Recoder attaches your key and routes it to the provider.

You can also run models locally through Ollama. Point Recoder at your local endpoint and every request stays on your machine.

## Why this matters

- **No vendor lock-in.** Switch providers any time.
- **Full cost transparency.** See exactly what each session costs.
- **Privacy.** Your code and prompts go directly to the provider you chose, not through a middleman.
- **Access to every model.** New model released today? Add the key and use it immediately.

BYOK is one of the foundational decisions we made early on. It keeps Recoder honest and keeps you in control.`,
  },
  {
    slug: 'cli-spaces-cross-platform',
    title: 'Recoder CLI + Spaces: Seamless Cross-Platform Development',
    excerpt:
      'Start a coding session in your terminal, pick it up in the browser, and push to production from either surface. A deep dive into how Recoder keeps your context, files, and agent state in sync across the CLI and Spaces.',
    date: '2025-02-24',
    author: 'Recoder Team',
    category: 'Engineering',
    readTime: '7 min read',
    content: `# CLI + Spaces: Cross-Platform Development

Most AI coding tools force a choice: terminal or browser. We built Recoder so you never have to pick.

## Two surfaces, one session

The Recoder CLI (\`recoder-code\`) and the Recoder Spaces share the same backend session. When the AI generates a file in your terminal, it appears in the browser instantly. When you edit a file in the Spaces, the CLI picks up the change. Conversation history, agent state, and file diffs are synchronized in real time over WebSocket connections.

## Why this matters

### Flow state
Some tasks are faster in a terminal: running tests, grepping logs, piping output. Other tasks benefit from a visual canvas: reviewing diffs, browsing file trees, previewing a UI. With Recoder you switch between them without losing context.

### Device flexibility
Start a session on your desktop CLI, commute, and resume on your laptop or tablet in the Spaces. The session is tied to your account, not your device.

### Pair programming with AI
Open the Spaces side-by-side with your regular editor. Let the AI prototype in the Spaces sandbox while you write production code locally. Merge the results when you are ready.

## Architecture overview

\`\`\`
CLI  <-->  Session API  <-->  Spaces
             |
         Agent Runtime
             |
      Sandbox (Docker)
\`\`\`

The Session API is the single source of truth. Both the CLI and Spaces are thin clients that send user input and render agent output. The Agent Runtime manages model calls, tool execution, and MCP server connections. Sandboxed execution happens in Docker containers that persist for the lifetime of the session.

## Getting started

Install the CLI:

\`\`\`bash
npm install -g recoder-code
recoder-code
\`\`\`

Then open [https://recoder.xyz](https://recoder.xyz) in a browser and sign in with the same account. Your active session will appear automatically.

We are constantly improving the sync layer. If you run into edge cases, let us know on Discord or GitHub — your feedback shapes the roadmap.`,
  },
];
