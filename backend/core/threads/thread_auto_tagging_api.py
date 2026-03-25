from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate, serialize_rows, serialize_row
from core.utils.logger import logger

router = APIRouter(tags=["thread-auto-tagging"])


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class CreateAutoTagRuleRequest(BaseModel):
    tag_name: str
    rule_type: str
    rule_config: dict
    color: Optional[str] = "#6366f1"


class UpdateAutoTagRuleRequest(BaseModel):
    tag_name: Optional[str] = None
    rule_type: Optional[str] = None
    rule_config: Optional[dict] = None
    color: Optional[str] = None
    is_active: Optional[bool] = None


# ---------------------------------------------------------------------------
# Rule CRUD endpoints
# ---------------------------------------------------------------------------

@router.post("/auto-tags/rules", summary="Create an auto-tag rule")
async def create_rule(
    body: CreateAutoTagRuleRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    valid_types = ('keyword', 'agent', 'tool_used', 'message_count', 'sentiment', 'regex')
    if body.rule_type not in valid_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid rule_type. Must be one of: {', '.join(valid_types)}"
        )

    if not body.tag_name or not body.tag_name.strip():
        raise HTTPException(status_code=400, detail="Tag name is required")

    try:
        row = await execute_one(
            """
            INSERT INTO thread_auto_tag_rules (user_id, tag_name, rule_type, rule_config, color)
            VALUES (:user_id, :tag_name, :rule_type, :rule_config::jsonb, :color)
            RETURNING *
            """,
            {
                "user_id": user_id,
                "tag_name": body.tag_name.strip(),
                "rule_type": body.rule_type,
                "rule_config": body.rule_config,
                "color": body.color or "#6366f1",
            },
            commit=True,
        )
        return serialize_row(dict(row)) if row else {"status": "ok"}
    except Exception as e:
        logger.error(f"Failed to create auto-tag rule: {e}")
        raise HTTPException(status_code=500, detail="Failed to create rule")


@router.get("/auto-tags/rules", summary="List auto-tag rules")
async def list_rules(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    rows = await execute(
        """
        SELECT * FROM thread_auto_tag_rules
        WHERE user_id::text = :user_id
        ORDER BY created_at DESC
        """,
        {"user_id": user_id},
    )
    return serialize_rows([dict(r) for r in rows])


@router.patch("/auto-tags/rules/{rule_id}", summary="Update an auto-tag rule")
async def update_rule(
    rule_id: str,
    body: UpdateAutoTagRuleRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    existing = await execute_one(
        "SELECT id FROM thread_auto_tag_rules WHERE id = :id AND user_id::text = :user_id",
        {"id": rule_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Rule not found")

    if body.rule_type:
        valid_types = ('keyword', 'agent', 'tool_used', 'message_count', 'sentiment', 'regex')
        if body.rule_type not in valid_types:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid rule_type. Must be one of: {', '.join(valid_types)}"
            )

    updates = {}
    params: dict = {"id": rule_id, "user_id": user_id}

    if body.tag_name is not None:
        updates["tag_name"] = body.tag_name.strip()
        params["tag_name"] = body.tag_name.strip()
    if body.rule_type is not None:
        updates["rule_type"] = body.rule_type
        params["rule_type"] = body.rule_type
    if body.rule_config is not None:
        updates["rule_config"] = body.rule_config
        params["rule_config"] = body.rule_config
    if body.color is not None:
        updates["color"] = body.color
        params["color"] = body.color
    if body.is_active is not None:
        updates["is_active"] = body.is_active
        params["is_active"] = body.is_active

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    set_parts = []
    for k in updates:
        if k == "rule_config":
            set_parts.append(f"{k} = :{k}::jsonb")
        else:
            set_parts.append(f"{k} = :{k}")
    set_clause = ", ".join(set_parts)

    try:
        row = await execute_one(
            f"UPDATE thread_auto_tag_rules SET {set_clause} WHERE id = :id AND user_id::text = :user_id RETURNING *",
            params,
            commit=True,
        )
        return serialize_row(dict(row)) if row else {"status": "ok"}
    except Exception as e:
        logger.error(f"Failed to update auto-tag rule: {e}")
        raise HTTPException(status_code=500, detail="Failed to update rule")


@router.delete("/auto-tags/rules/{rule_id}", summary="Delete an auto-tag rule")
async def delete_rule(
    rule_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    existing = await execute_one(
        "SELECT id FROM thread_auto_tag_rules WHERE id = :id AND user_id::text = :user_id",
        {"id": rule_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Rule not found")

    await execute_mutate(
        "DELETE FROM thread_auto_tag_rules WHERE id = :id AND user_id::text = :user_id",
        {"id": rule_id, "user_id": user_id},
    )
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Apply endpoints
# ---------------------------------------------------------------------------

async def _evaluate_rule(rule: dict, thread_id: str, user_id: str) -> bool:
    """Evaluate a single rule against a thread. Returns True if the rule matches."""
    rule_type = rule["rule_type"]
    config = rule.get("rule_config") or {}

    try:
        if rule_type == "keyword":
            keywords = config.get("keywords", [])
            if not keywords:
                return False
            # Check if any keyword appears in thread messages
            for kw in keywords:
                result = await execute_one(
                    """
                    SELECT 1 FROM messages
                    WHERE thread_id::text = :thread_id
                      AND content ILIKE :pattern
                    LIMIT 1
                    """,
                    {"thread_id": thread_id, "pattern": f"%{kw}%"},
                )
                if result:
                    return True
            return False

        elif rule_type == "agent":
            agent_ids = config.get("agent_ids", [])
            if not agent_ids:
                return False
            for agent_id in agent_ids:
                result = await execute_one(
                    """
                    SELECT 1 FROM agent_runs
                    WHERE thread_id::text = :thread_id AND agent_id::text = :agent_id
                    LIMIT 1
                    """,
                    {"thread_id": thread_id, "agent_id": agent_id},
                )
                if result:
                    return True
            return False

        elif rule_type == "tool_used":
            tool_names = config.get("tool_names", [])
            if not tool_names:
                return False
            for tool_name in tool_names:
                result = await execute_one(
                    """
                    SELECT 1 FROM messages
                    WHERE thread_id::text = :thread_id
                      AND role = 'tool'
                      AND content ILIKE :pattern
                    LIMIT 1
                    """,
                    {"thread_id": thread_id, "pattern": f"%{tool_name}%"},
                )
                if result:
                    return True
            return False

        elif rule_type == "message_count":
            min_count = config.get("min", 0)
            max_count = config.get("max")
            count_result = await execute_one(
                "SELECT COUNT(*) as cnt FROM messages WHERE thread_id::text = :thread_id",
                {"thread_id": thread_id},
            )
            count = count_result["cnt"] if count_result else 0
            if count >= min_count:
                if max_count is None or count <= max_count:
                    return True
            return False

        elif rule_type == "regex":
            pattern = config.get("pattern", "")
            if not pattern:
                return False
            result = await execute_one(
                """
                SELECT 1 FROM messages
                WHERE thread_id::text = :thread_id
                  AND content ~ :pattern
                LIMIT 1
                """,
                {"thread_id": thread_id, "pattern": pattern},
            )
            return result is not None

        elif rule_type == "sentiment":
            # Sentiment rules match on metadata; simplified check
            sentiment_value = config.get("sentiment", "")
            if not sentiment_value:
                return False
            result = await execute_one(
                """
                SELECT 1 FROM threads
                WHERE thread_id::text = :thread_id
                  AND metadata->>'sentiment' = :sentiment
                LIMIT 1
                """,
                {"thread_id": thread_id, "sentiment": sentiment_value},
            )
            return result is not None

    except Exception as e:
        logger.warning(f"Error evaluating rule {rule.get('id')} on thread {thread_id}: {e}")
    return False


@router.post("/auto-tags/apply/{thread_id}", summary="Apply auto-tag rules to a thread")
async def apply_auto_tags(
    thread_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    rules = await execute(
        "SELECT * FROM thread_auto_tag_rules WHERE user_id::text = :user_id AND is_active = true",
        {"user_id": user_id},
    )

    applied = 0
    for rule in rules:
        matched = await _evaluate_rule(dict(rule), thread_id, user_id)
        if matched:
            try:
                await execute_one(
                    """
                    INSERT INTO thread_auto_tags (user_id, thread_id, tag_name, rule_id, confidence)
                    VALUES (:user_id, :thread_id, :tag_name, :rule_id, 1.0)
                    ON CONFLICT (user_id, thread_id, tag_name) DO NOTHING
                    RETURNING id
                    """,
                    {
                        "user_id": user_id,
                        "thread_id": thread_id,
                        "tag_name": rule["tag_name"],
                        "rule_id": str(rule["id"]),
                    },
                    commit=True,
                )
                # Increment match count
                await execute_mutate(
                    "UPDATE thread_auto_tag_rules SET match_count = match_count + 1 WHERE id = :id",
                    {"id": str(rule["id"])},
                )
                applied += 1
            except Exception as e:
                logger.warning(f"Failed to apply auto-tag for rule {rule['id']}: {e}")

    return {"status": "ok", "applied": applied, "rules_evaluated": len(rules)}


@router.post("/auto-tags/apply-all", summary="Apply auto-tag rules to recent threads")
async def apply_all_auto_tags(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    # Get recent threads (last 50)
    threads = await execute(
        """
        SELECT thread_id FROM threads
        WHERE account_id::text = :user_id
        ORDER BY created_at DESC
        LIMIT 50
        """,
        {"user_id": user_id},
    )

    rules = await execute(
        "SELECT * FROM thread_auto_tag_rules WHERE user_id::text = :user_id AND is_active = true",
        {"user_id": user_id},
    )

    total_applied = 0
    threads_processed = 0

    for thread in threads:
        thread_id = str(thread["thread_id"])
        threads_processed += 1
        for rule in rules:
            matched = await _evaluate_rule(dict(rule), thread_id, user_id)
            if matched:
                try:
                    result = await execute_one(
                        """
                        INSERT INTO thread_auto_tags (user_id, thread_id, tag_name, rule_id, confidence)
                        VALUES (:user_id, :thread_id, :tag_name, :rule_id, 1.0)
                        ON CONFLICT (user_id, thread_id, tag_name) DO NOTHING
                        RETURNING id
                        """,
                        {
                            "user_id": user_id,
                            "thread_id": thread_id,
                            "tag_name": rule["tag_name"],
                            "rule_id": str(rule["id"]),
                        },
                        commit=True,
                    )
                    if result:
                        await execute_mutate(
                            "UPDATE thread_auto_tag_rules SET match_count = match_count + 1 WHERE id = :id",
                            {"id": str(rule["id"])},
                        )
                        total_applied += 1
                except Exception as e:
                    logger.warning(f"Failed to apply auto-tag: {e}")

    return {
        "status": "ok",
        "threads_processed": threads_processed,
        "tags_applied": total_applied,
    }


# ---------------------------------------------------------------------------
# Query endpoints
# ---------------------------------------------------------------------------

@router.get("/auto-tags/threads/{thread_id}", summary="Get auto-tags for a thread")
async def get_thread_auto_tags(
    thread_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    rows = await execute(
        """
        SELECT t.*, r.rule_type, r.color
        FROM thread_auto_tags t
        LEFT JOIN thread_auto_tag_rules r ON r.id::text = t.rule_id::text
        WHERE t.user_id::text = :user_id AND t.thread_id::text = :thread_id
        ORDER BY t.applied_at DESC
        """,
        {"user_id": user_id, "thread_id": thread_id},
    )
    return serialize_rows([dict(r) for r in rows])


@router.get("/auto-tags/stats", summary="Get auto-tag statistics")
async def get_auto_tag_stats(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    # Tag distribution
    distribution = await execute(
        """
        SELECT tag_name, COUNT(*) as count
        FROM thread_auto_tags
        WHERE user_id::text = :user_id
        GROUP BY tag_name
        ORDER BY count DESC
        LIMIT 20
        """,
        {"user_id": user_id},
    )

    # Top rules by match count
    top_rules = await execute(
        """
        SELECT tag_name, rule_type, match_count, color
        FROM thread_auto_tag_rules
        WHERE user_id::text = :user_id
        ORDER BY match_count DESC
        LIMIT 10
        """,
        {"user_id": user_id},
    )

    total_tags = await execute_one(
        "SELECT COUNT(*) as cnt FROM thread_auto_tags WHERE user_id::text = :user_id",
        {"user_id": user_id},
    )

    total_rules = await execute_one(
        "SELECT COUNT(*) as cnt FROM thread_auto_tag_rules WHERE user_id::text = :user_id",
        {"user_id": user_id},
    )

    return {
        "total_tags_applied": total_tags["cnt"] if total_tags else 0,
        "total_rules": total_rules["cnt"] if total_rules else 0,
        "tag_distribution": serialize_rows([dict(d) for d in distribution]),
        "top_rules": serialize_rows([dict(r) for r in top_rules]),
    }
