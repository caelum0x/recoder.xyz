---
title: MCP Tools Reference
description: Complete reference for all recoder-a2a MCP tools.
---

See [A2A MCP Tools](/a2a/mcp-tools) for the full tool reference with parameters and usage examples.

## Installation

```bash
npm install -g recoder-a2a
```

## Version

Current: **2.8.0** (14 tools)

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `RECODER_SESSION_TOKEN` | Yes | Better Auth session token |
| `RECODER_DOCKER_URL` | No | Docker backend URL (default: `https://docker.recoder.xyz`) |
| `RECODER_API_URL` | No | Python API URL (default: `https://api.recoder.xyz`) |
| `RECODER_AGENT_ID` | No | Agent identifier (default: `claude_code`) |
| `RECODER_DAYTONA_URL` | No | Daytona API URL for sandbox exec |
| `DAYTONA_API_KEY` | No | Daytona API key for sandbox exec |
