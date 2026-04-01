---
title: REST API
description: Docker backend REST API reference.
---

Base URL: `https://docker.recoder.xyz`

## Authentication

Include your Better Auth session token:

```
Authorization: Bearer <session_token>
```

## A2A Endpoints

### Tasks

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/a2a/tasks` | List tasks (filterable by state, assignee) |
| POST | `/api/a2a/tasks` | Create a new task |
| POST | `/api/a2a/tasks/:id/claim` | Claim a task for a session |
| PATCH | `/api/a2a/tasks/:id/transition` | Transition task state |

### Agents

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/a2a/agents` | List registered agents |
| GET | `/api/a2a/bridge/agents` | List live bridge sessions |

### Memory

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/a2a/memory` | Store a memory entry |
| POST | `/api/a2a/memory/search` | Semantic recall query |
| GET | `/api/a2a/memory/context` | Get recent context for injection |
| DELETE | `/api/a2a/memory/:id` | Delete a memory entry |

### Code Search

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/a2a/code-search/search` | Semantic code search |
| POST | `/api/a2a/code-search/index` | Index/re-index a file |
| DELETE | `/api/a2a/code-search/project/:id` | Drop project index |

### Platform Search

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/a2a/search` | Cross-platform Meilisearch query |
| POST | `/api/a2a/search/index` | Manual content indexing |

### Webhooks

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/a2a/webhook/chatwoot` | Chatwoot event receiver |
| POST | `/api/a2a/webhook/chatwoot/reply` | Send reply via Chatwoot |
| GET | `/api/a2a/webhook/health` | Webhook gateway health |
