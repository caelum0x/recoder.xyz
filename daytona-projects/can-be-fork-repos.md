# Repos We Can Directly Clone Into Daytona

Updated: May 6, 2026

This file is not a generic OSS inspiration list.

It answers one operational question for Recoder:

- which upstream repos can we clone directly into a Daytona workspace and use right away for product work, experiments, or reference implementation

The checked-out baseline for this decision is [`daytona-projects/daytona`](/Users/arhansubasi/recoder.xyz/daytona-projects/daytona:1), especially its sandbox, process, file, preview, SDK, and guide flows.

## What "Directly Clone And Use" Means

A repo belongs on the main list only if all of these are true:

1. it is a public repo we can clone as-is into a Daytona workspace
2. the useful path starts with normal repo operations: `git clone`, install deps, run commands, inspect files
3. the primary value is available inside a sandbox without inventing a separate control plane first
4. the repo uses a runtime shape Daytona already supports well: Node, TypeScript, Python, Go, Ruby, Java, Docker-compatible tooling, or a normal web app dev server
5. success can be verified from files, logs, tests, HTTP preview, or CLI output
6. the first useful run does not require private company infra, hidden credentials, or a large multi-service cluster we do not already operate
7. we can use upstream directly; we do not need to fork first just to evaluate or integrate it

If a repo fails any of those, it should not be on the direct-clone list.

## Disqualifiers

Do not put a repo in the main list if any of these are true:

- it is mostly interesting as a pattern or paper, but not a runnable workspace
- it requires proprietary hosted infrastructure before the first meaningful local or sandbox run
- it depends on a full desktop or computer-use lane for its basic value
- it is primarily a marketplace, directory, clone app, or consumer shell rather than an execution substrate
- it is so infra-heavy that "clone and use" really means "stand up a platform"
- it is only relevant if Recoder decides to own a completely separate product line

## Directly Clone And Use Now

These are acceptable upstream repos to clone into Daytona-backed workflows right now.

| Repo | Why it qualifies | Recommended use |
| --- | --- | --- |
| `daytonaio/daytona` | Directly aligned with the runtime layer we are already using. Public, runnable, documented, and structured around sandbox, file, process, preview, SDK, and computer-use primitives. | Source of truth for runtime capabilities, guides, and implementation patterns. Clone locally when we need to verify how a Daytona feature is expected to work. |
| `a2aproject/a2a-js` | Small, code-first integration surface. Useful in a normal Node workspace with standard install and test flows. | Use for A2A protocol experiments and adapter work. |
| `browserbase/stagehand` | Runnable TypeScript project with clear browser-automation value that maps to Recoder agent workflows. | Use for browser-task execution patterns, extraction flows, and tool design references. |
| `lightpanda-io/browser` | Directly useful for low-cost rendering and browser automation work. Fits normal build-and-run evaluation. | Use as an upstream browser/render lane, not as a fork target. |
| `vercel-labs/agent-browser` | Runnable browser-agent reference that fits the sandbox execution model better than a pure concept repo. | Use for reference implementations around browser agents and control flow. |
| `anomalyco/opencode` | Directly relevant to coding-agent runtime behavior and can be cloned and exercised in a sandbox. | Use for coding-runtime comparison, prompt behavior study, and integration experiments. |

## Cloneable With Moderate Setup Friction

These are still valid clone targets, but they should not be treated as instant drop-ins.

| Repo | Why it is not in the top tier | Use rule |
| --- | --- | --- |
| `e2b-dev/E2B` | Same general class as Daytona, but evaluation usually turns into platform comparison rather than immediate product integration. | Clone only when we are comparing execution substrates or portability assumptions. |
| `upstash/context7` | Useful project, but the value is more integration and service behavior than "run this repo locally and get immediate product leverage." | Clone for docs or retrieval experiments, not as a first-line runtime dependency. |
| `badlogic/sitegeist` | Interesting UX and browser-native patterns, but not a direct runtime primitive for Recoder. | Clone only for UI or interaction pattern borrowing. |
| `gastownhall/beads` | Cloneable and usable, but it is workflow infrastructure, not a runtime or preview primitive. | Clone when iterating on issue-tracking or agent-memory workflows. |
| `mem0ai/mem0` | Technically cloneable, but practical value depends on a larger memory-system decision. | Clone only when persistent agent memory becomes an active implementation lane. |

## Reference Only, Not Direct-Clone Inputs

These may still be useful to read, but they should not be presented as repos we can simply clone into Daytona and immediately use for the current Recoder lane.

| Repo | Why not |
| --- | --- |
| `vercel-labs/open-agents` | Better treated as a product reference than a direct runtime building block. |
| `vercel-labs/workflow-builder-template` | More of a later workflow-UI reference than an execution substrate. |
| `kortix-ai/wbac` | Overlaps with broader browser-agent tooling without being a clear direct-clone win. |
| `kortix-ai/agent-computer-use` | Too dependent on the later computer-use lane to count as a near-term direct-use repo. |
| `badlogic/pi-mono` | Broad agent toolkit; useful to study, but not a focused direct-clone dependency for Recoder. |
| `anomalyco/models.dev` | Reference dataset and service ideas, not a runnable core dependency. |
| `openclaw/openclaw` | Too broad and product-shaped relative to the current runtime-first priorities. |
| `openclaw/lobster` | Interesting shell and workflow ideas, but not a current direct-use repo. |
| `openclaw/clawhub` | Ecosystem directory, not an execution primitive. |

## Out Of Scope

These should stay off the working shortlist for the current Daytona-backed Recoder lane.

### Trading and crypto agents

- `NoFxAiOS/nofx`
- `kunalsinghdadhwal/LiqX`
- `yllvar/multi-modal-hyperliquid-trading-agent`
- `yolojewjitsu/moon-dev-ai-agents`
- `DefiLlama/DefiLlama-Adapters`
- `Jnix2007/hyper402`
- `hyperliquid-dex/order_book_server`

### Consumer chat, clone, or app-builder projects

- `ChatGPTNextWeb/NextChat`
- `nextify-limited/libra`
- `dyad-sh/dyad`
- `giselles-ai/giselle`
- `firecrawl/open-lovable`
- `zaidmukaddam/scira`
- `FOLLGAD/complexity`
- `Galaxies-dev/*`

### Large infra or adjacent stacks that are not direct-clone wins for this lane

- `openziti/ziti`
- `vllm-project/vllm`
- `slatedb/slatedb`
- `neondatabase/neon`
- `Dokploy/dokploy`
- `hunvreus/devpush`
- `SonicJs-Org/sonicjs`
- `directus-labs/agency-os`
- `haydenbleasel/eververse`

## Preferred Order

When I need an upstream repo for Daytona-backed Recoder work, use this order:

1. `daytonaio/daytona`
2. `a2aproject/a2a-js`
3. `browserbase/stagehand`
4. `lightpanda-io/browser`
5. `vercel-labs/agent-browser`
6. `anomalyco/opencode`
7. `e2b-dev/E2B`

## Practical Rule

If a repo is on the `Directly Clone And Use Now` list, we can pull it into a Daytona workspace without asking for a special exception.

If it is not on that list, treat it as reference material unless there is a specific implementation reason to promote it.
