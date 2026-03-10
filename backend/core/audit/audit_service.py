"""
Sprint 43 Phase 1: Audit Logging Service

Provides a fire-and-forget helper to record audit events.
"""

import asyncio
import json
from typing import Optional
from fastapi import Request
from core.services.db import execute_mutate
from core.utils.logger import logger


async def log_audit_event(
    user_id: str,
    action: str,
    resource_type: str,
    resource_id: Optional[str] = None,
    details: Optional[dict] = None,
    request: Optional[Request] = None,
) -> None:
    """
    Insert an audit log entry. Designed to be fire-and-forget:
    callers can wrap in asyncio.create_task() so it never blocks.
    """
    ip_address = None
    user_agent = None
    if request:
        ip_address = request.client.host if request.client else None
        user_agent = request.headers.get("user-agent")

    try:
        await execute_mutate(
            """
            INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details, ip_address, user_agent)
            VALUES (:user_id, :action, :resource_type, :resource_id, :details::jsonb, :ip_address, :user_agent)
            """,
            {
                "user_id": user_id,
                "action": action,
                "resource_type": resource_type,
                "resource_id": resource_id,
                "details": json.dumps(details or {}),
                "ip_address": ip_address,
                "user_agent": user_agent,
            },
        )
    except Exception as e:
        logger.warning(f"Failed to write audit log: {e}")


def fire_audit_event(
    user_id: str,
    action: str,
    resource_type: str,
    resource_id: Optional[str] = None,
    details: Optional[dict] = None,
    request: Optional[Request] = None,
) -> None:
    """
    Fire-and-forget wrapper around log_audit_event.
    Safe to call from sync or async contexts where an event loop is running.
    """
    asyncio.create_task(
        log_audit_event(user_id, action, resource_type, resource_id, details, request)
    )
