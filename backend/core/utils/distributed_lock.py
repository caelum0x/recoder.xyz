import asyncio
import uuid
from typing import Optional
from datetime import datetime, timezone, timedelta
from contextlib import asynccontextmanager
from core.utils.logger import logger
from core.services.db import execute, execute_one, execute_mutate

class DistributedLock:
    def __init__(self, lock_key: str, timeout_seconds: int = 300, holder_id: Optional[str] = None):
        self.lock_key = lock_key
        self.timeout_seconds = timeout_seconds
        self.holder_id = holder_id or f"{uuid.uuid4()}"
        self._acquired = False
    
    async def acquire(self, wait: bool = False, wait_timeout: int = 30) -> bool:
        start_time = datetime.now(timezone.utc)
        
        while True:
            try:
                result = await execute_one(
                    "SELECT acquire_distributed_lock(:p_lock_key, :p_holder_id, :p_timeout_seconds) AS acquired",
                    {
                        "p_lock_key": self.lock_key,
                        "p_holder_id": self.holder_id,
                        "p_timeout_seconds": self.timeout_seconds,
                    },
                )

                if result and result.get("acquired"):
                    self._acquired = True
                    logger.info(f"[LOCK] Acquired lock: {self.lock_key} by {self.holder_id}")
                    return True
                
                if not wait:
                    logger.warning(f"[LOCK] Failed to acquire lock (no wait): {self.lock_key}")
                    return False
                
                elapsed = (datetime.now(timezone.utc) - start_time).total_seconds()
                if elapsed >= wait_timeout:
                    logger.warning(f"[LOCK] Lock acquisition timeout after {elapsed}s: {self.lock_key}")
                    return False
                
                await asyncio.sleep(0.5)
                
            except Exception as e:
                logger.error(f"[LOCK] Error acquiring lock {self.lock_key}: {e}")
                if not wait:
                    return False
                await asyncio.sleep(1)
    
    async def release(self) -> bool:
        if not self._acquired:
            return True
        
        try:
            result = await execute_one(
                "SELECT release_distributed_lock(:p_lock_key, :p_holder_id) AS released",
                {
                    "p_lock_key": self.lock_key,
                    "p_holder_id": self.holder_id,
                },
            )
            
            self._acquired = False
            logger.info(f"[LOCK] Released lock: {self.lock_key} by {self.holder_id}")
            return bool(result and result.get("released"))
            
        except Exception as e:
            logger.error(f"[LOCK] Error releasing lock {self.lock_key}: {e}")
            return False
    
    async def __aenter__(self):
        acquired = await self.acquire(wait=True, wait_timeout=30)
        if not acquired:
            raise RuntimeError(f"Failed to acquire lock: {self.lock_key}")
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.release()


@asynccontextmanager
async def distributed_lock(lock_key: str, timeout_seconds: int = 300, wait: bool = True):
    lock = DistributedLock(lock_key, timeout_seconds)
    try:
        acquired = await lock.acquire(wait=wait, wait_timeout=30)
        if not acquired:
            raise RuntimeError(f"Failed to acquire lock: {lock_key}")
        yield lock
    finally:
        await lock.release()


class RenewalLock:
    @staticmethod
    async def lock_renewal_processing(account_id: str, period_start: int) -> DistributedLock:
        lock_key = f"renewal:{account_id}:{period_start}"
        return DistributedLock(lock_key, timeout_seconds=300)
    
    @staticmethod
    async def check_and_mark_renewal_processed(
        account_id: str, 
        period_start: int,
        period_end: int,
        subscription_id: str,
        credits_granted: float,
        processed_by: str,
        stripe_event_id: Optional[str] = None
    ) -> bool:
        existing = await execute_one(
            """
            SELECT id, processed_by, credits_granted
            FROM renewal_processing
            WHERE account_id::text = :account_id AND period_start = :period_start
            LIMIT 1
            """,
            {"account_id": account_id, "period_start": period_start},
        )

        if existing:
            logger.warning(
                f"[RENEWAL BLOCK] Period {period_start} for account {account_id} "
                f"already processed by {existing['processed_by']} "
                f"(granted ${existing['credits_granted']})"
            )
            return False
        
        try:
            await execute_mutate(
                """
                INSERT INTO renewal_processing (
                    account_id, period_start, period_end, subscription_id,
                    processed_by, credits_granted, stripe_event_id
                )
                VALUES (
                    :account_id, :period_start, :period_end, :subscription_id,
                    :processed_by, :credits_granted, :stripe_event_id
                )
                """,
                {
                    "account_id": account_id,
                    "period_start": period_start,
                    "period_end": period_end,
                    "subscription_id": subscription_id,
                    "processed_by": processed_by,
                    "credits_granted": credits_granted,
                    "stripe_event_id": stripe_event_id,
                },
            )
            
            logger.info(
                f"[RENEWAL TRACK] Marked period {period_start} as processed by {processed_by} "
                f"for account {account_id} (${credits_granted} credits)"
            )
            return True
            
        except Exception as e:
            logger.error(f"[RENEWAL TRACK] Failed to mark renewal processed: {e}")
            return False


class WebhookLock:
    @staticmethod
    async def check_and_mark_webhook_processing(
        event_id: str,
        event_type: str,
        payload: dict = None,
        force_reprocess: bool = False
    ) -> tuple[bool, Optional[str]]:
        event = await execute_one(
            """
            SELECT id, status, processed_at, processing_started_at, retry_count
            FROM webhook_events
            WHERE event_id::text = :event_id
            LIMIT 1
            """,
            {"event_id": event_id},
        )

        if event:
            if event['status'] == 'completed':
                if force_reprocess:
                    logger.warning(f"[WEBHOOK] Event {event_id} marked as completed but force_reprocess=True - resetting to processing")
                    await execute_mutate(
                        """
                        UPDATE webhook_events
                        SET status = 'processing',
                            processing_started_at = :processing_started_at,
                            retry_count = :retry_count,
                            error_message = NULL
                        WHERE id = :id
                        """,
                        {
                            "processing_started_at": datetime.now(timezone.utc).isoformat(),
                            "retry_count": event.get('retry_count', 0) + 1,
                            "id": event["id"],
                        },
                    )
                    return True, None
                logger.info(f"[WEBHOOK] Event {event_id} already completed at {event['processed_at']}")
                return False, 'already_completed'
            elif event['status'] == 'processing':
                # Check if webhook is stuck (processing for more than 5 minutes)
                processing_started = event.get('processing_started_at')
                if processing_started:
                    try:
                        started_at = datetime.fromisoformat(processing_started.replace('Z', '+00:00'))
                        timeout_threshold = datetime.now(timezone.utc) - timedelta(minutes=5)
                        if started_at < timeout_threshold:
                            logger.warning(
                                f"[WEBHOOK] Event {event_id} stuck in processing since {processing_started}, "
                                f"resetting to allow retry"
                            )
                            await execute_mutate(
                                """
                                UPDATE webhook_events
                                SET status = 'failed',
                                    error_message = :error_message,
                                    retry_count = :retry_count
                                WHERE id = :id
                                """,
                                {
                                    "error_message": "Webhook processing timeout - stuck in processing for >5 minutes",
                                    "retry_count": event.get('retry_count', 0) + 1,
                                    "id": event["id"],
                                },
                            )
                            # Now retry it
                            await execute_mutate(
                                """
                                UPDATE webhook_events
                                SET status = 'processing',
                                    processing_started_at = :processing_started_at,
                                    retry_count = :retry_count
                                WHERE id = :id
                                """,
                                {
                                    "processing_started_at": datetime.now(timezone.utc).isoformat(),
                                    "retry_count": event.get('retry_count', 0) + 1,
                                    "id": event["id"],
                                },
                            )
                            return True, None
                    except Exception as e:
                        logger.error(f"[WEBHOOK] Error checking timeout for event {event_id}: {e}")
                
                logger.warning(f"[WEBHOOK] Event {event_id} is currently being processed")
                return False, 'in_progress'
            elif event['status'] == 'failed':
                logger.info(f"[WEBHOOK] Retrying previously failed event {event_id}")
                await execute_mutate(
                    """
                    UPDATE webhook_events
                    SET status = 'processing',
                        processing_started_at = :processing_started_at,
                        retry_count = :retry_count
                    WHERE id = :id
                    """,
                    {
                        "processing_started_at": datetime.now(timezone.utc).isoformat(),
                        "retry_count": event.get('retry_count', 0) + 1,
                        "id": event["id"],
                    },
                )
                return True, None
        else:
            try:
                await execute_mutate(
                    """
                    INSERT INTO webhook_events (
                        event_id, event_type, status, processing_started_at, payload
                    )
                    VALUES (
                        :event_id, :event_type, 'processing', :processing_started_at, :payload
                    )
                    """,
                    {
                        "event_id": event_id,
                        "event_type": event_type,
                        "processing_started_at": datetime.now(timezone.utc).isoformat(),
                        "payload": payload,
                    },
                )
                logger.info(f"[WEBHOOK] Started processing new event {event_id}")
                return True, None
            except Exception as e:
                if 'duplicate key' in str(e).lower() or 'unique' in str(e).lower():
                    logger.warning(f"[WEBHOOK] Race condition detected for event {event_id}, checking if existing event is stuck...")
                    # Race condition - another process inserted first, check if it's stuck
                    race_event = await execute_one(
                        """
                        SELECT id, status, processing_started_at, retry_count
                        FROM webhook_events
                        WHERE event_id::text = :event_id
                        LIMIT 1
                        """,
                        {"event_id": event_id},
                    )

                    if race_event:
                        
                        # If the winner already completed, we're done
                        if race_event['status'] == 'completed':
                            logger.info(f"[WEBHOOK] Race condition resolved - event {event_id} already completed")
                            return False, 'already_completed'
                        
                        # If the winner already failed, we can retry
                        if race_event['status'] == 'failed':
                            logger.info(f"[WEBHOOK] Race condition resolved - event {event_id} failed, retrying")
                            await execute_mutate(
                                """
                                UPDATE webhook_events
                                SET status = 'processing',
                                    processing_started_at = :processing_started_at,
                                    retry_count = :retry_count
                                WHERE id = :id
                                """,
                                {
                                    "processing_started_at": datetime.now(timezone.utc).isoformat(),
                                    "retry_count": race_event.get('retry_count', 0) + 1,
                                    "id": race_event["id"],
                                },
                            )
                            return True, None
                        
                        # Winner is still processing - wait briefly and check again
                        if race_event['status'] == 'processing':
                            logger.info(f"[WEBHOOK] Race condition - event {event_id} being processed, waiting to verify...")
                            await asyncio.sleep(3)  # Wait 3 seconds for the other process
                            
                            # Re-check status
                            recheck = await execute_one(
                                """
                                SELECT id, status, processing_started_at, retry_count
                                FROM webhook_events
                                WHERE event_id::text = :event_id
                                LIMIT 1
                                """,
                                {"event_id": event_id},
                            )

                            if recheck:
                                final_status = recheck['status']
                                if final_status == 'completed':
                                    logger.info(f"[WEBHOOK] Race condition resolved - event {event_id} completed while waiting")
                                    return False, 'already_completed'
                                elif final_status == 'failed':
                                    logger.info(f"[WEBHOOK] Race condition resolved - event {event_id} failed, retrying")
                                    await execute_mutate(
                                        """
                                        UPDATE webhook_events
                                        SET status = 'processing',
                                            processing_started_at = :processing_started_at,
                                            retry_count = :retry_count
                                        WHERE id = :id
                                        """,
                                        {
                                            "processing_started_at": datetime.now(timezone.utc).isoformat(),
                                            "retry_count": recheck.get('retry_count', 0) + 1,
                                            "id": recheck["id"],
                                        },
                                    )
                                    return True, None
                            
                            # Still processing after wait - tell caller to signal retry
                            logger.warning(f"[WEBHOOK] Event {event_id} still processing after wait, signaling retry needed")
                            return False, 'processing_retry_later'
                    
                    logger.warning(f"[WEBHOOK] Race condition detected for event {event_id}, signaling retry needed")
                    return False, 'processing_retry_later'
                raise
        
        return True, None
    
    @staticmethod
    async def mark_webhook_completed(event_id: str):
        await execute_mutate(
            """
            UPDATE webhook_events
            SET status = 'completed',
                processed_at = :processed_at
            WHERE event_id::text = :event_id
            """,
            {"processed_at": datetime.now(timezone.utc).isoformat(), "event_id": event_id},
        )
        
        logger.info(f"[WEBHOOK] Marked event {event_id} as completed")
    
    @staticmethod
    async def mark_webhook_failed(event_id: str, error_message: str):
        try:
            safe_error_message = str(error_message)[:2000]
            import re
            safe_error_message = re.sub(r'[^\x00-\x7F]+', ' ', safe_error_message)
            safe_error_message = safe_error_message.replace('\x00', '')
        except Exception:
            safe_error_message = "Error message could not be serialized"
        
        try:
            await execute_mutate(
                """
                UPDATE webhook_events
                SET status = 'failed',
                    error_message = :error_message,
                    processed_at = :processed_at
                WHERE event_id::text = :event_id
                """,
                {
                    "error_message": safe_error_message,
                    "processed_at": datetime.now(timezone.utc).isoformat(),
                    "event_id": event_id,
                },
            )
            
            logger.error(f"[WEBHOOK] Marked event {event_id} as failed: {safe_error_message}")
        except Exception as db_error:
            logger.error(f"[WEBHOOK] Failed to mark event {event_id} as failed in database: {db_error}")
            logger.error(f"[WEBHOOK] Original error was: {safe_error_message}")
