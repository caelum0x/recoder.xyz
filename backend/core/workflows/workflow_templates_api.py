"""API routes for workflow templates — reusable multi-step agent pipelines."""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate, serialize_row, serialize_rows
from core.utils.logger import logger

router = APIRouter(tags=["workflow-templates"])


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class WorkflowStepInput(BaseModel):
    agent_id: str
    instruction: str
    order: int


class CreateWorkflowTemplateRequest(BaseModel):
    name: str
    description: Optional[str] = None
    category: Optional[str] = "general"
    steps: List[WorkflowStepInput]
    variables: Optional[List[dict]] = None
    is_public: Optional[bool] = False


class UpdateWorkflowTemplateRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    steps: Optional[List[WorkflowStepInput]] = None
    variables: Optional[List[dict]] = None
    is_public: Optional[bool] = None


class RunWorkflowTemplateRequest(BaseModel):
    variable_values: Optional[dict] = None


# ---------------------------------------------------------------------------
# Template CRUD
# ---------------------------------------------------------------------------

@router.post("/workflows/templates", summary="Create a workflow template")
async def create_workflow_template(
    body: CreateWorkflowTemplateRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    if not body.name or not body.name.strip():
        raise HTTPException(status_code=400, detail="Template name is required")
    if not body.steps:
        raise HTTPException(status_code=400, detail="At least one step is required")

    valid_categories = ('general', 'data_pipeline', 'content_generation', 'monitoring', 'integration', 'custom')
    category = body.category or 'general'
    if category not in valid_categories:
        raise HTTPException(status_code=400, detail=f"Invalid category. Must be one of: {', '.join(valid_categories)}")

    steps_data = [s.model_dump() for s in body.steps]
    variables_data = body.variables or []

    row = await execute_one(
        """
        INSERT INTO workflow_templates (user_id, name, description, category, steps, variables, is_public)
        VALUES (:user_id, :name, :description, :category, :steps::jsonb, :variables::jsonb, :is_public)
        RETURNING *
        """,
        {
            "user_id": user_id,
            "name": body.name.strip(),
            "description": body.description,
            "category": category,
            "steps": steps_data,
            "variables": variables_data,
            "is_public": body.is_public or False,
        },
        commit=True,
    )
    return serialize_row(dict(row))


@router.get("/workflows/templates", summary="List workflow templates")
async def list_workflow_templates(
    category: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    public_only: bool = Query(False),
    limit: int = Query(50, ge=1, le=200),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    conditions = []
    params: dict = {"user_id": user_id, "limit": limit}

    if public_only:
        conditions.append("(is_public = true OR user_id::text = :user_id)")
    else:
        conditions.append("(user_id::text = :user_id OR is_public = true)")

    if category:
        conditions.append("category = :category")
        params["category"] = category

    if search:
        conditions.append("(name ILIKE :search OR description ILIKE :search)")
        params["search"] = f"%{search}%"

    where = "WHERE " + " AND ".join(conditions) if conditions else ""

    rows = await execute(
        f"""
        SELECT * FROM workflow_templates
        {where}
        ORDER BY updated_at DESC
        LIMIT :limit
        """,
        params,
    )
    return serialize_rows([dict(r) for r in rows])


@router.get("/workflows/templates/{template_id}", summary="Get workflow template detail")
async def get_workflow_template(
    template_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    row = await execute_one(
        """
        SELECT * FROM workflow_templates
        WHERE id = :id AND (user_id::text = :user_id OR is_public = true)
        """,
        {"id": template_id, "user_id": user_id},
    )
    if not row:
        raise HTTPException(status_code=404, detail="Workflow template not found")
    return serialize_row(dict(row))


@router.patch("/workflows/templates/{template_id}", summary="Update a workflow template")
async def update_workflow_template(
    template_id: str,
    body: UpdateWorkflowTemplateRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    existing = await execute_one(
        "SELECT id FROM workflow_templates WHERE id = :id AND user_id::text = :user_id",
        {"id": template_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Workflow template not found or access denied")

    updates = {}
    params: dict = {"id": template_id, "user_id": user_id}

    if body.name is not None:
        updates["name"] = body.name.strip()
        params["name"] = body.name.strip()
    if body.description is not None:
        updates["description"] = body.description
        params["description"] = body.description
    if body.category is not None:
        valid_categories = ('general', 'data_pipeline', 'content_generation', 'monitoring', 'integration', 'custom')
        if body.category not in valid_categories:
            raise HTTPException(status_code=400, detail=f"Invalid category. Must be one of: {', '.join(valid_categories)}")
        updates["category"] = body.category
        params["category"] = body.category
    if body.steps is not None:
        steps_data = [s.model_dump() for s in body.steps]
        updates["steps"] = steps_data
        params["steps"] = steps_data
    if body.variables is not None:
        updates["variables"] = body.variables
        params["variables"] = body.variables
    if body.is_public is not None:
        updates["is_public"] = body.is_public
        params["is_public"] = body.is_public

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    set_parts = []
    for k in updates:
        if k in ("steps", "variables"):
            set_parts.append(f"{k} = :{k}::jsonb")
        else:
            set_parts.append(f"{k} = :{k}")
    set_parts.append("updated_at = now()")
    set_clause = ", ".join(set_parts)

    row = await execute_one(
        f"UPDATE workflow_templates SET {set_clause} WHERE id = :id AND user_id::text = :user_id RETURNING *",
        params,
        commit=True,
    )
    return serialize_row(dict(row))


@router.delete("/workflows/templates/{template_id}", summary="Delete a workflow template")
async def delete_workflow_template(
    template_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    existing = await execute_one(
        "SELECT id FROM workflow_templates WHERE id = :id AND user_id::text = :user_id",
        {"id": template_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Workflow template not found or access denied")

    await execute_mutate(
        "DELETE FROM workflow_templates WHERE id = :id AND user_id::text = :user_id",
        {"id": template_id, "user_id": user_id},
    )
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Template runs
# ---------------------------------------------------------------------------

@router.post("/workflows/templates/{template_id}/run", summary="Run a workflow template")
async def run_workflow_template(
    template_id: str,
    body: RunWorkflowTemplateRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    # Verify template exists and user has access
    template = await execute_one(
        """
        SELECT * FROM workflow_templates
        WHERE id = :id AND (user_id::text = :user_id OR is_public = true)
        """,
        {"id": template_id, "user_id": user_id},
    )
    if not template:
        raise HTTPException(status_code=404, detail="Workflow template not found")

    # Create run record
    run_row = await execute_one(
        """
        INSERT INTO workflow_template_runs (template_id, user_id, variable_values, status, started_at)
        VALUES (:template_id, :user_id, :variable_values::jsonb, 'running', now())
        RETURNING *
        """,
        {
            "template_id": template_id,
            "user_id": user_id,
            "variable_values": body.variable_values or {},
        },
        commit=True,
    )

    # Increment use_count
    await execute_mutate(
        "UPDATE workflow_templates SET use_count = use_count + 1 WHERE id = :id",
        {"id": template_id},
    )

    return serialize_row(dict(run_row))


@router.get("/workflows/templates/{template_id}/runs", summary="List runs for a workflow template")
async def list_workflow_template_runs(
    template_id: str,
    limit: int = Query(50, ge=1, le=200),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    # Verify template access
    template = await execute_one(
        """
        SELECT id FROM workflow_templates
        WHERE id = :id AND (user_id::text = :user_id OR is_public = true)
        """,
        {"id": template_id, "user_id": user_id},
    )
    if not template:
        raise HTTPException(status_code=404, detail="Workflow template not found")

    rows = await execute(
        """
        SELECT * FROM workflow_template_runs
        WHERE template_id::text = :template_id AND user_id::text = :user_id
        ORDER BY created_at DESC
        LIMIT :limit
        """,
        {"template_id": template_id, "user_id": user_id, "limit": limit},
    )
    return serialize_rows([dict(r) for r in rows])
