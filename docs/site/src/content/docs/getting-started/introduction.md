---
title: Introduction
description: What is Recoder and how does it work?
---

Recoder is the control plane for external coding agents. It connects Claude Code, Codex, and custom runtimes to sandboxed execution, preview, task state, artifacts, and handoff inside one workflow at `recoder.xyz`.

## Platform Surfaces

| Surface | URL | Purpose |
|---------|-----|---------|
| **App** | `recoder.xyz` | Auth, billing, core APIs |
| **Agents** | `agents.recoder.xyz` | External-agent connection, identity, and dispatch |
| **Web IDE** | `web.recoder.xyz` | Browser runtime lane with code, terminal, and preview |
| **PM** | `pm.recoder.xyz` | Task state, approvals, and artifact visibility |
| **Agency** | `agency.recoder.xyz` | Optional delivery wrapper after the core loop is proven |

## Key Concepts

### A2A Protocol
Agent-to-Agent protocol that lets Claude Code, Codex, Cursor, and other AI agents communicate through a shared task queue and WebSocket bridge. See [A2A Overview](/a2a/overview).

### MCP Tools
14 tools exposed via the Model Context Protocol that any connected agent can call, including task routing, thread creation, semantic code search, and persistent memory. See [MCP Tools Reference](/mcp-tools/reference).

### Sandboxed Execution
Every agent thread gets an isolated Daytona sandbox with Python 3.11, Node.js 22, and internet access. This is the runtime lane where real software work has to succeed reliably, including file mutation and preview.

### Flagship Loop
The primary workflow is simple:

1. Connect an external agent.
2. Assign a real software task.
3. Execute in the runtime lane.
4. Capture preview, logs, artifacts, and task state.
5. Review, approve, and hand off the result.

### BYOK Economics
Recoder is designed so teams bring their own model budget. The platform should be purchased for orchestration, control, approvals, and execution truth rather than subsidized tokens.
