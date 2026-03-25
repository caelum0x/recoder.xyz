"""
API instance metrics service for tracking active agent runs.

Provides:
- Active agent run counts (from DB - source of truth)
- Redis stream counts (real-time tracking)
- CloudWatch publishing for monitoring
"""
import asyncio
import os
from datetime import datetime, timezone
from typing import Optional, Dict, List

from core.utils.logger import logger
from core.utils.config import config, EnvMode

# CloudWatch client (lazy initialized)
_cloudwatch_client = None
# Flag to avoid repeated "no credentials" warnings
_cloudwatch_unavailable = False


def _get_cloudwatch_client():
    """Get or create CloudWatch client (production only).

    Returns None silently after the first failure to avoid spamming logs
    every publish interval when AWS credentials are not configured.
    """
    global _cloudwatch_client, _cloudwatch_unavailable

    if config.ENV_MODE != EnvMode.PRODUCTION:
        return None

    # If we already know CloudWatch is unavailable, skip silently
    if _cloudwatch_unavailable:
        return None

    if _cloudwatch_client is None:
        try:
            import boto3
            # Check if AWS credentials are configured before creating client
            aws_key = os.getenv("AWS_ACCESS_KEY_ID")
            aws_secret = os.getenv("AWS_SECRET_ACCESS_KEY")
            if not aws_key or not aws_secret:
                logger.info("AWS credentials not configured — CloudWatch metrics disabled (this message appears once)")
                _cloudwatch_unavailable = True
                return None
            _cloudwatch_client = boto3.client('cloudwatch', region_name='us-west-2')
        except ImportError:
            logger.info("boto3 not installed — CloudWatch metrics disabled (this message appears once)")
            _cloudwatch_unavailable = True
            return None
        except Exception as e:
            logger.warning(f"Failed to initialize CloudWatch client: {e} — disabling CloudWatch metrics")
            _cloudwatch_unavailable = True
            return None

    return _cloudwatch_client


async def get_worker_metrics() -> dict:
    """
    Get active agent run metrics.
    
    Returns:
        dict with:
        - active_agent_runs: Total active runs across all instances (from DB)
        - active_redis_streams: Active Redis stream keys (real-time tracking)
        - orphaned_streams: Streams without DB records (should be 0)
    """
    from core.services.db import Table
    from core.services import redis

    try:
        # Count active agent runs from database (source of truth across all instances)
        active_agent_runs = await Table("agent_runs").count(filters={"status": "running"})
        
        # Count active Redis stream keys (real-time tracking)
        active_redis_streams = 0
        try:
            redis_client = await redis.get_client()
            # Use SCAN to find all agent_run:*:stream keys (non-blocking)
            cursor = 0
            pattern = "agent_run:*:stream"
            while True:
                cursor, keys = await redis_client.scan(cursor, match=pattern, count=100)
                active_redis_streams += len(keys)
                if cursor == 0:
                    break
        except Exception as e:
            logger.warning(f"Failed to count Redis stream keys: {e}")
            # Fallback: use DB count if Redis fails
            active_redis_streams = active_agent_runs
        
        # Orphaned streams = Redis streams without corresponding 'running' DB record
        # Should be 0 in healthy state - non-zero indicates cleanup issues
        orphaned_streams = max(0, active_redis_streams - active_agent_runs)
        
        return {
            "active_agent_runs": active_agent_runs,
            "active_redis_streams": active_redis_streams,
            "orphaned_streams": orphaned_streams,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
    except Exception as e:
        logger.error(f"Failed to get API instance metrics: {e}")
        raise


async def get_worker_count() -> int:
    """
    Get active agent run count (simplified version).
    
    Returns:
        Number of active agent runs across all instances
    """
    try:
        metrics = await get_worker_metrics()
        return metrics["active_agent_runs"]
    except Exception as e:
        logger.error(f"Failed to get active agent run count: {e}")
        return 0


async def publish_to_cloudwatch(metrics: dict) -> bool:
    """
    Publish API instance metrics to CloudWatch for monitoring.
    
    Args:
        metrics: API instance metrics dict from get_worker_metrics()
        
    Returns:
        True if published successfully, False otherwise
    """
    cloudwatch = _get_cloudwatch_client()
    if cloudwatch is None:
        return False
    
    try:
        metric_data = [
            {
                'MetricName': 'ActiveAgentRuns',
                'Value': metrics.get('active_agent_runs', 0),
                'Unit': 'Count',
                'Dimensions': [{'Name': 'Service', 'Value': 'api'}]
            },
            {
                'MetricName': 'OrphanedStreams',
                'Value': metrics.get('orphaned_streams', 0),
                'Unit': 'Count',
                'Dimensions': [{'Name': 'Service', 'Value': 'api'}]
            }
        ]
        
        cloudwatch.put_metric_data(
            Namespace='Recoder',
            MetricData=metric_data
        )
        logger.debug(f"Published metrics to CloudWatch: {metrics.get('active_agent_runs')} active runs, {metrics.get('orphaned_streams')} orphaned streams")
        return True
    except Exception as e:
        logger.error(f"Failed to publish API instance metrics to CloudWatch: {e}")
        return False


async def start_cloudwatch_publisher(interval_seconds: int = 60):
    """
    Background task to publish API instance metrics to CloudWatch periodically.

    Args:
        interval_seconds: How often to publish (default 60s)
    """
    # Check once at startup — if CloudWatch is not available, exit immediately
    # instead of spinning in an infinite loop that logs errors every interval.
    if _get_cloudwatch_client() is None:
        logger.info("CloudWatch publisher not started — client unavailable")
        return

    logger.info(f"Starting CloudWatch API instance metrics publisher (interval: {interval_seconds}s)")

    while True:
        try:
            await asyncio.sleep(interval_seconds)

            metrics = await get_worker_metrics()
            await publish_to_cloudwatch(metrics)

        except asyncio.CancelledError:
            logger.info("CloudWatch API instance metrics publisher stopped")
            raise
        except Exception as e:
            logger.error(f"Error in CloudWatch API instance publisher loop: {e}")


async def cleanup_orphaned_redis_streams(max_age_seconds: int = 3600) -> int:
    """
    Clean up Redis streams that have no TTL set (TTL = -1).
    
    This handles streams that were created before TTL was set, or where
    the process crashed before reaching the finally block that sets TTL.
    
    Args:
        max_age_seconds: TTL to set on orphaned streams (default 1 hour)
        
    Returns:
        Number of streams that had TTL set
    """
    from core.services import redis
    
    fixed_count = 0
    try:
        redis_client = await redis.get_client()
        
        # Scan for all stream keys
        cursor = 0
        pattern = "agent_run:*:stream"
        
        while True:
            cursor, keys = await redis_client.scan(cursor, match=pattern, count=100)
            
            for key in keys:
                try:
                    ttl = await redis_client.ttl(key)
                    if ttl == -1:  # No TTL set
                        await redis_client.expire(key, max_age_seconds)
                        fixed_count += 1
                except Exception:
                    pass  # Skip individual key errors
            
            if cursor == 0:
                break
        
        if fixed_count > 0:
            logger.warning(f"🧹 Set TTL on {fixed_count} orphaned Redis streams (no TTL)")
        
        return fixed_count
    except Exception as e:
        logger.error(f"Failed to cleanup orphaned Redis streams: {e}")
        return 0


async def start_stream_cleanup_task(interval_seconds: int = 300):
    """
    Background task to periodically clean up orphaned Redis streams.
    
    Runs every 5 minutes by default to catch any streams that somehow
    escaped TTL setting (crash before finally block, etc).
    
    Args:
        interval_seconds: How often to run cleanup (default 5 minutes)
    """
    logger.info(f"Starting Redis stream cleanup task (interval: {interval_seconds}s)")
    
    while True:
        try:
            await asyncio.sleep(interval_seconds)
            await cleanup_orphaned_redis_streams()
        except asyncio.CancelledError:
            logger.info("Redis stream cleanup task stopped")
            raise
        except Exception as e:
            logger.error(f"Error in stream cleanup task: {e}")
