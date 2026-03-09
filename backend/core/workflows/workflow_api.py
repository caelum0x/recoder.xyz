"""FastAPI CRUD routes for workflows, nodes, and edges."""

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/workflows", tags=["workflows"])


class WorkflowCreateRequest(BaseModel):
    name: str
    agent_id: str
    description: str = ""


class NodeCreateRequest(BaseModel):
    node_type: str
    label: str
    config: dict = {}
    position_x: float = 0
    position_y: float = 0


class EdgeCreateRequest(BaseModel):
    source_node_id: str
    target_node_id: str
    condition: Optional[dict] = None


@router.post("")
async def create_workflow(req: WorkflowCreateRequest, request: Request):
    """Create a new workflow for an agent."""
    return {
        "id": "placeholder",
        "name": req.name,
        "status": "draft",
        "message": "Workflow created (DB not connected yet)",
    }


@router.get("/templates/list")
async def list_templates(category: str = None):
    """List available workflow templates."""
    from core.workflows.templates import get_templates
    return get_templates(category)


class WorkflowAnalyticsResponse(BaseModel):
    execution_count: int = 0
    success_count: int = 0
    failure_count: int = 0
    success_rate: float = 0.0
    avg_duration_seconds: float = 0.0
    total_cost: float = 0.0
    bottleneck_nodes: list = []
    failure_hotspots: list = []


class WorkflowsOverviewResponse(BaseModel):
    total_workflows: int = 0
    total_executions: int = 0
    overall_success_rate: float = 0.0
    total_cost: float = 0.0
    most_used_workflow: str = ""
    avg_execution_time_seconds: float = 0.0


@router.get("/analytics/overview", response_model=WorkflowsOverviewResponse)
async def workflows_overview(request: Request):
    """Aggregate analytics across all workflows for the current user."""
    db = request.app.state.db
    try:
        sql = """
        SELECT
            COUNT(DISTINCT w.id) as total_workflows,
            COUNT(we.id) as total_executions,
            COUNT(we.id) FILTER (WHERE we.status = 'completed') as success_count,
            COALESCE(SUM(we.total_cost), 0) as total_cost,
            AVG(EXTRACT(EPOCH FROM (we.completed_at - we.started_at))) FILTER (WHERE we.completed_at IS NOT NULL) as avg_duration
        FROM workflows w
        LEFT JOIN workflow_executions we ON w.id = we.workflow_id
        """
        stats = await db.execute(sql)
        row = stats[0] if stats else {}

        total_executions = row.get("total_executions", 0) or 0
        success_count = row.get("success_count", 0) or 0

        # Find most used workflow
        most_used_sql = """
        SELECT w.name, COUNT(we.id) as exec_count
        FROM workflows w
        JOIN workflow_executions we ON w.id = we.workflow_id
        GROUP BY w.id, w.name
        ORDER BY exec_count DESC
        LIMIT 1
        """
        most_used = await db.execute(most_used_sql)
        most_used_name = most_used[0]["name"] if most_used else ""

        return WorkflowsOverviewResponse(
            total_workflows=row.get("total_workflows", 0) or 0,
            total_executions=total_executions,
            overall_success_rate=round((success_count / total_executions) * 100, 2) if total_executions > 0 else 0.0,
            total_cost=round(float(row.get("total_cost", 0) or 0), 4),
            most_used_workflow=most_used_name,
            avg_execution_time_seconds=round(float(row.get("avg_duration", 0) or 0), 2),
        )
    except Exception as e:
        logger.error(f"Error fetching workflows overview: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch workflows overview")


@router.post("/{workflow_id}/from-template")
async def create_from_template(workflow_id: str, request: Request):
    """Apply a template to a workflow, creating nodes and edges from the template definition."""
    data = await request.json()
    template_name = data.get("template_name")
    from core.workflows.templates import get_template
    tmpl = get_template(template_name)
    if not tmpl:
        raise HTTPException(404, "Template not found")
    return {
        "workflow_id": workflow_id,
        "template": template_name,
        "created_nodes": len(tmpl["definition"]["nodes"]),
        "created_edges": len(tmpl["definition"]["edges"]),
        "message": "Template applied (placeholder — DB not connected yet)",
    }


@router.get("/{workflow_id}")
async def get_workflow(workflow_id: str, request: Request):
    """Get a workflow with its nodes and edges."""
    return {"workflow": {"id": workflow_id}, "nodes": [], "edges": []}


@router.get("/agent/{agent_id}")
async def list_agent_workflows(agent_id: str, request: Request):
    """List all workflows for an agent."""
    return []


@router.put("/{workflow_id}")
async def update_workflow(workflow_id: str, request: Request):
    """Update a workflow."""
    data = await request.json()
    return {"id": workflow_id, "updated": True, **data}


@router.delete("/{workflow_id}")
async def delete_workflow(workflow_id: str, request: Request):
    """Delete a workflow."""
    return {"deleted": True}


@router.post("/{workflow_id}/nodes")
async def add_node(workflow_id: str, req: NodeCreateRequest, request: Request):
    """Add a node to a workflow."""
    return {
        "id": "placeholder",
        "workflow_id": workflow_id,
        "node_type": req.node_type,
        "label": req.label,
    }


@router.post("/{workflow_id}/edges")
async def add_edge(workflow_id: str, req: EdgeCreateRequest, request: Request):
    """Add an edge between two nodes."""
    return {
        "id": "placeholder",
        "workflow_id": workflow_id,
        "source": req.source_node_id,
        "target": req.target_node_id,
    }


@router.delete("/nodes/{node_id}")
async def delete_node(node_id: str, request: Request):
    """Delete a node."""
    return {"deleted": True}


@router.delete("/edges/{edge_id}")
async def delete_edge(edge_id: str, request: Request):
    """Delete an edge."""
    return {"deleted": True}


@router.post("/{workflow_id}/execute")
async def execute_workflow(workflow_id: str, request: Request):
    """Start a workflow execution."""
    data = await request.json() if request.headers.get("content-type") == "application/json" else {}
    return {
        "execution_id": "placeholder",
        "workflow_id": workflow_id,
        "status": "running",
        "trigger_type": data.get("trigger_type", "manual"),
        "message": "Workflow execution started (placeholder — DB not connected yet)",
    }


@router.get("/{workflow_id}/executions")
async def list_executions(workflow_id: str, request: Request):
    """List execution history for a workflow."""
    return []


@router.get("/executions/{execution_id}")
async def get_execution(execution_id: str, request: Request):
    """Get details of a specific execution."""
    return {"execution": {"id": execution_id, "status": "completed"}, "node_executions": []}


@router.get("/approvals/pending")
async def list_pending_approvals(request: Request):
    """List all pending approval gates for the current user."""
    return []


@router.post("/approvals/{approval_id}/approve")
async def approve_gate(approval_id: str, request: Request):
    """Approve a pending approval gate."""
    return {"id": approval_id, "status": "approved"}


@router.post("/approvals/{approval_id}/reject")
async def reject_gate(approval_id: str, request: Request):
    """Reject a pending approval gate."""
    return {"id": approval_id, "status": "rejected"}


@router.get("/{workflow_id}/analytics", response_model=WorkflowAnalyticsResponse)
async def workflow_analytics(workflow_id: str, request: Request):
    """Analytics for a specific workflow: execution counts, success rate, bottleneck nodes, failure hotspots."""
    db = request.app.state.db
    try:
        # Get execution stats
        stats_sql = """
        SELECT
            COUNT(*) as execution_count,
            COUNT(*) FILTER (WHERE status = 'completed') as success_count,
            COUNT(*) FILTER (WHERE status = 'failed') as failure_count,
            AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) FILTER (WHERE completed_at IS NOT NULL) as avg_duration,
            COALESCE(SUM(total_cost), 0) as total_cost
        FROM workflow_executions
        WHERE workflow_id = $1
        """
        stats = await db.execute(stats_sql, workflow_id)
        row = stats[0] if stats else {}

        execution_count = row.get("execution_count", 0) or 0
        success_count = row.get("success_count", 0) or 0
        failure_count = row.get("failure_count", 0) or 0
        success_rate = round((success_count / execution_count) * 100, 2) if execution_count > 0 else 0.0

        # Get bottleneck nodes (slowest avg execution time)
        bottleneck_sql = """
        SELECT
            wne.node_id,
            wn.label,
            wn.node_type,
            AVG(EXTRACT(EPOCH FROM (wne.completed_at - wne.started_at))) as avg_seconds,
            COUNT(*) as exec_count
        FROM workflow_node_executions wne
        JOIN workflow_nodes wn ON wne.node_id = wn.id
        JOIN workflow_executions we ON wne.execution_id = we.id
        WHERE we.workflow_id = $1 AND wne.completed_at IS NOT NULL
        GROUP BY wne.node_id, wn.label, wn.node_type
        ORDER BY avg_seconds DESC
        LIMIT 5
        """
        bottlenecks = await db.execute(bottleneck_sql, workflow_id)
        bottleneck_nodes = [
            {"node_id": b["node_id"], "label": b["label"], "node_type": b["node_type"],
             "avg_seconds": round(float(b["avg_seconds"] or 0), 2), "exec_count": b["exec_count"]}
            for b in (bottlenecks or [])
        ]

        # Get failure hotspots (nodes with highest failure rates)
        failure_sql = """
        SELECT
            wne.node_id,
            wn.label,
            wn.node_type,
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE wne.status = 'failed') as failures
        FROM workflow_node_executions wne
        JOIN workflow_nodes wn ON wne.node_id = wn.id
        JOIN workflow_executions we ON wne.execution_id = we.id
        WHERE we.workflow_id = $1
        GROUP BY wne.node_id, wn.label, wn.node_type
        HAVING COUNT(*) FILTER (WHERE wne.status = 'failed') > 0
        ORDER BY failures DESC
        LIMIT 5
        """
        failures = await db.execute(failure_sql, workflow_id)
        failure_hotspots = [
            {"node_id": f["node_id"], "label": f["label"], "node_type": f["node_type"],
             "total": f["total"], "failures": f["failures"],
             "failure_rate": round((f["failures"] / f["total"]) * 100, 2) if f["total"] > 0 else 0}
            for f in (failures or [])
        ]

        return WorkflowAnalyticsResponse(
            execution_count=execution_count,
            success_count=success_count,
            failure_count=failure_count,
            success_rate=success_rate,
            avg_duration_seconds=round(float(row.get("avg_duration", 0) or 0), 2),
            total_cost=round(float(row.get("total_cost", 0) or 0), 4),
            bottleneck_nodes=bottleneck_nodes,
            failure_hotspots=failure_hotspots,
        )
    except Exception as e:
        logger.error(f"Error fetching workflow analytics: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch workflow analytics")
