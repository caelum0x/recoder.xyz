import json
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Optional, List
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate
from core.utils.logger import logger

router = APIRouter(prefix="/trigger-templates", tags=["trigger-templates"])


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class TriggerTemplateCreate(BaseModel):
    name: str
    description: Optional[str] = None
    category: str = Field(..., pattern=r"^(monitoring|reporting|data_sync|maintenance|alerts|custom)$")
    trigger_type: str = Field(..., pattern=r"^(schedule|event|condition)$")
    config_template: dict
    icon: str = "zap"


class TriggerTemplateApply(BaseModel):
    agent_id: str
    overrides: Optional[dict] = None


class TriggerTemplateOut(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    category: str
    trigger_type: str
    config_template: dict
    icon: str
    is_builtin: bool
    user_id: Optional[str] = None
    usage_count: int
    created_at: str


# ---------------------------------------------------------------------------
# Built-in template definitions
# ---------------------------------------------------------------------------

BUILTIN_TEMPLATES = [
    {
        "name": "Hourly Health Check",
        "description": "Run a health check every hour and report status",
        "category": "monitoring",
        "trigger_type": "schedule",
        "config_template": {
            "cron": "0 * * * *",
            "input": "Run health check and report status",
            "timezone": "UTC",
        },
        "icon": "heart-pulse",
    },
    {
        "name": "Daily Summary Report",
        "description": "Generate a daily summary report every morning at 9 AM",
        "category": "reporting",
        "trigger_type": "schedule",
        "config_template": {
            "cron": "0 9 * * *",
            "input": "Generate daily summary report",
            "timezone": "UTC",
        },
        "icon": "file-text",
    },
    {
        "name": "Weekly Analytics Digest",
        "description": "Generate a weekly analytics digest every Monday at 10 AM",
        "category": "reporting",
        "trigger_type": "schedule",
        "config_template": {
            "cron": "0 10 * * 1",
            "input": "Generate weekly analytics digest",
            "timezone": "UTC",
        },
        "icon": "bar-chart-3",
    },
    {
        "name": "Error Alert Monitor",
        "description": "Alert when error count exceeds a configurable threshold",
        "category": "alerts",
        "trigger_type": "condition",
        "config_template": {
            "condition": "error_count > threshold",
            "threshold": 10,
            "check_interval_minutes": 5,
            "input": "Check error count and alert if above threshold",
        },
        "icon": "alert-triangle",
    },
    {
        "name": "Cost Budget Alert",
        "description": "Alert when daily cost exceeds configured budget",
        "category": "alerts",
        "trigger_type": "condition",
        "config_template": {
            "condition": "daily_cost > budget",
            "budget": 10.0,
            "check_interval_minutes": 15,
            "input": "Check daily cost and alert if above budget",
        },
        "icon": "dollar-sign",
    },
    {
        "name": "Data Sync Hourly",
        "description": "Sync data from configured sources every hour",
        "category": "data_sync",
        "trigger_type": "schedule",
        "config_template": {
            "cron": "0 * * * *",
            "input": "Sync data from configured sources",
            "timezone": "UTC",
        },
        "icon": "refresh-cw",
    },
]


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("", summary="List Trigger Templates", operation_id="list_trigger_templates")
async def list_trigger_templates(
    category: Optional[str] = Query(None, description="Filter by category"),
    trigger_type: Optional[str] = Query(None, description="Filter by trigger type"),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List all trigger templates (built-in + user-created)."""
    conditions = ["(is_builtin = true OR user_id::text = :user_id)"]
    params: dict = {"user_id": user_id}

    if category:
        conditions.append("category = :category")
        params["category"] = category

    if trigger_type:
        conditions.append("trigger_type = :trigger_type")
        params["trigger_type"] = trigger_type

    where_clause = " AND ".join(conditions)
    query = f"""
        SELECT id, name, description, category, trigger_type, config_template,
               icon, is_builtin, user_id, usage_count, created_at::text
        FROM trigger_templates
        WHERE {where_clause}
        ORDER BY is_builtin DESC, usage_count DESC, created_at DESC
    """
    rows = await execute(query, params)
    return [dict(r) for r in rows]


@router.post("/seed", summary="Seed Built-in Templates", operation_id="seed_trigger_templates")
async def seed_trigger_templates(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Seed the built-in trigger templates (idempotent)."""

    seeded = 0
    for tpl in BUILTIN_TEMPLATES:
        existing = await execute_one(
            "SELECT id FROM trigger_templates WHERE name = :name AND is_builtin = true",
            {"name": tpl["name"]},
        )
        if existing:
            continue

        await execute_mutate(
            """
            INSERT INTO trigger_templates (name, description, category, trigger_type, config_template, icon, is_builtin, user_id)
            VALUES (:name, :description, :category, :trigger_type, CAST(:config_template AS jsonb), :icon, true, NULL)
            """,
            {
                "name": tpl["name"],
                "description": tpl["description"],
                "category": tpl["category"],
                "trigger_type": tpl["trigger_type"],
                "config_template": json.dumps(tpl["config_template"]),
                "icon": tpl["icon"],
            },
        )
        seeded += 1

    return {"status": "ok", "seeded": seeded, "total_builtin": len(BUILTIN_TEMPLATES)}


@router.get("/{template_id}", summary="Get Trigger Template", operation_id="get_trigger_template")
async def get_trigger_template(
    template_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get a specific trigger template by ID."""
    row = await execute_one(
        """
        SELECT id, name, description, category, trigger_type, config_template,
               icon, is_builtin, user_id, usage_count, created_at::text
        FROM trigger_templates
        WHERE id = :template_id AND (is_builtin = true OR user_id::text = :user_id)
        """,
        {"template_id": template_id, "user_id": user_id},
    )
    if not row:
        raise HTTPException(status_code=404, detail="Template not found")
    return dict(row)


@router.post("", summary="Create Trigger Template", operation_id="create_trigger_template")
async def create_trigger_template(
    body: TriggerTemplateCreate,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Create a custom trigger template."""
    row = await execute_one(
        """
        INSERT INTO trigger_templates (name, description, category, trigger_type, config_template, icon, is_builtin, user_id)
        VALUES (:name, :description, :category, :trigger_type, :config_template::jsonb, :icon, false, :user_id)
        RETURNING id, name, description, category, trigger_type, config_template,
                  icon, is_builtin, user_id, usage_count, created_at::text
        """,
        {
            "name": body.name,
            "description": body.description,
            "category": body.category,
            "trigger_type": body.trigger_type,
            "config_template": json.dumps(body.config_template),
            "icon": body.icon,
            "user_id": user_id,
        },
    )
    return dict(row)


@router.post("/{template_id}/apply", summary="Apply Trigger Template", operation_id="apply_trigger_template")
async def apply_trigger_template(
    template_id: str,
    body: TriggerTemplateApply,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Apply a trigger template to an agent, creating the actual trigger/schedule."""

    # Fetch the template
    template = await execute_one(
        """
        SELECT id, name, description, category, trigger_type, config_template, icon
        FROM trigger_templates
        WHERE id = :template_id AND (is_builtin = true OR user_id::text = :user_id)
        """,
        {"template_id": template_id, "user_id": user_id},
    )
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    config = dict(template["config_template"])
    # Merge any overrides from the request
    if body.overrides:
        config.update(body.overrides)

    # Increment usage count
    await execute_mutate(
        "UPDATE trigger_templates SET usage_count = usage_count + 1 WHERE id = :template_id",
        {"template_id": template_id},
    )

    trigger_type = template["trigger_type"]

    if trigger_type == "schedule":
        # Create a scheduled trigger via the agent_schedules table
        cron_expr = config.get("cron", "0 * * * *")
        trigger_input = config.get("input", "")
        tz = config.get("timezone", "UTC")

        row = await execute_one(
            """
            INSERT INTO agent_schedules (user_id, agent_id, name, cron_expression, input_message, timezone, is_active)
            VALUES (:user_id, :agent_id, :name, :cron, :input_msg, :tz, true)
            RETURNING id, name, cron_expression, input_message, timezone, is_active, created_at::text
            """,
            {
                "user_id": user_id,
                "agent_id": body.agent_id,
                "name": template["name"],
                "cron": cron_expr,
                "input_msg": trigger_input,
                "tz": tz,
            },
        )
        return {
            "status": "applied",
            "trigger_type": "schedule",
            "template_name": template["name"],
            "created": dict(row) if row else None,
        }

    else:
        # For condition/event types, store as a webhook-type trigger in agent_triggers
        # (agent_trigger_type enum does not include 'condition'/'event', webhook is the generic type)
        # The actual template trigger type is stored in the config for reference.
        config["_template_trigger_type"] = trigger_type
        row = await execute_one(
            """
            INSERT INTO agent_triggers (agent_id, trigger_type, name, description, config, is_active)
            VALUES (:agent_id::uuid, 'webhook', :name, :description, :config::jsonb, true)
            RETURNING trigger_id, name, trigger_type, config, is_active, created_at::text
            """,
            {
                "agent_id": body.agent_id,
                "name": template["name"],
                "description": template.get("description") or "",
                "config": json.dumps(config),
            },
        )
        return {
            "status": "applied",
            "trigger_type": trigger_type,
            "template_name": template["name"],
            "created": dict(row) if row else None,
        }
