from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate, serialize_row, serialize_rows

router = APIRouter(tags=["thread-annotations"])


class CreateAnnotationRequest(BaseModel):
    message_index: Optional[int] = None
    annotation_type: str = "note"
    content: str
    color: str = "#fbbf24"


class UpdateAnnotationRequest(BaseModel):
    content: Optional[str] = None
    annotation_type: Optional[str] = None
    color: Optional[str] = None
    is_resolved: Optional[bool] = None
    message_index: Optional[int] = None


VALID_ANNOTATION_TYPES = {'note', 'highlight', 'question', 'action', 'bug', 'insight', 'action_item', 'warning'}


class CreateReplyRequest(BaseModel):
    content: str


@router.post("/threads/{thread_id}/annotations", summary="Create an annotation")
async def create_annotation(
    thread_id: str,
    body: CreateAnnotationRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    if body.annotation_type not in VALID_ANNOTATION_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid annotation_type. Must be one of: {', '.join(sorted(VALID_ANNOTATION_TYPES))}"
        )

    row = await execute_one(
        """
        INSERT INTO thread_annotations (user_id, thread_id, message_index, annotation_type, content, color)
        VALUES (:user_id, :thread_id, :message_index, :annotation_type, :content, :color)
        RETURNING *
        """,
        {
            "user_id": user_id,
            "thread_id": thread_id,
            "message_index": body.message_index,
            "annotation_type": body.annotation_type,
            "content": body.content,
            "color": body.color,
        },
        commit=True,
    )
    if not row:
        raise HTTPException(status_code=500, detail="Failed to create annotation")
    return serialize_row(dict(row))


@router.get("/threads/{thread_id}/annotations", summary="List annotations for a thread")
async def list_annotations(
    thread_id: str,
    annotation_type: Optional[str] = Query(None),
    resolved: Optional[bool] = Query(None),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    conditions = ["thread_id::text = :thread_id", "user_id::text = :user_id"]
    params: dict = {"thread_id": thread_id, "user_id": user_id}

    if annotation_type:
        if annotation_type not in VALID_ANNOTATION_TYPES:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid annotation_type. Must be one of: {', '.join(sorted(VALID_ANNOTATION_TYPES))}"
            )
        conditions.append("annotation_type = :annotation_type")
        params["annotation_type"] = annotation_type

    if resolved is not None:
        conditions.append("is_resolved = :resolved")
        params["resolved"] = resolved

    where = " AND ".join(conditions)

    rows = await execute(
        f"""
        SELECT * FROM thread_annotations
        WHERE {where}
        ORDER BY created_at ASC
        """,
        params,
    )
    return serialize_rows([dict(r) for r in rows])


@router.patch("/threads/{thread_id}/annotations/{annotation_id}", summary="Update an annotation")
async def update_annotation(
    thread_id: str,
    annotation_id: str,
    body: UpdateAnnotationRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    if "annotation_type" in updates and updates["annotation_type"] not in VALID_ANNOTATION_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid annotation_type. Must be one of: {', '.join(sorted(VALID_ANNOTATION_TYPES))}"
        )

    set_clauses = ["updated_at = now()"]
    params = {"annotation_id": annotation_id, "thread_id": thread_id, "user_id": user_id}

    for key, value in updates.items():
        set_clauses.append(f"{key} = :{key}")
        params[key] = value

    set_sql = ", ".join(set_clauses)

    row = await execute_one(
        f"""
        UPDATE thread_annotations
        SET {set_sql}
        WHERE id = :annotation_id AND thread_id::text = :thread_id AND user_id::text = :user_id
        RETURNING *
        """,
        params,
        commit=True,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Annotation not found")
    return serialize_row(dict(row))


@router.delete("/threads/{thread_id}/annotations/{annotation_id}", summary="Delete an annotation")
async def delete_annotation(
    thread_id: str,
    annotation_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    rows = await execute_mutate(
        """
        DELETE FROM thread_annotations
        WHERE id = :annotation_id AND thread_id::text = :thread_id AND user_id::text = :user_id
        RETURNING id
        """,
        {"annotation_id": annotation_id, "thread_id": thread_id, "user_id": user_id},
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Annotation not found")
    return {"status": "ok"}


@router.get("/annotations/recent", summary="Get recent annotations across threads")
async def get_recent_annotations(
    limit: int = Query(10, ge=1, le=100),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    rows = await execute(
        """
        SELECT * FROM thread_annotations
        WHERE user_id::text = :user_id
        ORDER BY created_at DESC
        LIMIT :limit
        """,
        {"user_id": user_id, "limit": limit},
    )
    return serialize_rows([dict(r) for r in rows])


@router.get("/annotations/summary", summary="Annotation summary stats")
async def get_annotation_summary(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    rows = await execute(
        """
        SELECT annotation_type, COUNT(*) as count
        FROM thread_annotations
        WHERE user_id::text = :user_id
        GROUP BY annotation_type
        ORDER BY count DESC
        """,
        {"user_id": user_id},
    )
    by_type = {r["annotation_type"]: r["count"] for r in rows}

    unresolved_row = await execute_one(
        """
        SELECT COUNT(*) as count
        FROM thread_annotations
        WHERE user_id::text = :user_id AND is_resolved = false
        """,
        {"user_id": user_id},
    )
    unresolved_count = unresolved_row["count"] if unresolved_row else 0

    total = sum(by_type.values())

    return {
        "total": total,
        "unresolved": unresolved_count,
        "by_type": by_type,
    }


# ---------------------------------------------------------------------------
# Sprint 65: Resolve, Replies, Action Items
# ---------------------------------------------------------------------------

@router.post("/annotations/{annotation_id}/resolve", summary="Toggle resolve status on an annotation")
async def resolve_annotation(
    annotation_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    existing = await execute_one(
        "SELECT id, is_resolved FROM thread_annotations WHERE id = :id AND user_id::text = :user_id",
        {"id": annotation_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Annotation not found")

    new_resolved = not existing["is_resolved"]
    resolved_at_clause = "now()" if new_resolved else "NULL"

    row = await execute_one(
        f"""
        UPDATE thread_annotations
        SET is_resolved = :is_resolved, resolved_at = {resolved_at_clause}, updated_at = now()
        WHERE id = :id AND user_id::text = :user_id
        RETURNING *
        """,
        {"id": annotation_id, "user_id": user_id, "is_resolved": new_resolved},
        commit=True,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Annotation not found")
    return serialize_row(dict(row))


@router.post("/annotations/{annotation_id}/replies", summary="Add a reply to an annotation")
async def add_annotation_reply(
    annotation_id: str,
    body: CreateReplyRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    # Verify annotation ownership
    annotation = await execute_one(
        "SELECT id FROM thread_annotations WHERE id = :id AND user_id::text = :user_id",
        {"id": annotation_id, "user_id": user_id},
    )
    if not annotation:
        raise HTTPException(status_code=404, detail="Annotation not found")

    row = await execute_one(
        """
        INSERT INTO annotation_replies (annotation_id, user_id, content)
        VALUES (:annotation_id, :user_id, :content)
        RETURNING *
        """,
        {
            "annotation_id": annotation_id,
            "user_id": user_id,
            "content": body.content,
        },
        commit=True,
    )
    if not row:
        raise HTTPException(status_code=500, detail="Failed to create reply")
    return serialize_row(dict(row))


@router.get("/annotations/{annotation_id}/replies", summary="List replies for an annotation")
async def list_annotation_replies(
    annotation_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    # Verify annotation ownership
    annotation = await execute_one(
        "SELECT id FROM thread_annotations WHERE id = :id AND user_id::text = :user_id",
        {"id": annotation_id, "user_id": user_id},
    )
    if not annotation:
        raise HTTPException(status_code=404, detail="Annotation not found")

    rows = await execute(
        """
        SELECT * FROM annotation_replies
        WHERE annotation_id::text = :annotation_id
        ORDER BY created_at ASC
        """,
        {"annotation_id": annotation_id},
    )
    return serialize_rows([dict(r) for r in rows])


@router.get("/annotations/action-items", summary="All unresolved action items across threads")
async def get_action_items(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    rows = await execute(
        """
        SELECT a.*,
            (SELECT COUNT(*) FROM annotation_replies r WHERE r.annotation_id::text = a.id::text) AS reply_count
        FROM thread_annotations a
        WHERE a.user_id::text = :user_id
          AND a.annotation_type IN ('action', 'action_item')
          AND a.is_resolved = false
        ORDER BY a.created_at DESC
        """,
        {"user_id": user_id},
    )
    return serialize_rows([dict(r) for r in rows])
