"""
A/B Testing API endpoints.

Provides experiment management, result recording, and statistical summaries
for A/B testing agent configurations.
"""

import uuid
import json
from datetime import datetime, timezone
from typing import Optional, Dict, Any

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate, serialize_row, serialize_rows
from core.utils.logger import logger

router = APIRouter(tags=["ab-testing"])


# ============================================================================
# Pydantic Models
# ============================================================================

class CreateExperimentRequest(BaseModel):
    experiment_name: str
    description: Optional[str] = None
    agent_id: str
    variant_a_config: Dict[str, Any] = Field(default_factory=dict)
    variant_b_config: Dict[str, Any] = Field(default_factory=dict)
    traffic_split_pct: Optional[int] = 50


class UpdateExperimentRequest(BaseModel):
    experiment_name: Optional[str] = None
    description: Optional[str] = None
    agent_id: Optional[str] = None
    variant_a_config: Optional[Dict[str, Any]] = None
    variant_b_config: Optional[Dict[str, Any]] = None
    traffic_split_pct: Optional[int] = None
    status: Optional[str] = None
    winner: Optional[str] = None


class StopExperimentRequest(BaseModel):
    winner: Optional[str] = None


class RecordResultRequest(BaseModel):
    variant: str
    metric_name: str
    metric_value: float
    sample_size: Optional[int] = 1


# ============================================================================
# Helpers
# ============================================================================

def _json_dumps(obj: Any) -> str:
    return json.dumps(obj or {})


# ============================================================================
# Endpoints
# ============================================================================

@router.post(
    "/experiments",
    summary="Create A/B experiment",
    operation_id="create_experiment",
)
async def create_experiment(
    body: CreateExperimentRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Create a new A/B experiment."""
    exp_id = str(uuid.uuid4())
    try:
        row = await execute_one(
            """
            INSERT INTO ab_experiments
              (id, user_id, experiment_name, description, agent_id,
               variant_a_config, variant_b_config, traffic_split_pct)
            VALUES
              (:id, :user_id, :experiment_name, :description, :agent_id,
               :variant_a_config::jsonb, :variant_b_config::jsonb, :traffic_split_pct)
            RETURNING *
            """,
            {
                "id": exp_id,
                "user_id": user_id,
                "experiment_name": body.experiment_name,
                "description": body.description,
                "agent_id": body.agent_id,
                "variant_a_config": _json_dumps(body.variant_a_config),
                "variant_b_config": _json_dumps(body.variant_b_config),
                "traffic_split_pct": body.traffic_split_pct,
            },
        )
        return serialize_row(row)
    except Exception as exc:
        logger.error(f"create_experiment error: {exc}")
        raise HTTPException(status_code=500, detail="Failed to create experiment")


@router.get(
    "/experiments",
    summary="List A/B experiments",
    operation_id="list_experiments",
)
async def list_experiments(
    agent_id: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List all experiments, optionally filtered by agent_id and/or status."""
    params: Dict[str, Any] = {"user_id": user_id}
    filters = ""
    if agent_id:
        filters += " AND agent_id = :agent_id"
        params["agent_id"] = agent_id
    if status:
        filters += " AND status = :status"
        params["status"] = status

    rows = await execute(
        f"""
        SELECT * FROM ab_experiments
        WHERE user_id = :user_id{filters}
        ORDER BY created_at DESC
        """,
        params,
    )
    return serialize_rows(rows)


@router.get(
    "/experiments/{experiment_id}",
    summary="Get experiment detail",
    operation_id="get_experiment",
)
async def get_experiment(
    experiment_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get a single experiment by ID."""
    row = await execute_one(
        "SELECT * FROM ab_experiments WHERE id = :id AND user_id = :user_id",
        {"id": experiment_id, "user_id": user_id},
    )
    if not row:
        raise HTTPException(status_code=404, detail="Experiment not found")
    return serialize_row(row)


@router.patch(
    "/experiments/{experiment_id}",
    summary="Update experiment",
    operation_id="update_experiment",
)
async def update_experiment(
    experiment_id: str,
    body: UpdateExperimentRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Update experiment config, status, or winner."""
    existing = await execute_one(
        "SELECT id FROM ab_experiments WHERE id = :id AND user_id = :user_id",
        {"id": experiment_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Experiment not found")

    raw = body.model_dump(exclude_none=True)
    if not raw:
        return serialize_row(
            await execute_one("SELECT * FROM ab_experiments WHERE id = :id", {"id": experiment_id})
        )

    # Serialize JSONB fields
    data: Dict[str, Any] = {}
    for k, v in raw.items():
        if k in ("variant_a_config", "variant_b_config"):
            data[k] = _json_dumps(v)
        else:
            data[k] = v

    set_parts = []
    for k in data:
        if k in ("variant_a_config", "variant_b_config"):
            set_parts.append(f"{k} = :{k}::jsonb")
        else:
            set_parts.append(f"{k} = :{k}")

    set_clause = ", ".join(set_parts)
    data["id"] = experiment_id
    data["user_id"] = user_id

    row = await execute_one(
        f"""
        UPDATE ab_experiments SET {set_clause}
        WHERE id = :id AND user_id = :user_id
        RETURNING *
        """,
        data,
    )
    return serialize_row(row)


@router.delete(
    "/experiments/{experiment_id}",
    summary="Delete experiment",
    operation_id="delete_experiment",
)
async def delete_experiment(
    experiment_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Delete an experiment and all its results."""
    existing = await execute_one(
        "SELECT id FROM ab_experiments WHERE id = :id AND user_id = :user_id",
        {"id": experiment_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Experiment not found")

    await execute_mutate(
        "DELETE FROM ab_experiments WHERE id = :id AND user_id = :user_id",
        {"id": experiment_id, "user_id": user_id},
    )
    return {"deleted": True, "id": experiment_id}


@router.post(
    "/experiments/{experiment_id}/start",
    summary="Start experiment",
    operation_id="start_experiment",
)
async def start_experiment(
    experiment_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Set experiment status to running and record started_at."""
    existing = await execute_one(
        "SELECT id FROM ab_experiments WHERE id = :id AND user_id = :user_id",
        {"id": experiment_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Experiment not found")

    row = await execute_one(
        """
        UPDATE ab_experiments
        SET status = 'running', started_at = now()
        WHERE id = :id AND user_id = :user_id
        RETURNING *
        """,
        {"id": experiment_id, "user_id": user_id},
    )
    return serialize_row(row)


@router.post(
    "/experiments/{experiment_id}/stop",
    summary="Stop experiment",
    operation_id="stop_experiment",
)
async def stop_experiment(
    experiment_id: str,
    body: StopExperimentRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Set experiment status to completed and record ended_at."""
    existing = await execute_one(
        "SELECT id FROM ab_experiments WHERE id = :id AND user_id = :user_id",
        {"id": experiment_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Experiment not found")

    params: Dict[str, Any] = {"id": experiment_id, "user_id": user_id}
    winner_clause = ""
    if body.winner:
        winner_clause = ", winner = :winner"
        params["winner"] = body.winner

    row = await execute_one(
        f"""
        UPDATE ab_experiments
        SET status = 'completed', ended_at = now(){winner_clause}
        WHERE id = :id AND user_id = :user_id
        RETURNING *
        """,
        params,
    )
    return serialize_row(row)


@router.post(
    "/experiments/{experiment_id}/results",
    summary="Record experiment result",
    operation_id="record_experiment_result",
)
async def record_result(
    experiment_id: str,
    body: RecordResultRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Record a metric result for a variant."""
    existing = await execute_one(
        "SELECT id FROM ab_experiments WHERE id = :id AND user_id = :user_id",
        {"id": experiment_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Experiment not found")

    result_id = str(uuid.uuid4())
    try:
        row = await execute_one(
            """
            INSERT INTO ab_experiment_results
              (id, experiment_id, user_id, variant, metric_name, metric_value, sample_size)
            VALUES
              (:id, :experiment_id, :user_id, :variant, :metric_name, :metric_value, :sample_size)
            RETURNING *
            """,
            {
                "id": result_id,
                "experiment_id": experiment_id,
                "user_id": user_id,
                "variant": body.variant,
                "metric_name": body.metric_name,
                "metric_value": body.metric_value,
                "sample_size": body.sample_size,
            },
        )
        return serialize_row(row)
    except Exception as exc:
        logger.error(f"record_result error: {exc}")
        raise HTTPException(status_code=500, detail="Failed to record result")


@router.get(
    "/experiments/{experiment_id}/results",
    summary="List experiment results (aggregated)",
    operation_id="list_experiment_results",
)
async def list_results(
    experiment_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Return aggregated results per variant+metric."""
    existing = await execute_one(
        "SELECT id FROM ab_experiments WHERE id = :id AND user_id = :user_id",
        {"id": experiment_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Experiment not found")

    rows = await execute(
        """
        SELECT
          variant,
          metric_name,
          AVG(metric_value) AS avg_value,
          SUM(sample_size)  AS total_samples
        FROM ab_experiment_results
        WHERE experiment_id = :experiment_id AND user_id = :user_id
        GROUP BY variant, metric_name
        ORDER BY variant, metric_name
        """,
        {"experiment_id": experiment_id, "user_id": user_id},
    )
    return serialize_rows(rows)


@router.get(
    "/experiments/{experiment_id}/summary",
    summary="Experiment comparison summary",
    operation_id="get_experiment_summary",
)
async def get_experiment_summary(
    experiment_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    For each metric compute variant A vs B averages, pct_diff, and suggested_winner.
    suggested_winner: 'b' if pct_diff>5, 'a' if pct_diff<-5, else 'tie'.
    """
    existing = await execute_one(
        "SELECT id FROM ab_experiments WHERE id = :id AND user_id = :user_id",
        {"id": experiment_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Experiment not found")

    rows = await execute(
        """
        SELECT
          metric_name,
          variant,
          AVG(metric_value) AS avg_value
        FROM ab_experiment_results
        WHERE experiment_id = :experiment_id AND user_id = :user_id
        GROUP BY metric_name, variant
        ORDER BY metric_name, variant
        """,
        {"experiment_id": experiment_id, "user_id": user_id},
    )

    # Build per-metric dict
    metrics: Dict[str, Dict[str, float]] = {}
    for r in (rows or []):
        mn = r["metric_name"]
        if mn not in metrics:
            metrics[mn] = {}
        metrics[mn][r["variant"]] = float(r["avg_value"] or 0)

    summary = []
    for metric_name, variants in metrics.items():
        a = variants.get("a", 0.0)
        b = variants.get("b", 0.0)
        pct_diff = ((b - a) / a * 100) if a != 0 else 0.0
        if pct_diff > 5:
            suggested_winner = "b"
        elif pct_diff < -5:
            suggested_winner = "a"
        else:
            suggested_winner = "tie"
        summary.append({
            "metric_name": metric_name,
            "variant_a_avg": round(a, 4),
            "variant_b_avg": round(b, 4),
            "pct_diff": round(pct_diff, 2),
            "suggested_winner": suggested_winner,
        })

    return summary
