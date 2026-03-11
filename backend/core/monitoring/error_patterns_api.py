"""
Error Pattern Detection API endpoints.

Scans recent errors, groups by signature, tracks patterns with severity and
status workflow (active -> investigating -> resolved -> muted).
"""

from datetime import datetime, timezone
from typing import Optional, List
import json

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate
from core.utils.logger import logger

router = APIRouter(prefix="/error-patterns", tags=["error-patterns"])


# ============================================================================
# Pydantic Models
# ============================================================================

class UpdateErrorPatternRequest(BaseModel):
    status: Optional[str] = None
    resolution: Optional[str] = None
    severity: Optional[str] = None


class ErrorPatternResponse(BaseModel):
    id: str
    pattern_name: str
    error_signature: str
    occurrence_count: int
    affected_agents: list
    first_seen_at: str
    last_seen_at: str
    status: str
    resolution: Optional[str] = None
    severity: str
    sample_errors: list


class ErrorPatternStatsResponse(BaseModel):
    active_count: int = 0
    by_severity: dict = Field(default_factory=dict)
    most_frequent: list = Field(default_factory=list)
    trending: list = Field(default_factory=list)


# ============================================================================
# Helper
# ============================================================================

def _serialize_pattern(row: dict) -> dict:
    """Convert a DB row into a JSON-serializable dict."""
    return {
        "id": str(row["id"]),
        "pattern_name": row["pattern_name"],
        "error_signature": row["error_signature"],
        "occurrence_count": row["occurrence_count"],
        "affected_agents": row["affected_agents"] or [],
        "first_seen_at": row["first_seen_at"].isoformat() if hasattr(row["first_seen_at"], "isoformat") else str(row["first_seen_at"]),
        "last_seen_at": row["last_seen_at"].isoformat() if hasattr(row["last_seen_at"], "isoformat") else str(row["last_seen_at"]),
        "status": row["status"],
        "resolution": row.get("resolution"),
        "severity": row["severity"],
        "sample_errors": row.get("sample_errors") or [],
    }


# ============================================================================
# Endpoints
# ============================================================================

@router.post(
    "/scan",
    summary="Scan Recent Errors",
    operation_id="scan_error_patterns",
)
async def scan_error_patterns(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Scan recent agent run errors, group by first line (signature),
    and create or update detected patterns.
    """
    try:
        # Fetch recent failed runs with error info
        error_rows = await execute(
            """
            SELECT agent_id, error, status, started_at
            FROM agent_runs
            WHERE user_id = :user_id
              AND status = 'failed'
              AND error IS NOT NULL
              AND started_at > now() - interval '7 days'
            ORDER BY started_at DESC
            LIMIT 500
            """,
            {"user_id": user_id},
        )

        if not error_rows:
            return {"patterns_found": 0, "patterns_created": 0, "patterns_updated": 0}

        # Group errors by first line (signature)
        groups: dict = {}
        for row in error_rows:
            error_text = str(row.get("error", ""))
            signature = error_text.split("\n")[0].strip()[:500]
            if not signature:
                signature = "Unknown error"

            if signature not in groups:
                groups[signature] = {
                    "agents": set(),
                    "count": 0,
                    "samples": [],
                    "first_seen": row.get("started_at"),
                    "last_seen": row.get("started_at"),
                }

            g = groups[signature]
            g["agents"].add(row["agent_id"])
            g["count"] += 1
            if len(g["samples"]) < 5:
                g["samples"].append({
                    "agent_id": row["agent_id"],
                    "error": error_text[:2000],
                    "timestamp": row["started_at"].isoformat() if hasattr(row["started_at"], "isoformat") else str(row["started_at"]),
                })

            ts = row.get("started_at")
            if ts:
                if g["first_seen"] is None or ts < g["first_seen"]:
                    g["first_seen"] = ts
                if g["last_seen"] is None or ts > g["last_seen"]:
                    g["last_seen"] = ts

        created = 0
        updated = 0

        for signature, data in groups.items():
            # Check if pattern already exists
            existing = await execute_one(
                """
                SELECT id, occurrence_count, affected_agents, sample_errors
                FROM detected_error_patterns
                WHERE user_id = :user_id AND error_signature = :signature
                """,
                {"user_id": user_id, "signature": signature},
            )

            agents_list = list(data["agents"])
            pattern_name = signature[:120]

            # Auto-detect severity based on count
            count = data["count"]
            if count >= 50:
                severity = "critical"
            elif count >= 20:
                severity = "high"
            elif count >= 5:
                severity = "medium"
            else:
                severity = "low"

            if existing:
                # Merge agents
                old_agents = existing.get("affected_agents") or []
                merged_agents = list(set(old_agents + agents_list))
                # Merge samples (keep at most 10)
                old_samples = existing.get("sample_errors") or []
                merged_samples = (old_samples + data["samples"])[:10]

                await execute_mutate(
                    """
                    UPDATE detected_error_patterns
                    SET occurrence_count = occurrence_count + :count,
                        affected_agents = :agents,
                        last_seen_at = :last_seen,
                        sample_errors = :samples,
                        severity = :severity,
                        updated_at = now()
                    WHERE id = :id
                    """,
                    {
                        "id": existing["id"],
                        "count": count,
                        "agents": merged_agents,
                        "last_seen": data["last_seen"],
                        "samples": json.dumps(merged_samples),
                        "severity": severity,
                    },
                )
                updated += 1
            else:
                await execute_mutate(
                    """
                    INSERT INTO detected_error_patterns
                        (user_id, pattern_name, error_signature, occurrence_count,
                         affected_agents, first_seen_at, last_seen_at, severity, sample_errors)
                    VALUES
                        (:user_id, :pattern_name, :signature, :count,
                         :agents, :first_seen, :last_seen, :severity, :samples)
                    """,
                    {
                        "user_id": user_id,
                        "pattern_name": pattern_name,
                        "signature": signature,
                        "count": count,
                        "agents": agents_list,
                        "first_seen": data["first_seen"],
                        "last_seen": data["last_seen"],
                        "severity": severity,
                        "samples": json.dumps(data["samples"]),
                    },
                )
                created += 1

        return {
            "patterns_found": len(groups),
            "patterns_created": created,
            "patterns_updated": updated,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error scanning error patterns: {e}")
        raise HTTPException(status_code=500, detail="Failed to scan error patterns")


@router.get(
    "",
    summary="List Error Patterns",
    operation_id="list_error_patterns",
)
async def list_error_patterns(
    status: Optional[str] = Query(default=None),
    severity: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List error patterns with optional filters."""
    try:
        conditions = ["user_id = :user_id"]
        params: dict = {"user_id": user_id, "limit": limit, "offset": offset}

        if status:
            conditions.append("status = :status")
            params["status"] = status

        if severity:
            conditions.append("severity = :severity")
            params["severity"] = severity

        where_clause = " AND ".join(conditions)

        rows = await execute(
            f"""
            SELECT *
            FROM detected_error_patterns
            WHERE {where_clause}
            ORDER BY last_seen_at DESC
            LIMIT :limit OFFSET :offset
            """,
            params,
        )

        return [_serialize_pattern(row) for row in rows]

    except Exception as e:
        logger.error(f"Error listing error patterns: {e}")
        raise HTTPException(status_code=500, detail="Failed to list error patterns")


@router.get(
    "/stats",
    summary="Error Pattern Stats",
    operation_id="get_error_pattern_stats",
)
async def get_error_pattern_stats(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get aggregate error-pattern statistics."""
    try:
        # Active count
        active_row = await execute_one(
            """
            SELECT COUNT(*) AS cnt
            FROM detected_error_patterns
            WHERE user_id = :user_id AND status = 'active'
            """,
            {"user_id": user_id},
        )
        active_count = int(active_row["cnt"]) if active_row else 0

        # By severity
        sev_rows = await execute(
            """
            SELECT severity, COUNT(*) AS cnt
            FROM detected_error_patterns
            WHERE user_id = :user_id AND status IN ('active', 'investigating')
            GROUP BY severity
            """,
            {"user_id": user_id},
        )
        by_severity = {}
        for row in sev_rows:
            by_severity[row["severity"]] = int(row["cnt"])

        # Most frequent (top 5)
        freq_rows = await execute(
            """
            SELECT id, pattern_name, occurrence_count, severity, last_seen_at
            FROM detected_error_patterns
            WHERE user_id = :user_id AND status IN ('active', 'investigating')
            ORDER BY occurrence_count DESC
            LIMIT 5
            """,
            {"user_id": user_id},
        )
        most_frequent = []
        for row in freq_rows:
            most_frequent.append({
                "id": str(row["id"]),
                "pattern_name": row["pattern_name"],
                "occurrence_count": row["occurrence_count"],
                "severity": row["severity"],
            })

        # Trending: patterns seen most in last 24h (approximate by last_seen_at recency)
        trending_rows = await execute(
            """
            SELECT id, pattern_name, occurrence_count, severity, last_seen_at
            FROM detected_error_patterns
            WHERE user_id = :user_id
              AND status IN ('active', 'investigating')
              AND last_seen_at > now() - interval '24 hours'
            ORDER BY occurrence_count DESC
            LIMIT 5
            """,
            {"user_id": user_id},
        )
        trending = []
        for row in trending_rows:
            trending.append({
                "id": str(row["id"]),
                "pattern_name": row["pattern_name"],
                "occurrence_count": row["occurrence_count"],
                "severity": row["severity"],
            })

        return {
            "active_count": active_count,
            "by_severity": by_severity,
            "most_frequent": most_frequent,
            "trending": trending,
        }

    except Exception as e:
        logger.error(f"Error fetching error pattern stats: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch error pattern stats")


@router.get(
    "/{pattern_id}",
    summary="Get Error Pattern Detail",
    operation_id="get_error_pattern",
)
async def get_error_pattern(
    pattern_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get a single error pattern by ID with sample errors."""
    try:
        row = await execute_one(
            """
            SELECT * FROM detected_error_patterns
            WHERE id = :pattern_id AND user_id = :user_id
            """,
            {"pattern_id": pattern_id, "user_id": user_id},
        )

        if not row:
            raise HTTPException(status_code=404, detail="Error pattern not found")

        return _serialize_pattern(row)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching error pattern {pattern_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch error pattern")


@router.patch(
    "/{pattern_id}",
    summary="Update Error Pattern",
    operation_id="update_error_pattern",
)
async def update_error_pattern(
    pattern_id: str,
    body: UpdateErrorPatternRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Update an error pattern's status, resolution, or severity."""
    if body.status:
        valid_statuses = {"active", "investigating", "resolved", "muted"}
        if body.status not in valid_statuses:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid status: {body.status}. Must be one of: {', '.join(valid_statuses)}"
            )

    if body.severity:
        valid_severities = {"low", "medium", "high", "critical"}
        if body.severity not in valid_severities:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid severity: {body.severity}. Must be one of: {', '.join(valid_severities)}"
            )

    try:
        set_parts = []
        params: dict = {"pattern_id": pattern_id, "user_id": user_id}

        if body.status is not None:
            set_parts.append("status = :status")
            params["status"] = body.status

        if body.resolution is not None:
            set_parts.append("resolution = :resolution")
            params["resolution"] = body.resolution

        if body.severity is not None:
            set_parts.append("severity = :severity")
            params["severity"] = body.severity

        if not set_parts:
            raise HTTPException(status_code=400, detail="No fields to update")

        set_parts.append("updated_at = now()")
        set_clause = ", ".join(set_parts)

        rows = await execute_mutate(
            f"""
            UPDATE detected_error_patterns
            SET {set_clause}
            WHERE id = :pattern_id AND user_id = :user_id
            RETURNING *
            """,
            params,
        )

        if not rows:
            raise HTTPException(status_code=404, detail="Error pattern not found")

        return _serialize_pattern(rows[0])

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating error pattern {pattern_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to update error pattern")
