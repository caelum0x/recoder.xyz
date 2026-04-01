---
title: Introduction
description: What is Recoder and how does it work?
---

Recoder is a unified AI-powered development platform that connects multiple AI agents, sandboxed code execution, and project management into a single control plane at `recoder.xyz`.

## Platform Surfaces

| Surface | URL | Purpose |
|---------|-----|---------|
| **App** | `recoder.xyz` | Auth, billing, core APIs |
| **Agents** | `agents.recoder.xyz` | AI agent threads with sandboxed execution |
| **Web IDE** | `web.recoder.xyz` | Browser-based code editor with live preview |
| **PM** | `pm.recoder.xyz` | AI product management copilot |
| **Agency** | `agency.recoder.xyz` | Client project workflows |

## Key Concepts

### A2A Protocol
Agent-to-Agent protocol that lets Claude Code, Codex, Cursor, and other AI agents communicate through a shared task queue and WebSocket bridge. See [A2A Overview](/a2a/overview).

### MCP Tools
14 tools exposed via the Model Context Protocol that any connected agent can call — from sending tasks to other agents, to semantic code search, to persistent memory. See [MCP Tools Reference](/mcp-tools/reference).

### Sandboxed Execution
Every agent thread gets an isolated Daytona sandbox with Python 3.11, Node.js 22, and internet access. Code runs safely without affecting the host.

### Persistent Memory
Agents can store and recall facts, preferences, and decisions across sessions using Qdrant-backed semantic memory. "This user prefers Tailwind over CSS modules" persists between conversations.
