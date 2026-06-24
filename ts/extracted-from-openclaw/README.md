# Extracted from OpenClaw (2026-03-28)

Code extracted before removing OpenClaw from production.

## What's Here

### social-gateways/
Channel implementations — WhatsApp, Telegram, Slack, Discord, Signal, LINE, Feishu, iMessage.
Each has accounts, message normalization, API clients, and delivery logic.
**Use for:** porting into Agency or IronClaw as messaging channel plugins.

### agents/
Agent execution logic — scope management, patch application, auth, tool calling.
**Use for:** studying PIC agent patterns, potentially porting to Recoder Agents.

### gateway-core/
Core gateway + channel routing — auth, boot, chat handling, abort, attachments.
Also includes channel framework (allowlists, mention gating, sender identity, etc.).
**Use for:** reference when building Agency's channel layer.

### skills-reference/
List of 53 OpenClaw skills (not copied — just the directory listing).
Skills include: 1password, apple-notes, bear-notes, canvas, camsnap, etc.
**Use for:** inspiration for Recoder Agent skills.

## What Was Removed
- OpenClaw nginx server block (openclaw.recoder.xyz)
- OpenClaw upstream definition
- vcpeer + vcpeer-cron PM2 services (stop on server)
- openclaw-gateway Docker container (remove on server)

## Replacement Plan
See plan.md Phase 5 for IronClaw/ZeroClaw/build-into-Agency options.
