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
