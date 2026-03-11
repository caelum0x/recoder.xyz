"""
Usage Anomaly Detection API endpoints.

Provides anomaly scanning (comparing recent vs baseline usage), listing,
status updates, and aggregate stats for detected usage anomalies.
"""

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate
from core.utils.logger import logger

router = APIRouter(prefix="/anomalies", tags=["anomaly-detection"])


# ============================================================================
# Pydantic Models
# ============================================================================

class UpdateAnomalyStatusRequest(BaseModel):
    status: str


# ============================================================================
# Endpoints
# ============================================================================

@router.get(
    "",
    summary="List Anomalies",
    operation_id="list_anomalies",
)
async def list_anomalies(
    status: Optional[str] = Query(default=None),
    anomaly_type: Optional[str] = Query(default=None),
    severity: Optional[str] = Query(default=None),
    agent_id: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List usage anomalies with optional filters."""
    try:
        conditions = ["a.user_id = :user_id"]
        params: dict = {"user_id": user_id, "limit": limit, "offset": offset}

        if status:
            conditions.append("a.status = :status")
            params["status"] = status

        if anomaly_type:
            conditions.append("a.anomaly_type = :anomaly_type")
            params["anomaly_type"] = anomaly_type

        if severity:
            conditions.append("a.severity = :severity")
            params["severity"] = severity

        if agent_id:
            conditions.append("a.agent_id = :agent_id")
            params["agent_id"] = agent_id

        where_clause = " AND ".join(conditions)

        rows = await execute(
            f"""
            SELECT
                a.id, a.user_id, a.anomaly_type, a.severity, a.agent_id,
                a.description, a.current_value, a.baseline_value,
                a.deviation_percent, a.status, a.detected_at, a.resolved_at,
                ag.name AS agent_name
            FROM usage_anomalies a
            LEFT JOIN agents ag ON ag.agent_id = a.agent_id
            WHERE {where_clause}
            ORDER BY a.detected_at DESC
            LIMIT :limit OFFSET :offset
            """,
            params,
        )

        results = []
        for row in rows:
            results.append({
                "id": str(row["id"]),
                "user_id": str(row["user_id"]),
                "anomaly_type": row["anomaly_type"],
                "severity": row["severity"],
                "agent_id": row["agent_id"],
                "agent_name": row.get("agent_name"),
                "description": row["description"],
                "current_value": float(row["current_value"]) if row["current_value"] is not None else None,
                "baseline_value": float(row["baseline_value"]) if row["baseline_value"] is not None else None,
                "deviation_percent": float(row["deviation_percent"]) if row["deviation_percent"] is not None else None,
                "status": row["status"],
                "detected_at": row["detected_at"].isoformat() if hasattr(row["detected_at"], "isoformat") else str(row["detected_at"]),
                "resolved_at": row["resolved_at"].isoformat() if row.get("resolved_at") and hasattr(row["resolved_at"], "isoformat") else None,
            })

        return results

    except Exception as e:
        logger.error(f"Error listing anomalies: {e}")
        raise HTTPException(status_code=500, detail="Failed to list anomalies")


@router.patch(
    "/{anomaly_id}",
    summary="Update Anomaly Status",
    operation_id="update_anomaly_status",
)
async def update_anomaly_status(
    anomaly_id: str,
    body: UpdateAnomalyStatusRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Update an anomaly's status (acknowledge, resolve, or dismiss)."""
    valid_statuses = {"open", "acknowledged", "resolved", "dismissed"}
    if body.status not in valid_statuses:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status: {body.status}. Must be one of: {', '.join(valid_statuses)}"
        )

    try:
        set_parts = ["status = :status"]
        params: dict = {"anomaly_id": anomaly_id, "user_id": user_id, "status": body.status}

        if body.status == "resolved":
            set_parts.append("resolved_at = now()")

        set_clause = ", ".join(set_parts)

        rows = await execute_mutate(
            f"""
            UPDATE usage_anomalies
            SET {set_clause}
            WHERE id = :anomaly_id AND user_id = :user_id
            RETURNING id, user_id, anomaly_type, severity, agent_id,
                      description, current_value, baseline_value,
                      deviation_percent, status, detected_at, resolved_at
            """,
            params,
        )

        if not rows:
            raise HTTPException(status_code=404, detail="Anomaly not found")

        row = rows[0]
        return {
            "id": str(row["id"]),
            "user_id": str(row["user_id"]),
            "anomaly_type": row["anomaly_type"],
            "severity": row["severity"],
            "agent_id": row["agent_id"],
            "description": row["description"],
            "current_value": float(row["current_value"]) if row["current_value"] is not None else None,
            "baseline_value": float(row["baseline_value"]) if row["baseline_value"] is not None else None,
            "deviation_percent": float(row["deviation_percent"]) if row["deviation_percent"] is not None else None,
            "status": row["status"],
            "detected_at": row["detected_at"].isoformat() if hasattr(row["detected_at"], "isoformat") else str(row["detected_at"]),
            "resolved_at": row["resolved_at"].isoformat() if row.get("resolved_at") and hasattr(row["resolved_at"], "isoformat") else None,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating anomaly {anomaly_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to update anomaly")


@router.post(
    "/scan",
    summary="Run Anomaly Scan",
    operation_id="run_anomaly_scan",
)
async def run_anomaly_scan(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Run an anomaly scan comparing last 24h usage vs previous 7d averages.
    Flags metrics with >50% deviation as anomalies.
    Creates anomaly records and returns found anomalies.
    """
    try:
        found_anomalies = []

        # Compare last 24h vs previous 7d average per agent from quota_usage_daily
        rows = await execute(
            """
            WITH recent AS (
                SELECT
                    agent_id,
                    COALESCE(SUM(run_count), 0) AS recent_runs,
                    COALESCE(SUM(cost), 0) AS recent_cost,
                    COALESCE(SUM(error_count), 0) AS recent_errors,
                    COALESCE(SUM(token_count), 0) AS recent_tokens
                FROM quota_usage_daily
                WHERE user_id = :user_id
                  AND date >= (CURRENT_DATE - INTERVAL '1 day')
                GROUP BY agent_id
            ),
            baseline AS (
                SELECT
                    agent_id,
                    COALESCE(AVG(daily_runs), 0) AS avg_runs,
                    COALESCE(AVG(daily_cost), 0) AS avg_cost,
                    COALESCE(AVG(daily_errors), 0) AS avg_errors,
                    COALESCE(AVG(daily_tokens), 0) AS avg_tokens
                FROM (
                    SELECT
                        agent_id,
                        date,
                        SUM(run_count) AS daily_runs,
                        SUM(cost) AS daily_cost,
                        SUM(error_count) AS daily_errors,
                        SUM(token_count) AS daily_tokens
                    FROM quota_usage_daily
                    WHERE user_id = :user_id
                      AND date >= (CURRENT_DATE - INTERVAL '8 days')
                      AND date < (CURRENT_DATE - INTERVAL '1 day')
                    GROUP BY agent_id, date
                ) daily
                GROUP BY agent_id
            )
            SELECT
                r.agent_id,
                r.recent_runs, b.avg_runs,
                r.recent_cost, b.avg_cost,
                r.recent_errors, b.avg_errors,
                r.recent_tokens, b.avg_tokens
            FROM recent r
            LEFT JOIN baseline b ON r.agent_id IS NOT DISTINCT FROM b.agent_id
            """,
            {"user_id": user_id},
        )

        for row in rows:
            agent_id = row["agent_id"]
            checks = [
                {
                    "type": "cost_spike",
                    "current": float(row["recent_cost"] or 0),
                    "baseline": float(row["avg_cost"] or 0),
                    "label": "cost",
                },
                {
                    "type": "run_surge",
                    "current": float(row["recent_runs"] or 0),
                    "baseline": float(row["avg_runs"] or 0),
                    "label": "run count",
                },
                {
                    "type": "error_spike",
                    "current": float(row["recent_errors"] or 0),
                    "baseline": float(row["avg_errors"] or 0),
                    "label": "error count",
                },
                {
                    "type": "token_surge",
                    "current": float(row["recent_tokens"] or 0),
                    "baseline": float(row["avg_tokens"] or 0),
                    "label": "token usage",
                },
            ]

            for check in checks:
                current_val = check["current"]
                baseline_val = check["baseline"]

                # Skip if both values are essentially zero
                if baseline_val < 0.001 and current_val < 0.001:
                    continue

                # Calculate deviation
                if baseline_val > 0:
                    deviation = ((current_val - baseline_val) / baseline_val) * 100
                elif current_val > 0:
                    deviation = 100.0  # New activity where there was none
                else:
                    continue

                # Flag if >50% deviation
                if deviation > 50:
                    # Determine severity based on deviation magnitude
                    if deviation > 200:
                        severity = "critical"
                    elif deviation > 100:
                        severity = "high"
                    elif deviation > 75:
                        severity = "medium"
                    else:
                        severity = "low"

                    description = (
                        f"{check['label'].capitalize()} anomaly detected: "
                        f"current value {current_val:.2f} vs baseline {baseline_val:.2f} "
                        f"({deviation:.1f}% increase)"
                    )

                    insert_rows = await execute_mutate(
                        """
                        INSERT INTO usage_anomalies
                            (user_id, anomaly_type, severity, agent_id, description,
                             current_value, baseline_value, deviation_percent)
                        VALUES
                            (:user_id, :anomaly_type, :severity, :agent_id, :description,
                             :current_value, :baseline_value, :deviation_percent)
                        RETURNING id, user_id, anomaly_type, severity, agent_id,
                                  description, current_value, baseline_value,
                                  deviation_percent, status, detected_at, resolved_at
                        """,
                        {
                            "user_id": user_id,
                            "anomaly_type": check["type"],
                            "severity": severity,
                            "agent_id": agent_id,
                            "description": description,
                            "current_value": current_val,
                            "baseline_value": baseline_val,
                            "deviation_percent": round(deviation, 2),
                        },
                    )

                    if insert_rows:
                        r = insert_rows[0]
                        found_anomalies.append({
                            "id": str(r["id"]),
                            "user_id": str(r["user_id"]),
                            "anomaly_type": r["anomaly_type"],
                            "severity": r["severity"],
                            "agent_id": r["agent_id"],
                            "description": r["description"],
                            "current_value": float(r["current_value"]) if r["current_value"] is not None else None,
                            "baseline_value": float(r["baseline_value"]) if r["baseline_value"] is not None else None,
                            "deviation_percent": float(r["deviation_percent"]) if r["deviation_percent"] is not None else None,
                            "status": r["status"],
                            "detected_at": r["detected_at"].isoformat() if hasattr(r["detected_at"], "isoformat") else str(r["detected_at"]),
                            "resolved_at": None,
                        })

        return {
            "anomalies_found": len(found_anomalies),
            "anomalies": found_anomalies,
        }

    except Exception as e:
        logger.error(f"Error running anomaly scan: {e}")
        raise HTTPException(status_code=500, detail="Failed to run anomaly scan")


@router.get(
    "/stats",
    summary="Anomaly Stats",
    operation_id="get_anomaly_stats",
)
async def get_anomaly_stats(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get anomaly stats: open count by severity, most affected agent, anomalies per day (last 30d)."""
    try:
        # Open count by severity
        severity_rows = await execute(
            """
            SELECT severity, COUNT(*) AS cnt
            FROM usage_anomalies
            WHERE user_id = :user_id AND status = 'open'
            GROUP BY severity
            """,
            {"user_id": user_id},
        )
        open_by_severity = {}
        total_open = 0
        for row in severity_rows:
            count = int(row["cnt"])
            open_by_severity[row["severity"]] = count
            total_open += count

        # Most affected agent (by open anomaly count)
        agent_row = await execute_one(
            """
            SELECT a.agent_id, ag.name AS agent_name, COUNT(*) AS anomaly_count
            FROM usage_anomalies a
            LEFT JOIN agents ag ON ag.agent_id = a.agent_id
            WHERE a.user_id = :user_id AND a.status = 'open'
            GROUP BY a.agent_id, ag.name
            ORDER BY anomaly_count DESC
            LIMIT 1
            """,
            {"user_id": user_id},
        )
        most_affected_agent = None
        if agent_row:
            most_affected_agent = {
                "agent_id": agent_row["agent_id"],
                "agent_name": agent_row.get("agent_name"),
                "anomaly_count": int(agent_row["anomaly_count"]),
            }

        # Anomalies per day (last 30 days)
        daily_rows = await execute(
            """
            SELECT
                DATE(detected_at) AS day,
                COUNT(*) AS count
            FROM usage_anomalies
            WHERE user_id = :user_id
              AND detected_at >= (CURRENT_DATE - INTERVAL '30 days')
            GROUP BY DATE(detected_at)
            ORDER BY day ASC
            """,
            {"user_id": user_id},
        )
        anomalies_per_day = []
        for row in daily_rows:
            anomalies_per_day.append({
                "date": row["day"].isoformat() if hasattr(row["day"], "isoformat") else str(row["day"]),
                "count": int(row["count"]),
            })

        return {
            "open_by_severity": open_by_severity,
            "total_open": total_open,
            "most_affected_agent": most_affected_agent,
            "anomalies_per_day": anomalies_per_day,
        }

    except Exception as e:
        logger.error(f"Error fetching anomaly stats: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch anomaly stats")
