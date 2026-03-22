from fastapi import APIRouter, Depends, HTTPException, Query, Request
from typing import Dict, List, Optional, Any
from pydantic import BaseModel
from core.auth import get_current_user
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.utils.logger import logger
from core.utils.config import config, EnvMode
from core.services.db import execute
from .notification_service import notification_service
from .models import NotificationChannel, NotificationEvent, NotificationPriority

router = APIRouter(tags=["notifications"], prefix="/notifications")


def check_notifications_enabled():
    """Check if notifications features are enabled. Settings/device endpoints are staging-only."""
    if config.ENV_MODE != EnvMode.STAGING:
        raise HTTPException(
            status_code=403,
            detail=f"Notifications are only available in staging mode (current mode: {config.ENV_MODE.value})"
        )


@router.get("")
async def list_notifications(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    unread_only: bool = Query(False),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List notifications for the current user."""
    try:
        where_clause = "WHERE user_id = :user_id"
        if unread_only:
            where_clause += " AND read = false"

        rows = await execute(
            f"""
            SELECT id, type, title, message, data, created_at, read
            FROM notifications
            {where_clause}
            ORDER BY created_at DESC
            LIMIT :limit OFFSET :offset
            """,
            {"user_id": user_id, "limit": limit, "offset": offset},
        )

        count_rows = await execute(
            f"SELECT count(*) as total FROM notifications {where_clause}",
            {"user_id": user_id},
        )
        total = count_rows[0]["total"] if count_rows else 0

        notifications = []
        for row in rows:
            notifications.append({
                "id": str(row["id"]),
                "type": row.get("type", "info"),
                "title": row.get("title", ""),
                "message": row.get("message", ""),
                "data": row.get("data"),
                "created_at": row["created_at"].isoformat() if row.get("created_at") else None,
                "read": row.get("read", False),
            })

        return {
            "notifications": notifications,
            "total": total,
            "limit": limit,
            "offset": offset,
        }
    except Exception as e:
        logger.error(f"Error listing notifications: {e}")
        return {"notifications": [], "total": 0, "limit": limit, "offset": offset}


@router.post("/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Mark a notification as read."""
    try:
        await execute(
            "UPDATE notifications SET read = true WHERE id = :id AND user_id = :user_id",
            {"id": notification_id, "user_id": user_id},
        )
        return {"success": True}
    except Exception as e:
        logger.error(f"Error marking notification read: {e}")
        return {"success": False}


@router.post("/read-all")
async def mark_all_read(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Mark all notifications as read."""
    try:
        await execute(
            "UPDATE notifications SET read = true WHERE user_id = :user_id AND read = false",
            {"user_id": user_id},
        )
        return {"success": True}
    except Exception as e:
        logger.error(f"Error marking all notifications read: {e}")
        return {"success": False}


class NotificationSettingsUpdate(BaseModel):
    email_enabled: Optional[bool] = None
    push_enabled: Optional[bool] = None
    in_app_enabled: Optional[bool] = None


class DeviceTokenRequest(BaseModel):
    device_token: str
    device_type: str = "mobile"
    provider: str = "expo"


class TestNotificationRequest(BaseModel):
    event_type: NotificationEvent = NotificationEvent.SYSTEM_ALERT
    channels: Optional[List[NotificationChannel]] = None
    title: str = "Test Notification"
    message: str = "This is a test notification from Recoder"


class SendNotificationRequest(BaseModel):
    account_id: str
    event_type: NotificationEvent
    data: Dict[str, Any]
    channels: Optional[List[NotificationChannel]] = None
    priority: NotificationPriority = NotificationPriority.MEDIUM


@router.get("/settings")
async def get_notification_settings(current_user: dict = Depends(get_current_user)):
    check_notifications_enabled()
    try:
        account_id = current_user.get('user_id')
        settings = await notification_service.get_account_notification_settings(account_id)
        
        if not settings:
            settings = await notification_service.create_default_settings(account_id)
        
        return {"success": True, "settings": settings.dict()}
        
    except Exception as e:
        logger.error(f"Error getting notification settings: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/settings")
async def update_notification_settings(
    settings_update: NotificationSettingsUpdate,
    current_user: dict = Depends(get_current_user)
):
    check_notifications_enabled()
    try:
        account_id = current_user.get('user_id')
        
        update_data = {k: v for k, v in settings_update.dict().items() if v is not None}
        
        success = await notification_service.update_account_notification_settings(
            account_id=account_id,
            settings=update_data
        )
        
        if not success:
            raise HTTPException(status_code=500, detail="Failed to update settings")
        
        updated_settings = await notification_service.get_account_notification_settings(account_id)
        
        return {
            "success": True,
            "message": "Notification settings updated successfully",
            "settings": updated_settings.dict() if updated_settings else None
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating notification settings: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/device-token")
async def register_device_token(
    token_request: DeviceTokenRequest,
    current_user: dict = Depends(get_current_user)
):
    check_notifications_enabled()
    try:
        account_id = current_user.get('user_id')
        
        success = await notification_service.register_device_token(
            account_id=account_id,
            device_token=token_request.device_token,
            device_type=token_request.device_type,
            provider=token_request.provider
        )
        
        if not success:
            raise HTTPException(status_code=500, detail="Failed to register device token")
        
        return {
            "success": True,
            "message": "Device token registered successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error registering device token: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/device-token/{device_token}")
async def unregister_device_token(
    device_token: str,
    provider: str = "expo",
    current_user: dict = Depends(get_current_user)
):
    check_notifications_enabled()
    try:
        account_id = current_user.get('user_id')
        
        success = await notification_service.unregister_device_token(
            account_id=account_id,
            device_token=device_token,
            provider=provider
        )
        
        if not success:
            raise HTTPException(status_code=500, detail="Failed to unregister device token")
        
        return {
            "success": True,
            "message": "Device token unregistered successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error unregistering device token: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/webhooks/novu")
async def handle_novu_webhook(request: Request):
    try:
        payload = await request.json()
        
        logger.info(f"Received Novu webhook: {payload.get('type', 'unknown')}")
        
        event_type = payload.get('type')
        
        if event_type == 'notification.sent':
            logger.info(f"Notification sent: {payload.get('transactionId')}")
        elif event_type == 'notification.failed':
            logger.warning(f"Notification failed: {payload.get('transactionId')}")
        elif event_type == 'subscriber.created':
            logger.info(f"Subscriber created: {payload.get('subscriberId')}")
        
        return {"status": "ok"}
        
    except Exception as e:
        logger.error(f"Error handling Novu webhook: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

