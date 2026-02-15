# Recoder Public API Reference

Base URL: `https://api.recoder.xyz/api/v1`

Authentication: `X-API-Key` header with your Recoder API key.

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

**Response (200):**
```json
{
  "data": {
    "messageId": "msg_xyz789",
    "status": "sent"
  }
}
```

Note: The prompt is processed asynchronously. The preview URL will update once the AI finishes making changes.

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

All errors follow this format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message"
  }
}
```

Common error codes:
- `UNAUTHORIZED` — Invalid or missing API key
- `RATE_LIMITED` — Too many requests (includes `retryAfter` in seconds)
- `MISSING_REQUIRED_FIELD` — A required field is missing from the request
- `PROJECT_NOT_FOUND` — Project doesn't exist or you don't have access
- `PROJECT_CREATION_FAILED` — Failed to create the project container
- `PROJECT_PUBLISH_FAILED` — Failed to publish the project

---

## Rate Limits

- Default: 60 requests per minute per API key
- Rate limit headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
