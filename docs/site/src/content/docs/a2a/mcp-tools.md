---
title: MCP Tools
description: All 14 tools available through the recoder-a2a MCP server.
---

The `recoder-a2a` npm package exposes 14 tools via the Model Context Protocol. Install with `npm install -g recoder-a2a`.

## Agent Communication

### `recoder_list_agents`
List all agents registered on the platform with health status.

### `recoder_list_tasks`
List recent A2A tasks with IDs, states, and assignments.

### `recoder_send_task`
Send a task to another agent.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `target_agent` | string | Yes | Target agent ID |
| `task` | string | Yes | Task description |
| `intent` | string | No | `execute`, `plan`, `handoff`, `tool_call` (default: `execute`) |

### `recoder_inbox`
Check inbound tasks assigned to this agent. Shows pending tasks from other agents and unclaimed REST tasks.

### `recoder_task_respond`
Complete or fail an inbound task.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `task_id` | string | Yes | Task ID from inbox |
| `result` | string | Yes | Response to send back |
| `status` | string | No | `complete` or `failed` (default: `complete`) |

## Agent Threads & Sandboxes

### `recoder_create_thread`
Create an AI agent thread with a Daytona sandbox.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `prompt` | string | Yes | Task for the AI agent |
| `agent_id` | string | No | Agent ID (default: Recoder assistant) |

### `recoder_get_thread`
Get messages from an existing thread, including AI responses.

### `recoder_sandbox_exec`
Execute a shell command in an isolated Daytona sandbox.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `command` | string | Yes | Shell command to execute |
| `sandbox_id` | string | No | Existing sandbox ID (creates new if omitted) |

## Memory & Search

### `recoder_remember`
Store a persistent memory entry. Memories are semantically searchable and survive across sessions.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `content` | string | Yes | What to remember |
| `type` | string | No | `preference`, `fact`, `task`, `code`, `decision`, `error` |
| `tags` | string[] | No | Categorization tags |

### `recoder_recall`
Semantic search over stored memories.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | Natural language query |
| `limit` | number | No | Max results (1-50, default: 10) |
| `type` | string | No | Filter by memory type |

### `recoder_forget`
Delete a memory entry by ID.

### `recoder_search_code`
Semantic code search across an indexed project.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `project_id` | string | Yes | Project to search |
| `query` | string | Yes | What to find (natural language) |
| `limit` | number | No | Max results (1-20, default: 10) |

### `recoder_search`
Search across all platform content: threads, files, PM features, agency projects.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `q` | string | Yes | Search query |
| `sources` | string[] | No | `threads`, `files`, `pm_features`, `agency_items` |
| `limit` | number | No | Max results (1-50, default: 10) |

## Canvas

### `recoder_canvas_update`
Push live Excalidraw element updates to a canvas board in the Recoder agents UI.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `project_id` | string | Yes | Project the canvas belongs to |
| `thread_id` | string | No | Thread ID for routing |
| `elements` | object[] | Yes | Excalidraw elements array |
