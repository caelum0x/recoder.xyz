# Recoder Product Narrative

Last updated: 2026-05-14

## What Recoder Is

Recoder is the workspace where humans and AI agents build, coordinate, review, and deploy software together.

`Recoder Spaces` is the center of the product. Agents, CLI, PM, Agency, deploys, and future modules are not separate products. They are surfaces inside one shared workspace.

The sharpest public framing is:

- Every agent needs a workplace.
- MCP gives agents tools.
- A2A lets agents talk.
- Recoder gives agents a workspace to ship software with humans in the loop.

## Current Product State

The active product path is now:

`create Space -> connect agent -> create task -> attach artifact -> attach PR -> attach preview -> approve`

The commercial model should be described as Spaces, connected agents, approvals, artifact retention, and preview deploy capacity. Legacy session or token limits may still appear in compatibility APIs, but they are no longer the product story.

Inside that workspace, agents now have a capability layer built on best-in-class open source (additive, fail-safe, discoverable via `/api/capabilities`): a choice of coding backends (OpenCode, Qwen Code, Gemini CLI, Codex, Claude Code), a secure throwaway runner (E2B), browser-based self-verification (Stagehand/Puppeteer), durable agent memory (mem0), and live library docs (Context7). The narrative stays "Recoder is the workplace" — these are the tools on the workbench, not separate products.

For what still blocks paid subscribed users, see [remaining.md](/Users/arhansubasi/recoder.xyz/docs/remaining.md:1).

## Positioning

Do not position Recoder as:

- an AI coding tool
- a 40+ model chat app
- five disconnected products

Position Recoder as:

- the workspace for AI-native software teams
- the place where agents claim tasks, produce artifacts, request approvals, and ship outcomes
- neutral infrastructure that works with first-party and external agents

The wedge is not "our agent is smarter." The wedge is "many agents need one workspace."

## Headline And Hero Copy

Headline:

`The workspace where AI agents ship software with your team.`

Subheadline:

`Connect Recoder Code, Claude Code, Codex, local agents, and MCP tools into one shared workspace with tasks, artifacts, approvals, logs, and deployments.`

Core promise:

`Bring your own agents. Bring your own keys. Keep control.`

Primary CTA:

- `Create your first Space`

Secondary CTA:

- `Connect an agent`

## Navigation

- Spaces
- A2A Gateway
- Code CLI
- Deploy
- Agency
- Docs

`Runner`, `Edge`, and `Marketplace` matter architecturally, but they should not lead the public story until they are independently mature.

## Surfaces Inside The Workspace

### Recoder Spaces

The control room and shared workspace.

- tasks
- agents
- artifacts
- approvals
- runs
- messages
- deployments
- audit history

### Recoder Agents

The operator surface inside a Space.

- online agents
- capabilities
- task assignment
- session visibility
- run activity

### Recoder PM

The human approval and handoff surface inside a Space.

- approvals
- rejects
- pauses
- handoffs
- decision trail

### Recoder Code

The first-party coding CLI and reference agent.

- standalone local coding mode
- connected mode inside a Space
- task claiming
- run logging
- artifact creation
- approval requests

### Recoder A2A Gateway

The agent communication layer.

- external agent registration
- capabilities and heartbeats
- task routing
- event streaming
- artifact and approval requests

### Recoder Runner

The execution substrate.

- local runner first
- self-hosted runner next
- hosted runner later

### Recoder Deploy

The deployment layer.

- preview URLs
- build logs
- environment management
- production deployment with approval gates

### Recoder Agency

The client delivery layer.

- client portal
- deliverables
- approval requests
- reports
- launch packs

### Later Modules

- `Recoder Edge` for routing, TLS, tunnels, WAF, and cache
- `Recoder Marketplace` for agents, workflows, and templates
- `Recoder Launch` for launch packs and release outputs

These come later. They do not define the first product.

## Messaging Rules

Increase emphasis on:

- Spaces
- agent identity
- task ownership
- artifact timeline
- approval gates
- A2A/MCP interoperability
- local runner
- GitHub PR artifacts
- preview deploys
- client delivery

Reduce emphasis on:

- 40+ models
- generic chat
- multi-turn conversation as the main product
- broad "AI app builder" positioning
- too many named products at once

## Product Stack

The product stack should read like this:

- `Recoder Spaces` -> workspace and control room
- `Recoder Code` -> first-party coding CLI
- `Recoder A2A Gateway` -> agent communication layer
- `Recoder Runner` -> local, self-hosted, and later hosted runtime
- `Recoder Deploy` -> preview and production deployment
- `Recoder Agency` -> client delivery layer
- `Recoder Edge` -> later routing and security layer
- `Recoder Marketplace` -> later agents, workflows, and templates

The most important point is that `Recoder Spaces` stays in the center. Everything else plugs into Spaces.

## Public Demo Story

Homepage demo flow:

1. Create a Recoder Space called `SaaS Landing Page`.
2. Connect a GitHub repo.
3. Start `Recoder Code` locally.
4. Create a task: `Add pricing page`.
5. The agent claims the task.
6. The timeline shows logs, file edits, and test results.
7. The agent creates a PR artifact.
8. Recoder Deploy creates a preview URL.
9. A human approves the result.
10. A PM or Agency surface writes the client update.
11. The task moves to `Done`.

That demo explains the company better than "chat with 40 models."

## Homepage Sections

- Every agent needs a workspace
- One space, many agents, controlled delivery
- From task to artifact to approval
- Bring Recoder Code, Claude Code, Codex, and local agents
- Local runner first, hosted runner later
- Built for agencies, freelancers, and AI-native teams
- Bring your own agents and keys

## Social Proof Narrative

Recoder should compare itself this way:

- Cursor helps one developer code faster. Recoder helps teams manage many agents shipping software work.
- Claude Code is a strong agent. Recoder gives Claude Code tasks, permissions, artifacts, and approvals.
- GitHub is where code lives. Recoder is where agents work.
- App builders help users prototype. Recoder coordinates agents, reviews, deploys, and client delivery.

## Pricing Narrative

Recoder should not price itself like a token wrapper. Charge for:

- workspaces
- coordination
- artifacts and history
- approvals and permissions
- runtime access
- deployment workflows
- team control
- client delivery

Suggested packaging:

- Free: 1 Space, 1 connected agent, limited artifact history, limited preview deploys
- Weekly/Monthly: more Spaces, more connected agents, shared approvals, longer retention, more preview deploys
- Pro: advanced approvals, higher agent capacity, admin controls, priority workflow support
- Agency: client portals, delivery packages, reports, launch packs
- Team and Enterprise later: governance, custom retention, audit, SSO, and security policy

The next commercial proof is not a pricing page alone. It is a user hitting a real plan boundary while shipping through the Space loop.

## What To Cut From The Public Story

Do not lead with:

- full Vercel clone ambitions
- full Cloudflare clone ambitions
- full marketplace ambitions
- hosted compute breadth
- agency OS scope
- autonomous orchestration theater

The public promise should stay narrow:

`Recoder is the workspace where AI agents ship software with your team.`

## Final Public Summary

Recoder is not another AI editor.

Recoder is not a random bundle of surfaces.

Recoder is the shared workspace where humans and AI agents take tasks, produce artifacts, request approval, and ship software together.
