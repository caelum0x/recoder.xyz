---
name: recoder
description: Build and deploy web & mobile apps with Recoder. Use when the user asks to create an app, website, landing page, or any coding project. Creates projects, sends coding prompts, gets live preview URLs, and publishes to the web.
homepage: https://recoder.xyz
user-invocable: true
metadata: { "clawdbot": { "emoji": "🚀", "primaryEnv": "RECODER_API_KEY", "requires": { "env": ["RECODER_API_KEY"], "bins": ["node"] }, "install": [] } }
---

# Recoder — Build & Deploy Apps

Recoder is a cloud IDE that builds web and mobile apps with AI. You can create projects, send coding prompts, get live preview URLs, and publish to the web — all via API.

## Setup

The user must configure their Recoder API key as the `RECODER_API_KEY` environment
variable. Keys start with `sk_` and can be created at https://recoder.xyz/settings/api-keys.
If the key is missing or has the wrong format, every command fails fast with a clear
"not configured" error and a non-zero exit code (it does not attempt network calls).

The API base URL defaults to `https://api.recoder.xyz` but can be overridden with the `RECODER_API_URL` environment variable.

## Available Commands

Use the script at `{baseDir}/scripts/recoder-api.mjs` for all Recoder operations:

### Create a Project

```bash
node {baseDir}/scripts/recoder-api.mjs create --name "My App" --template react
```

Templates: `react` (default), `nextjs`, `vue`, `svelte`, `expo`, `html`

Returns: project ID and preview URL.

### Send a Prompt

```bash
node {baseDir}/scripts/recoder-api.mjs prompt --project <project-id> --prompt "Add a dark mode toggle"
```

Optional: `--model <model-id>` to specify the AI model.

Returns: a `taskId` and `status` (`queued`). Prompts run asynchronously — the preview
URL updates once the AI finishes. The same `taskId` can be used to poll task status.

### Get Preview URL

```bash
node {baseDir}/scripts/recoder-api.mjs preview --project <project-id>
```

Returns: live preview URL the user can open in their browser or on their phone.

### List Projects

```bash
node {baseDir}/scripts/recoder-api.mjs list
```

Returns: all projects with their IDs, names, and statuses.

### Publish to Web

```bash
node {baseDir}/scripts/recoder-api.mjs publish --project <project-id>
```

Returns: public URL (e.g., `https://web.recoder.xyz/my-app`).

## Workflow

When the user asks to build something:

1. **Create** a project with an appropriate template:
   - Web app / landing page / dashboard → `react` or `nextjs`
   - Mobile app → `expo`
   - Simple page → `html`
2. **Send** the user's request as a prompt to the project.
3. **Share** the preview URL so the user can see the result.
4. If the user asks for changes, send follow-up prompts to the same project.
5. When the user is happy, **publish** to get a permanent public URL.

## Example Interaction

User: "Build me a todo app with React and Tailwind"

1. Create project: `node {baseDir}/scripts/recoder-api.mjs create --name "Todo App" --template react`
2. Send prompt: `node {baseDir}/scripts/recoder-api.mjs prompt --project <id> --prompt "Build a todo app with React and Tailwind CSS. Include add, delete, and mark-complete features with a clean modern UI."`
3. Get preview: `node {baseDir}/scripts/recoder-api.mjs preview --project <id>`
4. Share the preview URL with the user.

User: "Add dark mode"

5. Send follow-up: `node {baseDir}/scripts/recoder-api.mjs prompt --project <id> --prompt "Add dark mode toggle"`
6. Share updated preview URL.

User: "Ship it!"

7. Publish: `node {baseDir}/scripts/recoder-api.mjs publish --project <id>`
8. Share the public URL.

## Important Notes

- Always create a project before sending prompts.
- Keep track of the project ID across the conversation — reuse it for follow-up prompts.
- The preview URL is live and updates in real-time as the AI makes changes.
- Templates determine the starting framework. Pick the one closest to what the user wants.
- For mobile apps, use the `expo` template. The user can scan a QR code with Expo Go.
