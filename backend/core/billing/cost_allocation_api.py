"""
Cost Allocation API.

Manage cost allocation projects and allocate agent run costs to projects.
Provides project CRUD, run-to-project allocation, and cost reports.
"""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate
from core.utils.logger import logger

router = APIRouter(prefix="/cost", tags=["cost-allocation"])


# ============================================================================
# Pydantic Models
# ============================================================================

class CreateCostProjectRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    budget: Optional[float] = Field(None, ge=0)
    color: Optional[str] = Field(None, max_length=20)


class UpdateCostProjectRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    budget: Optional[float] = Field(None, ge=0)
    color: Optional[str] = Field(None, max_length=20)
    is_active: Optional[bool] = None


class CostProjectResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    budget: Optional[float] = None
    color: str = "#6366f1"
    is_active: bool = True
    total_spend: float = 0.0
    run_count: int = 0
    created_at: str


class AllocateRunCostRequest(BaseModel):
    run_id: str = Field(..., min_length=1)
    agent_id: Optional[str] = None
    project_id: str = Field(...)
    cost: float = Field(..., ge=0)
    tokens_in: Optional[int] = Field(None, ge=0)
    tokens_out: Optional[int] = Field(None, ge=0)
    model: Optional[str] = None


class CostAllocationResponse(BaseModel):
    id: str
    run_id: str
    agent_id: Optional[str] = None
    project_id: Optional[str] = None
    project_name: Optional[str] = None
    project_color: Optional[str] = None
    cost: float
    tokens_in: int = 0
    tokens_out: int = 0
    model: Optional[str] = None
    allocated_at: str


class CostAllocationListResponse(BaseModel):
    allocations: List[CostAllocationResponse] = []
    total: int = 0


class ProjectCostReport(BaseModel):
    project_id: str
    project_name: str
    project_color: str
    budget: Optional[float] = None
    total_spend: float = 0.0
    budget_used_pct: Optional[float] = None
    run_count: int = 0
    top_agents: List[Dict[str, Any]] = []


class CostReportResponse(BaseModel):
    projects: List[ProjectCostReport] = []
    total_spend: float = 0.0
    unallocated_spend: float = 0.0
    top_agents: List[Dict[str, Any]] = []
    days: int = 30


# ============================================================================
# Helpers
# ============================================================================

def _ts(val: Any) -> str:
    if val is None:
        return ""
    if hasattr(val, "isoformat"):
        return val.isoformat()
    return str(val)


# ============================================================================
# Project CRUD
# ============================================================================

@router.post("/projects", response_model=CostProjectResponse, summary="Create cost project")
async def create_cost_project(
    body: CreateCostProjectRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Create a new cost allocation project."""
    try:
        row = await execute_one(
            """INSERT INTO cost_allocation_projects
                   (user_id, name, description, budget, color)
               VALUES
                   (:user_id, :name, :description, :budget, :color)
               RETURNING *""",
            {
                "user_id": user_id,
                "name": body.name,
                "description": body.description,
                "budget": body.budget,
                "color": body.color or "#6366f1",
            },
            commit=True,
        )

        if not row:
            raise HTTPException(status_code=500, detail="Failed to create cost project")

        return CostProjectResponse(
            id=str(row["id"]),
            name=row["name"],
            description=row.get("description"),
            budget=float(row["budget"]) if row.get("budget") is not None else None,
            color=row.get("color", "#6366f1"),
            is_active=row.get("is_active", True),
            total_spend=0.0,
            run_count=0,
            created_at=_ts(row["created_at"]),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating cost project: {e}")
        raise HTTPException(status_code=500, detail="Failed to create cost project")


@router.get("/projects", response_model=List[CostProjectResponse], summary="List cost projects")
async def list_cost_projects(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List all cost projects with total spend from allocations."""
    try:
        rows = await execute(
            """SELECT
                   p.*,
                   COALESCE(SUM(a.cost), 0) AS total_spend,
                   COUNT(a.id) AS run_count
               FROM cost_allocation_projects p
               LEFT JOIN run_cost_allocations a ON a.project_id = p.id
               WHERE p.user_id = :user_id
               GROUP BY p.id
               ORDER BY p.created_at DESC""",
            {"user_id": user_id},
        )

        return [
            CostProjectResponse(
                id=str(r["id"]),
                name=r["name"],
                description=r.get("description"),
                budget=float(r["budget"]) if r.get("budget") is not None else None,
                color=r.get("color", "#6366f1"),
                is_active=r.get("is_active", True),
                total_spend=float(r.get("total_spend", 0)),
                run_count=int(r.get("run_count", 0)),
                created_at=_ts(r["created_at"]),
            )
            for r in (rows or [])
        ]

    except Exception as e:
        logger.error(f"Error listing cost projects: {e}")
        raise HTTPException(status_code=500, detail="Failed to list cost projects")


@router.patch("/projects/{project_id}", response_model=CostProjectResponse, summary="Update cost project")
async def update_cost_project(
    project_id: str,
    body: UpdateCostProjectRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Update an existing cost project."""
    try:
        existing = await execute_one(
            "SELECT id FROM cost_allocation_projects WHERE id = :id AND user_id = :user_id",
            {"id": project_id, "user_id": user_id},
        )
        if not existing:
            raise HTTPException(status_code=404, detail="Cost project not found")

        set_parts: List[str] = []
        params: Dict[str, Any] = {"id": project_id, "user_id": user_id}

        if body.name is not None:
            set_parts.append("name = :name")
            params["name"] = body.name
        if body.description is not None:
            set_parts.append("description = :description")
            params["description"] = body.description
        if body.budget is not None:
            set_parts.append("budget = :budget")
            params["budget"] = body.budget
        if body.color is not None:
            set_parts.append("color = :color")
            params["color"] = body.color
        if body.is_active is not None:
            set_parts.append("is_active = :is_active")
            params["is_active"] = body.is_active

        if not set_parts:
            raise HTTPException(status_code=400, detail="No fields to update")

        set_sql = ", ".join(set_parts)

        row = await execute_one(
            f"""UPDATE cost_allocation_projects SET {set_sql}
                WHERE id = :id AND user_id = :user_id
                RETURNING *""",
            params,
            commit=True,
        )

        if not row:
            raise HTTPException(status_code=500, detail="Failed to update cost project")

        # Get spend totals
        spend_row = await execute_one(
            """SELECT COALESCE(SUM(cost), 0) AS total_spend, COUNT(*) AS run_count
               FROM run_cost_allocations WHERE project_id = :project_id""",
            {"project_id": project_id},
        )

        return CostProjectResponse(
            id=str(row["id"]),
            name=row["name"],
            description=row.get("description"),
            budget=float(row["budget"]) if row.get("budget") is not None else None,
            color=row.get("color", "#6366f1"),
            is_active=row.get("is_active", True),
            total_spend=float(spend_row["total_spend"]) if spend_row else 0.0,
            run_count=int(spend_row["run_count"]) if spend_row else 0,
            created_at=_ts(row["created_at"]),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating cost project {project_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to update cost project")


@router.delete("/projects/{project_id}", summary="Delete cost project")
async def delete_cost_project(
    project_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Delete a cost project. Allocations will have project_id set to NULL."""
    try:
        existing = await execute_one(
            "SELECT id FROM cost_allocation_projects WHERE id = :id AND user_id = :user_id",
            {"id": project_id, "user_id": user_id},
        )
        if not existing:
            raise HTTPException(status_code=404, detail="Cost project not found")

        await execute_mutate(
            "DELETE FROM cost_allocation_projects WHERE id = :id AND user_id = :user_id",
            {"id": project_id, "user_id": user_id},
        )

        return {"success": True}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting cost project {project_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete cost project")


# ============================================================================
# Run Cost Allocation
# ============================================================================

@router.post("/allocate", summary="Allocate run cost to project")
async def allocate_run_cost(
    body: AllocateRunCostRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Allocate a run to a cost project. Upserts on run_id."""
    try:
        # Verify project belongs to user
        project = await execute_one(
            "SELECT id FROM cost_allocation_projects WHERE id = :project_id AND user_id = :user_id",
            {"project_id": body.project_id, "user_id": user_id},
        )
        if not project:
            raise HTTPException(status_code=404, detail="Cost project not found")

        row = await execute_one(
            """INSERT INTO run_cost_allocations
                   (user_id, run_id, agent_id, project_id, cost, tokens_in, tokens_out, model)
               VALUES
                   (:user_id, :run_id, :agent_id, :project_id, :cost, :tokens_in, :tokens_out, :model)
               ON CONFLICT (run_id) DO UPDATE SET
                   project_id = EXCLUDED.project_id,
                   cost = EXCLUDED.cost,
                   tokens_in = EXCLUDED.tokens_in,
                   tokens_out = EXCLUDED.tokens_out,
                   model = EXCLUDED.model,
                   agent_id = EXCLUDED.agent_id
               RETURNING *""",
            {
                "user_id": user_id,
                "run_id": body.run_id,
                "agent_id": body.agent_id,
                "project_id": body.project_id,
                "cost": body.cost,
                "tokens_in": body.tokens_in or 0,
                "tokens_out": body.tokens_out or 0,
                "model": body.model,
            },
            commit=True,
        )

        if not row:
            raise HTTPException(status_code=500, detail="Failed to allocate run cost")

        return {
            "success": True,
            "id": str(row["id"]),
            "run_id": row["run_id"],
            "project_id": str(row["project_id"]) if row.get("project_id") else None,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error allocating run cost: {e}")
        raise HTTPException(status_code=500, detail="Failed to allocate run cost")


@router.get("/allocations", response_model=CostAllocationListResponse, summary="List cost allocations")
async def list_cost_allocations(
    project_id: Optional[str] = Query(None, description="Filter by project ID"),
    agent_id: Optional[str] = Query(None, description="Filter by agent ID"),
    days: int = Query(30, ge=1, le=365, description="Number of days to look back"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List run cost allocations with filters."""
    try:
        where_parts = [
            "a.user_id = :user_id",
            "a.allocated_at >= now() - make_interval(days => :days)",
        ]
        params: Dict[str, Any] = {
            "user_id": user_id,
            "days": days,
            "limit": limit,
            "offset": offset,
        }

        if project_id:
            where_parts.append("a.project_id = :project_id")
            params["project_id"] = project_id
        if agent_id:
            where_parts.append("a.agent_id = :agent_id")
            params["agent_id"] = agent_id

        where_sql = " AND ".join(where_parts)

        count_row = await execute_one(
            f"SELECT COUNT(*) AS cnt FROM run_cost_allocations a WHERE {where_sql}",
            params,
        )
        total = count_row["cnt"] if count_row else 0

        rows = await execute(
            f"""SELECT
                    a.*,
                    p.name AS project_name,
                    p.color AS project_color
                FROM run_cost_allocations a
                LEFT JOIN cost_allocation_projects p ON p.id = a.project_id
                WHERE {where_sql}
                ORDER BY a.allocated_at DESC
                LIMIT :limit OFFSET :offset""",
            params,
        )

        allocations = [
            CostAllocationResponse(
                id=str(r["id"]),
                run_id=r["run_id"],
                agent_id=r.get("agent_id"),
                project_id=str(r["project_id"]) if r.get("project_id") else None,
                project_name=r.get("project_name"),
                project_color=r.get("project_color"),
                cost=float(r["cost"]),
                tokens_in=int(r.get("tokens_in", 0)),
                tokens_out=int(r.get("tokens_out", 0)),
                model=r.get("model"),
                allocated_at=_ts(r["allocated_at"]),
            )
            for r in (rows or [])
        ]

        return CostAllocationListResponse(allocations=allocations, total=total)

    except Exception as e:
        logger.error(f"Error listing cost allocations: {e}")
        raise HTTPException(status_code=500, detail="Failed to list cost allocations")


# ============================================================================
# Cost Report
# ============================================================================

@router.get("/report", response_model=CostReportResponse, summary="Cost report by project")
async def get_cost_report(
    days: int = Query(30, ge=1, le=365, description="Number of days to look back"),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Cost report grouped by project with budget vs actual and top agents."""
    try:
        params: Dict[str, Any] = {"user_id": user_id, "days": days}

        # Per-project totals
        project_rows = await execute(
            """SELECT
                   p.id AS project_id,
                   p.name AS project_name,
                   p.color AS project_color,
                   p.budget,
                   COALESCE(SUM(a.cost), 0) AS total_spend,
                   COUNT(a.id) AS run_count
               FROM cost_allocation_projects p
               LEFT JOIN run_cost_allocations a
                   ON a.project_id = p.id
                   AND a.allocated_at >= now() - make_interval(days => :days)
               WHERE p.user_id = :user_id
               GROUP BY p.id
               ORDER BY total_spend DESC""",
            params,
        )

        projects: List[ProjectCostReport] = []
        total_allocated = 0.0

        for r in (project_rows or []):
            spend = float(r.get("total_spend", 0))
            budget = float(r["budget"]) if r.get("budget") is not None else None
            budget_pct = round((spend / budget) * 100, 2) if budget and budget > 0 else None
            total_allocated += spend

            # Top agents per project
            agent_rows = await execute(
                """SELECT
                       agent_id,
                       SUM(cost) AS agent_cost,
                       COUNT(*) AS agent_runs
                   FROM run_cost_allocations
                   WHERE project_id = :project_id
                     AND user_id = :user_id
                     AND allocated_at >= now() - make_interval(days => :days)
                     AND agent_id IS NOT NULL
                   GROUP BY agent_id
                   ORDER BY agent_cost DESC
                   LIMIT 5""",
                {"project_id": str(r["project_id"]), "user_id": user_id, "days": days},
            )

            top_agents = [
                {
                    "agent_id": ar["agent_id"],
                    "cost": float(ar["agent_cost"]),
                    "runs": int(ar["agent_runs"]),
                }
                for ar in (agent_rows or [])
            ]

            projects.append(ProjectCostReport(
                project_id=str(r["project_id"]),
                project_name=r["project_name"],
                project_color=r.get("project_color", "#6366f1"),
                budget=budget,
                total_spend=spend,
                budget_used_pct=budget_pct,
                run_count=int(r.get("run_count", 0)),
                top_agents=top_agents,
            ))

        # Unallocated spend
        unallocated_row = await execute_one(
            """SELECT COALESCE(SUM(cost), 0) AS unallocated
               FROM run_cost_allocations
               WHERE user_id = :user_id
                 AND project_id IS NULL
                 AND allocated_at >= now() - make_interval(days => :days)""",
            params,
        )
        unallocated = float(unallocated_row["unallocated"]) if unallocated_row else 0.0

        # Global top agents
        global_agent_rows = await execute(
            """SELECT
                   agent_id,
                   SUM(cost) AS agent_cost,
                   COUNT(*) AS agent_runs
               FROM run_cost_allocations
               WHERE user_id = :user_id
                 AND allocated_at >= now() - make_interval(days => :days)
                 AND agent_id IS NOT NULL
               GROUP BY agent_id
               ORDER BY agent_cost DESC
               LIMIT 10""",
            params,
        )

        global_top_agents = [
            {
                "agent_id": ar["agent_id"],
                "cost": float(ar["agent_cost"]),
                "runs": int(ar["agent_runs"]),
            }
            for ar in (global_agent_rows or [])
        ]

        return CostReportResponse(
            projects=projects,
            total_spend=total_allocated + unallocated,
            unallocated_spend=unallocated,
            top_agents=global_top_agents,
            days=days,
        )

    except Exception as e:
        logger.error(f"Error generating cost report: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate cost report")
