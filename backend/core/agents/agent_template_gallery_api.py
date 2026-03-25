"""
Agent Template Gallery API endpoints.

Provides CRUD for agent templates, template usage tracking,
category listing, and creating templates from existing agents.
"""

import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

from core.services.db import execute, execute_one, execute_mutate
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.utils.logger import logger

router = APIRouter(prefix="/agent-templates", tags=["agent-template-gallery"])


# ============================================================================
# Pydantic Models
# ============================================================================

class AgentTemplate(BaseModel):
    id: str
    user_id: Optional[str] = None
    template_name: str
    description: Optional[str] = None
    category: str = "general"
    agent_config: Dict[str, Any] = {}
    icon: str = "bot"
    is_official: bool = False
    is_public: bool = False
    use_count: int = 0
    tags: List[str] = []
    preview_images: List[str] = []
    created_at: str
    updated_at: str


class CreateTemplateRequest(BaseModel):
    template_name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    category: str = Field(default="general")
    agent_config: Dict[str, Any] = {}
    icon: str = Field(default="bot")
    is_public: bool = False
    tags: List[str] = []
    preview_images: List[str] = []


class UpdateTemplateRequest(BaseModel):
    template_name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = None
    category: Optional[str] = None
    agent_config: Optional[Dict[str, Any]] = None
    icon: Optional[str] = None
    is_public: Optional[bool] = None
    tags: Optional[List[str]] = None
    preview_images: Optional[List[str]] = None


class UseTemplateResponse(BaseModel):
    created_agent_id: str
    template_id: str
    template_name: str
    message: str = "Agent created from template"


class TemplateFromAgentRequest(BaseModel):
    template_name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    category: str = Field(default="general")
    is_public: bool = False
    tags: List[str] = []
    icon: str = "bot"


class CategoryCount(BaseModel):
    category: str
    count: int
    label: str


VALID_CATEGORIES = {
    'general', 'coding', 'writing', 'analysis',
    'customer_support', 'data', 'automation', 'creative'
}

CATEGORY_LABELS = {
    'general': 'General',
    'coding': 'Coding',
    'writing': 'Writing',
    'analysis': 'Analysis',
    'customer_support': 'Customer Support',
    'data': 'Data',
    'automation': 'Automation',
    'creative': 'Creative',
}


# ============================================================================
# Endpoints
# ============================================================================

@router.post("", response_model=AgentTemplate, summary="Create agent template")
async def create_template(body: CreateTemplateRequest, request: Request):
    """Create a new agent template."""
    user_id = await verify_and_get_user_id_from_jwt(request)

    if body.category not in VALID_CATEGORIES:
        raise HTTPException(status_code=400, detail=f"Invalid category. Must be one of: {', '.join(VALID_CATEGORIES)}")

    try:
        sql = """
        INSERT INTO agent_templates (
            user_id, template_name, description, category,
            agent_config, icon, is_public, tags, preview_images
        ) VALUES (
            :user_id, :template_name, :description, :category,
            :agent_config, :icon, :is_public, :tags, :preview_images
        )
        RETURNING id, created_at, updated_at
        """
        result = await execute_one(sql, {
            "user_id": user_id,
            "template_name": body.template_name,
            "description": body.description,
            "category": body.category,
            "agent_config": json.dumps(body.agent_config),
            "icon": body.icon,
            "is_public": body.is_public,
            "tags": body.tags,
            "preview_images": body.preview_images,
        })

        return AgentTemplate(
            id=str(result["id"]),
            user_id=str(user_id),
            template_name=body.template_name,
            description=body.description,
            category=body.category,
            agent_config=body.agent_config,
            icon=body.icon,
            is_public=body.is_public,
            tags=body.tags,
            preview_images=body.preview_images,
            created_at=str(result["created_at"]),
            updated_at=str(result["updated_at"]),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating template for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to create template")


@router.get("", response_model=List[AgentTemplate], summary="List agent templates")
async def list_templates(
    request: Request,
    category: Optional[str] = Query(None, description="Filter by category"),
    search: Optional[str] = Query(None, description="Search in name and description"),
    tags: Optional[str] = Query(None, description="Comma-separated tag filter"),
    sort_by: str = Query("recent", description="popular or recent"),
    official_only: bool = Query(False, description="Only official templates"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """List agent templates with filtering, search, and sorting."""
    user_id = await verify_and_get_user_id_from_jwt(request)

    try:
        where_clauses = ["(is_public = true OR user_id::text = :user_id)"]
        params: Dict[str, Any] = {"user_id": user_id, "limit": limit, "offset": offset}

        if category:
            where_clauses.append("category = :category")
            params["category"] = category

        if search:
            where_clauses.append("(template_name ILIKE :search OR description ILIKE :search)")
            params["search"] = f"%{search}%"

        if tags:
            tag_list = [t.strip() for t in tags.split(",") if t.strip()]
            if tag_list:
                where_clauses.append("tags && :tags")
                params["tags"] = tag_list

        if official_only:
            where_clauses.append("is_official = true")

        where_sql = " AND ".join(where_clauses)
        order_sql = "use_count DESC" if sort_by == "popular" else "created_at DESC"

        sql = f"""
        SELECT id, user_id, template_name, description, category,
               agent_config, icon, is_official, is_public, use_count,
               tags, preview_images, created_at, updated_at
        FROM agent_templates
        WHERE {where_sql}
        ORDER BY {order_sql}
        LIMIT :limit OFFSET :offset
        """

        rows = await execute(sql, params)

        return [
            AgentTemplate(
                id=str(row["id"]),
                user_id=str(row["user_id"]) if row["user_id"] else None,
                template_name=row["template_name"],
                description=row["description"],
                category=row["category"],
                agent_config=row["agent_config"] or {},
                icon=row["icon"] or "bot",
                is_official=row["is_official"],
                is_public=row["is_public"],
                use_count=row["use_count"],
                tags=row["tags"] or [],
                preview_images=row["preview_images"] or [],
                created_at=str(row["created_at"]),
                updated_at=str(row["updated_at"]),
            )
            for row in (rows or [])
        ]

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing templates: {e}")
        raise HTTPException(status_code=500, detail="Failed to list templates")


@router.get("/categories", response_model=List[CategoryCount], summary="List categories with counts")
async def list_categories(request: Request):
    """List all template categories with their template counts."""
    user_id = await verify_and_get_user_id_from_jwt(request)

    try:
        sql = """
        SELECT category, COUNT(*) as count
        FROM agent_templates
        WHERE is_public = true OR user_id::text = :user_id
        GROUP BY category
        ORDER BY count DESC
        """
        rows = await execute(sql, {"user_id": user_id})

        results = []
        for row in (rows or []):
            cat = row["category"]
            results.append(CategoryCount(
                category=cat,
                count=row["count"],
                label=CATEGORY_LABELS.get(cat, cat.replace("_", " ").title()),
            ))

        # Add categories with zero count
        existing_cats = {r.category for r in results}
        for cat in VALID_CATEGORIES:
            if cat not in existing_cats:
                results.append(CategoryCount(
                    category=cat,
                    count=0,
                    label=CATEGORY_LABELS.get(cat, cat.replace("_", " ").title()),
                ))

        return results

    except Exception as e:
        logger.error(f"Error listing categories: {e}")
        raise HTTPException(status_code=500, detail="Failed to list categories")


@router.get("/{template_id}", response_model=AgentTemplate, summary="Get template detail")
async def get_template(template_id: str, request: Request):
    """Get a single template by ID."""
    import re as _re
    if not _re.match(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', template_id):
        raise HTTPException(status_code=404, detail="Template not found")

    user_id = await verify_and_get_user_id_from_jwt(request)

    try:
        sql = """
        SELECT id, user_id, template_name, description, category,
               agent_config, icon, is_official, is_public, use_count,
               tags, preview_images, created_at, updated_at
        FROM agent_templates
        WHERE id = :template_id
          AND (is_public = true OR user_id::text = :user_id)
        """
        row = await execute_one(sql, {"template_id": template_id, "user_id": user_id})

        if not row:
            raise HTTPException(status_code=404, detail="Template not found")

        return AgentTemplate(
            id=str(row["id"]),
            user_id=str(row["user_id"]) if row["user_id"] else None,
            template_name=row["template_name"],
            description=row["description"],
            category=row["category"],
            agent_config=row["agent_config"] or {},
            icon=row["icon"] or "bot",
            is_official=row["is_official"],
            is_public=row["is_public"],
            use_count=row["use_count"],
            tags=row["tags"] or [],
            preview_images=row["preview_images"] or [],
            created_at=str(row["created_at"]),
            updated_at=str(row["updated_at"]),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching template {template_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch template")


@router.post("/{template_id}/use", response_model=UseTemplateResponse, summary="Use template to create agent")
async def use_template(template_id: str, request: Request):
    """
    Create a new agent from a template.
    Increments the template's use_count and logs the usage.
    """
    user_id = await verify_and_get_user_id_from_jwt(request)

    try:
        # Fetch the template
        template_sql = """
        SELECT id, template_name, agent_config, category, icon
        FROM agent_templates
        WHERE id = :template_id
          AND (is_public = true OR user_id::text = :user_id)
        """
        template = await execute_one(template_sql, {"template_id": template_id, "user_id": user_id})

        if not template:
            raise HTTPException(status_code=404, detail="Template not found")

        config = template["agent_config"] or {}
        agent_name = config.get("name", template["template_name"])

        # Create a new agent from the config
        create_sql = """
        INSERT INTO agents (name, account_id, system_prompt, agent_type, model, tools_config, config)
        VALUES (:name, :account_id, :system_prompt, :agent_type, :model, :tools_config, :config)
        RETURNING agent_id
        """
        agent_result = await execute_one(create_sql, {
            "name": agent_name,
            "account_id": user_id,
            "system_prompt": config.get("system_prompt", ""),
            "agent_type": config.get("agent_type", "conversational"),
            "model": config.get("model", "anthropic/claude-sonnet-4-20250514"),
            "tools_config": json.dumps(config.get("tools_config", {})),
            "config": json.dumps(config),
        })

        created_agent_id = str(agent_result["agent_id"])

        # Increment use_count
        await execute_mutate(
            "UPDATE agent_templates SET use_count = use_count + 1 WHERE id = :template_id",
            {"template_id": template_id},
        )

        # Log usage
        await execute_mutate(
            """
            INSERT INTO template_usage_log (template_id, user_id, created_agent_id)
            VALUES (:template_id, :user_id, :created_agent_id)
            """,
            {
                "template_id": template_id,
                "user_id": user_id,
                "created_agent_id": created_agent_id,
            },
        )

        return UseTemplateResponse(
            created_agent_id=created_agent_id,
            template_id=template_id,
            template_name=template["template_name"],
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error using template {template_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to create agent from template")


@router.patch("/{template_id}", response_model=AgentTemplate, summary="Update template")
async def update_template(template_id: str, body: UpdateTemplateRequest, request: Request):
    """Update an agent template. Only the owner can update."""
    user_id = await verify_and_get_user_id_from_jwt(request)

    try:
        # Verify ownership
        check_sql = "SELECT id FROM agent_templates WHERE id = :template_id AND user_id::text = :user_id"
        existing = await execute_one(check_sql, {"template_id": template_id, "user_id": user_id})

        if not existing:
            raise HTTPException(status_code=404, detail="Template not found or not owned by you")

        # Build update fields
        updates = []
        params: Dict[str, Any] = {"template_id": template_id, "user_id": user_id}

        if body.template_name is not None:
            updates.append("template_name = :template_name")
            params["template_name"] = body.template_name
        if body.description is not None:
            updates.append("description = :description")
            params["description"] = body.description
        if body.category is not None:
            if body.category not in VALID_CATEGORIES:
                raise HTTPException(status_code=400, detail=f"Invalid category")
            updates.append("category = :category")
            params["category"] = body.category
        if body.agent_config is not None:
            updates.append("agent_config = :agent_config")
            params["agent_config"] = json.dumps(body.agent_config)
        if body.icon is not None:
            updates.append("icon = :icon")
            params["icon"] = body.icon
        if body.is_public is not None:
            updates.append("is_public = :is_public")
            params["is_public"] = body.is_public
        if body.tags is not None:
            updates.append("tags = :tags")
            params["tags"] = body.tags
        if body.preview_images is not None:
            updates.append("preview_images = :preview_images")
            params["preview_images"] = body.preview_images

        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update")

        updates.append("updated_at = now()")
        set_sql = ", ".join(updates)

        sql = f"""
        UPDATE agent_templates
        SET {set_sql}
        WHERE id = :template_id AND user_id::text = :user_id
        RETURNING id, user_id, template_name, description, category,
                  agent_config, icon, is_official, is_public, use_count,
                  tags, preview_images, created_at, updated_at
        """
        row = await execute_one(sql, params)

        return AgentTemplate(
            id=str(row["id"]),
            user_id=str(row["user_id"]) if row["user_id"] else None,
            template_name=row["template_name"],
            description=row["description"],
            category=row["category"],
            agent_config=row["agent_config"] or {},
            icon=row["icon"] or "bot",
            is_official=row["is_official"],
            is_public=row["is_public"],
            use_count=row["use_count"],
            tags=row["tags"] or [],
            preview_images=row["preview_images"] or [],
            created_at=str(row["created_at"]),
            updated_at=str(row["updated_at"]),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating template {template_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to update template")


@router.delete("/{template_id}", summary="Delete template")
async def delete_template(template_id: str, request: Request):
    """Delete an agent template. Only the owner can delete."""
    user_id = await verify_and_get_user_id_from_jwt(request)

    try:
        sql = """
        DELETE FROM agent_templates
        WHERE id = :template_id AND user_id::text = :user_id
        RETURNING id
        """
        result = await execute_one(sql, {"template_id": template_id, "user_id": user_id})

        if not result:
            raise HTTPException(status_code=404, detail="Template not found or not owned by you")

        return {"deleted": True, "template_id": template_id}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting template {template_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete template")


@router.post("/from-agent/{agent_id}", response_model=AgentTemplate, summary="Create template from existing agent")
async def create_template_from_agent(
    agent_id: str,
    body: TemplateFromAgentRequest,
    request: Request,
):
    """Create a template from an existing agent's configuration."""
    user_id = await verify_and_get_user_id_from_jwt(request)

    if body.category not in VALID_CATEGORIES:
        raise HTTPException(status_code=400, detail=f"Invalid category. Must be one of: {', '.join(VALID_CATEGORIES)}")

    try:
        # Fetch agent config
        agent_sql = """
        SELECT agent_id, name, system_prompt, agent_type, model, tools_config, config
        FROM agents
        WHERE agent_id::text = :agent_id AND account_id::text = :user_id
        """
        agent = await execute_one(agent_sql, {"agent_id": agent_id, "user_id": user_id})

        if not agent:
            raise HTTPException(status_code=404, detail="Agent not found or not owned by you")

        # Build agent_config from the agent's data
        agent_config = agent.get("config") or {}
        if isinstance(agent_config, str):
            agent_config = json.loads(agent_config)
        agent_config.update({
            "name": agent["name"],
            "system_prompt": agent.get("system_prompt", ""),
            "agent_type": agent.get("agent_type", "conversational"),
            "model": agent.get("model", ""),
            "tools_config": agent.get("tools_config") or {},
        })

        # Create the template
        sql = """
        INSERT INTO agent_templates (
            user_id, template_name, description, category,
            agent_config, icon, is_public, tags
        ) VALUES (
            :user_id, :template_name, :description, :category,
            :agent_config, :icon, :is_public, :tags
        )
        RETURNING id, created_at, updated_at
        """
        result = await execute_one(sql, {
            "user_id": user_id,
            "template_name": body.template_name,
            "description": body.description,
            "category": body.category,
            "agent_config": json.dumps(agent_config),
            "icon": body.icon,
            "is_public": body.is_public,
            "tags": body.tags,
        })

        return AgentTemplate(
            id=str(result["id"]),
            user_id=str(user_id),
            template_name=body.template_name,
            description=body.description,
            category=body.category,
            agent_config=agent_config,
            icon=body.icon,
            is_public=body.is_public,
            tags=body.tags,
            created_at=str(result["created_at"]),
            updated_at=str(result["updated_at"]),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating template from agent {agent_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to create template from agent")
