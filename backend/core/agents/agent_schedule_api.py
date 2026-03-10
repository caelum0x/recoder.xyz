from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, field_validator
from typing import Optional, List
from datetime import datetime, timezone, timedelta
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one
from core.utils.logger import logger
import re
import calendar

router = APIRouter(tags=["agent-schedules"])


# ---------------------------------------------------------------------------
# Simple cron parser (5-field: minute hour day_of_month month day_of_week)
# ---------------------------------------------------------------------------

CRON_FIELD_RANGES = [
    (0, 59),   # minute
    (0, 23),   # hour
    (1, 31),   # day of month
    (1, 12),   # month
    (0, 6),    # day of week (0 = Sunday)
]

CRON_FIELD_NAMES = ["minute", "hour", "day_of_month", "month", "day_of_week"]


def _parse_cron_field(field: str, min_val: int, max_val: int) -> list[int]:
    """Parse a single cron field into a list of matching integer values."""
    values = set()
    for part in field.split(","):
        step = 1
        if "/" in part:
            range_part, step_str = part.split("/", 1)
            step = int(step_str)
            if step < 1:
                raise ValueError(f"Step must be >= 1, got {step}")
        else:
            range_part = part

        if range_part == "*":
            start, end = min_val, max_val
        elif "-" in range_part:
            s, e = range_part.split("-", 1)
            start, end = int(s), int(e)
        else:
            start = end = int(range_part)

        if start < min_val or end > max_val or start > end:
            raise ValueError(f"Range {start}-{end} out of bounds ({min_val}-{max_val})")

        for v in range(start, end + 1, step):
            values.add(v)

    return sorted(values)


def validate_cron_expression(expr: str) -> bool:
    """Validate a 5-field cron expression. Raises ValueError if invalid."""
    parts = expr.strip().split()
    if len(parts) != 5:
        raise ValueError(f"Cron expression must have 5 fields, got {len(parts)}")
    for i, part in enumerate(parts):
        try:
            _parse_cron_field(part, *CRON_FIELD_RANGES[i])
        except Exception as e:
            raise ValueError(f"Invalid {CRON_FIELD_NAMES[i]} field '{part}': {e}")
    return True


def calculate_next_run(cron_expr: str, after: datetime | None = None) -> datetime:
    """Calculate the next run time for a 5-field cron expression after the given datetime (UTC)."""
    if after is None:
        after = datetime.now(timezone.utc)
    # Ensure we have timezone-aware UTC datetime
    if after.tzinfo is None:
        after = after.replace(tzinfo=timezone.utc)

    parts = cron_expr.strip().split()
    minutes = _parse_cron_field(parts[0], *CRON_FIELD_RANGES[0])
    hours = _parse_cron_field(parts[1], *CRON_FIELD_RANGES[1])
    dom = _parse_cron_field(parts[2], *CRON_FIELD_RANGES[2])
    months = _parse_cron_field(parts[3], *CRON_FIELD_RANGES[3])
    dow = _parse_cron_field(parts[4], *CRON_FIELD_RANGES[4])

    dom_restricted = parts[2] != "*"
    dow_restricted = parts[4] != "*"

    # Start searching from one minute after `after`
    candidate = after.replace(second=0, microsecond=0) + timedelta(minutes=1)

    # Limit search to prevent infinite loop (scan up to ~2 years)
    max_iterations = 366 * 24 * 60
    for _ in range(max_iterations):
        if candidate.month not in months:
            # Skip to first day of next matching month
            candidate = _next_month(candidate, months)
            continue

        # Day matching: if both dom and dow are restricted, match either (union)
        day_match = True
        if dom_restricted and dow_restricted:
            day_match = candidate.day in dom or (candidate.weekday() + 1) % 7 in dow
        elif dom_restricted:
            day_match = candidate.day in dom
        elif dow_restricted:
            # Python weekday: Mon=0..Sun=6 → cron: Sun=0..Sat=6
            day_match = (candidate.weekday() + 1) % 7 in dow

        if not day_match:
            candidate = _next_day(candidate)
            continue

        if candidate.hour not in hours:
            candidate = _next_hour(candidate, hours)
            continue

        if candidate.minute not in minutes:
            next_min = _next_minute(candidate, minutes)
            if next_min is None:
                # No matching minute left in this hour — advance to the next hour
                candidate = _next_hour(candidate, hours)
                # Reset minute to the first matching one (will be checked on next iteration)
                continue
            candidate = next_min
            continue

        return candidate

    # Fallback: 1 hour from now
    return after + timedelta(hours=1)


def _next_month(dt: datetime, months: list[int]) -> datetime:
    """Advance dt to the first moment of the next matching month."""
    year, month = dt.year, dt.month
    for _ in range(24):  # scan up to 2 years
        month += 1
        if month > 12:
            month = 1
            year += 1
        if month in months:
            return datetime(year, month, 1, 0, 0, tzinfo=timezone.utc)
    return dt + timedelta(days=365)


def _next_day(dt: datetime) -> datetime:
    return (dt + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)


def _next_hour(dt: datetime, hours: list[int]) -> datetime:
    for h in hours:
        if h > dt.hour:
            return dt.replace(hour=h, minute=0, second=0, microsecond=0)
    # Wrap to next day
    return _next_day(dt)


def _next_minute(dt: datetime, minutes: list[int]) -> datetime | None:
    for m in minutes:
        if m > dt.minute:
            return dt.replace(minute=m, second=0, microsecond=0)
    return None


def cron_to_human(expr: str) -> str:
    """Convert a cron expression to a human-readable string (best effort)."""
    presets = {
        "0 * * * *": "Every hour",
        "0 */6 * * *": "Every 6 hours",
        "0 9 * * *": "Daily at 9:00 AM",
        "0 9 * * 1": "Every Monday at 9:00 AM",
        "0 9 1 * *": "1st of every month at 9:00 AM",
        "*/5 * * * *": "Every 5 minutes",
        "*/15 * * * *": "Every 15 minutes",
        "*/30 * * * *": "Every 30 minutes",
        "0 0 * * *": "Daily at midnight",
        "0 12 * * *": "Daily at noon",
    }
    normalized = " ".join(expr.strip().split())
    if normalized in presets:
        return presets[normalized]
    return normalized


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class CreateScheduleRequest(BaseModel):
    name: str
    cron_expression: str
    timezone: str = "UTC"
    input_message: Optional[str] = None
    max_runs: Optional[int] = None

    @field_validator("cron_expression")
    @classmethod
    def check_cron(cls, v: str) -> str:
        validate_cron_expression(v)
        return v.strip()


class UpdateScheduleRequest(BaseModel):
    name: Optional[str] = None
    cron_expression: Optional[str] = None
    timezone: Optional[str] = None
    input_message: Optional[str] = None
    is_active: Optional[bool] = None
    max_runs: Optional[int] = None

    @field_validator("cron_expression")
    @classmethod
    def check_cron(cls, v: str | None) -> str | None:
        if v is not None:
            validate_cron_expression(v)
            return v.strip()
        return v


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/agents/{agent_id}/schedules", summary="Create schedule for agent")
async def create_schedule(
    agent_id: str,
    body: CreateScheduleRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    next_run = calculate_next_run(body.cron_expression)
    row = await execute_one(
        """
        INSERT INTO agent_schedules (
            user_id, agent_id, name, cron_expression, timezone,
            input_message, max_runs, next_run_at
        ) VALUES (
            :user_id, :agent_id, :name, :cron_expression, :timezone,
            :input_message, :max_runs, :next_run_at
        )
        RETURNING *
        """,
        {
            "user_id": user_id,
            "agent_id": agent_id,
            "name": body.name,
            "cron_expression": body.cron_expression,
            "timezone": body.timezone,
            "input_message": body.input_message,
            "max_runs": body.max_runs,
            "next_run_at": next_run.isoformat(),
        },
    )
    result = dict(row)
    result["cron_human"] = cron_to_human(body.cron_expression)
    return result


@router.get("/agents/{agent_id}/schedules", summary="List schedules for agent")
async def list_agent_schedules(
    agent_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    rows = await execute(
        """
        SELECT * FROM agent_schedules
        WHERE agent_id = :agent_id AND user_id = :user_id
        ORDER BY created_at DESC
        """,
        {"agent_id": agent_id, "user_id": user_id},
    )
    results = []
    for r in rows:
        d = dict(r)
        d["cron_human"] = cron_to_human(d["cron_expression"])
        results.append(d)
    return results


@router.get("/schedules", summary="List all user schedules")
async def list_all_schedules(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    rows = await execute(
        """
        SELECT s.*, a.name AS agent_name
        FROM agent_schedules s
        LEFT JOIN agents a ON a.agent_id = s.agent_id
        WHERE s.user_id = :user_id
        ORDER BY s.created_at DESC
        """,
        {"user_id": user_id},
    )
    results = []
    for r in rows:
        d = dict(r)
        d["cron_human"] = cron_to_human(d["cron_expression"])
        results.append(d)
    return results


@router.patch("/schedules/{schedule_id}", summary="Update schedule")
async def update_schedule(
    schedule_id: str,
    body: UpdateScheduleRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    # Verify ownership
    existing = await execute_one(
        "SELECT * FROM agent_schedules WHERE id = :id AND user_id = :user_id",
        {"id": schedule_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Schedule not found")

    updates = {}
    params = {"id": schedule_id, "user_id": user_id}

    if body.name is not None:
        updates["name"] = body.name
        params["name"] = body.name
    if body.cron_expression is not None:
        updates["cron_expression"] = body.cron_expression
        params["cron_expression"] = body.cron_expression
    if body.timezone is not None:
        updates["timezone"] = body.timezone
        params["timezone"] = body.timezone
    if body.input_message is not None:
        updates["input_message"] = body.input_message
        params["input_message"] = body.input_message
    if body.is_active is not None:
        updates["is_active"] = body.is_active
        params["is_active"] = body.is_active
    if body.max_runs is not None:
        updates["max_runs"] = body.max_runs
        params["max_runs"] = body.max_runs

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    # Recalculate next_run_at if cron changed or schedule reactivated
    cron_expr = body.cron_expression or existing["cron_expression"]
    if body.cron_expression is not None or body.is_active is True:
        next_run = calculate_next_run(cron_expr)
        updates["next_run_at"] = next_run.isoformat()
        params["next_run_at"] = next_run.isoformat()

    set_clauses = ", ".join(f"{k} = :{k}" for k in updates)
    set_clauses += ", updated_at = now()"

    row = await execute_one(
        f"UPDATE agent_schedules SET {set_clauses} WHERE id = :id AND user_id = :user_id RETURNING *",
        params,
    )
    result = dict(row)
    result["cron_human"] = cron_to_human(result["cron_expression"])
    return result


@router.delete("/schedules/{schedule_id}", summary="Delete schedule")
async def delete_schedule(
    schedule_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    existing = await execute_one(
        "SELECT id FROM agent_schedules WHERE id = :id AND user_id = :user_id",
        {"id": schedule_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Schedule not found")

    await execute(
        "DELETE FROM agent_schedules WHERE id = :id AND user_id = :user_id",
        {"id": schedule_id, "user_id": user_id},
    )
    return {"status": "ok"}


@router.post("/schedules/{schedule_id}/trigger", summary="Manually trigger a scheduled run")
async def trigger_schedule(
    schedule_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    schedule = await execute_one(
        "SELECT * FROM agent_schedules WHERE id = :id AND user_id = :user_id",
        {"id": schedule_id, "user_id": user_id},
    )
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")

    # Create a schedule_execution record
    execution = await execute_one(
        """
        INSERT INTO schedule_executions (schedule_id, user_id, agent_id, status)
        VALUES (:schedule_id, :user_id, :agent_id, 'pending')
        RETURNING *
        """,
        {
            "schedule_id": schedule_id,
            "user_id": user_id,
            "agent_id": schedule["agent_id"],
        },
    )

    # Update run count and last_run_at
    await execute(
        """
        UPDATE agent_schedules
        SET run_count = run_count + 1, last_run_at = now(), updated_at = now()
        WHERE id = :id
        """,
        {"id": schedule_id},
    )

    return dict(execution)


@router.get("/schedules/{schedule_id}/executions", summary="List execution history")
async def list_executions(
    schedule_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    status: Optional[str] = Query(None),
):
    # Verify ownership
    schedule = await execute_one(
        "SELECT id FROM agent_schedules WHERE id = :id AND user_id = :user_id",
        {"id": schedule_id, "user_id": user_id},
    )
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")

    where = "schedule_id = :schedule_id AND user_id = :user_id"
    params: dict = {"schedule_id": schedule_id, "user_id": user_id, "limit": limit, "offset": offset}

    if status:
        where += " AND status = :status"
        params["status"] = status

    rows = await execute(
        f"""
        SELECT * FROM schedule_executions
        WHERE {where}
        ORDER BY started_at DESC
        LIMIT :limit OFFSET :offset
        """,
        params,
    )

    count_row = await execute_one(
        f"SELECT COUNT(*) FROM schedule_executions WHERE {where}",
        {k: v for k, v in params.items() if k not in ("limit", "offset")},
    )
    total = int(count_row["count"]) if count_row else 0

    return {
        "executions": [dict(r) for r in rows],
        "total": total,
        "limit": limit,
        "offset": offset,
    }
