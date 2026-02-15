"""
URL refresh utilities for expired signed URLs.

This module provides functions to detect expired signed URLs in LLM messages
and regenerate them before making API calls.

Supports:
  - S3 presigned URLs (X-Amz-Algorithm / X-Amz-Expires)
  - Legacy JWT-signed URLs (JWT token in ?token= param)
"""
import asyncio
import base64
import json
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import parse_qs, urlparse

from core.services.storage import create_signed_url as storage_create_signed_url
from core.utils.logger import logger

# Constants
STAGED_FILES_BUCKET = "staged-files"
SIGNED_URL_EXPIRY = 3600


def is_signed_url(url: str) -> bool:
    """Check if a URL is a signed URL (S3 or legacy JWT-based)."""
    if not url or not isinstance(url, str):
        return False
    # S3 presigned URL
    if 'X-Amz-Signature' in url or 'X-Amz-Algorithm' in url:
        return True
    # Legacy JWT-signed URL
    if '/object/sign/' in url or 'token=' in url:
        return True
    return False


def extract_storage_path_from_url(url: str) -> Optional[str]:
    """
    Extract the storage path from a signed URL.

    Handles:
      - S3:      https://endpoint/bucket/path/to/file?X-Amz-...
      - Legacy:   https://host/storage/v1/object/sign/{bucket}/{path}?token=xxx

    Returns the storage path or None if extraction fails.
    """
    try:
        parsed = urlparse(url)
        path = parsed.path

        # S3 presigned URL: /{bucket}/{storage_path}
        if 'X-Amz-Signature' in url or 'X-Amz-Algorithm' in url:
            # Strip leading slash and bucket name
            parts = path.lstrip('/').split('/', 1)
            if len(parts) == 2:
                return parts[1]
            return None

        # Legacy: /storage/v1/object/sign/{bucket}/{storage_path}
        match = re.match(r'/storage/v1/object/sign/[^/]+/(.+)', path)
        if match:
            return match.group(1)

        return None
    except Exception as e:
        logger.warning(f"Failed to extract storage path from URL: {e}")
        return None


def is_signed_url_expired(url: str, buffer_seconds: int = 300) -> bool:
    """
    Check if a signed URL is expired or about to expire.

    Handles:
      - S3 presigned URLs (X-Amz-Date + X-Amz-Expires)
      - Legacy JWT-signed URLs (JWT exp claim in ?token=)

    Returns True if expired or about to expire.
    """
    if not is_signed_url(url):
        return False

    try:
        parsed = urlparse(url)
        query_params = parse_qs(parsed.query)

        # S3 presigned URL
        amz_date = query_params.get('X-Amz-Date', [None])[0]
        amz_expires = query_params.get('X-Amz-Expires', [None])[0]
        if amz_date and amz_expires:
            # Parse X-Amz-Date format: 20250101T000000Z
            created = datetime.strptime(amz_date, '%Y%m%dT%H%M%SZ').replace(tzinfo=timezone.utc)
            expires_at = created.timestamp() + int(amz_expires)
            current_time = datetime.now(timezone.utc).timestamp()
            return current_time >= (expires_at - buffer_seconds)

        # Legacy JWT token
        token = query_params.get('token', [None])[0]
        if not token:
            return True

        parts = token.split('.')
        if len(parts) != 3:
            return True

        payload = parts[1]
        padding = 4 - len(payload) % 4
        if padding != 4:
            payload += '=' * padding

        decoded = base64.urlsafe_b64decode(payload)
        claims = json.loads(decoded)

        exp_timestamp = claims.get('exp')
        if not exp_timestamp:
            return True

        current_time = datetime.now(timezone.utc).timestamp()
        return current_time >= (exp_timestamp - buffer_seconds)

    except Exception as e:
        logger.warning(f"Failed to check URL expiration: {e}")
        return True


async def refresh_signed_url(storage_path: str, bucket: str = STAGED_FILES_BUCKET) -> Optional[str]:
    """Generate a new signed URL for a storage path."""
    try:
        return await storage_create_signed_url(bucket, storage_path, SIGNED_URL_EXPIRY)
    except Exception as e:
        logger.error(f"Failed to refresh signed URL for {storage_path}: {e}")
        return None


async def refresh_image_urls_in_messages(
    messages: List[Dict[str, Any]],
    thread_id: Optional[str] = None
) -> Tuple[List[Dict[str, Any]], int]:
    """
    Scan messages for expired image URLs and refresh them.
    Persists refreshed URLs to DB to avoid re-refreshing on each turn.
    """
    urls_to_refresh: List[Tuple[Optional[str], Dict, str]] = []

    for msg in messages:
        content = msg.get('content')
        if not isinstance(content, list):
            continue

        message_id = msg.get('message_id')

        for part in content:
            if not isinstance(part, dict) or part.get('type') != 'image_url':
                continue

            image_url_obj = part.get('image_url', {})
            url = image_url_obj.get('url', '')

            if not is_signed_url(url):
                continue

            if not is_signed_url_expired(url):
                continue

            storage_path = extract_storage_path_from_url(url)

            if storage_path:
                urls_to_refresh.append((message_id, image_url_obj, storage_path))
            else:
                logger.warning(f"Cannot refresh URL - failed to extract storage path from: {url[:100]}...")

    if not urls_to_refresh:
        return messages, 0

    refreshed_message_ids: List[str] = []

    async def refresh_one(item: Tuple[Optional[str], Dict, str]) -> bool:
        message_id, image_url_obj, storage_path = item
        new_url = await refresh_signed_url(storage_path, STAGED_FILES_BUCKET)
        if new_url:
            image_url_obj['url'] = new_url
            if message_id:
                refreshed_message_ids.append(message_id)
            return True
        return False

    results = await asyncio.gather(*[refresh_one(item) for item in urls_to_refresh])
    refreshed_count = sum(1 for r in results if r)

    if refreshed_count > 0:
        logger.info(f"Refreshed {refreshed_count} expired image URL(s)")

        if refreshed_message_ids:
            msgs_to_persist = {
                msg['message_id']: msg
                for msg in messages
                if msg.get('message_id') in refreshed_message_ids
            }
            asyncio.create_task(_persist_and_invalidate(msgs_to_persist, thread_id))

    return messages, refreshed_count


async def _persist_and_invalidate(
    messages_to_update: Dict[str, Dict],
    thread_id: Optional[str]
) -> None:
    """Persist refreshed URLs to DB and invalidate cache (background task)."""
    from core.threads.repo import update_message_content

    for message_id, msg in messages_to_update.items():
        try:
            content = msg.get('content')
            if content:
                await update_message_content(message_id, content)
                logger.debug(f"Persisted refreshed URL for message {message_id}")
        except Exception as e:
            logger.warning(f"Failed to persist refreshed URL for message {message_id}: {e}")

    if thread_id:
        try:
            from core.cache.runtime_cache import invalidate_message_history_cache
            await invalidate_message_history_cache(thread_id)
            logger.debug(f"Invalidated message cache for thread {thread_id}")
        except Exception as e:
            logger.warning(f"Failed to invalidate cache for thread {thread_id}: {e}")
