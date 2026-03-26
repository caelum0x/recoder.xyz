from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, field_validator
from typing import Optional, List
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate
from core.utils.logger import logger
import secrets
import httpx
from datetime import datetime, timezone

router = APIRouter(prefix="/agent-webhooks", tags=["agent-webhooks"])

# ---------------------------------------------------------------------------
# Valid webhook event types
# ---------------------------------------------------------------------------

VALID_EVENTS = {
    "run.started",
    "run.completed",
    "run.failed",
    "run.error",
    "thread.created",
    "thread.message",
    "agent.updated",
    "agent.deployed",
}

# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------


class CreateWebhookRequest(BaseModel):
    agent_id: Optional[str] = None
    name: str
    url: str
    secret: Optional[str] = None
    events: List[str]
    retry_count: Optional[int] = 3
    timeout_ms: Optional[int] = 5000

    @field_validator("events")
    @classmethod
    def validate_events(cls, v: List[str]) -> List[str]:
        if not v:
            raise ValueError("At least one event is required")
        invalid = set(v) - VALID_EVENTS
        if invalid:
            raise ValueError(f"Invalid events: {', '.join(sorted(invalid))}")
        return v

    @field_validator("retry_count")
    @classmethod
    def validate_retry_count(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and (v < 1 or v > 5):
            raise ValueError("retry_count must be between 1 and 5")
        return v

    @field_validator("timeout_ms")
    @classmethod
    def validate_timeout_ms(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and (v < 1000 or v > 30000):
            raise ValueError("timeout_ms must be between 1000 and 30000")
        return v


class UpdateWebhookRequest(BaseModel):
    name: Optional[str] = None
    url: Optional[str] = None
    secret: Optional[str] = None
    events: Optional[List[str]] = None
    is_active: Optional[bool] = None
    retry_count: Optional[int] = None
    timeout_ms: Optional[int] = None
    agent_id: Optional[str] = None

    @field_validator("events")
    @classmethod
    def validate_events(cls, v: Optional[List[str]]) -> Optional[List[str]]:
        if v is not None:
            if not v:
                raise ValueError("At least one event is required")
            invalid = set(v) - VALID_EVENTS
            if invalid:
                raise ValueError(f"Invalid events: {', '.join(sorted(invalid))}")
        return v

    @field_validator("retry_count")
    @classmethod
    def validate_retry_count(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and (v < 1 or v > 5):
            raise ValueError("retry_count must be between 1 and 5")
        return v

    @field_validator("timeout_ms")
    @classmethod
    def validate_timeout_ms(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and (v < 1000 or v > 30000):
            raise ValueError("timeout_ms must be between 1000 and 30000")
        return v


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/webhooks", summary="Create webhook")
async def create_webhook(
    body: CreateWebhookRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    if not body.name or not body.name.strip():
        raise HTTPException(status_code=400, detail="Webhook name is required")
    if not body.url or not body.url.strip():
        raise HTTPException(status_code=400, detail="Webhook URL is required")

    webhook_secret = body.secret or f"whsec_{secrets.token_urlsafe(32)}"

    row = await execute_one(
        """
        INSERT INTO agent_webhooks (user_id, agent_id, name, url, secret, events, retry_count, timeout_ms)
        VALUES (CAST(:user_id AS uuid), :agent_id, :name, :url, :secret, :events, :retry_count, :timeout_ms)
        RETURNING *
        """,
        {
            "user_id": user_id,
            "agent_id": body.agent_id,
            "name": body.name.strip(),
            "url": body.url.strip(),
            "secret": webhook_secret,
            "events": body.events,
            "retry_count": body.retry_count or 3,
            "timeout_ms": body.timeout_ms or 5000,
        },
        commit=True,
    )
    return _serialize_webhook(row)


@router.get("/webhooks", summary="List webhooks")
async def list_webhooks(
    agent_id: Optional[str] = Query(None),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    if agent_id:
        rows = await execute(
            """
            SELECT w.*,
                   0 AS delivered_count,
                   0 AS total_delivery_count,
                   NULL::timestamptz AS last_delivery_at
            FROM agent_webhooks w
            WHERE w.user_id::text = :user_id AND w.agent_id = :agent_id
            ORDER BY w.created_at DESC
            """,
            {"user_id": user_id, "agent_id": agent_id},
        )
    else:
        rows = await execute(
            """
            SELECT w.*,
                   0 AS delivered_count,
                   0 AS total_delivery_count,
                   NULL::timestamptz AS last_delivery_at
            FROM agent_webhooks w
            WHERE w.user_id::text = :user_id
            ORDER BY w.created_at DESC
            """,
            {"user_id": user_id},
        )
    return {"webhooks": [_serialize_webhook(r) for r in rows]}


@router.patch("/webhooks/{webhook_id}", summary="Update webhook")
async def update_webhook(
    webhook_id: str,
    body: UpdateWebhookRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    existing = await execute_one(
        "SELECT id FROM agent_webhooks WHERE id::text = :id AND user_id::text = :user_id",
        {"id": webhook_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Webhook not found")

    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    set_parts = []
    params = {"id": webhook_id, "user_id": user_id}

    for key, value in updates.items():
        set_parts.append(f"{key} = :{key}")
        params[key] = value

    set_parts.append("updated_at = now()")
    set_clause = ", ".join(set_parts)

    row = await execute_one(
        f"""
        UPDATE agent_webhooks SET {set_clause}
        WHERE id::text = :id AND user_id::text = :user_id
        RETURNING *
        """,
        params,
        commit=True,
    )
    return _serialize_webhook(row)


@router.delete("/webhooks/{webhook_id}", summary="Delete webhook")
async def delete_webhook(
    webhook_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    existing = await execute_one(
        "SELECT id FROM agent_webhooks WHERE id::text = :id AND user_id::text = :user_id",
        {"id": webhook_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Webhook not found")

    await execute_mutate(
        "DELETE FROM agent_webhooks WHERE id::text = :id AND user_id::text = :user_id",
        {"id": webhook_id, "user_id": user_id},
    )
    return {"success": True}


@router.post("/webhooks/{webhook_id}/test", summary="Send test delivery")
async def test_webhook(
    webhook_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    webhook = await execute_one(
        "SELECT * FROM agent_webhooks WHERE id::text = :id AND user_id::text = :user_id",
        {"id": webhook_id, "user_id": user_id},
    )
    if not webhook:
        raise HTTPException(status_code=404, detail="Webhook not found")

    test_payload = {
        "event": "webhook.test",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "webhook_id": str(webhook["id"]),
        "webhook_name": webhook["name"],
        "message": "This is a test delivery from Recoder.",
    }

    response_status = None
    response_body = None
    status = "pending"

    try:
        async with httpx.AsyncClient(timeout=webhook["timeout_ms"] / 1000) as client:
            headers = {"Content-Type": "application/json", "User-Agent": "Recoder-Webhooks/1.0"}
            if webhook.get("secret"):
                import hashlib
                import hmac
                import json

                payload_bytes = json.dumps(test_payload).encode("utf-8")
                signature = hmac.new(
                    webhook["secret"].encode("utf-8"),
                    payload_bytes,
                    hashlib.sha256,
                ).hexdigest()
                headers["X-Webhook-Signature"] = f"sha256={signature}"

            resp = await client.post(webhook["url"], json=test_payload, headers=headers)
            response_status = resp.status_code
            response_body = resp.text[:2000]
            status = "delivered" if 200 <= resp.status_code < 300 else "failed"
    except Exception as e:
        response_body = str(e)[:2000]
        status = "failed"
        logger.warning(f"Test webhook delivery failed for {webhook_id}: {e}")

    delivery = await execute_one(
        """
        INSERT INTO agent_webhook_deliveries (webhook_id, user_id, event_type, payload, response_status, response_body, status, attempt, delivered_at)
        VALUES (CAST(:webhook_id AS uuid), CAST(:user_id AS uuid), :event_type, :payload, :response_status, :response_body, :status, 1, :delivered_at)
        RETURNING *
        """,
        {
            "webhook_id": webhook_id,
            "user_id": user_id,
            "event_type": "webhook.test",
            "payload": test_payload,
            "response_status": response_status,
            "response_body": response_body,
            "status": status,
            "delivered_at": datetime.now(timezone.utc) if status == "delivered" else None,
        },
        commit=True,
    )
    return _serialize_delivery(delivery)


@router.get("/webhooks/{webhook_id}/deliveries", summary="List webhook deliveries")
async def list_deliveries(
    webhook_id: str,
    status: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    # Verify ownership
    existing = await execute_one(
        "SELECT id FROM agent_webhooks WHERE id::text = :id AND user_id::text = :user_id",
        {"id": webhook_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Webhook not found")

    params = {
        "webhook_id": webhook_id,
        "user_id": user_id,
        "limit": limit,
        "offset": offset,
    }

    where_clauses = ["d.webhook_id::text = :webhook_id", "d.user_id::text = :user_id"]
    if status:
        where_clauses.append("d.status = :status")
        params["status"] = status

    where = " AND ".join(where_clauses)

    rows = await execute(
        f"""
        SELECT d.* FROM agent_webhook_deliveries d
        WHERE {where}
        ORDER BY d.created_at DESC
        LIMIT :limit OFFSET :offset
        """,
        params,
    )

    total_row = await execute_one(
        f"SELECT COUNT(*) as total FROM agent_webhook_deliveries d WHERE {where}",
        params,
    )

    return {
        "deliveries": [_serialize_delivery(r) for r in rows],
        "total": total_row["total"] if total_row else 0,
    }


@router.post("/webhooks/deliveries/{delivery_id}/retry", summary="Retry failed delivery")
async def retry_delivery(
    delivery_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    delivery = await execute_one(
        """
        SELECT d.*, w.url, w.secret, w.timeout_ms
        FROM agent_webhook_deliveries d
        JOIN agent_webhooks w ON w.id = d.webhook_id
        WHERE d.id::text = :id AND d.user_id::text = :user_id
        """,
        {"id": delivery_id, "user_id": user_id},
    )
    if not delivery:
        raise HTTPException(status_code=404, detail="Delivery not found")

    if delivery["status"] not in ("failed", "retrying"):
        raise HTTPException(status_code=400, detail="Only failed deliveries can be retried")

    payload = delivery["payload"]
    response_status = None
    response_body = None
    status = "retrying"

    try:
        timeout_s = (delivery.get("timeout_ms") or 5000) / 1000
        async with httpx.AsyncClient(timeout=timeout_s) as client:
            headers = {"Content-Type": "application/json", "User-Agent": "Recoder-Webhooks/1.0"}
            if delivery.get("secret"):
                import hashlib
                import hmac
                import json

                payload_bytes = json.dumps(payload, default=str).encode("utf-8")
                signature = hmac.new(
                    delivery["secret"].encode("utf-8"),
                    payload_bytes,
                    hashlib.sha256,
                ).hexdigest()
                headers["X-Webhook-Signature"] = f"sha256={signature}"

            resp = await client.post(delivery["url"], json=payload, headers=headers)
            response_status = resp.status_code
            response_body = resp.text[:2000]
            status = "delivered" if 200 <= resp.status_code < 300 else "failed"
    except Exception as e:
        response_body = str(e)[:2000]
        status = "failed"
        logger.warning(f"Retry webhook delivery failed for {delivery_id}: {e}")

    updated = await execute_one(
        """
        UPDATE agent_webhook_deliveries
        SET response_status = :response_status,
            response_body = :response_body,
            status = :status,
            attempt = attempt + 1,
            delivered_at = :delivered_at
        WHERE id::text = :id AND user_id::text = :user_id
        RETURNING *
        """,
        {
            "id": delivery_id,
            "user_id": user_id,
            "response_status": response_status,
            "response_body": response_body,
            "status": status,
            "delivered_at": datetime.now(timezone.utc) if status == "delivered" else None,
        },
        commit=True,
    )
    return _serialize_delivery(updated)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _serialize_webhook(row: dict) -> dict:
    if not row:
        return {}
    from core.services.db import serialize_row

    result = serialize_row(row)
    # Mask secret for list views
    if result.get("secret"):
        s = result["secret"]
        result["secret_preview"] = s[:10] + "..." if len(s) > 10 else s
    return result


def _serialize_delivery(row: dict) -> dict:
    if not row:
        return {}
    from core.services.db import serialize_row

    result = serialize_row(row)
    # Remove join columns that aren't part of the delivery
    for col in ("url", "secret", "timeout_ms"):
        result.pop(col, None)
    return result
