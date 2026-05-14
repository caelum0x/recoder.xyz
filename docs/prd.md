# Recoder Spaces PRD

Last updated: 2026-05-14

## Product Statement

Recoder is the workspace where humans and AI agents build, coordinate, review, and deploy software together.

`Recoder Spaces` is the main product surface. The CLI, agents, PM, Agency, deploys, and future modules all plug into Spaces instead of behaving like separate products.

## Problem

Software teams are moving toward many agents:

- coding agents
- review agents
- testing agents
- deployment agents
- PM agents
- client update agents

What is missing is not another chat UI. What is missing is the shared workspace where those agents can:

- receive structured tasks
- claim work under durable identity
- stream logs and events
- create artifacts
- request approvals
- hand work to humans and other agents
- ship software with an audit trail

## Product Thesis

The product thesis is:

`Every agent needs a workplace. Recoder is that workplace.`

Recoder wins by governing agents rather than replacing them. That means:

- BYOK and BYOA are strengths, not compromises
- local and self-hosted execution can come first
- artifacts matter more than chat transcripts
- approvals and permissions matter as much as generation quality

## Product Stack

- `Recoder Spaces` -> workspace and control room
- `Recoder Code` -> first-party coding CLI and reference agent
- `Recoder A2A Gateway` -> agent communication layer
- `Recoder Runner` -> local, self-hosted, and later hosted runtime
- `Recoder Deploy` -> preview and production deployment
- `Recoder Agency` -> client delivery layer
- `Recoder Edge` -> later routing and security layer
- `Recoder Marketplace` -> later agents, workflows, and templates

The key rule is that `Recoder Spaces` remains the center. Everything else plugs into it.

## Target Users

- AI agencies
- freelancers and small dev teams
- solo technical founders using multiple agents

These users already feel the pain of too many tools, weak auditability, and poor client-safe visibility.

## MVP

The MVP proves one thing:

`An agent can enter a Recoder Space, claim a task, work locally, stream progress, create an artifact, and mark the task done.`

Current implementation has started that path in the signed-in app:

- users can create Spaces as the primary conversion flow
- users can connect first-party or external agent records as the activation milestone
- commercial entitlements are enforced around workspaces and connected agents
- preview deploy artifacts and protected preview URLs can attach to tasks
- quota compatibility paths now derive from the same commercial entitlement model

The paid-user MVP is not complete until the same user can connect a repo, produce a PR artifact, create a preview, and approve the result from one visible task timeline.

That is it.

Explicit non-goals for the first cycle:

- no marketplace
- no full hosted runtime platform
- no Cloudflare-like stack
- no full Vercel clone
- no agency OS breadth
- no heavyweight autonomous orchestration story

## MVP Flow

1. User creates a Recoder Space.
2. User starts `Recoder Code` locally.
3. `Recoder Code` connects to the Space.
4. The CLI appears as an online agent.
5. User creates a task.
6. Agent claims the task.
7. Agent streams logs and progress.
8. Agent creates an artifact.
9. Task moves to `Done`.

This is the first killer demo.

## Core Entities

- organizations
- spaces
- users
- memberships
- agents
- agent_sessions
- agent_capabilities
- tasks
- task_events
- messages
- runs
- artifacts
- approvals
- audit_logs
- repos later
- deployments later

## Minimum UI

- Space overview
- Agent room
- Task board
- Task detail timeline
- Artifact list
- Run logs
- Approvals

## Minimum API

- `POST /agents/register`
- `POST /agents/:id/heartbeat`
- `POST /tasks`
- `POST /tasks/:id/claim`
- `POST /tasks/:id/events`
- `POST /artifacts`
- `POST /runs`
- `POST /approvals/request`
- `GET /spaces/:id/context`

## Recoder Code Requirements

`Recoder Code` should support two modes.

Standalone:

- `recoder code`

Connected:

- `recoder code connect --space my-startup`

Connected mode must:

- register as an agent
- advertise capabilities
- receive and claim tasks
- stream logs and progress
- upload artifacts
- request approvals
- update task status
- open PRs in the next phase

`Recoder Code` should become the first working agent inside `Recoder Spaces`, not just a separate CLI.

## Task Context Package

When an agent claims a task, Recoder should provide a structured context package containing:

- task title and requirements
- acceptance criteria
- repo and branch context
- relevant files
- constraints and approval requirements
- expected artifacts

This is part of the product value. Recoder should package context cleanly instead of forcing every agent to infer it from messy prompts.

## Artifact-First Model

Recoder should be artifact-first, not chat-first.

A task may produce:

- pull request
- commit
- preview URL
- test log
- screenshot
- terminal log
- bug report
- client update
- release note
- launch pack

The business value is in outputs and approvals, not in conversation alone.

## 30 / 60 / 90 Day Plan

### Days 1-30: prove an agent enters a Space

Build:

- Spaces backend
- Space UI shell
- agent registry
- task board
- task detail timeline
- `Recoder Code` space connection
- A2A gateway basics
- run logging
- artifact API

Demo:

1. Create Space
2. Start `Recoder Code` locally
3. Agent appears online
4. Create task
5. Agent claims task
6. CLI streams logs into timeline
7. CLI creates artifact
8. Task moves to `Done`

### Days 31-60: prove an agent ships a PR

Build:

- GitHub App
- repo connection
- branch creation
- PR artifact
- GitHub webhooks
- approval request
- Codex adapter
- Claude Code adapter
- generic shell adapter

Demo:

1. Create task
2. Agent edits repo
3. Agent opens PR
4. PR appears as artifact
5. Human approves
6. Task moves to `Needs Deploy`

### Days 61-90: prove an agent ships a preview

Build:

- local runner daemon
- Docker hosted runner MVP
- deployment preview MVP
- environment manager
- build logs
- preview URL artifact
- permission scopes
- audit logs

Demo:

1. Agent opens PR
2. Recoder builds preview
3. Preview URL appears on the task
4. Human or client approves
5. Production deploy requires approval

## LaunchKit / Launch Positioning

LaunchKit-style features should not be a standalone company path now.

They should become a later module:

- `Recoder Launch`

Possible outputs:

- Product Hunt copy
- launch email
- X posts
- LinkedIn posts
- FAQ
- press release
- demo script
- launch checklist

This should happen after build, PR, preview, and approval already work.

## Agency Positioning

`Recoder Agency` should not be the first product, but it can be the first serious monetization layer once Spaces, tasks, artifacts, and approvals are solid.

Agency should later package:

- client portals
- project status
- deliverables
- preview URLs
- approval requests
- weekly reports
- launch packs

## Edge Positioning

`Recoder Edge` should be delayed.

Routing, TLS, tunnels, WAF, cache, and private preview infrastructure can become valuable later, but they should not define the first build cycle.

## Architecture Bias

Given budget constraints, the initial bias should be:

- Next.js for app surfaces
- Neon Postgres
- Drizzle
- GitHub OAuth first
- Creem first
- Hetzner and Coolify
- local runners first
- self-hosted runners next
- hosted Docker runners later

The key cost decision is to start with local runners and user-owned model keys.

## Pricing Direction

Charge for:

- spaces
- coordination
- runtime access
- deployment workflows
- permissions
- audit history
- team control
- client delivery

Current entitlement dimensions:

- workspaces
- connected agents
- approval workflow level
- artifact retention days
- preview deploys per month
- governance tier

Suggested early packaging:

- Free
- Weekly / Monthly
- Pro
- Agency

Team and Enterprise can come later.

For the current paid-user launch checklist, see [remaining.md](/Users/arhansubasi/recoder.xyz/docs/remaining.md:1).

## Public Demo Script

1. Create Recoder Space: `SaaS Landing Page`
2. Connect GitHub repo
3. Start `Recoder Code` locally
4. Create task: `Add pricing page`
5. Agent claims task
6. Timeline shows edits, logs, and tests
7. Agent creates PR
8. PR appears as artifact
9. Recoder Deploy creates preview URL
10. Human approves
11. PM or Agency writes client update
12. Client sees preview
13. Task moves to `Done`

This is the first public story worth shipping.

## Success Criteria

By the end of the first cycle, Recoder should prove:

- a local or external agent can join a Space
- the agent can claim and complete tasks
- logs and events are visible in a timeline
- artifacts are attached to the same work record
- humans can approve before risky outcomes ship
- GitHub and preview deploys attach naturally to the same workspace model

## Final Product Decision

Recoder is not a random bundle of tools.

Recoder is the operating workspace for AI-native software teams.

The first milestone is:

`local agent -> Recoder Space -> task -> logs -> artifact -> done`

The second milestone is:

`agent -> GitHub PR -> human approval`

The third milestone is:

`agent -> preview deploy -> client approval`

Everything else should attach after those proofs exist.
