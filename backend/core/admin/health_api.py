from fastapi import APIRouter, Depends
from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime, timezone
import time
import os

from core.auth import require_admin
from core.utils.logger import logger
from core.services.db import execute_read, execute_one_read, execute_scalar_read

router = APIRouter(prefix="/admin", tags=["Admin"])

_start_time = time.time()


# ============================================================================
# MODELS
# ============================================================================

class ServiceStatus(BaseModel):
    name: str
    status: str  # "healthy" | "degraded" | "down"
    latency_ms: Optional[float] = None

class DatabaseHealth(BaseModel):
    status: str
    latency_ms: float

class ApiHealth(BaseModel):
    status: str
    uptime_seconds: float
    version: str

class HealthResponse(BaseModel):
    database: DatabaseHealth
    api: ApiHealth
    services: List[ServiceStatus]
    checked_at: str

class MetricsResponse(BaseModel):
    total_users: int
    active_users_24h: int
    total_agents: int
    total_threads: int
    total_runs_today: int
    storage_used_mb: float
    errors_24h: int

class UserEntry(BaseModel):
    id: str
    email: Optional[str] = None
    created_at: Optional[str] = None
    last_active: Optional[str] = None
    agent_count: int = 0
    run_count: int = 0

class UsersResponse(BaseModel):
    users: List[UserEntry]
    total: int


# ============================================================================
# GET /admin/health — system health check
# ============================================================================

@router.get("/health", response_model=HealthResponse)
async def get_system_health(admin: dict = Depends(require_admin)):
    """System health check: database, api, core services."""

    # --- Database health ---
    db_status = "healthy"
    db_latency = 0.0
    try:
        t0 = time.time()
        await execute_scalar_read("SELECT 1")
        db_latency = round((time.time() - t0) * 1000, 2)
        if db_latency > 1000:
            db_status = "degraded"
    except Exception as e:
        logger.error(f"Health check DB error: {e}")
        db_status = "down"
        db_latency = -1

    # --- API health ---
    uptime = round(time.time() - _start_time, 1)
    api_version = os.getenv("APP_VERSION", "1.0.0")

    # --- Service probes (lightweight table existence checks) ---
    services: List[ServiceStatus] = []

    # Agent service
    try:
        t0 = time.time()
        await execute_one_read("SELECT 1 FROM agents LIMIT 1")
        lat = round((time.time() - t0) * 1000, 2)
        services.append(ServiceStatus(name="agents", status="healthy", latency_ms=lat))
    except Exception:
        services.append(ServiceStatus(name="agents", status="down", latency_ms=None))

    # Workflow / threads service
    try:
        t0 = time.time()
        await execute_one_read("SELECT 1 FROM threads LIMIT 1")
        lat = round((time.time() - t0) * 1000, 2)
        services.append(ServiceStatus(name="workflows", status="healthy", latency_ms=lat))
    except Exception:
        services.append(ServiceStatus(name="workflows", status="down", latency_ms=None))

    # Webhooks service
    try:
        t0 = time.time()
        await execute_one_read("SELECT 1 FROM agent_triggers LIMIT 1")
        lat = round((time.time() - t0) * 1000, 2)
        services.append(ServiceStatus(name="webhooks", status="healthy", latency_ms=lat))
    except Exception:
        services.append(ServiceStatus(name="webhooks", status="down", latency_ms=None))

    return HealthResponse(
        database=DatabaseHealth(status=db_status, latency_ms=db_latency),
        api=ApiHealth(status="healthy", uptime_seconds=uptime, version=api_version),
        services=services,
        checked_at=datetime.now(timezone.utc).isoformat(),
    )


# ============================================================================
# GET /admin/metrics — platform-wide metrics
# ============================================================================

@router.get("/metrics", response_model=MetricsResponse)
async def get_platform_metrics(admin: dict = Depends(require_admin)):
    """Platform-wide metrics: users, agents, threads, runs, storage, errors."""

    try:
        # Total users
        row = await execute_one_read("SELECT COUNT(*) AS cnt FROM accounts")
        total_users = row["cnt"] if row else 0

        # Active users in last 24h (based on agent_runs)
        row = await execute_one_read(
            "SELECT COUNT(DISTINCT user_id) AS cnt FROM agent_runs WHERE started_at > NOW() - INTERVAL '24 hours'"
        )
        active_users_24h = row["cnt"] if row else 0

        # Total agents
        row = await execute_one_read("SELECT COUNT(*) AS cnt FROM agents")
        total_agents = row["cnt"] if row else 0

        # Total threads
        row = await execute_one_read("SELECT COUNT(*) AS cnt FROM threads")
        total_threads = row["cnt"] if row else 0

        # Runs today
        row = await execute_one_read(
            "SELECT COUNT(*) AS cnt FROM agent_runs WHERE started_at > CURRENT_DATE"
        )
        total_runs_today = row["cnt"] if row else 0

        # Storage estimate (sum of pg_total_relation_size for key tables, in MB)
        storage_row = await execute_one_read("""
            SELECT COALESCE(
                SUM(pg_total_relation_size(c.oid))::bigint, 0
            ) / (1024 * 1024) AS size_mb
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public'
              AND c.relkind = 'r'
        """)
        storage_used_mb = round(float(storage_row["size_mb"]) if storage_row else 0, 2)

        # Errors in last 24h (runs with status 'error' or 'failed')
        row = await execute_one_read(
            "SELECT COUNT(*) AS cnt FROM agent_runs WHERE status IN ('error', 'failed') AND started_at > NOW() - INTERVAL '24 hours'"
        )
        errors_24h = row["cnt"] if row else 0

    except Exception as e:
        logger.error(f"Metrics query error: {e}")
        return MetricsResponse(
            total_users=0,
            active_users_24h=0,
            total_agents=0,
            total_threads=0,
            total_runs_today=0,
            storage_used_mb=0,
            errors_24h=0,
        )

    return MetricsResponse(
        total_users=total_users,
        active_users_24h=active_users_24h,
        total_agents=total_agents,
        total_threads=total_threads,
        total_runs_today=total_runs_today,
        storage_used_mb=storage_used_mb,
        errors_24h=errors_24h,
    )


# ============================================================================
# GET /admin/users — list users (admin only)
# ============================================================================

@router.get("/users/overview", response_model=UsersResponse)
async def get_admin_users(
    search: Optional[str] = None,
    limit: int = 25,
    offset: int = 0,
    admin: dict = Depends(require_admin),
):
    """List users with agent and run counts."""

    try:
        where_clause = ""
        params: dict = {"lim": limit, "off": offset}

        if search:
            where_clause = "WHERE a.email ILIKE :search"
            params["search"] = f"%{search}%"

        # Total count
        count_sql = f"SELECT COUNT(*) AS cnt FROM accounts a {where_clause}"
        count_row = await execute_one_read(count_sql, params)
        total = count_row["cnt"] if count_row else 0

        # Users with join counts
        sql = f"""
            SELECT
                a.account_id AS id,
                a.email,
                a.created_at,
                COALESCE(ar_last.last_active, a.created_at) AS last_active,
                COALESCE(ag.agent_count, 0) AS agent_count,
                COALESCE(runs.run_count, 0) AS run_count
            FROM accounts a
            LEFT JOIN LATERAL (
                SELECT MAX(started_at) AS last_active
                FROM agent_runs WHERE user_id = a.account_id
            ) ar_last ON true
            LEFT JOIN LATERAL (
                SELECT COUNT(*) AS agent_count
                FROM agents WHERE user_id = a.account_id
            ) ag ON true
            LEFT JOIN LATERAL (
                SELECT COUNT(*) AS run_count
                FROM agent_runs WHERE user_id = a.account_id
            ) runs ON true
            {where_clause}
            ORDER BY a.created_at DESC
            LIMIT :lim OFFSET :off
        """

        rows = await execute_read(sql, params)

        users = []
        for r in rows:
            users.append(UserEntry(
                id=r["id"],
                email=r.get("email"),
                created_at=str(r["created_at"]) if r.get("created_at") else None,
                last_active=str(r["last_active"]) if r.get("last_active") else None,
                agent_count=r.get("agent_count", 0),
                run_count=r.get("run_count", 0),
            ))

        return UsersResponse(users=users, total=total)

    except Exception as e:
        logger.error(f"Admin users query error: {e}")
        return UsersResponse(users=[], total=0)
