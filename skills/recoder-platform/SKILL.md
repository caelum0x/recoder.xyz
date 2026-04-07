---
name: recoder-platform
description: Interact with the Recoder platform APIs — sandbox management, file operations, project CRUD, and A2A task dispatch. Use when working on Recoder projects programmatically.
---

# Recoder Platform

Tools for interacting with the Recoder platform from within agent sessions.

## API Base URLs

- `https://api.recoder.xyz/v1` — Python backend (auth, threads, projects, sandbox)
- `https://docker.recoder.xyz` — Docker backend (files, exec, preview, opencode)
- `https://agents.recoder.xyz` — Agents frontend (UI, A2A bridge)

## Authentication

All API calls require a Bearer token:
```bash
curl -H "Authorization: Bearer $RECODER_API_KEY" https://api.recoder.xyz/v1/health
```

## Sandbox Operations

### Check sandbox status
```bash
curl -H "Authorization: Bearer $RECODER_API_KEY" \
  "https://api.recoder.xyz/v1/project/$PROJECT_ID/sandbox/status"
```

### Write file to sandbox
```bash
curl -X POST -H "Authorization: Bearer $RECODER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"path": "src/index.ts", "content": "console.log(\"hello\")"}' \
  "https://docker.recoder.xyz/api/file/$PROJECT_ID"
```

### Execute command in sandbox
```bash
curl -X POST -H "Authorization: Bearer $RECODER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"command": "npm install && npm run dev"}' \
  "https://docker.recoder.xyz/api/exec/$PROJECT_ID"
```

### Read file from sandbox
```bash
curl -H "Authorization: Bearer $RECODER_API_KEY" \
  "https://docker.recoder.xyz/api/file/$PROJECT_ID?path=src/index.ts"
```

## Project Management

### List projects
```bash
curl -H "Authorization: Bearer $RECODER_API_KEY" \
  "https://api.recoder.xyz/v1/projects"
```

### Get project details
```bash
curl -H "Authorization: Bearer $RECODER_API_KEY" \
  "https://api.recoder.xyz/v1/projects/$PROJECT_ID"
```

## A2A Task Dispatch

### Send task to another agent
```bash
curl -X POST -H "Authorization: Bearer $RECODER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"targetAgent": "codex", "task": "Review the auth module", "context": {}}' \
  "https://docker.recoder.xyz/api/a2a/tasks"
```

### Check inbox for tasks
```bash
curl -H "Authorization: Bearer $RECODER_API_KEY" \
  "https://docker.recoder.xyz/api/a2a/inbox"
```

## Pi Coding Agent

### Send coding prompt (uses Daytona sandbox directly)
```bash
curl -X POST -H "Authorization: Bearer $RECODER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Create a React landing page with Tailwind"}' \
  "https://docker.recoder.xyz/api/pi/$PROJECT_ID"
```
