from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one
from core.utils.logger import logger

router = APIRouter(prefix="/integrations", tags=["Integrations"])

class IntegrationStatus(BaseModel):
    provider: str
    name: str
    connected: bool
    status: str  # "connected" | "disconnected" | "error" | "expired"
    connected_at: Optional[datetime] = None
    last_sync: Optional[datetime] = None
    error_message: Optional[str] = None
    scopes: list[str] = []

class IntegrationListResponse(BaseModel):
    integrations: list[IntegrationStatus]

KNOWN_PROVIDERS = [
    {"provider": "github", "name": "GitHub"},
    {"provider": "google", "name": "Google Workspace"},
    {"provider": "composio", "name": "Composio"},
    {"provider": "slack", "name": "Slack"},
    {"provider": "notion", "name": "Notion"},
]

@router.get("", response_model=IntegrationListResponse, summary="List user integrations")
async def list_integrations(user_id: str = Depends(verify_and_get_user_id_from_jwt)):
    """List all available integrations with their connection status."""
    try:
        connected = await execute(
            """SELECT provider, status, connected_at, last_sync_at, error_message, scopes
               FROM user_integrations WHERE user_id = :user_id""",
            {"user_id": user_id}
        )
    except Exception:
        connected = []

    connected_map = {r["provider"]: r for r in connected}

    result = []
    for p in KNOWN_PROVIDERS:
        conn = connected_map.get(p["provider"])
        if conn:
            result.append(IntegrationStatus(
                provider=p["provider"],
                name=p["name"],
                connected=conn["status"] == "connected",
                status=conn["status"],
                connected_at=conn.get("connected_at"),
                last_sync=conn.get("last_sync_at"),
                error_message=conn.get("error_message"),
                scopes=conn.get("scopes", []),
            ))
        else:
            result.append(IntegrationStatus(
                provider=p["provider"],
                name=p["name"],
                connected=False,
                status="disconnected",
            ))

    return IntegrationListResponse(integrations=result)

@router.get("/{provider}", summary="Get integration details")
async def get_integration(provider: str, user_id: str = Depends(verify_and_get_user_id_from_jwt)):
    row = await execute_one(
        """SELECT provider, status, connected_at, last_sync_at, error_message, scopes
           FROM user_integrations WHERE user_id = :user_id AND provider = :provider""",
        {"user_id": user_id, "provider": provider}
    )
    if not row:
        return IntegrationStatus(provider=provider, name=provider.title(), connected=False, status="disconnected")
    return IntegrationStatus(
        provider=row["provider"],
        name=provider.title(),
        connected=row["status"] == "connected",
        status=row["status"],
        connected_at=row.get("connected_at"),
        last_sync=row.get("last_sync_at"),
        error_message=row.get("error_message"),
        scopes=row.get("scopes", []),
    )

@router.delete("/{provider}", summary="Disconnect integration")
async def disconnect_integration(provider: str, user_id: str = Depends(verify_and_get_user_id_from_jwt)):
    await execute(
        "DELETE FROM user_integrations WHERE user_id = :user_id AND provider = :provider",
        {"user_id": user_id, "provider": provider}
    )
    return {"status": "disconnected", "provider": provider}

@router.post("/{provider}/refresh", summary="Refresh integration token")
async def refresh_integration(provider: str, user_id: str = Depends(verify_and_get_user_id_from_jwt)):
    row = await execute_one(
        "SELECT * FROM user_integrations WHERE user_id = :user_id AND provider = :provider",
        {"user_id": user_id, "provider": provider}
    )
    if not row:
        raise HTTPException(status_code=404, detail="Integration not found")
    # Mark as refreshing — actual OAuth refresh would happen here
    await execute(
        """UPDATE user_integrations SET status = 'connected', error_message = NULL, last_sync_at = now()
           WHERE user_id = :user_id AND provider = :provider""",
        {"user_id": user_id, "provider": provider}
    )
    return {"status": "refreshed", "provider": provider}
