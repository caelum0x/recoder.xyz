"""
Agent Changelog API endpoints.

Tracks and retrieves configuration changes made to agents over time.
Provides timeline, summary, and diff views for agent change history.
"""

from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from core.utils.auth_utils import require_agent_access, AuthorizedAgentAccess
from core.services.db import execute, execute_one, execute_mutate
from core.utils.logger import logger

router = APIRouter(prefix="/agents", tags=["agent-changelog"])


# ============================================================================
# Pydantic Models
# ============================================================================

class ChangelogEntry(BaseModel):
    id: str
    agent_id: str
    user_id: str
    change_type: str
    description: Optional[str] = None
    old_value: Optional[Dict[str, Any]] = None
    new_value: Optional[Dict[str, Any]] = None
    metadata: Dict[str, Any] = {}
    created_at: str


class ChangelogListResponse(BaseModel):
    changes: List[ChangelogEntry] = []
    total: int = 0
    page: int = 1
    page_size: int = 50


class ChangelogCreateRequest(BaseModel):
    change_type: str = Field(
        ...,
        description="Type of change: instructions_updated, tools_added, tools_removed, "
                    "tools_configured, model_changed, name_changed, knowledge_added, "
                    "knowledge_removed, trigger_added, trigger_removed, "
                    "integration_added, integration_removed, settings_changed"
    )
    description: Optional[str] = None
    old_value: Optional[Dict[str, Any]] = None
    new_value: Optional[Dict[str, Any]] = None
    metadata: Optional[Dict[str, Any]] = None


class ChangelogSummaryItem(BaseModel):
    change_type: str
    count: int


class ChangelogSummaryResponse(BaseModel):
    summary: List[ChangelogSummaryItem] = []
    total_changes: int = 0
    period_days: int = 30


VALID_CHANGE_TYPES = {
    'instructions_updated',
    'tools_added',
    'tools_removed',
    'tools_configured',
    'model_changed',
    'name_changed',
    'knowledge_added',
    'knowledge_removed',
    'trigger_added',
    'trigger_removed',
    'integration_added',
    'integration_removed',
    'settings_changed',
}


# ============================================================================
# Endpoints
# ============================================================================

@router.get(
    "/{agent_id}/changelog",
    response_model=ChangelogListResponse,
    summary="List agent changelog entries",
)
async def list_agent_changelog(
    agent_id: str,
    auth: AuthorizedAgentAccess = Depends(require_agent_access),
    change_type: Optional[str] = Query(None, description="Filter by change type"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(50, ge=1, le=100, description="Items per page"),
):
    """
    List all configuration changes for an agent, ordered by most recent first.
    Optionally filter by change_type.
    """
    try:
        where_clauses = ["agent_id::text = :agent_id"]
        params: Dict[str, Any] = {"agent_id": agent_id}

        if change_type:
            if change_type not in VALID_CHANGE_TYPES:
                raise HTTPException(status_code=400, detail=f"Invalid change_type: {change_type}")
            where_clauses.append("change_type = :change_type")
            params["change_type"] = change_type

        where_sql = " AND ".join(where_clauses)

        # Count total
        count_sql = f"SELECT COUNT(*) AS cnt FROM agent_changelog WHERE {where_sql}"
        count_row = await execute_one(count_sql, params)
        total = count_row["cnt"] if count_row else 0

        # Fetch page
        offset = (page - 1) * page_size
        params["limit"] = page_size
        params["offset"] = offset

        data_sql = f"""
        SELECT id, agent_id, user_id, change_type, description,
               old_value, new_value, metadata, created_at
        FROM agent_changelog
        WHERE {where_sql}
        ORDER BY created_at DESC
        LIMIT :limit OFFSET :offset
        """

        rows = await execute(data_sql, params)

        changes = [
            ChangelogEntry(
                id=str(row["id"]),
                agent_id=str(row["agent_id"]),
                user_id=row["user_id"],
                change_type=row["change_type"],
                description=row.get("description"),
                old_value=row.get("old_value"),
                new_value=row.get("new_value"),
                metadata=row.get("metadata") or {},
                created_at=row["created_at"].isoformat() if hasattr(row["created_at"], 'isoformat') else str(row["created_at"]),
            )
            for row in (rows or [])
        ]

        return ChangelogListResponse(
            changes=changes,
            total=total,
            page=page,
            page_size=page_size,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing changelog for agent {agent_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to list agent changelog")


@router.post(
    "/{agent_id}/changelog",
    response_model=ChangelogEntry,
    summary="Record a changelog entry",
)
async def create_changelog_entry(
    agent_id: str,
    body: ChangelogCreateRequest,
    auth: AuthorizedAgentAccess = Depends(require_agent_access),
):
    """
    Record a new configuration change for an agent.
    """
    try:
        if body.change_type not in VALID_CHANGE_TYPES:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid change_type '{body.change_type}'. Must be one of: {', '.join(sorted(VALID_CHANGE_TYPES))}"
            )

        sql = """
        INSERT INTO agent_changelog (agent_id, user_id, change_type, description, old_value, new_value, metadata)
        VALUES (:agent_id, :user_id, :change_type, :description, :old_value, :new_value, :metadata)
        RETURNING id, agent_id, user_id, change_type, description, old_value, new_value, metadata, created_at
        """

        row = await execute_one(sql, {
            "agent_id": agent_id,
            "user_id": auth.user_id,
            "change_type": body.change_type,
            "description": body.description,
            "old_value": body.old_value,
            "new_value": body.new_value,
            "metadata": body.metadata or {},
        })

        if not row:
            raise HTTPException(status_code=500, detail="Failed to create changelog entry")

        return ChangelogEntry(
            id=str(row["id"]),
            agent_id=str(row["agent_id"]),
            user_id=row["user_id"],
            change_type=row["change_type"],
            description=row.get("description"),
            old_value=row.get("old_value"),
            new_value=row.get("new_value"),
            metadata=row.get("metadata") or {},
            created_at=row["created_at"].isoformat() if hasattr(row["created_at"], 'isoformat') else str(row["created_at"]),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating changelog entry for agent {agent_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to create changelog entry")


@router.get(
    "/{agent_id}/changelog/summary",
    response_model=ChangelogSummaryResponse,
    summary="Get changelog summary by type",
)
async def get_changelog_summary(
    agent_id: str,
    auth: AuthorizedAgentAccess = Depends(require_agent_access),
    days: int = Query(30, ge=1, le=365, description="Number of days to summarize"),
):
    """
    Get change frequency by type over the last N days.
    Returns counts grouped by change_type for bar chart rendering.
    """
    try:
        since = datetime.now(timezone.utc) - timedelta(days=days)

        sql = """
        SELECT change_type, COUNT(*) AS cnt
        FROM agent_changelog
        WHERE agent_id::text = :agent_id AND created_at >= :since
        GROUP BY change_type
        ORDER BY cnt DESC
        """

        rows = await execute(sql, {"agent_id": agent_id, "since": since})

        summary = [
            ChangelogSummaryItem(change_type=row["change_type"], count=row["cnt"])
            for row in (rows or [])
        ]

        total = sum(item.count for item in summary)

        return ChangelogSummaryResponse(
            summary=summary,
            total_changes=total,
            period_days=days,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting changelog summary for agent {agent_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to get changelog summary")


@router.get(
    "/{agent_id}/changelog/diff/{change_id}",
    response_model=ChangelogEntry,
    summary="Get specific changelog entry detail",
)
async def get_changelog_diff(
    agent_id: str,
    change_id: str,
    auth: AuthorizedAgentAccess = Depends(require_agent_access),
):
    """
    Get a specific changelog entry with full old_value and new_value for diff display.
    """
    try:
        sql = """
        SELECT id, agent_id, user_id, change_type, description,
               old_value, new_value, metadata, created_at
        FROM agent_changelog
        WHERE id = :change_id AND agent_id::text = :agent_id
        """

        row = await execute_one(sql, {"change_id": change_id, "agent_id": agent_id})

        if not row:
            raise HTTPException(status_code=404, detail="Changelog entry not found")

        return ChangelogEntry(
            id=str(row["id"]),
            agent_id=str(row["agent_id"]),
            user_id=row["user_id"],
            change_type=row["change_type"],
            description=row.get("description"),
            old_value=row.get("old_value"),
            new_value=row.get("new_value"),
            metadata=row.get("metadata") or {},
            created_at=row["created_at"].isoformat() if hasattr(row["created_at"], 'isoformat') else str(row["created_at"]),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting changelog diff {change_id} for agent {agent_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to get changelog entry")
