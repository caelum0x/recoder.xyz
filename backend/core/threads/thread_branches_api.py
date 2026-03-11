import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate, serialize_row, serialize_rows
from core.utils.logger import logger

router = APIRouter(tags=["thread-branches"])


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

VALID_STATUSES = ('active', 'merged', 'archived', 'deleted')


class CreateBranchRequest(BaseModel):
    branch_point_index: int
    branch_name: Optional[str] = None
    description: Optional[str] = None


class UpdateBranchRequest(BaseModel):
    branch_name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post(
    "/threads/{thread_id}/branch",
    summary="Create thread branch",
    operation_id="create_thread_branch",
)
async def create_branch(
    thread_id: str,
    body: CreateBranchRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Create a branch from a thread at a specific message index."""
    branch_thread_id = str(uuid.uuid4())

    row = await execute_one(
        """
        INSERT INTO thread_branches (
            user_id, source_thread_id, branch_thread_id,
            branch_point_index, branch_name, description
        ) VALUES (
            :user_id, :source_thread_id, :branch_thread_id,
            :branch_point_index, :branch_name, :description
        )
        RETURNING *
        """,
        {
            "user_id": user_id,
            "source_thread_id": thread_id,
            "branch_thread_id": branch_thread_id,
            "branch_point_index": body.branch_point_index,
            "branch_name": body.branch_name,
            "description": body.description,
        },
        commit=True,
    )

    if not row:
        raise HTTPException(status_code=500, detail="Failed to create branch")

    return serialize_row(dict(row))


@router.get(
    "/threads/{thread_id}/branches",
    summary="List thread branches",
    operation_id="list_thread_branches",
)
async def list_branches(
    thread_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List all branches from a thread."""
    rows = await execute(
        """
        SELECT * FROM thread_branches
        WHERE source_thread_id = :thread_id
          AND user_id = :user_id
          AND status != 'deleted'
        ORDER BY created_at DESC
        """,
        {"thread_id": thread_id, "user_id": user_id},
    )
    return {"branches": serialize_rows([dict(r) for r in rows])}


@router.get(
    "/branches/{branch_id}",
    summary="Get branch detail",
    operation_id="get_branch_detail",
)
async def get_branch(
    branch_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get a branch by ID."""
    row = await execute_one(
        """
        SELECT * FROM thread_branches
        WHERE id = :branch_id AND user_id = :user_id
        """,
        {"branch_id": branch_id, "user_id": user_id},
    )
    if not row:
        raise HTTPException(status_code=404, detail="Branch not found")
    return serialize_row(dict(row))


@router.patch(
    "/branches/{branch_id}",
    summary="Update branch",
    operation_id="update_branch",
)
async def update_branch(
    branch_id: str,
    body: UpdateBranchRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Update branch name, description, or status."""
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    # Validate status
    if "status" in updates and updates["status"] not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {', '.join(VALID_STATUSES)}")

    set_clauses = []
    params = {"branch_id": branch_id, "user_id": user_id}

    for field, value in updates.items():
        set_clauses.append(f"{field} = :{field}")
        params[field] = value

    set_sql = ", ".join(set_clauses)

    row = await execute_one(
        f"""
        UPDATE thread_branches
        SET {set_sql}
        WHERE id = :branch_id AND user_id = :user_id
        RETURNING *
        """,
        params,
        commit=True,
    )

    if not row:
        raise HTTPException(status_code=404, detail="Branch not found or not owned by user")

    return serialize_row(dict(row))


@router.delete(
    "/branches/{branch_id}",
    summary="Delete branch",
    operation_id="delete_branch",
)
async def delete_branch(
    branch_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Soft-delete a branch by setting status to 'deleted'."""
    row = await execute_one(
        """
        UPDATE thread_branches
        SET status = 'deleted'
        WHERE id = :branch_id AND user_id = :user_id
        RETURNING id
        """,
        {"branch_id": branch_id, "user_id": user_id},
        commit=True,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Branch not found")
    return {"deleted": True, "branch_id": branch_id}


@router.get(
    "/branches/tree/{thread_id}",
    summary="Get full branch tree",
    operation_id="get_branch_tree",
)
async def get_branch_tree(
    thread_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Get the full branch tree for a thread (recursive: branches of branches).
    Returns a tree structure with the root thread and all descendant branches.
    """
    # Fetch all branches that originate from this thread or any of its sub-branches
    # Use a recursive approach: first get direct branches, then branches of those branches
    all_branches: List[Dict[str, Any]] = []
    visited: set = set()
    queue = [thread_id]

    while queue:
        current_thread_id = queue.pop(0)
        if current_thread_id in visited:
            continue
        visited.add(current_thread_id)

        rows = await execute(
            """
            SELECT * FROM thread_branches
            WHERE source_thread_id = :thread_id
              AND user_id = :user_id
              AND status != 'deleted'
            ORDER BY branch_point_index ASC, created_at ASC
            """,
            {"thread_id": current_thread_id, "user_id": user_id},
        )

        for row in rows:
            branch = dict(row)
            all_branches.append(branch)
            # Queue the branch_thread_id to find sub-branches
            queue.append(str(branch["branch_thread_id"]))

    # Build tree structure
    def build_node(tid: str) -> Dict[str, Any]:
        children = []
        for b in all_branches:
            if str(b["source_thread_id"]) == tid:
                child_node = build_node(str(b["branch_thread_id"]))
                child_node["branch"] = serialize_row(b)
                children.append(child_node)
        return {
            "thread_id": tid,
            "children": children,
        }

    tree = build_node(thread_id)
    return {"tree": tree, "total_branches": len(all_branches)}
