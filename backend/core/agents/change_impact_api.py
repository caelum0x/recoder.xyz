"""
Change Impact Analysis API.

Analyses the impact of proposed changes to an agent's configuration, tools,
prompts, models, workflows, or dependencies.

- POST   /agents/{agent_id}/impact-analysis   — run impact analysis
- GET    /agents/{agent_id}/impact-analyses    — list analyses for agent
- GET    /impact-analyses/{analysis_id}        — detail
- PATCH  /impact-analyses/{analysis_id}        — approve / reject
- GET    /impact-analyses/stats                — aggregate stats
"""

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate
from core.utils.logger import logger

router = APIRouter(tags=["change-impact"])


# ============================================================================
# Pydantic Models
# ============================================================================

VALID_CHANGE_TYPES = {
    "config_update",
    "tool_change",
    "prompt_change",
    "model_change",
    "workflow_change",
    "dependency_change",
}

VALID_STATUSES = {"pending", "approved", "rejected", "applied"}


class RunImpactAnalysisRequest(BaseModel):
    change_type: str = Field(..., description="Type of change")
    change_description: str = Field(..., description="Human-readable description of the change")
    proposed_changes: dict = Field(default_factory=dict, description="Structured representation of proposed changes")


class UpdateStatusRequest(BaseModel):
    status: str = Field(..., description="New status: approved or rejected")


class ImpactAnalysisResponse(BaseModel):
    id: str
    user_id: str
    agent_id: str
    change_type: str
    change_description: str
    proposed_changes: dict
    impact_assessment: dict
    risk_level: str
    affected_items: list
    status: str
    created_at: str


class ImpactStatsResponse(BaseModel):
    total: int = 0
    by_risk_level: dict = {}
    by_change_type: dict = {}
    approval_rate: float = 0.0


# ============================================================================
# Helpers
# ============================================================================

def _ts(val) -> str:
    if val is None:
        return ""
    if hasattr(val, "isoformat"):
        return val.isoformat()
    return str(val)


def _row_to_response(row: Dict[str, Any]) -> ImpactAnalysisResponse:
    return ImpactAnalysisResponse(
        id=str(row["id"]),
        user_id=str(row["user_id"]),
        agent_id=row["agent_id"],
        change_type=row["change_type"],
        change_description=row["change_description"],
        proposed_changes=row.get("proposed_changes") or {},
        impact_assessment=row.get("impact_assessment") or {},
        risk_level=row.get("risk_level", "medium"),
        affected_items=row.get("affected_items") or [],
        status=row.get("status", "pending"),
        created_at=_ts(row["created_at"]),
    )


def _assess_risk(affected_count: int) -> str:
    """Assign risk based on count of affected items."""
    if affected_count == 0:
        return "low"
    elif affected_count <= 2:
        return "medium"
    elif affected_count <= 5:
        return "high"
    else:
        return "critical"


# ============================================================================
# Endpoints
# ============================================================================

@router.post(
    "/agents/{agent_id}/impact-analysis",
    summary="Run change impact analysis",
    operation_id="run_impact_analysis",
    response_model=ImpactAnalysisResponse,
)
async def run_impact_analysis(
    agent_id: str,
    body: RunImpactAnalysisRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Run an impact analysis for a proposed change to an agent."""
    if body.change_type not in VALID_CHANGE_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid change_type. Must be one of: {', '.join(sorted(VALID_CHANGE_TYPES))}",
        )

    # Verify agent ownership
    agent = await execute_one(
        "SELECT agent_id, name FROM agents WHERE agent_id = :agent_id AND account_id = :user_id",
        {"agent_id": agent_id, "user_id": user_id},
    )
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    try:
        # Build affected items list by querying dependent agents, deployment slots, routing rules
        affected_items: List[Dict[str, Any]] = []

        # 1. Check dependent agents (agents that depend on this one)
        dependent_agents = await execute(
            """
            SELECT ad.source_agent_id, a.name
            FROM agent_dependencies ad
            JOIN agents a ON a.agent_id = ad.source_agent_id
            WHERE ad.target_agent_id = :agent_id AND ad.user_id = :user_id
            """,
            {"agent_id": agent_id, "user_id": user_id},
        )
        for dep in (dependent_agents or []):
            affected_items.append({
                "type": "dependent_agent",
                "id": dep["source_agent_id"],
                "name": dep.get("name", dep["source_agent_id"][:8]),
                "impact": "May be affected by upstream change",
            })

        # 2. Check deployment slots
        try:
            deployment_slots = await execute(
                """
                SELECT id, slot_name, environment
                FROM agent_deployment_slots
                WHERE agent_id = :agent_id AND user_id = :user_id
                """,
                {"agent_id": agent_id, "user_id": user_id},
            )
            for slot in (deployment_slots or []):
                affected_items.append({
                    "type": "deployment_slot",
                    "id": str(slot["id"]),
                    "name": slot.get("slot_name", "unnamed"),
                    "environment": slot.get("environment", "unknown"),
                    "impact": "Deployed instance will need redeployment",
                })
        except Exception:
            # Table may not exist yet; skip
            pass

        # 3. Check model routing rules
        try:
            routing_rules = await execute(
                """
                SELECT id, rule_name
                FROM model_routing_rules
                WHERE agent_id = :agent_id AND user_id = :user_id
                """,
                {"agent_id": agent_id, "user_id": user_id},
            )
            for rule in (routing_rules or []):
                affected_items.append({
                    "type": "routing_rule",
                    "id": str(rule["id"]),
                    "name": rule.get("rule_name", "unnamed"),
                    "impact": "Routing behavior may change",
                })
        except Exception:
            pass

        # 4. Check active triggers
        try:
            triggers = await execute(
                """
                SELECT id, trigger_type
                FROM agent_triggers
                WHERE agent_id = :agent_id AND user_id = :user_id AND is_active = true
                """,
                {"agent_id": agent_id, "user_id": user_id},
            )
            for trigger in (triggers or []):
                affected_items.append({
                    "type": "trigger",
                    "id": str(trigger["id"]),
                    "name": trigger.get("trigger_type", "unknown"),
                    "impact": "Active trigger may behave differently",
                })
        except Exception:
            pass

        risk_level = _assess_risk(len(affected_items))

        # Build impact assessment summary
        impact_assessment = {
            "total_affected": len(affected_items),
            "affected_by_type": {},
            "summary": f"This {body.change_type.replace('_', ' ')} affects {len(affected_items)} item(s).",
        }
        for item in affected_items:
            item_type = item["type"]
            impact_assessment["affected_by_type"][item_type] = (
                impact_assessment["affected_by_type"].get(item_type, 0) + 1
            )

        # Insert analysis
        row = await execute_one(
            """
            INSERT INTO change_impact_analyses
                (user_id, agent_id, change_type, change_description, proposed_changes,
                 impact_assessment, risk_level, affected_items, status)
            VALUES
                (:user_id, :agent_id, :change_type, :change_description, :proposed_changes::jsonb,
                 :impact_assessment::jsonb, :risk_level, :affected_items::jsonb, 'pending')
            RETURNING *
            """,
            {
                "user_id": user_id,
                "agent_id": agent_id,
                "change_type": body.change_type,
                "change_description": body.change_description,
                "proposed_changes": __import__("json").dumps(body.proposed_changes),
                "impact_assessment": __import__("json").dumps(impact_assessment),
                "risk_level": risk_level,
                "affected_items": __import__("json").dumps(affected_items),
            },
        )

        if not row:
            raise HTTPException(status_code=500, detail="Failed to create impact analysis")

        return _row_to_response(row)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error running impact analysis for agent {agent_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to run impact analysis")


@router.get(
    "/agents/{agent_id}/impact-analyses",
    summary="List impact analyses for agent",
    operation_id="list_agent_impact_analyses",
)
async def list_agent_impact_analyses(
    agent_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List all impact analyses for a specific agent."""
    try:
        rows = await execute(
            """
            SELECT * FROM change_impact_analyses
            WHERE user_id = :user_id AND agent_id = :agent_id
            ORDER BY created_at DESC
            """,
            {"user_id": user_id, "agent_id": agent_id},
        )
        return [_row_to_response(row) for row in (rows or [])]
    except Exception as e:
        logger.error(f"Error listing impact analyses for agent {agent_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to list impact analyses")


@router.get(
    "/impact-analyses/stats",
    summary="Impact analysis stats",
    operation_id="get_impact_analysis_stats",
    response_model=ImpactStatsResponse,
)
async def get_impact_stats(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get aggregate stats for impact analyses."""
    try:
        # Total count
        total_row = await execute_one(
            "SELECT COUNT(*) as cnt FROM change_impact_analyses WHERE user_id = :user_id",
            {"user_id": user_id},
        )
        total = total_row["cnt"] if total_row else 0

        # By risk level
        risk_rows = await execute(
            """
            SELECT risk_level, COUNT(*) as cnt
            FROM change_impact_analyses
            WHERE user_id = :user_id
            GROUP BY risk_level
            """,
            {"user_id": user_id},
        )
        by_risk_level = {row["risk_level"]: row["cnt"] for row in (risk_rows or [])}

        # By change type
        type_rows = await execute(
            """
            SELECT change_type, COUNT(*) as cnt
            FROM change_impact_analyses
            WHERE user_id = :user_id
            GROUP BY change_type
            """,
            {"user_id": user_id},
        )
        by_change_type = {row["change_type"]: row["cnt"] for row in (type_rows or [])}

        # Approval rate
        decided_row = await execute_one(
            """
            SELECT
                COUNT(*) FILTER (WHERE status IN ('approved', 'rejected')) as decided,
                COUNT(*) FILTER (WHERE status = 'approved') as approved
            FROM change_impact_analyses
            WHERE user_id = :user_id
            """,
            {"user_id": user_id},
        )
        decided = decided_row["decided"] if decided_row else 0
        approved = decided_row["approved"] if decided_row else 0
        approval_rate = (approved / decided * 100) if decided > 0 else 0.0

        return ImpactStatsResponse(
            total=total,
            by_risk_level=by_risk_level,
            by_change_type=by_change_type,
            approval_rate=round(approval_rate, 1),
        )
    except Exception as e:
        logger.error(f"Error getting impact analysis stats: {e}")
        raise HTTPException(status_code=500, detail="Failed to get impact stats")


@router.get(
    "/impact-analyses/{analysis_id}",
    summary="Impact analysis detail",
    operation_id="get_impact_analysis_detail",
    response_model=ImpactAnalysisResponse,
)
async def get_impact_analysis_detail(
    analysis_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get detail for a single impact analysis."""
    try:
        row = await execute_one(
            """
            SELECT * FROM change_impact_analyses
            WHERE id = :analysis_id AND user_id = :user_id
            """,
            {"analysis_id": analysis_id, "user_id": user_id},
        )
        if not row:
            raise HTTPException(status_code=404, detail="Impact analysis not found")
        return _row_to_response(row)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting impact analysis {analysis_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to get impact analysis")


@router.patch(
    "/impact-analyses/{analysis_id}",
    summary="Update impact analysis status",
    operation_id="update_impact_analysis_status",
    response_model=ImpactAnalysisResponse,
)
async def update_impact_analysis_status(
    analysis_id: str,
    body: UpdateStatusRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Approve or reject an impact analysis."""
    if body.status not in {"approved", "rejected"}:
        raise HTTPException(status_code=400, detail="Status must be 'approved' or 'rejected'")

    try:
        row = await execute_one(
            """
            UPDATE change_impact_analyses
            SET status = :status
            WHERE id = :analysis_id AND user_id = :user_id
            RETURNING *
            """,
            {"status": body.status, "analysis_id": analysis_id, "user_id": user_id},
        )
        if not row:
            raise HTTPException(status_code=404, detail="Impact analysis not found")
        return _row_to_response(row)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating impact analysis {analysis_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to update impact analysis")
