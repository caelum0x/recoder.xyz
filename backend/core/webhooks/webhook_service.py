"""Webhook delivery service with HMAC signing and retry logic."""

import json

import httpx
from datetime import datetime, timedelta, timezone

from core.services.db import execute, execute_one
from core.utils.logger import logger
from core.webhooks.webhook_signing import sign_payload


class WebhookService:
    """Sends webhook payloads to registered endpoints."""

    @staticmethod
    async def send(account_id: str, event: str, payload: dict) -> None:
        """Find matching endpoints and dispatch webhooks."""
        endpoints = await execute(
            """SELECT id, url, secret, events FROM webhook_endpoints
               WHERE account_id = :account_id AND active = true
               AND :event = ANY(events)""",
            {"account_id": account_id, "event": event},
        )

        for ep in (endpoints or []):
            try:
                await WebhookService._deliver(
                    ep["id"], ep["url"], ep["secret"], event, payload,
                )
            except Exception as e:
                logger.error(f"Webhook delivery failed for {ep['id']}: {e}")

    @staticmethod
    async def _deliver(
        webhook_id: str,
        url: str,
        secret: str,
        event: str,
        payload: dict,
    ) -> None:
        """Send a single webhook with HMAC-SHA256 signature and timestamp."""
        body = json.dumps(payload, default=str)
        signature, timestamp = sign_payload(body, secret)

        headers = {
            "Content-Type": "application/json",
            "X-Recoder-Event": event,
            "X-Recoder-Signature": f"sha256={signature}",
            "X-Recoder-Timestamp": timestamp,
        }

        # Record the delivery attempt
        delivery = await execute_one(
            """INSERT INTO webhook_deliveries (webhook_id, event, payload, attempts)
               VALUES (:webhook_id, :event, :payload::jsonb, 1)
               RETURNING id""",
            {"webhook_id": webhook_id, "event": event, "payload": body},
            commit=True,
        )

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(url, content=body, headers=headers)

            await execute_one(
                """UPDATE webhook_deliveries
                   SET response_status = :status, response_body = :body, delivered_at = now()
                   WHERE id = :id""",
                {
                    "id": delivery["id"],
                    "status": resp.status_code,
                    "body": resp.text[:1000],
                },
                commit=True,
            )
        except Exception as e:
            # Schedule retry with exponential backoff
            retry_at = datetime.now(timezone.utc) + timedelta(minutes=5)
            await execute_one(
                """UPDATE webhook_deliveries
                   SET response_body = :error, next_retry_at = :retry_at
                   WHERE id = :id""",
                {
                    "id": delivery["id"],
                    "error": str(e)[:500],
                    "retry_at": retry_at,
                },
                commit=True,
            )

    @staticmethod
    async def retry_delivery(delivery_id: str) -> bool:
        """Retry a failed delivery."""
        delivery = await execute_one(
            """SELECT wd.*, we.url, we.secret
               FROM webhook_deliveries wd
               JOIN webhook_endpoints we ON we.id = wd.webhook_id
               WHERE wd.id = :id AND wd.delivered_at IS NULL""",
            {"id": delivery_id},
        )
        if not delivery:
            return False

        if delivery["attempts"] >= delivery["max_attempts"]:
            await execute_one(
                "UPDATE webhook_deliveries SET failed_at = now() WHERE id = :id",
                {"id": delivery_id},
                commit=True,
            )
            return False

        await execute_one(
            "UPDATE webhook_deliveries SET attempts = attempts + 1 WHERE id = :id",
            {"id": delivery_id},
            commit=True,
        )

        try:
            body = (
                delivery["payload"]
                if isinstance(delivery["payload"], str)
                else json.dumps(delivery["payload"], default=str)
            )
            signature, timestamp = sign_payload(body, delivery["secret"])

            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(
                    delivery["url"],
                    content=body,
                    headers={
                        "Content-Type": "application/json",
                        "X-Recoder-Event": delivery["event"],
                        "X-Recoder-Signature": f"sha256={signature}",
                        "X-Recoder-Timestamp": timestamp,
                    },
                )

            await execute_one(
                """UPDATE webhook_deliveries
                   SET response_status = :status, response_body = :body,
                       delivered_at = now(), next_retry_at = NULL
                   WHERE id = :id""",
                {
                    "id": delivery_id,
                    "status": resp.status_code,
                    "body": resp.text[:1000],
                },
                commit=True,
            )
            return True
        except Exception as e:
            next_retry = datetime.now(timezone.utc) + timedelta(minutes=15)
            await execute_one(
                """UPDATE webhook_deliveries
                   SET response_body = :error, next_retry_at = :retry
                   WHERE id = :id""",
                {
                    "id": delivery_id,
                    "error": str(e)[:500],
                    "retry": next_retry,
                },
                commit=True,
            )
            return False


webhook_service = WebhookService()
