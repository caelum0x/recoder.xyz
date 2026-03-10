"""
Unified Activity Timeline API.

Aggregates activity events from multiple sources (agent_activity, audit_logs,
schedule_executions, platform_activity) into a single timeline with stats
and heatmap endpoints.
"""

from datetime import datetime, timezone, timedelta, date
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one
from core.utils.logger import logger

router = APIRouter(prefix="/activity", tags=["unified-activity"])


# ============================================================================
# Pydantic Models
# ============================================================================

class TimelineItem(BaseModel):
    id: str
    source: str  # agent_activity, audit_log, schedule_execution, platform_activity
    type: str
    title: str
    description: Optional[str] = None
    resource_id: Optional[str] = None
    resource_type: Optional[str] = None
    resource_name: Optional[str] = None
    timestamp: str
    metadata: Dict[str, Any] = {}


class TimelineResponse(BaseModel):
    items: List[TimelineItem] = []
    total: int = 0
    has_more: bool = False


class DailyActivityStat(BaseModel):
    date: str
    count: int = 0
    breakdown: Dict[str, int] = {}


class ActivityStatsResponse(BaseModel):
    events_today: int = 0
    events_this_week: int = 0
    most_active_resource: Optional[str] = None
    peak_hour: Optional[int] = None
    daily_stats: List[DailyActivityStat] = []


class HeatmapCell(BaseModel):
    day: int  # 0=Mon, 6=Sun
    hour: int  # 0-23
    count: int = 0


class HeatmapResponse(BaseModel):
    cells: List[HeatmapCell] = []
    total_events: int = 0
    period_days: int = 7


# ============================================================================
# Helpers
# ============================================================================

def _ts(val: Any) -> str:
    if val is None:
        return ""
    if hasattr(val, "isoformat"):
        return val.isoformat()
    return str(val)


def _safe_str(val: Any) -> Optional[str]:
    if val is None:
        return None
    return str(val)


# ============================================================================
# Endpoints
# ============================================================================

@router.get("/timeline", response_model=TimelineResponse, summary="Unified activity timeline")
async def get_activity_timeline(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
    limit: int = Query(30, ge=1, le=100),
    offset: int = Query(0, ge=0),
    resource_type: Optional[str] = Query(None, description="Filter: agent, thread, schedule, platform"),
    from_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    to_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
):
    """
    Unified timeline aggregating events from agent_activity, audit_logs,
    schedule_executions, and platform_activity.
    """
    try:
        all_items: List[TimelineItem] = []

        # Build date filter SQL fragments
        date_filter_aa = ""
        date_filter_al = ""
        date_filter_se = ""
        date_filter_pa = ""
        date_params: Dict[str, Any] = {}

        if from_date:
            date_params["from_date"] = from_date
            date_filter_aa += " AND aa.created_at >= :from_date::timestamptz"
            date_filter_al += " AND al.created_at >= :from_date::timestamptz"
            date_filter_se += " AND se.executed_at >= :from_date::timestamptz"
            date_filter_pa += " AND pa.timestamp >= :from_date::timestamptz"

        if to_date:
            date_params["to_date"] = to_date + "T23:59:59Z"
            date_filter_aa += " AND aa.created_at <= :to_date::timestamptz"
            date_filter_al += " AND al.created_at <= :to_date::timestamptz"
            date_filter_se += " AND se.executed_at <= :to_date::timestamptz"
            date_filter_pa += " AND pa.timestamp <= :to_date::timestamptz"

        # 1. Agent Activity
        if not resource_type or resource_type == 'agent':
            try:
                aa_rows = await execute(
                    f"""SELECT aa.id, aa.activity_type, aa.description, aa.agent_id,
                               aa.metadata, aa.created_at, a.name AS agent_name
                        FROM agent_activity aa
                        LEFT JOIN agents a ON a.agent_id::text = aa.agent_id
                        WHERE aa.user_id = :user_id{date_filter_aa}
                        ORDER BY aa.created_at DESC
                        LIMIT :fetch_limit""",
                    {"user_id": user_id, "fetch_limit": limit + offset, **date_params},
                )
                for row in (aa_rows or []):
                    all_items.append(TimelineItem(
                        id=f"aa-{row['id']}",
                        source="agent_activity",
                        type=row.get("activity_type", "unknown"),
                        title=_activity_title(row.get("activity_type", ""), row.get("agent_name")),
                        description=row.get("description"),
                        resource_id=_safe_str(row.get("agent_id")),
                        resource_type="agent",
                        resource_name=row.get("agent_name"),
                        timestamp=_ts(row.get("created_at")),
                        metadata=row.get("metadata") or {},
                    ))
            except Exception as e:
                logger.warning(f"unified_activity: agent_activity query failed: {e}")

        # 2. Audit Logs
        if not resource_type or resource_type == 'audit':
            try:
                al_rows = await execute(
                    f"""SELECT id, action, resource_type, resource_id, details, created_at
                        FROM audit_logs
                        WHERE user_id = :user_id{date_filter_al}
                        ORDER BY created_at DESC
                        LIMIT :fetch_limit""",
                    {"user_id": user_id, "fetch_limit": limit + offset, **date_params},
                )
                for row in (al_rows or []):
                    all_items.append(TimelineItem(
                        id=f"al-{row['id']}",
                        source="audit_log",
                        type=row.get("action", "unknown"),
                        title=_audit_title(row.get("action", ""), row.get("resource_type")),
                        description=None,
                        resource_id=_safe_str(row.get("resource_id")),
                        resource_type=row.get("resource_type"),
                        timestamp=_ts(row.get("created_at")),
                        metadata=row.get("details") if isinstance(row.get("details"), dict) else {},
                    ))
            except Exception as e:
                logger.warning(f"unified_activity: audit_logs query failed: {e}")

        # 3. Schedule Executions
        if not resource_type or resource_type == 'schedule':
            try:
                se_rows = await execute(
                    f"""SELECT se.id, se.schedule_id, se.status, se.error_message,
                               se.executed_at, s.name AS schedule_name, s.agent_id
                        FROM schedule_executions se
                        LEFT JOIN agent_schedules s ON s.id = se.schedule_id
                        WHERE s.user_id = :user_id{date_filter_se}
                        ORDER BY se.executed_at DESC
                        LIMIT :fetch_limit""",
                    {"user_id": user_id, "fetch_limit": limit + offset, **date_params},
                )
                for row in (se_rows or []):
                    all_items.append(TimelineItem(
                        id=f"se-{row['id']}",
                        source="schedule_execution",
                        type=f"schedule_{row.get('status', 'unknown')}",
                        title=f"Schedule: {row.get('schedule_name', 'Unknown')}",
                        description=row.get("error_message"),
                        resource_id=_safe_str(row.get("schedule_id")),
                        resource_type="schedule",
                        resource_name=row.get("schedule_name"),
                        timestamp=_ts(row.get("executed_at")),
                        metadata={"agent_id": _safe_str(row.get("agent_id"))},
                    ))
            except Exception as e:
                logger.warning(f"unified_activity: schedule_executions query failed: {e}")

        # 4. Platform Activity
        if not resource_type or resource_type == 'platform':
            try:
                pa_rows = await execute(
                    f"""SELECT id, app, type, title, description, timestamp, metadata
                        FROM platform_activity
                        WHERE user_id = :user_id{date_filter_pa}
                        ORDER BY timestamp DESC
                        LIMIT :fetch_limit""",
                    {"user_id": user_id, "fetch_limit": limit + offset, **date_params},
                )
                for row in (pa_rows or []):
                    all_items.append(TimelineItem(
                        id=f"pa-{row['id']}",
                        source="platform_activity",
                        type=row.get("type", "unknown"),
                        title=row.get("title", "Platform event"),
                        description=row.get("description"),
                        resource_type="platform",
                        resource_name=row.get("app"),
                        timestamp=_ts(row.get("timestamp")),
                        metadata=row.get("metadata") or {},
                    ))
            except Exception as e:
                logger.warning(f"unified_activity: platform_activity query failed: {e}")

        # Sort all items by timestamp DESC
        all_items.sort(key=lambda x: x.timestamp, reverse=True)

        total = len(all_items)
        paged = all_items[offset : offset + limit]

        return TimelineResponse(
            items=paged,
            total=total,
            has_more=(offset + limit) < total,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching unified timeline: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch activity timeline")


@router.get("/stats", response_model=ActivityStatsResponse, summary="Activity statistics")
async def get_activity_stats(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Activity statistics: events today, this week, most active resource,
    peak hour, and daily counts for the last 30 days.
    """
    try:
        now = datetime.now(timezone.utc)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        week_start = today_start - timedelta(days=today_start.weekday())
        thirty_days_ago = today_start - timedelta(days=30)

        # Events today
        events_today = 0
        try:
            row = await execute_one(
                "SELECT COUNT(*) AS cnt FROM agent_activity WHERE user_id = :user_id AND created_at >= :since",
                {"user_id": user_id, "since": today_start},
            )
            if row:
                events_today = row["cnt"]
        except Exception as e:
            logger.warning(f"activity_stats: events_today failed: {e}")

        # Events this week
        events_this_week = 0
        try:
            row = await execute_one(
                "SELECT COUNT(*) AS cnt FROM agent_activity WHERE user_id = :user_id AND created_at >= :since",
                {"user_id": user_id, "since": week_start},
            )
            if row:
                events_this_week = row["cnt"]
        except Exception as e:
            logger.warning(f"activity_stats: events_this_week failed: {e}")

        # Most active resource (agent) in last 30 days
        most_active_resource: Optional[str] = None
        try:
            row = await execute_one(
                """SELECT a.name
                   FROM agent_activity aa
                   LEFT JOIN agents a ON a.agent_id::text = aa.agent_id
                   WHERE aa.user_id = :user_id AND aa.created_at >= :since
                   GROUP BY a.name
                   ORDER BY COUNT(*) DESC
                   LIMIT 1""",
                {"user_id": user_id, "since": thirty_days_ago},
            )
            if row and row.get("name"):
                most_active_resource = row["name"]
        except Exception as e:
            logger.warning(f"activity_stats: most_active_resource failed: {e}")

        # Peak hour in last 7 days
        peak_hour: Optional[int] = None
        try:
            row = await execute_one(
                """SELECT EXTRACT(HOUR FROM created_at) AS hr
                   FROM agent_activity
                   WHERE user_id = :user_id AND created_at >= :since
                   GROUP BY EXTRACT(HOUR FROM created_at)
                   ORDER BY COUNT(*) DESC
                   LIMIT 1""",
                {"user_id": user_id, "since": today_start - timedelta(days=7)},
            )
            if row and row.get("hr") is not None:
                peak_hour = int(row["hr"])
        except Exception as e:
            logger.warning(f"activity_stats: peak_hour failed: {e}")

        # Daily event counts for last 30 days
        daily_stats: List[DailyActivityStat] = []
        try:
            rows = await execute(
                """SELECT DATE(created_at) AS day, activity_type, COUNT(*) AS cnt
                   FROM agent_activity
                   WHERE user_id = :user_id AND created_at >= :since
                   GROUP BY DATE(created_at), activity_type
                   ORDER BY day""",
                {"user_id": user_id, "since": thirty_days_ago},
            )
            # Group by day
            day_map: Dict[str, DailyActivityStat] = {}
            for row in (rows or []):
                day_str = str(row["day"])
                if day_str not in day_map:
                    day_map[day_str] = DailyActivityStat(date=day_str)
                stat = day_map[day_str]
                cnt = int(row["cnt"])
                stat.count += cnt
                stat.breakdown[row.get("activity_type", "other")] = cnt
            daily_stats = sorted(day_map.values(), key=lambda s: s.date)
        except Exception as e:
            logger.warning(f"activity_stats: daily_stats failed: {e}")

        return ActivityStatsResponse(
            events_today=events_today,
            events_this_week=events_this_week,
            most_active_resource=most_active_resource,
            peak_hour=peak_hour,
            daily_stats=daily_stats,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching activity stats: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch activity stats")


@router.get("/heatmap", response_model=HeatmapResponse, summary="Activity heatmap")
async def get_activity_heatmap(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
    days: int = Query(7, ge=1, le=30, description="Number of days to include"),
):
    """
    Hourly activity counts for the last N days, organized as a day-of-week x hour grid.
    Day 0 = Monday, 6 = Sunday. Hour 0-23.
    """
    try:
        since = datetime.now(timezone.utc) - timedelta(days=days)

        rows = await execute(
            """SELECT
                   EXTRACT(DOW FROM created_at) AS dow,
                   EXTRACT(HOUR FROM created_at) AS hr,
                   COUNT(*) AS cnt
               FROM agent_activity
               WHERE user_id = :user_id AND created_at >= :since
               GROUP BY EXTRACT(DOW FROM created_at), EXTRACT(HOUR FROM created_at)
               ORDER BY dow, hr""",
            {"user_id": user_id, "since": since},
        )

        cells: List[HeatmapCell] = []
        total_events = 0

        for row in (rows or []):
            # PostgreSQL DOW: 0=Sunday, 1=Monday...6=Saturday
            # Convert to ISO: 0=Monday...6=Sunday
            pg_dow = int(row["dow"])
            iso_day = (pg_dow - 1) % 7  # Mon=0, Sun=6
            cnt = int(row["cnt"])
            cells.append(HeatmapCell(day=iso_day, hour=int(row["hr"]), count=cnt))
            total_events += cnt

        return HeatmapResponse(
            cells=cells,
            total_events=total_events,
            period_days=days,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching activity heatmap: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch activity heatmap")


# ============================================================================
# Title Helpers
# ============================================================================

def _activity_title(activity_type: str, agent_name: Optional[str] = None) -> str:
    agent_label = agent_name or "Agent"
    titles = {
        "run_started": f"{agent_label} run started",
        "run_completed": f"{agent_label} run completed",
        "run_failed": f"{agent_label} run failed",
        "config_updated": f"{agent_label} configuration updated",
        "tool_added": f"Tool added to {agent_label}",
        "tool_removed": f"Tool removed from {agent_label}",
        "version_created": f"New version created for {agent_label}",
        "version_activated": f"Version activated for {agent_label}",
        "schedule_created": f"Schedule created for {agent_label}",
        "schedule_updated": f"Schedule updated for {agent_label}",
    }
    return titles.get(activity_type, f"{agent_label}: {activity_type}")


def _audit_title(action: str, resource_type: Optional[str] = None) -> str:
    resource = resource_type or "resource"
    return f"{action.replace('_', ' ').title()} ({resource})"
