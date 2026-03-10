from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one
from core.utils.logger import logger
import math

router = APIRouter(tags=["agent-ab-tests"])


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class CreateAbTestRequest(BaseModel):
    name: str
    description: Optional[str] = None
    agent_a_id: str
    agent_b_id: str
    metric: Optional[str] = "success_rate"
    total_trials: Optional[int] = 20


class UpdateAbTestRequest(BaseModel):
    status: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None


class RecordTrialRequest(BaseModel):
    variant: str  # 'A' or 'B'
    agent_id: str
    thread_id: Optional[str] = None
    input_message: Optional[str] = None
    success: Optional[bool] = None
    latency_ms: Optional[int] = None
    cost: Optional[float] = None
    tokens_used: Optional[int] = None
    user_rating: Optional[int] = None


# ---------------------------------------------------------------------------
# Statistical helpers
# ---------------------------------------------------------------------------

def _z_test_proportions(successes_a: int, n_a: int, successes_b: int, n_b: int) -> dict:
    """Simple two-proportion z-test for success rates."""
    if n_a == 0 or n_b == 0:
        return {"z_score": 0, "p_value": 1.0, "significant": False}

    p_a = successes_a / n_a
    p_b = successes_b / n_b
    p_pool = (successes_a + successes_b) / (n_a + n_b)

    if p_pool == 0 or p_pool == 1:
        return {"z_score": 0, "p_value": 1.0, "significant": False}

    se = math.sqrt(p_pool * (1 - p_pool) * (1 / n_a + 1 / n_b))
    if se == 0:
        return {"z_score": 0, "p_value": 1.0, "significant": False}

    z = (p_a - p_b) / se
    # Approximate two-tailed p-value using standard normal CDF
    p_value = 2 * (1 - _normal_cdf(abs(z)))
    return {
        "z_score": round(z, 4),
        "p_value": round(p_value, 4),
        "significant": p_value < 0.05,
    }


def _normal_cdf(x: float) -> float:
    """Approximate standard normal CDF using error function approximation."""
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


def _compute_confidence(p_value: float) -> float:
    """Convert p-value to a confidence percentage."""
    return round(max(0, min(100, (1 - p_value) * 100)), 1)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/ab-tests", summary="Create A/B test")
async def create_ab_test(
    body: CreateAbTestRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    if body.metric and body.metric not in ("success_rate", "latency", "cost", "user_rating"):
        raise HTTPException(status_code=400, detail="Invalid metric")
    if body.total_trials and (body.total_trials < 2 or body.total_trials > 1000):
        raise HTTPException(status_code=400, detail="total_trials must be between 2 and 1000")

    row = await execute_one(
        """
        INSERT INTO agent_ab_tests (
            user_id, name, description, agent_a_id, agent_b_id, metric, total_trials
        ) VALUES (
            :user_id, :name, :description, :agent_a_id, :agent_b_id, :metric, :total_trials
        )
        RETURNING *
        """,
        {
            "user_id": user_id,
            "name": body.name,
            "description": body.description,
            "agent_a_id": body.agent_a_id,
            "agent_b_id": body.agent_b_id,
            "metric": body.metric or "success_rate",
            "total_trials": body.total_trials or 20,
        },
    )
    return dict(row)


@router.get("/ab-tests", summary="List user's A/B tests")
async def list_ab_tests(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
    status: Optional[str] = Query(None),
):
    where = "user_id = :user_id"
    params: dict = {"user_id": user_id}

    if status:
        where += " AND status = :status"
        params["status"] = status

    rows = await execute(
        f"""
        SELECT * FROM agent_ab_tests
        WHERE {where}
        ORDER BY created_at DESC
        """,
        params,
    )
    return [dict(r) for r in rows]


@router.get("/ab-tests/{test_id}", summary="Get A/B test detail")
async def get_ab_test(
    test_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    test = await execute_one(
        "SELECT * FROM agent_ab_tests WHERE id = :id AND user_id = :user_id",
        {"id": test_id, "user_id": user_id},
    )
    if not test:
        raise HTTPException(status_code=404, detail="A/B test not found")

    trials = await execute(
        "SELECT * FROM ab_test_trials WHERE test_id = :test_id ORDER BY created_at DESC",
        {"test_id": test_id},
    )

    result = dict(test)
    result["trials"] = [dict(t) for t in trials]
    return result


@router.patch("/ab-tests/{test_id}", summary="Update A/B test")
async def update_ab_test(
    test_id: str,
    body: UpdateAbTestRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    existing = await execute_one(
        "SELECT * FROM agent_ab_tests WHERE id = :id AND user_id = :user_id",
        {"id": test_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="A/B test not found")

    updates = {}
    params = {"id": test_id, "user_id": user_id}

    if body.name is not None:
        updates["name"] = body.name
        params["name"] = body.name
    if body.description is not None:
        updates["description"] = body.description
        params["description"] = body.description
    if body.status is not None:
        if body.status not in ("draft", "running", "completed", "cancelled"):
            raise HTTPException(status_code=400, detail="Invalid status")

        # Set started_at when transitioning to running
        if body.status == "running" and existing["status"] == "draft":
            updates["started_at"] = datetime.now(timezone.utc).isoformat()
            params["started_at"] = updates["started_at"]

        # Set completed_at when completing or cancelling
        if body.status in ("completed", "cancelled"):
            updates["completed_at"] = datetime.now(timezone.utc).isoformat()
            params["completed_at"] = updates["completed_at"]

        updates["status"] = body.status
        params["status"] = body.status

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    set_clauses = ", ".join(f"{k} = :{k}" for k in updates)
    row = await execute_one(
        f"UPDATE agent_ab_tests SET {set_clauses} WHERE id = :id AND user_id = :user_id RETURNING *",
        params,
    )
    return dict(row)


@router.delete("/ab-tests/{test_id}", summary="Delete A/B test")
async def delete_ab_test(
    test_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    existing = await execute_one(
        "SELECT id FROM agent_ab_tests WHERE id = :id AND user_id = :user_id",
        {"id": test_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="A/B test not found")

    await execute(
        "DELETE FROM agent_ab_tests WHERE id = :id AND user_id = :user_id",
        {"id": test_id, "user_id": user_id},
    )
    return {"status": "ok"}


@router.post("/ab-tests/{test_id}/trials", summary="Record a trial result")
async def record_trial(
    test_id: str,
    body: RecordTrialRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    test = await execute_one(
        "SELECT * FROM agent_ab_tests WHERE id = :id AND user_id = :user_id",
        {"id": test_id, "user_id": user_id},
    )
    if not test:
        raise HTTPException(status_code=404, detail="A/B test not found")

    if test["status"] != "running":
        raise HTTPException(status_code=400, detail="Test must be running to record trials")

    if body.variant not in ("A", "B"):
        raise HTTPException(status_code=400, detail="Variant must be 'A' or 'B'")

    if body.user_rating is not None and (body.user_rating < 1 or body.user_rating > 5):
        raise HTTPException(status_code=400, detail="User rating must be between 1 and 5")

    # Insert trial
    trial = await execute_one(
        """
        INSERT INTO ab_test_trials (
            test_id, variant, agent_id, thread_id, input_message,
            success, latency_ms, cost, tokens_used, user_rating
        ) VALUES (
            :test_id, :variant, :agent_id, :thread_id, :input_message,
            :success, :latency_ms, :cost, :tokens_used, :user_rating
        )
        RETURNING *
        """,
        {
            "test_id": test_id,
            "variant": body.variant,
            "agent_id": body.agent_id,
            "thread_id": body.thread_id,
            "input_message": body.input_message,
            "success": body.success,
            "latency_ms": body.latency_ms,
            "cost": float(body.cost) if body.cost is not None else None,
            "tokens_used": body.tokens_used,
            "user_rating": body.user_rating,
        },
    )

    # Increment completed_trials
    new_completed = test["completed_trials"] + 1
    auto_complete = new_completed >= test["total_trials"]

    if auto_complete:
        await execute(
            """
            UPDATE agent_ab_tests
            SET completed_trials = :completed, status = 'completed', completed_at = now()
            WHERE id = :id
            """,
            {"completed": new_completed, "id": test_id},
        )
    else:
        await execute(
            "UPDATE agent_ab_tests SET completed_trials = :completed WHERE id = :id",
            {"completed": new_completed, "id": test_id},
        )

    result = dict(trial)
    result["test_completed"] = auto_complete
    result["completed_trials"] = new_completed
    result["total_trials"] = test["total_trials"]
    return result


@router.get("/ab-tests/{test_id}/results", summary="Get statistical results")
async def get_ab_test_results(
    test_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    test = await execute_one(
        "SELECT * FROM agent_ab_tests WHERE id = :id AND user_id = :user_id",
        {"id": test_id, "user_id": user_id},
    )
    if not test:
        raise HTTPException(status_code=404, detail="A/B test not found")

    trials = await execute(
        "SELECT * FROM ab_test_trials WHERE test_id = :test_id",
        {"test_id": test_id},
    )
    trials_list = [dict(t) for t in trials]

    # Split by variant
    a_trials = [t for t in trials_list if t["variant"] == "A"]
    b_trials = [t for t in trials_list if t["variant"] == "B"]

    def _avg(lst, key):
        vals = [t[key] for t in lst if t.get(key) is not None]
        if not vals:
            return None
        return round(sum(vals) / len(vals), 4)

    def _count_true(lst, key):
        return sum(1 for t in lst if t.get(key) is True)

    variant_a = {
        "trial_count": len(a_trials),
        "success_rate": round(_count_true(a_trials, "success") / len(a_trials), 4) if a_trials else None,
        "avg_latency_ms": _avg(a_trials, "latency_ms"),
        "avg_cost": _avg(a_trials, "cost"),
        "avg_tokens": _avg(a_trials, "tokens_used"),
        "avg_rating": _avg(a_trials, "user_rating"),
        "successes": _count_true(a_trials, "success"),
    }

    variant_b = {
        "trial_count": len(b_trials),
        "success_rate": round(_count_true(b_trials, "success") / len(b_trials), 4) if b_trials else None,
        "avg_latency_ms": _avg(b_trials, "latency_ms"),
        "avg_cost": _avg(b_trials, "cost"),
        "avg_tokens": _avg(b_trials, "tokens_used"),
        "avg_rating": _avg(b_trials, "user_rating"),
        "successes": _count_true(b_trials, "success"),
    }

    # Determine winner based on metric
    metric = test["metric"]
    winner = None
    stat_test = {"z_score": 0, "p_value": 1.0, "significant": False}

    if metric == "success_rate":
        stat_test = _z_test_proportions(
            variant_a["successes"], variant_a["trial_count"],
            variant_b["successes"], variant_b["trial_count"],
        )
        if variant_a["success_rate"] is not None and variant_b["success_rate"] is not None:
            if variant_a["success_rate"] > variant_b["success_rate"]:
                winner = "A"
            elif variant_b["success_rate"] > variant_a["success_rate"]:
                winner = "B"
    elif metric == "latency":
        # Lower latency is better
        if variant_a["avg_latency_ms"] is not None and variant_b["avg_latency_ms"] is not None:
            if variant_a["avg_latency_ms"] < variant_b["avg_latency_ms"]:
                winner = "A"
            elif variant_b["avg_latency_ms"] < variant_a["avg_latency_ms"]:
                winner = "B"
    elif metric == "cost":
        # Lower cost is better
        if variant_a["avg_cost"] is not None and variant_b["avg_cost"] is not None:
            if variant_a["avg_cost"] < variant_b["avg_cost"]:
                winner = "A"
            elif variant_b["avg_cost"] < variant_a["avg_cost"]:
                winner = "B"
    elif metric == "user_rating":
        # Higher rating is better
        if variant_a["avg_rating"] is not None and variant_b["avg_rating"] is not None:
            if variant_a["avg_rating"] > variant_b["avg_rating"]:
                winner = "A"
            elif variant_b["avg_rating"] > variant_a["avg_rating"]:
                winner = "B"

    confidence = _compute_confidence(stat_test["p_value"])

    return {
        "test_id": test_id,
        "metric": metric,
        "status": test["status"],
        "variant_a": variant_a,
        "variant_b": variant_b,
        "winner": winner,
        "confidence": confidence,
        "statistical_test": stat_test,
        "total_trials": test["total_trials"],
        "completed_trials": test["completed_trials"],
    }
