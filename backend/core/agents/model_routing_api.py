from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate, serialize_row, serialize_rows

router = APIRouter(tags=["model-routing"])


class CreateRoutingRuleRequest(BaseModel):
    name: str
    priority: int = 0
    condition_type: str
    condition_value: dict = {}
    target_model: str


class UpdateRoutingRuleRequest(BaseModel):
    name: Optional[str] = None
    priority: Optional[int] = None
    condition_type: Optional[str] = None
    condition_value: Optional[dict] = None
    target_model: Optional[str] = None
    is_active: Optional[bool] = None


class EvaluateRoutingRequest(BaseModel):
    message: str


VALID_CONDITION_TYPES = {'message_length', 'keyword', 'time_of_day', 'cost_threshold', 'complexity', 'fallback'}


@router.post("/agents/{agent_id}/routing-rules", summary="Create a routing rule")
async def create_routing_rule(
    agent_id: str,
    body: CreateRoutingRuleRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    if body.condition_type not in VALID_CONDITION_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid condition_type. Must be one of: {', '.join(sorted(VALID_CONDITION_TYPES))}"
        )

    row = await execute_one(
        """
        INSERT INTO model_routing_rules (user_id, agent_id, name, priority, condition_type, condition_value, target_model)
        VALUES (:user_id, :agent_id, :name, :priority, :condition_type, :condition_value, :target_model)
        RETURNING *
        """,
        {
            "user_id": user_id,
            "agent_id": agent_id,
            "name": body.name,
            "priority": body.priority,
            "condition_type": body.condition_type,
            "condition_value": body.condition_value,
            "target_model": body.target_model,
        },
        commit=True,
    )
    if not row:
        raise HTTPException(status_code=500, detail="Failed to create routing rule")
    return serialize_row(dict(row))


@router.get("/agents/{agent_id}/routing-rules", summary="List routing rules")
async def list_routing_rules(
    agent_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    rows = await execute(
        """
        SELECT * FROM model_routing_rules
        WHERE agent_id::text = :agent_id AND user_id::text = :user_id
        ORDER BY priority DESC, created_at ASC
        """,
        {"agent_id": agent_id, "user_id": user_id},
    )
    return serialize_rows([dict(r) for r in rows])


@router.patch("/agents/{agent_id}/routing-rules/{rule_id}", summary="Update a routing rule")
async def update_routing_rule(
    agent_id: str,
    rule_id: str,
    body: UpdateRoutingRuleRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    if "condition_type" in updates and updates["condition_type"] not in VALID_CONDITION_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid condition_type. Must be one of: {', '.join(sorted(VALID_CONDITION_TYPES))}"
        )

    set_clauses = []
    params = {"rule_id": rule_id, "agent_id": agent_id, "user_id": user_id}

    for key, value in updates.items():
        set_clauses.append(f"{key} = :{key}")
        params[key] = value

    set_sql = ", ".join(set_clauses)

    row = await execute_one(
        f"""
        UPDATE model_routing_rules
        SET {set_sql}
        WHERE id = :rule_id AND agent_id::text = :agent_id AND user_id::text = :user_id
        RETURNING *
        """,
        params,
        commit=True,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Routing rule not found")
    return serialize_row(dict(row))


@router.delete("/agents/{agent_id}/routing-rules/{rule_id}", summary="Delete a routing rule")
async def delete_routing_rule(
    agent_id: str,
    rule_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    rows = await execute_mutate(
        """
        DELETE FROM model_routing_rules
        WHERE id = :rule_id AND agent_id::text = :agent_id AND user_id::text = :user_id
        RETURNING id
        """,
        {"rule_id": rule_id, "agent_id": agent_id, "user_id": user_id},
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Routing rule not found")
    return {"status": "ok"}


def _evaluate_rule(rule: dict, message: str) -> bool:
    """Check if a single routing rule matches the given message."""
    condition_type = rule["condition_type"]
    condition_value = rule.get("condition_value") or {}

    if condition_type == "message_length":
        length = len(message)
        min_len = condition_value.get("min", 0)
        max_len = condition_value.get("max", float("inf"))
        return min_len <= length <= max_len

    elif condition_type == "keyword":
        keywords = condition_value.get("keywords", [])
        message_lower = message.lower()
        return any(kw.lower() in message_lower for kw in keywords)

    elif condition_type == "time_of_day":
        current_hour = datetime.now(timezone.utc).hour
        start_hour = condition_value.get("start", 0)
        end_hour = condition_value.get("end", 23)
        if start_hour <= end_hour:
            return start_hour <= current_hour <= end_hour
        else:
            # Wrap-around (e.g., 22-6)
            return current_hour >= start_hour or current_hour <= end_hour

    elif condition_type == "cost_threshold":
        # Cost threshold is a policy rule; always matches if present
        return True

    elif condition_type == "complexity":
        word_count = len(message.split())
        level = condition_value.get("level", "medium")
        if level == "simple":
            return word_count < 20
        elif level == "medium":
            return 20 <= word_count <= 100
        elif level == "complex":
            return word_count > 100
        return False

    elif condition_type == "fallback":
        return True

    return False


@router.post("/agents/{agent_id}/routing-rules/evaluate", summary="Evaluate routing rules against input")
async def evaluate_routing(
    agent_id: str,
    body: EvaluateRoutingRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    rows = await execute(
        """
        SELECT * FROM model_routing_rules
        WHERE agent_id::text = :agent_id AND user_id::text = :user_id AND is_active = true
        ORDER BY priority DESC, created_at ASC
        """,
        {"agent_id": agent_id, "user_id": user_id},
    )

    for row in rows:
        rule = dict(row)
        if _evaluate_rule(rule, body.message):
            # Increment hit count
            await execute_mutate(
                "UPDATE model_routing_rules SET hit_count = hit_count + 1 WHERE id = :rule_id",
                {"rule_id": rule["id"]},
            )
            return {
                "matched": True,
                "rule_id": str(rule["id"]),
                "rule_name": rule["name"],
                "target_model": rule["target_model"],
                "condition_type": rule["condition_type"],
            }

    return {"matched": False, "rule_id": None, "rule_name": None, "target_model": None, "condition_type": None}


@router.get("/agents/{agent_id}/routing-rules/stats", summary="Get routing rule stats")
async def get_routing_stats(
    agent_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    rows = await execute(
        """
        SELECT id, name, condition_type, target_model, hit_count, is_active
        FROM model_routing_rules
        WHERE agent_id::text = :agent_id AND user_id::text = :user_id
        ORDER BY hit_count DESC
        """,
        {"agent_id": agent_id, "user_id": user_id},
    )
    return serialize_rows([dict(r) for r in rows])
