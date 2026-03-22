# Recoder API Reference

**Base URL:** `https://api.recoder.xyz/v1`

**Auth:** All endpoints require `Authorization: Bearer <token>` header.

---

## Health
```
GET /health
→ {"status": "ok", "timestamp": "...", "instance_id": "..."}
```

## Agents
```
GET /agents?limit=10&sort_by=name&sort_order=asc
→ {"agents": [...], "pagination": {...}}

POST /agents
Body: {"name": "...", "description": "...", "system_prompt": "...", "model": "..."}
→ {"agent_id": "...", "name": "...", ...}
```

## Threads
```
GET /threads?limit=20
→ {"threads": [...], "pagination": {...}}

POST /threads
Body: {"agent_id": "..."}
→ {"thread_id": "...", "project_id": "...", "sandbox_id": "..."}

GET /threads/:id/messages
→ [{"role": "user", "content": "..."}, ...]
```

## Agent Execution
```
POST /agent/start (multipart/form-data)
Fields: prompt, thread_id, agent_id, model_name (optional)
→ {"thread_id": "...", "agent_run_id": "...", "status": "running"}
```

## Billing
```
GET /billing/account-state
→ {"credits": {"total": 9999900, "can_run": true}, "subscription": {...}, "models": [...]}
```

## Notifications
```
GET /notifications?limit=20&offset=0&unread_only=false
→ {"notifications": [...], "total": 0}

POST /notifications/:id/read
→ {"success": true}

POST /notifications/read-all
→ {"success": true}
```

## Prompts
```
GET /prompts
→ [{"id": "...", "name": "...", "content": "..."}]
```

## User Preferences
```
GET /preferences?category=appearance
→ {"preferences": [...]}

PUT /preferences/batch
Body: {"preferences": [{"preference_key": "...", "preference_value": ..., "category": "..."}]}
```

## MFA
```
GET /mfa/status
→ {"current_level": "aal1", "action_required": "none", ...}
```

## Composio
```
GET /composio/toolkits/:toolkit/icon
→ 200 (image)
```

## A2A (docker.recoder.xyz)
```
GET /api/a2a/agents
→ {"ok": true, "agents": [...]}

GET /api/a2a/tasks
→ {"success": true, "data": {"tasks": [], "count": 0}}

POST /api/a2a/tasks
Body: {"workspace_id": "...", "thread_id": "...", "requester": {...}, "assignee": {...}, "connector": {...}, "payload": {...}}

WebSocket: wss://docker.recoder.xyz/agent-bridge
Headers: x-agent-id, x-capabilities
```
