# Webhooks

Recoder webhooks deliver real-time HTTP POST notifications to your server when events occur in your account. This guide covers available events, configuration, signature verification, and best practices.

---

## Available Events

| Event               | Trigger                                       | Payload fields                                      |
|---------------------|-----------------------------------------------|-----------------------------------------------------|
| `agent.created`     | A new agent is created                        | `agent_id`, `name`                                  |
| `agent.updated`     | An agent configuration is updated             | `agent_id`                                          |
| `agent.deleted`     | An agent is deleted                           | `agent_id`                                          |
| `thread.created`    | A new thread (conversation) is created        | `thread_id`, `project_id`                           |
| `thread.completed`  | An agent run finishes successfully            | `thread_id`, `agent_run_id`, `status`               |
| `thread.failed`     | An agent run fails or errors                  | `thread_id`, `agent_run_id`, `status`, `error`      |
| `workflow.executed`  | A workflow execution starts                   | `workflow_id`, `execution_id`                       |
| `workflow.completed` | A workflow execution completes                | `workflow_id`, `execution_id`, `status`              |
| `test`              | Manual test ping from the dashboard           | `event`, `timestamp`                                |

---

## Creating a Webhook Endpoint

### Via API

```bash
curl -X POST https://api.recoder.xyz/webhooks \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/webhooks/recoder",
    "events": ["agent.created", "thread.completed"],
    "description": "Production handler"
  }'
```

**Response** (the `secret` is only returned in full on creation):

```json
{
  "id": "wh_abc123",
  "url": "https://example.com/webhooks/recoder",
  "secret": "a1b2c3d4e5f6...64-hex-chars",
  "events": ["agent.created", "thread.completed"],
  "active": true,
  "description": "Production handler",
  "created_at": "2026-03-09T12:00:00Z",
  "updated_at": "2026-03-09T12:00:00Z"
}
```

### Via Dashboard

Navigate to **Developers > Webhooks** and click **Add Endpoint**. Enter your URL, select events, and save. The signing secret is displayed once after creation -- copy it immediately.

---

## Webhook Delivery Format

Every webhook delivery is an HTTP POST with the following headers:

| Header                 | Description                                         |
|------------------------|-----------------------------------------------------|
| `Content-Type`         | `application/json`                                  |
| `X-Recoder-Event`      | The event type, e.g. `agent.created`                |
| `X-Recoder-Signature`  | HMAC-SHA256 signature: `sha256=<hex-digest>`        |

The request body is a JSON object containing the event-specific payload.

---

## Signature Verification

Every delivery is signed with your endpoint's secret using HMAC-SHA256. **Always verify signatures** before processing a webhook to prevent spoofed requests.

### How it works

1. Recoder serializes the payload to a JSON string.
2. Computes `HMAC-SHA256(secret, json_body)`.
3. Sends the hex digest in the `X-Recoder-Signature` header as `sha256=<hex>`.

### Python example

```python
import hashlib
import hmac
from fastapi import Request, HTTPException

WEBHOOK_SECRET = "your-signing-secret"

async def verify_webhook(request: Request) -> dict:
    body = await request.body()
    signature_header = request.headers.get("X-Recoder-Signature", "")

    if not signature_header.startswith("sha256="):
        raise HTTPException(status_code=400, detail="Missing signature")

    expected_sig = signature_header[len("sha256="):]
    computed_sig = hmac.new(
        WEBHOOK_SECRET.encode(),
        body,
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(computed_sig, expected_sig):
        raise HTTPException(status_code=403, detail="Invalid signature")

    return json.loads(body)
```

### TypeScript / Node.js example

```typescript
import crypto from "crypto";

const WEBHOOK_SECRET = process.env.RECODER_WEBHOOK_SECRET!;

function verifySignature(body: string, signatureHeader: string): boolean {
  if (!signatureHeader.startsWith("sha256=")) return false;

  const expectedSig = signatureHeader.slice("sha256=".length);
  const computedSig = crypto
    .createHmac("sha256", WEBHOOK_SECRET)
    .update(body, "utf8")
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(computedSig, "hex"),
    Buffer.from(expectedSig, "hex"),
  );
}

// Express handler
app.post("/webhooks/recoder", (req, res) => {
  const rawBody = req.body; // must be the raw string, not parsed JSON
  const sig = req.headers["x-recoder-signature"] as string;

  if (!verifySignature(rawBody, sig)) {
    return res.status(403).send("Invalid signature");
  }

  const event = req.headers["x-recoder-event"] as string;
  const payload = JSON.parse(rawBody);

  // Handle the event
  console.log(`Received ${event}:`, payload);

  res.status(200).send("OK");
});
```

---

## Retry Behavior

If your endpoint does not respond with a `2xx` status code (or the request times out after 10 seconds), Recoder will retry delivery:

| Attempt | Delay after previous attempt |
|---------|------------------------------|
| 1       | Immediate                    |
| 2       | ~5 minutes                   |
| 3       | ~15 minutes                  |

After 3 failed attempts the delivery is marked as permanently failed. You can manually retry any failed delivery from the dashboard or via the API:

```bash
curl -X POST https://api.recoder.xyz/webhooks/deliveries/{delivery_id}/retry \
  -H "Authorization: Bearer YOUR_API_KEY"
```

---

## API Reference

| Method   | Path                                      | Description                          |
|----------|-------------------------------------------|--------------------------------------|
| `POST`   | `/webhooks`                               | Create a new webhook endpoint        |
| `GET`    | `/webhooks`                               | List all webhook endpoints           |
| `GET`    | `/webhooks/{id}`                          | Get a single endpoint (with secret)  |
| `PATCH`  | `/webhooks/{id}`                          | Update endpoint fields               |
| `DELETE` | `/webhooks/{id}`                          | Delete endpoint and delivery history |
| `POST`   | `/webhooks/{id}/test`                     | Send a test event                    |
| `GET`    | `/webhooks/{id}/deliveries`               | List recent deliveries               |
| `POST`   | `/webhooks/deliveries/{delivery_id}/retry`| Retry a failed delivery              |

---

## Best Practices

1. **Respond quickly.** Return a `200 OK` as soon as you receive the webhook. Process the payload asynchronously (e.g. enqueue a job) rather than doing heavy work in the request handler.

2. **Verify signatures.** Always validate the `X-Recoder-Signature` header using HMAC-SHA256 with your endpoint secret. Use a constant-time comparison function.

3. **Use HTTPS.** Webhook URLs must use HTTPS in production. Recoder will not follow redirects.

4. **Handle duplicates.** In rare cases a delivery may be sent more than once. Use the delivery `id` or the idempotency of your business logic to handle this gracefully.

5. **Monitor delivery status.** Check the Webhooks dashboard regularly. Failed deliveries appear with a red badge and can be retried manually.

6. **Rotate secrets periodically.** If you suspect your signing secret has been compromised, delete the endpoint and create a new one with a fresh secret.

7. **Filter events.** Only subscribe to the events you need. This reduces unnecessary traffic and simplifies your handler logic.
