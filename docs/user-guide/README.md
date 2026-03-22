# Recoder Platform Documentation

## Getting Started

### Quick Start
1. **Sign up** at [recoder.xyz](https://recoder.xyz/auth/signup)
2. **Create your first agent** — Choose from 6 pre-built templates or build your own
3. **Start a thread** — Give your agent a task and watch it work
4. **Explore the platform** — Web IDE, PM, Agency, and more

### Platform Overview

| App | URL | What it does |
|-----|-----|-------------|
| **Recoder Agents** | [agents.recoder.xyz](https://agents.recoder.xyz) | Build and run AI agents that write code, analyze data, and automate tasks |
| **Recoder Web IDE** | [web.recoder.xyz](https://web.recoder.xyz) | Browser-based code editor with AI chat, live preview, and Docker containers |
| **Recoder PM** | [pm.recoder.xyz](https://pm.recoder.xyz) | AI-first product management — feedback analysis, roadmap, insights |
| **Recoder Agency** | [agency.recoder.xyz](https://agency.recoder.xyz) | AI-powered agency platform — workflows, client delivery, quotes |
| **Recoder Claw** | [openclaw.recoder.xyz](https://openclaw.recoder.xyz) | A2A Gateway — connect AI agents across platforms |

---

## AI Agents

### What are Agents?
Agents are autonomous AI workers that can execute tasks in isolated sandbox environments. Each agent has:
- A **system prompt** that defines its personality and capabilities
- A **model** (Claude, GPT, Gemini, etc.) that powers its intelligence
- **Tools** (file operations, shell commands, web browsing, etc.)
- A **sandbox** (isolated Linux environment) where it runs code

### Pre-built Agent Templates
- **Recoder** — General-purpose AI assistant with all tools enabled
- **Code Assistant** — Expert coder for writing, reviewing, and debugging
- **Data Analyst** — Analyzes data, creates visualizations, generates insights
- **Writing Assistant** — Creates content, blog posts, documentation
- **DevOps Engineer** — Infrastructure, CI/CD, deployment automation
- **Research Agent** — Web research, source evaluation, report compilation

### Creating a Thread
A thread is a conversation with an agent. When you create a thread:
1. A Daytona sandbox is provisioned (isolated Linux environment)
2. Your prompt is sent to the AI model
3. The agent can execute code, create files, browse the web
4. Results are streamed back in real-time

---

## Web IDE

### Features
- **AI Chat** — Ask AI to build, fix, or explain code
- **File Editor** — Full CodeMirror editor with syntax highlighting
- **Terminal** — Shell access to your project container
- **Live Preview** — See your app running in real-time
- **Version Control** — Git integration with push/pull
- **Publishing** — Deploy to web.recoder.xyz with one click

### Models Available
- Fast: Gemma 3, Llama 3.3, Qwen 3 (free)
- Balanced: Claude Haiku, GPT-4o Mini
- Powerful: Claude Sonnet, GPT-4o

---

## PM (Product Management)

### AI Features
- **Insight Synthesis** — AI analyzes feedback, usage, and support data
- **Contradiction Detection** — Finds conflicts between user feedback and usage patterns
- **RICE Scoring** — AI-generated feature prioritization scores
- **PRD Generation** — Auto-generate product requirement documents
- **AI Co-pilot** — Chat about your product insights

### Getting Started
1. Sign in at pm.recoder.xyz
2. Click "Generate sample data" on the Insights page
3. Explore features, feedback, releases, and initiatives
4. Use AI synthesis to generate insights

---

## Agency

### AI Features
- **AI Quote Generation** — Auto-generate quotes from client briefs
- **AI Brief Analysis** — Extract scope, timeline, risks from briefs
- **AI Deliverable Drafts** — Generate professional content for deliverables
- **Workflow Engine** — Visual workflow builder with AI nodes

### Workflow Editor
The Giselle-based workflow engine supports:
- Text generation (Claude, GPT, Gemini)
- Image generation (DALL-E, Imagen, FAL)
- RAG/Vector stores
- Web search
- Database queries

---

## A2A (Agent-to-Agent)

### What is A2A?
A2A enables AI agents to communicate and collaborate across platforms.

### Connecting
- **WebSocket**: `wss://docker.recoder.xyz/agent-bridge`
- **Headers**: `x-agent-id`, `x-capabilities`

### Supported Platforms
- Claude Code (MCP)
- OpenAI Codex (JSON-RPC)
- Cursor, Windsurf, Replit

---

## API

### Authentication
All API requests use Bearer token authentication:
```
Authorization: Bearer <session_token>
```

### Base URL
```
https://api.recoder.xyz/v1
```

### Key Endpoints
- `GET /agents` — List agents
- `POST /threads` — Create thread
- `POST /agent/start` — Start agent (Form data: prompt, thread_id)
- `GET /billing/account-state` — Billing info
- `GET /notifications` — List notifications
- `GET /health` — Health check

---

## BYOK (Bring Your Own Key)

Add your own AI provider keys at **Settings → API Keys**:
- OpenRouter
- Anthropic (Claude)
- OpenAI (GPT)
- Google (Gemini)

Platform provides free models by default. Premium models require BYOK or subscription.
