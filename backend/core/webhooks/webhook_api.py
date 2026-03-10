"""
Webhook management API.

CRUD for webhook endpoints plus delivery history and manual retry.
"""

import secrets
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one
from core.utils.logger import logger
from core.webhooks.webhook_service import webhook_service
from core.webhooks.webhook_signing import generate_webhook_secret

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


# ============================================================================
# Pydantic Models
# ============================================================================

class CreateWebhookRequest(BaseModel):
    url: str = Field(..., description="HTTPS endpoint URL")
    events: List[str] = Field(..., min_length=1, description="Event types to subscribe to")
    description: Optional[str] = None


class UpdateWebhookRequest(BaseModel):
    url: Optional[str] = None
    events: Optional[List[str]] = None
    active: Optional[bool] = None
    description: Optional[str] = None


class WebhookEndpointResponse(BaseModel):
    id: str
    url: str
    secret: str
    events: List[str]
    active: bool
    description: Optional[str] = None
    created_at: str
    updated_at: str


class WebhookEndpointListItem(BaseModel):
    id: str
    url: str
    events: List[str]
    active: bool
    description: Optional[str] = None
    created_at: str
    updated_at: str


class DeliveryItem(BaseModel):
    id: str
    event: str
    response_status: Optional[int] = None
    attempts: int
    max_attempts: int
    delivered_at: Optional[str] = None
    failed_at: Optional[str] = None
    next_retry_at: Optional[str] = None
    created_at: str


class DeliveryListResponse(BaseModel):
    deliveries: List[DeliveryItem] = []


class RetryResponse(BaseModel):
    success: bool
    message: str


# ============================================================================
# Helpers
# ============================================================================

def _ts(val: Any) -> str:
    """Convert a datetime or string to ISO string."""
    if val is None:
        return None
    if hasattr(val, "isoformat"):
        return val.isoformat()
    return str(val)


def _ts_optional(val: Any) -> Optional[str]:
    if val is None:
        return None
    return _ts(val)


# ============================================================================
# Endpoints
# ============================================================================

@router.post("", response_model=WebhookEndpointResponse, summary="Create webhook endpoint")
async def create_webhook(
    body: CreateWebhookRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Register a new webhook endpoint. A signing secret is auto-generated."""
    try:
        secret = secrets.token_hex(32)
        signing_secret = generate_webhook_secret()

        row = await execute_one(
            """INSERT INTO webhook_endpoints (account_id, url, secret, signing_secret, events, description)
               VALUES (:account_id, :url, :secret, :signing_secret, :events, :description)
               RETURNING id, url, secret, events, active, description, created_at, updated_at""",
            {
                "account_id": user_id,
                "url": body.url,
                "secret": secret,
                "signing_secret": signing_secret,
                "events": body.events,
                "description": body.description,
            },
            commit=True,
        )

        if not row:
            raise HTTPException(status_code=500, detail="Failed to create webhook endpoint")

        return WebhookEndpointResponse(
            id=str(row["id"]),
            url=row["url"],
            secret=row["secret"],
            events=row["events"],
            active=row["active"],
            description=row.get("description"),
            created_at=_ts(row["created_at"]),
            updated_at=_ts(row["updated_at"]),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating webhook endpoint: {e}")
        raise HTTPException(status_code=500, detail="Failed to create webhook endpoint")


@router.get("", response_model=List[WebhookEndpointListItem], summary="List webhook endpoints")
async def list_webhooks(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List all webhook endpoints for the authenticated account."""
    try:
        rows = await execute(
            """SELECT id, url, events, active, description, created_at, updated_at
               FROM webhook_endpoints
               WHERE account_id = :account_id
               ORDER BY created_at DESC""",
            {"account_id": user_id},
        )

        return [
            WebhookEndpointListItem(
                id=str(r["id"]),
                url=r["url"],
                events=r["events"],
                active=r["active"],
                description=r.get("description"),
                created_at=_ts(r["created_at"]),
                updated_at=_ts(r["updated_at"]),
            )
            for r in (rows or [])
        ]

    except Exception as e:
        logger.error(f"Error listing webhooks: {e}")
        raise HTTPException(status_code=500, detail="Failed to list webhooks")


@router.get("/{webhook_id}", response_model=WebhookEndpointResponse, summary="Get webhook endpoint")
async def get_webhook(
    webhook_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get a single webhook endpoint with its signing secret."""
    try:
        row = await execute_one(
            """SELECT id, url, secret, events, active, description, created_at, updated_at
               FROM webhook_endpoints
               WHERE id = :id AND account_id = :account_id""",
            {"id": webhook_id, "account_id": user_id},
        )

        if not row:
            raise HTTPException(status_code=404, detail="Webhook endpoint not found")

        return WebhookEndpointResponse(
            id=str(row["id"]),
            url=row["url"],
            secret=row["secret"],
            events=row["events"],
            active=row["active"],
            description=row.get("description"),
            created_at=_ts(row["created_at"]),
            updated_at=_ts(row["updated_at"]),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting webhook {webhook_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to get webhook endpoint")


@router.patch("/{webhook_id}", response_model=WebhookEndpointResponse, summary="Update webhook endpoint")
async def update_webhook(
    webhook_id: str,
    body: UpdateWebhookRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Update one or more fields of an existing webhook endpoint."""
    try:
        # Verify ownership first
        existing = await execute_one(
            "SELECT id FROM webhook_endpoints WHERE id = :id AND account_id = :account_id",
            {"id": webhook_id, "account_id": user_id},
        )
        if not existing:
            raise HTTPException(status_code=404, detail="Webhook endpoint not found")

        # Build dynamic SET clause
        set_parts = ["updated_at = now()"]
        params: Dict[str, Any] = {"id": webhook_id, "account_id": user_id}

        if body.url is not None:
            set_parts.append("url = :url")
            params["url"] = body.url
        if body.events is not None:
            set_parts.append("events = :events")
            params["events"] = body.events
        if body.active is not None:
            set_parts.append("active = :active")
            params["active"] = body.active
        if body.description is not None:
            set_parts.append("description = :description")
            params["description"] = body.description

        set_sql = ", ".join(set_parts)

        row = await execute_one(
            f"""UPDATE webhook_endpoints SET {set_sql}
                WHERE id = :id AND account_id = :account_id
                RETURNING id, url, secret, events, active, description, created_at, updated_at""",
            params,
            commit=True,
        )

        if not row:
            raise HTTPException(status_code=500, detail="Failed to update webhook endpoint")

        return WebhookEndpointResponse(
            id=str(row["id"]),
            url=row["url"],
            secret=row["secret"],
            events=row["events"],
            active=row["active"],
            description=row.get("description"),
            created_at=_ts(row["created_at"]),
            updated_at=_ts(row["updated_at"]),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating webhook {webhook_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to update webhook endpoint")


@router.delete("/{webhook_id}", summary="Delete webhook endpoint")
async def delete_webhook(
    webhook_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Delete a webhook endpoint and all its delivery records."""
    try:
        existing = await execute_one(
            "SELECT id FROM webhook_endpoints WHERE id = :id AND account_id = :account_id",
            {"id": webhook_id, "account_id": user_id},
        )
        if not existing:
            raise HTTPException(status_code=404, detail="Webhook endpoint not found")

        await execute_one(
            "DELETE FROM webhook_endpoints WHERE id = :id AND account_id = :account_id",
            {"id": webhook_id, "account_id": user_id},
            commit=True,
        )

        return {"success": True}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting webhook {webhook_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete webhook endpoint")


@router.post("/{webhook_id}/test", summary="Send test webhook")
async def test_webhook(
    webhook_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Send a test event to the webhook endpoint."""
    try:
        endpoint = await execute_one(
            """SELECT id, url, secret FROM webhook_endpoints
               WHERE id = :id AND account_id = :account_id""",
            {"id": webhook_id, "account_id": user_id},
        )
        if not endpoint:
            raise HTTPException(status_code=404, detail="Webhook endpoint not found")

        test_payload = {
            "event": "test",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

        await webhook_service._deliver(
            endpoint["id"],
            endpoint["url"],
            endpoint["secret"],
            "test",
            test_payload,
        )

        return {"success": True, "message": "Test webhook sent"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error sending test webhook {webhook_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to send test webhook")


@router.get(
    "/{webhook_id}/deliveries",
    response_model=DeliveryListResponse,
    summary="List recent deliveries",
)
async def list_deliveries(
    webhook_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
    limit: int = Query(50, ge=1, le=100),
):
    """List recent delivery attempts for a webhook endpoint (newest first)."""
    try:
        # Verify ownership
        endpoint = await execute_one(
            "SELECT id FROM webhook_endpoints WHERE id = :id AND account_id = :account_id",
            {"id": webhook_id, "account_id": user_id},
        )
        if not endpoint:
            raise HTTPException(status_code=404, detail="Webhook endpoint not found")

        rows = await execute(
            """SELECT id, event, response_status, attempts, max_attempts,
                      delivered_at, failed_at, next_retry_at, created_at
               FROM webhook_deliveries
               WHERE webhook_id = :webhook_id
               ORDER BY created_at DESC
               LIMIT :limit""",
            {"webhook_id": webhook_id, "limit": limit},
        )

        deliveries = [
            DeliveryItem(
                id=str(r["id"]),
                event=r["event"],
                response_status=r.get("response_status"),
                attempts=r["attempts"],
                max_attempts=r["max_attempts"],
                delivered_at=_ts_optional(r.get("delivered_at")),
                failed_at=_ts_optional(r.get("failed_at")),
                next_retry_at=_ts_optional(r.get("next_retry_at")),
                created_at=_ts(r["created_at"]),
            )
            for r in (rows or [])
        ]

        return DeliveryListResponse(deliveries=deliveries)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing deliveries for {webhook_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to list deliveries")


@router.post(
    "/deliveries/{delivery_id}/retry",
    response_model=RetryResponse,
    summary="Retry a failed delivery",
)
async def retry_delivery(
    delivery_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Manually retry a failed or pending delivery."""
    try:
        # Verify ownership through join
        ownership = await execute_one(
            """SELECT wd.id FROM webhook_deliveries wd
               JOIN webhook_endpoints we ON we.id = wd.webhook_id
               WHERE wd.id = :delivery_id AND we.account_id = :account_id""",
            {"delivery_id": delivery_id, "account_id": user_id},
        )
        if not ownership:
            raise HTTPException(status_code=404, detail="Delivery not found")

        success = await webhook_service.retry_delivery(delivery_id)

        if success:
            return RetryResponse(success=True, message="Delivery retried successfully")
        else:
            return RetryResponse(success=False, message="Retry failed or max attempts reached")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrying delivery {delivery_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to retry delivery")


# ============================================================================
# Signing Secret Management
# ============================================================================

class SigningSecretResponse(BaseModel):
    signing_secret: str


@router.get("/{webhook_id}/signing-secret", response_model=SigningSecretResponse, summary="Reveal signing secret")
async def get_signing_secret(
    webhook_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Reveal the HMAC signing secret for a webhook endpoint."""
    try:
        row = await execute_one(
            """SELECT signing_secret, secret
               FROM webhook_endpoints
               WHERE id = :id AND account_id = :account_id""",
            {"id": webhook_id, "account_id": user_id},
        )

        if not row:
            raise HTTPException(status_code=404, detail="Webhook endpoint not found")

        # Fall back to the original secret if signing_secret hasn't been set yet
        signing_secret = row.get("signing_secret") or row.get("secret", "")

        return SigningSecretResponse(signing_secret=signing_secret)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting signing secret for {webhook_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to get signing secret")


@router.post("/{webhook_id}/rotate-secret", response_model=SigningSecretResponse, summary="Rotate signing secret")
async def rotate_signing_secret(
    webhook_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Rotate the HMAC signing secret for a webhook endpoint."""
    try:
        # Verify ownership
        existing = await execute_one(
            "SELECT id FROM webhook_endpoints WHERE id = :id AND account_id = :account_id",
            {"id": webhook_id, "account_id": user_id},
        )
        if not existing:
            raise HTTPException(status_code=404, detail="Webhook endpoint not found")

        new_secret = generate_webhook_secret()

        await execute_one(
            """UPDATE webhook_endpoints
               SET signing_secret = :signing_secret, secret = :signing_secret, updated_at = now()
               WHERE id = :id AND account_id = :account_id""",
            {"id": webhook_id, "account_id": user_id, "signing_secret": new_secret},
            commit=True,
        )

        return SigningSecretResponse(signing_secret=new_secret)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error rotating signing secret for {webhook_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to rotate signing secret")
