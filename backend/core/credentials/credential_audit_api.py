"""
Credential Vault Audit API.

Provides access logging, summary statistics, and anomaly detection
for credential vault operations.
"""

from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate, serialize_rows
from core.utils.logger import logger

router = APIRouter(prefix="/credentials", tags=["credential-audit"])


# ============================================================================
# Pydantic Models
# ============================================================================

class AuditLogEntry(BaseModel):
    id: str
    user_id: str
    credential_key: str
    agent_id: Optional[str] = None
    access_type: str
    ip_address: Optional[str] = None
    success: bool = True
    created_at: str


class AuditSummary(BaseModel):
    total_accesses: int = 0
    unique_keys: int = 0
    failed_count: int = 0
    most_accessed_keys: List[dict] = Field(default_factory=list)
    most_active_agents: List[dict] = Field(default_factory=list)
    access_by_type: List[dict] = Field(default_factory=list)


class RecordAccessRequest(BaseModel):
    credential_key: str
    agent_id: Optional[str] = None
    access_type: str
    ip_address: Optional[str] = None
    success: bool = True


class AnomalyEntry(BaseModel):
    anomaly_type: str
    description: str
    credential_key: Optional[str] = None
    agent_id: Optional[str] = None
    count: int = 0
    last_seen: Optional[str] = None


# ============================================================================
# Endpoints
# ============================================================================

@router.get(
    "/audit-log",
    response_model=List[AuditLogEntry],
    summary="List Credential Access Log",
    operation_id="list_credential_audit_log",
)
async def list_audit_log(
    credential_key: Optional[str] = Query(default=None),
    agent_id: Optional[str] = Query(default=None),
    access_type: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List credential access log entries with optional filters."""
    try:
        conditions = ["user_id = :user_id"]
        params: dict = {"user_id": user_id, "limit": limit, "offset": offset}

        if credential_key:
            conditions.append("credential_key = :credential_key")
            params["credential_key"] = credential_key

        if agent_id:
            conditions.append("agent_id = :agent_id")
            params["agent_id"] = agent_id

        if access_type:
            conditions.append("access_type = :access_type")
            params["access_type"] = access_type

        where_clause = " AND ".join(conditions)

        rows = await execute(
            f"""
            SELECT id, user_id, credential_key, agent_id, access_type,
                   ip_address, success, created_at
            FROM credential_access_log
            WHERE {where_clause}
            ORDER BY created_at DESC
            LIMIT :limit OFFSET :offset
            """,
            params,
        )

        return serialize_rows(rows)

    except Exception as e:
        logger.error(f"Error listing credential audit log: {e}")
        raise HTTPException(status_code=500, detail="Failed to list audit log")


@router.get(
    "/audit-log/summary",
    response_model=AuditSummary,
    summary="Credential Access Summary",
    operation_id="get_credential_audit_summary",
)
async def get_audit_summary(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get summary statistics for credential access over the last 30 days."""
    try:
        # Total accesses, unique keys, failed count
        totals = await execute_one(
            """
            SELECT
                COUNT(*) AS total_accesses,
                COUNT(DISTINCT credential_key) AS unique_keys,
                COALESCE(SUM(CASE WHEN success = false THEN 1 ELSE 0 END), 0) AS failed_count
            FROM credential_access_log
            WHERE user_id = :user_id
              AND created_at >= now() - INTERVAL '30 days'
            """,
            {"user_id": user_id},
        )

        # Most accessed keys
        most_accessed_rows = await execute(
            """
            SELECT credential_key, COUNT(*) AS access_count
            FROM credential_access_log
            WHERE user_id = :user_id
              AND created_at >= now() - INTERVAL '30 days'
            GROUP BY credential_key
            ORDER BY access_count DESC
            LIMIT 10
            """,
            {"user_id": user_id},
        )

        # Most active agents
        most_active_rows = await execute(
            """
            SELECT agent_id, COUNT(*) AS access_count
            FROM credential_access_log
            WHERE user_id = :user_id
              AND agent_id IS NOT NULL
              AND created_at >= now() - INTERVAL '30 days'
            GROUP BY agent_id
            ORDER BY access_count DESC
            LIMIT 10
            """,
            {"user_id": user_id},
        )

        # Access breakdown by type
        by_type_rows = await execute(
            """
            SELECT access_type, COUNT(*) AS count
            FROM credential_access_log
            WHERE user_id = :user_id
              AND created_at >= now() - INTERVAL '30 days'
            GROUP BY access_type
            ORDER BY count DESC
            """,
            {"user_id": user_id},
        )

        return AuditSummary(
            total_accesses=int(totals["total_accesses"]) if totals else 0,
            unique_keys=int(totals["unique_keys"]) if totals else 0,
            failed_count=int(totals["failed_count"]) if totals else 0,
            most_accessed_keys=serialize_rows(most_accessed_rows),
            most_active_agents=serialize_rows(most_active_rows),
            access_by_type=serialize_rows(by_type_rows),
        )

    except Exception as e:
        logger.error(f"Error fetching credential audit summary: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch audit summary")


@router.post(
    "/audit-log",
    summary="Record Credential Access",
    operation_id="record_credential_access",
)
async def record_access(
    body: RecordAccessRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Record a credential access event."""
    try:
        valid_types = {"read", "create", "update", "delete", "use_in_run"}
        if body.access_type not in valid_types:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid access_type. Must be one of: {', '.join(sorted(valid_types))}",
            )

        rows = await execute_mutate(
            """
            INSERT INTO credential_access_log
                (user_id, credential_key, agent_id, access_type, ip_address, success)
            VALUES
                (:user_id, :credential_key, :agent_id, :access_type, :ip_address, :success)
            RETURNING id, created_at
            """,
            {
                "user_id": user_id,
                "credential_key": body.credential_key,
                "agent_id": body.agent_id,
                "access_type": body.access_type,
                "ip_address": body.ip_address,
                "success": body.success,
            },
        )

        if rows:
            return {
                "success": True,
                "id": str(rows[0]["id"]),
                "created_at": rows[0]["created_at"].isoformat()
                if hasattr(rows[0]["created_at"], "isoformat")
                else str(rows[0]["created_at"]),
            }

        return {"success": True}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error recording credential access: {e}")
        raise HTTPException(status_code=500, detail="Failed to record access")


@router.get(
    "/audit-log/anomalies",
    response_model=List[AnomalyEntry],
    summary="Credential Access Anomalies",
    operation_id="get_credential_anomalies",
)
async def get_anomalies(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Detect unusual credential access patterns: high frequency, failures, odd hours."""
    try:
        anomalies: list[dict] = []

        # 1. High frequency access (>50 accesses to a single key in 1 hour)
        high_freq_rows = await execute(
            """
            SELECT credential_key, COUNT(*) AS access_count,
                   MAX(created_at) AS last_seen
            FROM credential_access_log
            WHERE user_id = :user_id
              AND created_at >= now() - INTERVAL '1 hour'
            GROUP BY credential_key
            HAVING COUNT(*) > 50
            ORDER BY access_count DESC
            """,
            {"user_id": user_id},
        )
        for row in high_freq_rows:
            anomalies.append({
                "anomaly_type": "high_frequency",
                "description": f"Key '{row['credential_key']}' accessed {row['access_count']} times in the last hour",
                "credential_key": row["credential_key"],
                "count": int(row["access_count"]),
                "last_seen": row["last_seen"].isoformat() if hasattr(row["last_seen"], "isoformat") else str(row["last_seen"]),
            })

        # 2. Failed access attempts (>3 failures for a key in last 24 hours)
        failure_rows = await execute(
            """
            SELECT credential_key, COUNT(*) AS fail_count,
                   MAX(created_at) AS last_seen
            FROM credential_access_log
            WHERE user_id = :user_id
              AND success = false
              AND created_at >= now() - INTERVAL '24 hours'
            GROUP BY credential_key
            HAVING COUNT(*) > 3
            ORDER BY fail_count DESC
            """,
            {"user_id": user_id},
        )
        for row in failure_rows:
            anomalies.append({
                "anomaly_type": "repeated_failures",
                "description": f"Key '{row['credential_key']}' had {row['fail_count']} failed access attempts in 24 hours",
                "credential_key": row["credential_key"],
                "count": int(row["fail_count"]),
                "last_seen": row["last_seen"].isoformat() if hasattr(row["last_seen"], "isoformat") else str(row["last_seen"]),
            })

        # 3. Odd-hours access (between midnight and 5am in UTC)
        odd_hours_rows = await execute(
            """
            SELECT credential_key, agent_id, COUNT(*) AS access_count,
                   MAX(created_at) AS last_seen
            FROM credential_access_log
            WHERE user_id = :user_id
              AND EXTRACT(HOUR FROM created_at) BETWEEN 0 AND 4
              AND created_at >= now() - INTERVAL '7 days'
            GROUP BY credential_key, agent_id
            HAVING COUNT(*) > 5
            ORDER BY access_count DESC
            """,
            {"user_id": user_id},
        )
        for row in odd_hours_rows:
            anomalies.append({
                "anomaly_type": "odd_hours",
                "description": f"Key '{row['credential_key']}' accessed {row['access_count']} times during midnight-5am (UTC) in last 7 days",
                "credential_key": row["credential_key"],
                "agent_id": row.get("agent_id"),
                "count": int(row["access_count"]),
                "last_seen": row["last_seen"].isoformat() if hasattr(row["last_seen"], "isoformat") else str(row["last_seen"]),
            })

        return anomalies

    except Exception as e:
        logger.error(f"Error detecting credential anomalies: {e}")
        raise HTTPException(status_code=500, detail="Failed to detect anomalies")
