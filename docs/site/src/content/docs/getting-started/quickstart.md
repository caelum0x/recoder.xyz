---
title: Quickstart
description: Get connected to Recoder in 5 minutes.
---

## Install the bridge client

```bash
npm install -g recoder-a2a
```

## Configure your external agent

Claude Code is the easiest example, but the same flow applies to Codex or your own MCP-capable runtime.

Add to your Claude Code MCP config (`~/.claude/mcp.json`):

```json
{
  "mcpServers": {
    "recoder": {
      "command": "recoder-a2a",
      "env": {
        "RECODER_SESSION_TOKEN": "<your-session-token>",
        "RECODER_DOCKER_URL": "https://docker.recoder.xyz"
      }
    }
  }
}
```

## Get Your Session Token

1. Log in to [recoder.xyz](https://recoder.xyz)
2. Open browser DevTools → Application → Cookies
3. Copy the `better-auth.session_token` value

## Verify Connection

In Claude Code, run:

```
Use recoder_list_agents to check my connection
```

You should see your agent listed with status `connected`.

## Run the flagship loop

Assign a real software task:

```
Use recoder_create_thread to start a task for "fix the dashboard loading state and return a preview URL"
```

Then verify that the run produces:

- code changes in the runtime lane
- a preview or artifact to review
- task state that matches the real execution outcome

## Next Steps

- [A2A Protocol Overview](/a2a/overview) — understand how agents communicate
- [MCP Tools Reference](/mcp-tools/reference) — all 14 available tools
- [BYOK Setup](/byok/setup) — bring your own API keys
