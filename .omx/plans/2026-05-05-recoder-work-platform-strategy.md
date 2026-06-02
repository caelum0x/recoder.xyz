# Recoder Work Platform Strategy

Date: 2026-05-05
Owner: Codex planning pass
Scope: Product strategy, wedge selection, sequencing for `recoder.xyz`

## Requirements Summary

Recoder should not stay positioned as a generic "AI coding platform" or a loose bundle of agent tools. The better opportunity is to become the control plane where external AI agents like Claude Code and Codex connect, execute work, and use multiple Recoder surfaces as infrastructure.

The strategic question is not "how do we build another copilot?" It is "what category can Recoder own where better models increase margin and defensibility instead of commoditizing the product?"

The user thesis is:

- the winning AI companies will sell work, not seats
- services spend is much larger than software spend
- Recoder should move from "tool for humans" toward "software stack for AI workers and AI-native service firms"

Current repo/platform evidence:

- Recoder already has multiple production-facing surfaces: hub, Web IDE, agents, PM, agency, A2A/MCP flows in [plan.md](/Users/arhansubasi/recoder.xyz/plan.md:9)
- the desired architecture already centers on browser/auth authority plus agent/runtime surfaces, not a single monolith, in [plan.md](/Users/arhansubasi/recoder.xyz/plan.md:69)
- the live homepage already signals an A2A gateway and external agent connectivity, visible in the current `recoder.xyz` HTML response inspected on 2026-05-05

## ADR

Decision:
Reposition Recoder as the work infrastructure layer for AI agents, with a wedge in "AI worker operating system" rather than "AI coding copilot" or broad horizontal chat UI.

Drivers:

- Better models will compress pure UI-layer copilot moats.
- Recoder already has the right primitives for orchestration: auth, agents, Web IDE/runtime, PM, agency, A2A/MCP, preview, and execution control.
- The platform can become more valuable when users bring external agents instead of less valuable.

Alternatives considered:

- Stay a general AI coding/Web IDE product.
- Become a broad "all-in-one AI workspace for humans."
- Pivot directly into a full vertical AI service company (accounting, legal, etc.).

Why chosen:

- The current asset base fits agent infrastructure better than pure SaaS and better than jumping immediately into one services vertical.
- It gives Recoder a clearer wedge: "connect your agent to do work" instead of "use our assistant UI."
- It preserves optionality. Later you can layer vertical AI-service workflows on top of the same infrastructure.

Consequences:

- Product, messaging, and roadmap must stop centering the human chat surface.
- Reliability of agent execution, auth, task state, previews, tool access, audit trails, and multi-surface handoff becomes the top priority.
- Some current surfaces will need simplification and tighter integration under one agent-work model.

Follow-ups:

- tighten the wedge
- simplify the message
- pick one high-value workflow where external agents can deliver real work
- harden the runtime and deployment path enough to make that workflow trustworthy

## Positioning Recommendation

### Category

Recoder should be framed as:

"The operating system for AI workers."

More concrete variants:

- "Connect Claude Code, Codex, and your own agents to a real work platform."
- "Infrastructure for AI-native service firms."
- "A work execution layer for AI agents across coding, ops, PM, and client delivery."

### What Recoder is not

- not another generic copilot
- not just a browser IDE
- not only an MCP directory
- not yet a vertical AI accounting or law firm

### What Recoder is

- auth and identity for agents and humans
- execution runtime for agent work
- tool and surface orchestration across Web IDE, PM, agency, and agents
- task, preview, artifact, and approval infrastructure
- the place external agents plug into to do durable work

## Clear Wedge

The best immediate wedge is not "AI does all knowledge work." That is too broad.

The best wedge is:

"Bring your own agent, connect it to Recoder, and let it operate across real software work surfaces."

That wedge is strong because it is:

- understandable
- compatible with current product assets
- differentiated from standalone model UIs
- extensible into service-delivery verticals later

## Recommended Go-To-Market Sequence

### Phase 1: Own Agent-Native Software Work

Target user:
small teams and technical operators who already use Claude Code, Codex, Cursor, or custom agents

Promise:
"Your agents should not live in isolated chat windows. Connect them to Recoder so they can execute, preview, coordinate, and ship work."

Primary jobs:

- code changes
- debugging
- previews and verification
- PM/task execution
- client/agency handoff

Why this first:

- it matches current surfaces in [plan.md](/Users/arhansubasi/recoder.xyz/plan.md:14)
- you already have A2A/MCP and runtime primitives
- the buyer is already agent-native and does not need AI education

### Phase 2: Productize AI Worker Teams

Promise:
"Run agent teams, not just single prompts."

Primary jobs:

- assign work
- route between coding, PM, and agency lanes
- attach approvals, artifacts, logs, and previews
- let human operators supervise exceptions, not every action

This is where Recoder stops looking like software and starts looking like a work platform.

### Phase 3: Verticalize Into AI Service Firms

Only after Phase 1 and 2 are stable:

- AI software agency
- AI growth/content agency
- AI implementation partner workflows
- later, operational verticals with strong process structure

This is where Sequoia's "sell work, not software" thesis becomes fully monetizable.

## Product Strategy

### Core Product Thesis

Recoder should unify four layers:

1. Agent identity and access
2. Agent execution and tooling
3. Work surfaces and artifacts
4. Human approval, audit, and billing

### Product North Star

An external agent can:

- authenticate into Recoder
- discover tools and work context
- take a task
- execute across coding, PM, and delivery surfaces
- produce artifacts and previews
- request approval when needed
- complete work with traceability

### Primary Product Loop

1. User connects agent to Recoder.
2. User assigns real work.
3. Agent executes in Web IDE/runtime and related surfaces.
4. Recoder captures state, artifacts, logs, approvals, and previews.
5. User trusts Recoder with bigger work.
6. Team expands from one agent to multi-agent workflows.

## Acceptance Criteria

- Homepage/message can be reduced to one sentence that clearly states agent-work infrastructure positioning.
- A first-time user can understand the difference between Recoder and a copilot in under 10 seconds.
- There is one primary onboarding path centered on connecting an external agent.
- There is one flagship workflow that proves multi-surface agent work end to end.
- Runtime/deploy reliability is high enough that the flagship workflow can be demoed repeatedly.
- Pricing can be tied to work execution or managed outcomes, not only seats.

## Implementation Plan

### Step 1: Fix the narrative

Update homepage, docs, and product language so the center of gravity becomes:

- connect your agent
- give it work
- run across Recoder surfaces

This should replace diffuse "AI platform" language currently spread across the hub and related pages.

### Step 2: Define the flagship workflow

Pick one canonical demo and product path:

- "external agent completes a software task across code, preview, PM, and handoff"

Do not try to launch five wedges at once. One strong path is enough.

### Step 3: Simplify surface architecture around that workflow

Based on the desired architecture in [plan.md](/Users/arhansubasi/recoder.xyz/plan.md:69), make the user story coherent:

- app = identity and authority
- recoder-web = agent coding/runtime surface
- agents = agent registry / execution entrypoint
- pm = task and work-state layer
- agency = delivery/client-facing layer

Every surface should map to one sentence in the workflow.

### Step 4: Harden runtime reliability before expanding scope

The current blocker is not strategy; it is trust. The runtime/edit lane is still unstable in [plan.md](/Users/arhansubasi/recoder.xyz/plan.md:44).

Until the flagship flow is reliable:

- do not broaden the product story too much
- do not promise full AI worker teams broadly
- do not add more surface complexity

### Step 5: Add work-native primitives

Prioritize primitives that matter for selling work:

- approvals
- audit trails
- task state
- artifact outputs
- client-visible deliverables
- cost/accountability by run or outcome

### Step 6: Test pricing against the wedge

Move away from pure seat framing. Explore:

- per active agent
- per work run / task volume
- per managed workflow lane
- later, outcome- or service-tier pricing

## Risks and Mitigations

Risk:
The message stays too broad and sounds like another AI workspace.

Mitigation:
Force every landing page and onboarding step to answer: "Why not just use Claude Code directly?"

Risk:
The infrastructure is too unstable to support the bigger thesis.

Mitigation:
Narrow the flagship workflow and make reliability the top roadmap item before broader GTM pushes.

Risk:
Trying to jump directly into a vertical AI service company spreads the team too thin.

Mitigation:
First sell infrastructure for AI-native operators; verticalize only after the agent-work loop is trustworthy.

Risk:
Recoder becomes a collection of disconnected tools again.

Mitigation:
Use one canonical workflow and one architecture story to judge roadmap decisions.

## Verification Steps

- Rewrite the homepage hero and test whether users can restate the value proposition in one sentence.
- Run 10 customer interviews with agent-native users and ask what they believe Recoder is after a 30-second walkthrough.
- Validate one full external-agent workflow in production three times in a row without manual rescue.
- Check whether users naturally ask to connect existing agents rather than asking "which model do you provide?"
- Review roadmap items and cut anything that does not strengthen the flagship agent-work loop.

## Recommended Next Decisions

1. Choose the exact wedge sentence.
2. Choose the single flagship workflow.
3. Decide whether the first commercial motion is:
   - developer infra for external agents
   - AI-native software agency infrastructure
   - internal AI worker operating system for teams
4. Freeze non-core exploration until the runtime lane is reliable enough to support the story.

## My Recommendation

The strongest version is:

"Recoder is the operating system for AI workers. Connect Claude Code, Codex, or your own agents, then let them execute real work across coding, PM, and delivery surfaces."

That keeps the wedge sharp, fits the product you already have, and leaves room to evolve into selling work rather than selling software.
