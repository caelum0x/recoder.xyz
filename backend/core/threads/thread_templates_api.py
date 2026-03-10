from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from typing import Optional
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one
from core.utils.logger import logger
import json
import uuid

router = APIRouter(prefix="/thread-templates", tags=["thread-templates"])


class CreateTemplateRequest(BaseModel):
    name: str
    description: str | None = None
    agent_id: str | None = None
    initial_messages: list[dict] = []
    category: str = "general"


@router.post("", summary="Create thread template")
async def create_template(
    body: CreateTemplateRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    row = await execute_one(
        """
        INSERT INTO thread_templates (user_id, name, description, agent_id, initial_messages, category)
        VALUES (:user_id, :name, :description, :agent_id, :initial_messages, :category)
        RETURNING *
        """,
        {
            "user_id": user_id,
            "name": body.name,
            "description": body.description,
            "agent_id": body.agent_id,
            "initial_messages": json.dumps(body.initial_messages),
            "category": body.category,
        },
    )
    return dict(row)


@router.get("", summary="List thread templates")
async def list_templates(
    category: Optional[str] = Query(None),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    params: dict = {"user_id": user_id}
    query = "SELECT * FROM thread_templates WHERE user_id = :user_id"
    if category:
        query += " AND category = :category"
        params["category"] = category
    query += " ORDER BY created_at DESC"
    rows = await execute(query, params)
    return [dict(r) for r in rows]


@router.get("/{template_id}", summary="Get thread template")
async def get_template(
    template_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    row = await execute_one(
        "SELECT * FROM thread_templates WHERE id = :id AND user_id = :user_id",
        {"id": template_id, "user_id": user_id},
    )
    if not row:
        raise HTTPException(status_code=404, detail="Template not found")
    return dict(row)


@router.delete("/{template_id}", summary="Delete thread template")
async def delete_template(
    template_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    await execute(
        "DELETE FROM thread_templates WHERE id = :id AND user_id = :user_id",
        {"id": template_id, "user_id": user_id},
    )
    return {"status": "ok"}


@router.post("/{template_id}/create-thread", summary="Create thread from template")
async def create_thread_from_template(
    template_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    template = await execute_one(
        "SELECT * FROM thread_templates WHERE id = :id AND user_id = :user_id",
        {"id": template_id, "user_id": user_id},
    )
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    # Increment usage count
    await execute(
        "UPDATE thread_templates SET usage_count = usage_count + 1 WHERE id = :id",
        {"id": template_id},
    )

    thread_id = str(uuid.uuid4())

    # Create the thread
    await execute_one(
        """
        INSERT INTO threads (thread_id, account_id, agent_id, name)
        VALUES (:thread_id, :user_id, :agent_id, :name)
        RETURNING *
        """,
        {
            "thread_id": thread_id,
            "user_id": user_id,
            "agent_id": template.get("agent_id"),
            "name": template["name"],
        },
    )

    # Insert initial messages if any
    messages = template.get("initial_messages") or []
    if isinstance(messages, str):
        messages = json.loads(messages)

    for msg in messages:
        await execute(
            """
            INSERT INTO messages (thread_id, role, content, is_llm_message)
            VALUES (:thread_id, :role, :content, :is_llm)
            """,
            {
                "thread_id": thread_id,
                "role": msg.get("role", "user"),
                "content": json.dumps([{"type": "text", "text": msg.get("content", "")}]),
                "is_llm": msg.get("role") == "assistant",
            },
        )

    return {"thread_id": thread_id, "name": template["name"]}
