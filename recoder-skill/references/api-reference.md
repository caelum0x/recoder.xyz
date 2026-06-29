# Recoder Public API Reference

Base URL: `https://api.recoder.xyz/api/v1`

Authentication: `Authorization: Bearer sk_...` header. API keys start with `sk_`.

All successful responses are wrapped in an envelope:

```json
{ "success": true, "data": { ... }, "requestId": "...", "timestamp": "..." }
```

All errors use:

```json
{ "success": false, "error": { "code": "...", "message": "...", "details": { ... } }, "requestId": "...", "timestamp": "..." }
```

---

## POST /projects

Create a new project.

**Request:**
```json
{
  "name": "My App",
  "template": "react",
  "description": "Optional description"
}
```

**Templates:** `react`, `nextjs`, `vue`, `svelte`, `expo`, `html`

**Response (201):**
```json
{
  "data": {
    "id": "proj_abc123",
    "name": "My App",
    "status": "running",
    "template": "react",
    "previewUrl": "http://preview.recoder.xyz:3001",
    "createdAt": 1706889600000
  }
}
```

---

## GET /projects

List all projects for the authenticated API key.

**Response (200):**
```json
{
  "data": {
    "projects": [
      {
        "id": "proj_abc123",
        "name": "My App",
        "status": "running",
        "createdAt": 1706889600000
      }
    ]
  }
}
```

---

## GET /projects/:id

Get project details.

**Response (200):**
```json
{
  "data": {
    "id": "proj_abc123",
    "name": "My App",
    "status": "running",
    "template": "react",
    "framework": "vite",
    "previewUrl": "http://preview.recoder.xyz:3001",
    "publishedUrl": "https://web.recoder.xyz/my-app",
    "createdAt": 1706889600000
  }
}
```

---

## POST /projects/:id/prompt

Send a coding prompt to the AI.

**Request:**
```json
{
  "prompt": "Add a dark mode toggle with a smooth animation",
  "model": "anthropic/claude-sonnet-4.5"
}
```

The `model` field is optional. If omitted, the server uses the default model.

**Response (202 Accepted):**
```json
{
  "data": {
    "taskId": "task_xyz789",
    "status": "queued"
  }
}
```

Note: Prompts are processed asynchronously and return immediately with a `taskId`.
Poll `GET /projects/:id/tasks/:taskId` for task status, or open the SSE stream at
`GET /projects/:id/tasks/:taskId/stream`. The preview URL updates once the AI finishes.

---

## POST /projects/:id/publish

Publish the project to a public URL.

**Response (200):**
```json
{
  "data": {
    "url": "https://web.recoder.xyz/my-app",
    "slug": "my-app",
    "publishedAt": "2026-02-04T12:00:00.000Z"
  }
}
```

---

## Error Responses

All errors follow the envelope format described above (`success: false` with an
`error` object). Common error codes:

- `INVALID_API_KEY` — Invalid, missing, or expired API key (401)
- `INSUFFICIENT_SCOPE` — Key lacks the required scope, e.g. `projects:write` (403)
- `IP_NOT_ALLOWED` — Request from a disallowed IP (403)
- `RATE_LIMIT_EXCEEDED` — Too many requests; `details.retryAfter` is in seconds (429)
- `MISSING_REQUIRED_FIELD` — A required field is missing or empty (400)
- `PROJECT_NOT_FOUND` — Project doesn't exist, isn't running, or you don't have access (404)
- `PROJECT_CREATION_FAILED` — Failed to create the project container (500)
- `PROJECT_PUBLISH_FAILED` — Failed to publish the project (500)
- `SERVICE_UNAVAILABLE` — Project service not initialized (503)

---

## Rate Limits

- Per-key request rate limiting is enforced; limits vary by key tier.
- On `429 RATE_LIMIT_EXCEEDED`, the response includes a `Retry-After` header (seconds)
  and `error.details.retryAfter`.
- Some routes (e.g. `prompt`, task reads, task streams) have additional per-route limits.
