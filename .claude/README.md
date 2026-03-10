# Claude Code Settings

## Security Notice

This directory contains Claude Code configuration files. The `settings.local.json` file may contain sensitive information such as API keys, database credentials, and other secrets.

## Setup

1. Copy `settings.local.example.json` to `settings.local.json`:
   ```bash
   cp .claude/settings.local.example.json .claude/settings.local.json
   ```

2. Update `settings.local.json` with your actual credentials:
   - Replace `YOUR_DB_PASSWORD` with your database password
   - Replace `YOUR_DB_USER` with your database username
   - Replace `YOUR_DB_HOST` with your database host
   - Replace `YOUR_DB_NAME` with your database name

## Important

- **NEVER** commit `settings.local.json` to Git
- The file is already in `.gitignore` to prevent accidental commits
- Use environment variables or secure secret management for production environments

## File Structure

- `settings.local.json` - Your local settings with secrets (IGNORED by Git)
- `settings.local.example.json` - Template file safe to commit
- `agents/` - Claude Code agent configurations
- `rules/` - Project-specific operating standards and technical strategy
- `skills/` - Local skill definitions

## Personas and Swarm Commands

Use these command intents consistently:

- `/architect` - system design, tradeoffs, ADR creation
- `/builder` - implementation, refactors, bug fixes
- `/product-manager` - PRDs, user stories, acceptance criteria
- `/swarm-plan` - parallel exploration and option analysis
- `/swarm-execute` - parallel implementation with worker split
- `/swarm-review` - adversarial/multi-angle review
- `/code-check` - SOLID/DRY/consistency and regression audit

Recommended sequencing:

1. `/architect` or `/swarm-plan`
2. `/builder` or `/swarm-execute`
3. `/swarm-review` + `/code-check`
