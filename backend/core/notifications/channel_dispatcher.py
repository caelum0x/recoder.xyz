"""
Notification Channel Dispatcher
Sends notifications to configured Slack/Discord/email webhook channels.
Fire-and-forget: logs failures but does not raise.
"""

import asyncio
import httpx
from datetime import datetime, timezone
from typing import Optional
from core.services.db import execute
from core.utils.logger import logger


async def send_to_channel(
    channel_type: str,
    webhook_url: str,
    event_type: str,
    payload: dict,
) -> bool:
    """
    Send a single notification to a webhook channel.
    Returns True on success, False on failure.
    """
    try:
        if channel_type == "slack":
            return await _send_slack(webhook_url, event_type, payload)
        elif channel_type == "discord":
            return await _send_discord(webhook_url, event_type, payload)
        elif channel_type == "email":
            # Email channels don't use webhooks in the same way; log only
            logger.info(f"[DISPATCH] Email channel dispatch for event={event_type} (not implemented via webhook)")
            return True
        else:
            logger.warning(f"[DISPATCH] Unknown channel type: {channel_type}")
            return False
    except Exception as e:
        logger.error(f"[DISPATCH] Failed to send to {channel_type}: {e}")
        return False


async def _send_slack(webhook_url: str, event_type: str, payload: dict) -> bool:
    """Send a notification to a Slack incoming webhook."""
    title = payload.get("title", event_type)
    message = payload.get("message", "")
    timestamp = payload.get("timestamp") or datetime.now(timezone.utc).isoformat()

    slack_payload = {
        "text": f"*{title}*\n{message}",
        "blocks": [
            {
                "type": "header",
                "text": {
                    "type": "plain_text",
                    "text": title,
                    "emoji": True,
                },
            },
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": message,
                },
            },
            {
                "type": "context",
                "elements": [
                    {
                        "type": "mrkdwn",
                        "text": f"Event: `{event_type}` | {timestamp}",
                    }
                ],
            },
        ],
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(webhook_url, json=slack_payload)
        if resp.status_code == 200:
            logger.debug(f"[DISPATCH] Slack notification sent: {event_type}")
            return True
        else:
            logger.warning(f"[DISPATCH] Slack webhook returned {resp.status_code}: {resp.text}")
            return False


async def _send_discord(webhook_url: str, event_type: str, payload: dict) -> bool:
    """Send a notification to a Discord webhook."""
    title = payload.get("title", event_type)
    message = payload.get("message", "")
    timestamp = payload.get("timestamp") or datetime.now(timezone.utc).isoformat()

    # Map event types to colors
    color_map = {
        "agent.completed": 0x22C55E,   # green
        "agent.failed": 0xEF4444,      # red
        "thread.message": 0x3B82F6,    # blue
        "system.alert": 0xF59E0B,      # amber
        "schedule.triggered": 0x8B5CF6, # purple
        "quota.warning": 0xF97316,     # orange
    }
    color = color_map.get(event_type, 0x6B7280)

    discord_payload = {
        "content": None,
        "embeds": [
            {
                "title": title,
                "description": message,
                "color": color,
                "footer": {
                    "text": f"Recoder | {event_type}",
                },
                "timestamp": timestamp,
            }
        ],
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(webhook_url, json=discord_payload)
        if resp.status_code in (200, 204):
            logger.debug(f"[DISPATCH] Discord notification sent: {event_type}")
            return True
        else:
            logger.warning(f"[DISPATCH] Discord webhook returned {resp.status_code}: {resp.text}")
            return False


async def dispatch_to_channels(
    user_id: str,
    event_type: str,
    payload: dict,
) -> None:
    """
    Fire-and-forget: look up all active channels for a user that subscribe
    to the given event_type, and send to each.
    """
    try:
        rows = await execute(
            """
            SELECT * FROM notification_channels
            WHERE user_id::text = :user_id AND is_active = true
            """,
            {"user_id": user_id},
        )

        channels = [dict(r) for r in rows]
        if not channels:
            return

        tasks = []
        for ch in channels:
            # Check if the channel subscribes to this event type
            events = ch.get("events") or []
            if events and event_type not in events:
                continue

            tasks.append(
                send_to_channel(
                    channel_type=ch["channel_type"],
                    webhook_url=ch["webhook_url"],
                    event_type=event_type,
                    payload=payload,
                )
            )

        if tasks:
            results = await asyncio.gather(*tasks, return_exceptions=True)
            sent = sum(1 for r in results if r is True)
            logger.info(f"[DISPATCH] Sent {sent}/{len(tasks)} notifications for event={event_type} user={user_id[:8]}...")
    except Exception as e:
        logger.error(f"[DISPATCH] dispatch_to_channels failed for user={user_id[:8]}...: {e}")
