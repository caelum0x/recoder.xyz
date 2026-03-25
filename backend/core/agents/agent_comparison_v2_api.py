"""
Agent Comparison V2 API.

Provides CRUD for user-defined agent comparisons with custom metric snapshots.
Supports recording arbitrary numeric metrics per agent and computing per-metric summaries.
"""

from fastapi import APIRouter, Request, HTTPException
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate, serialize_row, serialize_rows
import json
from collections import defaultdict

router = APIRouter(tags=["agent-comparison-v2"])


# ============================================================================
# Helpers
# ============================================================================

def _serialize_comparison(row: dict, snapshots: list | None = None) -> dict:
    agent_ids = row.get("agent_ids") or []
    comparison_metrics = row.get("comparison_metrics") or []
    result = {
        "id": str(row["id"]),
        "user_id": str(row["user_id"]),
        "comparison_name": row["comparison_name"],
        "agent_ids": list(agent_ids),
        "comparison_metrics": list(comparison_metrics),
        "notes": row.get("notes"),
        "created_at": str(row["created_at"]),
    }
    if snapshots is not None:
        result["snapshots"] = snapshots
    return result


def _serialize_snapshot(row: dict) -> dict:
    return {
        "id": str(row["id"]),
        "comparison_id": str(row["comparison_id"]),
        "user_id": str(row["user_id"]),
        "agent_id": row["agent_id"],
        "metric_name": row["metric_name"],
        "metric_value": float(row["metric_value"]),
        "captured_at": str(row["captured_at"]),
    }


# ============================================================================
# Routes
# ============================================================================

@router.post("/agent-comparisons", summary="Create agent comparison")
async def create_agent_comparison(request: Request):
    user_id = verify_and_get_user_id_from_jwt(request)
    body = await request.json()

    comparison_name = body.get("comparison_name", "").strip()
    if not comparison_name:
        raise HTTPException(status_code=400, detail="comparison_name is required")

    agent_ids = body.get("agent_ids", [])
    if not isinstance(agent_ids, list) or len(agent_ids) == 0:
        raise HTTPException(status_code=400, detail="agent_ids must be a non-empty list")

    comparison_metrics = body.get("comparison_metrics", [])
    if not isinstance(comparison_metrics, list):
        comparison_metrics = []

    try:
        row = await execute_one(
            """
            INSERT INTO agent_comparisons
                (user_id, comparison_name, agent_ids, comparison_metrics, notes)
            VALUES
                (:user_id, :comparison_name, :agent_ids, :comparison_metrics, :notes)
            RETURNING *
            """,
            {
                "user_id": user_id,
                "comparison_name": comparison_name,
                "agent_ids": agent_ids,
                "comparison_metrics": comparison_metrics,
                "notes": body.get("notes"),
            },
        )
        return _serialize_comparison(row)
    except HTTPException:
        raise
    except Exception as e:
        if "unique" in str(e).lower():
            raise HTTPException(status_code=409, detail="A comparison with this name already exists")
        raise HTTPException(status_code=500, detail="Failed to create comparison")


@router.get("/agent-comparisons", summary="List agent comparisons")
async def list_agent_comparisons(request: Request):
    user_id = verify_and_get_user_id_from_jwt(request)

    try:
        rows = await execute(
            """
            SELECT * FROM agent_comparisons
            WHERE user_id::text = :user_id
            ORDER BY created_at DESC
            """,
            {"user_id": user_id},
        )
        return [_serialize_comparison(r) for r in (rows or [])]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to list comparisons")


@router.get("/agent-comparisons/{comparison_id}", summary="Get agent comparison with snapshots")
async def get_agent_comparison(comparison_id: str, request: Request):
    user_id = verify_and_get_user_id_from_jwt(request)

    try:
        row = await execute_one(
            "SELECT * FROM agent_comparisons WHERE id = :id AND user_id::text = :user_id",
            {"id": comparison_id, "user_id": user_id},
        )
        if not row:
            raise HTTPException(status_code=404, detail="Comparison not found")

        snapshot_rows = await execute(
            """
            SELECT * FROM comparison_metric_snapshots
            WHERE comparison_id::text = :comparison_id
            ORDER BY agent_id, metric_name, captured_at DESC
            """,
            {"comparison_id": comparison_id},
        )
        snapshots = [_serialize_snapshot(s) for s in (snapshot_rows or [])]
        return _serialize_comparison(row, snapshots=snapshots)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to get comparison")


@router.patch("/agent-comparisons/{comparison_id}", summary="Update agent comparison")
async def update_agent_comparison(comparison_id: str, request: Request):
    user_id = verify_and_get_user_id_from_jwt(request)
    body = await request.json()

    try:
        existing = await execute_one(
            "SELECT * FROM agent_comparisons WHERE id = :id AND user_id::text = :user_id",
            {"id": comparison_id, "user_id": user_id},
        )
        if not existing:
            raise HTTPException(status_code=404, detail="Comparison not found")

        updates = []
        params: dict = {"id": comparison_id, "user_id": user_id}

        if "comparison_name" in body:
            updates.append("comparison_name = :comparison_name")
            params["comparison_name"] = body["comparison_name"]
        if "notes" in body:
            updates.append("notes = :notes")
            params["notes"] = body["notes"]
        if "comparison_metrics" in body:
            updates.append("comparison_metrics = :comparison_metrics")
            params["comparison_metrics"] = body["comparison_metrics"]
        if "agent_ids" in body:
            updates.append("agent_ids = :agent_ids")
            params["agent_ids"] = body["agent_ids"]

        if not updates:
            return _serialize_comparison(existing)

        row = await execute_one(
            f"UPDATE agent_comparisons SET {', '.join(updates)} WHERE id = :id AND user_id::text = :user_id RETURNING *",
            params,
        )
        return _serialize_comparison(row)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to update comparison")


@router.delete("/agent-comparisons/{comparison_id}", summary="Delete agent comparison")
async def delete_agent_comparison(comparison_id: str, request: Request):
    user_id = verify_and_get_user_id_from_jwt(request)

    try:
        row = await execute_one(
            "DELETE FROM agent_comparisons WHERE id = :id AND user_id::text = :user_id RETURNING id",
            {"id": comparison_id, "user_id": user_id},
        )
        if not row:
            raise HTTPException(status_code=404, detail="Comparison not found")
        return {"deleted": True, "comparison_id": str(row["id"])}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to delete comparison")


@router.post("/agent-comparisons/{comparison_id}/metrics", summary="Record metric snapshot")
async def record_comparison_metric(comparison_id: str, request: Request):
    user_id = verify_and_get_user_id_from_jwt(request)
    body = await request.json()

    agent_id = body.get("agent_id", "").strip()
    metric_name = body.get("metric_name", "").strip()
    metric_value = body.get("metric_value")

    if not agent_id:
        raise HTTPException(status_code=400, detail="agent_id is required")
    if not metric_name:
        raise HTTPException(status_code=400, detail="metric_name is required")
    if metric_value is None:
        raise HTTPException(status_code=400, detail="metric_value is required")

    try:
        metric_value = float(metric_value)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="metric_value must be a number")

    try:
        exists = await execute_one(
            "SELECT id FROM agent_comparisons WHERE id = :id AND user_id::text = :user_id",
            {"id": comparison_id, "user_id": user_id},
        )
        if not exists:
            raise HTTPException(status_code=404, detail="Comparison not found")

        row = await execute_one(
            """
            INSERT INTO comparison_metric_snapshots
                (comparison_id, user_id, agent_id, metric_name, metric_value)
            VALUES
                (:comparison_id, :user_id, :agent_id, :metric_name, :metric_value)
            RETURNING *
            """,
            {
                "comparison_id": comparison_id,
                "user_id": user_id,
                "agent_id": agent_id,
                "metric_name": metric_name,
                "metric_value": metric_value,
            },
        )
        return _serialize_snapshot(row)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to record metric")


@router.get("/agent-comparisons/{comparison_id}/summary", summary="Get comparison metric summary")
async def get_comparison_summary(comparison_id: str, request: Request):
    user_id = verify_and_get_user_id_from_jwt(request)

    try:
        exists = await execute_one(
            "SELECT id FROM agent_comparisons WHERE id = :id AND user_id::text = :user_id",
            {"id": comparison_id, "user_id": user_id},
        )
        if not exists:
            raise HTTPException(status_code=404, detail="Comparison not found")

        # Aggregate: average metric_value per (metric_name, agent_id)
        rows = await execute(
            """
            SELECT metric_name, agent_id, AVG(metric_value) AS avg_value
            FROM comparison_metric_snapshots
            WHERE comparison_id::text = :comparison_id
            GROUP BY metric_name, agent_id
            """,
            {"comparison_id": comparison_id},
        )

        # Build: { metric_name: { agent_id: avg_value, ..., best_agent_id: "..." } }
        by_metric: dict[str, dict] = defaultdict(dict)
        for r in (rows or []):
            metric = r["metric_name"]
            agent = r["agent_id"]
            by_metric[metric][agent] = round(float(r["avg_value"]), 4)

        summary: dict = {}
        for metric, agent_values in by_metric.items():
            if not agent_values:
                continue
            best_agent_id = max(agent_values, key=lambda k: agent_values[k])
            summary[metric] = {**agent_values, "best_agent_id": best_agent_id}

        return summary
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to get comparison summary")
