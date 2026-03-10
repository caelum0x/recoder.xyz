"""
Run Replay API.

Provides endpoints for capturing, retrieving, and summarizing step-by-step
replay snapshots of agent runs. Enables debugging and playback of completed runs.
"""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate
from core.utils.logger import logger
import json

router = APIRouter(tags=["agent-replay"])


# ---------------------------------------------------------------------------
# Pydantic Models
# ---------------------------------------------------------------------------

class CaptureReplayStepRequest(BaseModel):
    step_index: int = Field(..., ge=0, description="Zero-based step index")
    step_type: str = Field(
        ...,
        description="Step type: user_input, llm_call, tool_call, tool_result, assistant_output, error",
    )
    content: Dict[str, Any] = Field(..., description="Step content payload (JSON)")
    tokens_in: int = Field(0, ge=0, description="Input tokens for this step")
    tokens_out: int = Field(0, ge=0, description="Output tokens for this step")
    latency_ms: int = Field(0, ge=0, description="Latency in milliseconds")
    cost: float = Field(0, ge=0, description="Cost for this step")
    thread_id: Optional[str] = Field(None, description="Thread ID (optional, auto-detected from run)")


class ReplayStepResponse(BaseModel):
    id: str
    run_id: str
    agent_id: str
    thread_id: str
    step_index: int
    step_type: str
    content: Dict[str, Any]
    tokens_in: int
    tokens_out: int
    latency_ms: int
    cost: float
    timestamp: str


class ReplaySummaryResponse(BaseModel):
    run_id: str
    agent_id: str
    total_steps: int
    step_type_counts: Dict[str, int]
    total_tokens_in: int
    total_tokens_out: int
    total_latency_ms: int
    total_cost: float
    first_step_at: Optional[str]
    last_step_at: Optional[str]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _ts(val: Any) -> str:
    if val is None:
        return ""
    if hasattr(val, "isoformat"):
        return val.isoformat()
    return str(val)


def _row_to_step(r: dict) -> ReplayStepResponse:
    content = r.get("content", {})
    if isinstance(content, str):
        try:
            content = json.loads(content)
        except (json.JSONDecodeError, TypeError):
            content = {"raw": content}

    return ReplayStepResponse(
        id=str(r["id"]),
        run_id=r["run_id"],
        agent_id=r["agent_id"],
        thread_id=r["thread_id"],
        step_index=r["step_index"],
        step_type=r["step_type"],
        content=content,
        tokens_in=r.get("tokens_in", 0) or 0,
        tokens_out=r.get("tokens_out", 0) or 0,
        latency_ms=r.get("latency_ms", 0) or 0,
        cost=float(r.get("cost", 0) or 0),
        timestamp=_ts(r.get("timestamp")),
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get(
    "/agents/{agent_id}/runs/{run_id}/replay",
    summary="Get full replay data for a run",
    operation_id="get_run_replay",
)
async def get_run_replay(
    agent_id: str,
    run_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Retrieve all replay steps for a given run, ordered by step index.
    Returns the full step-by-step playback data.
    """
    try:
        rows = await execute(
            """
            SELECT * FROM run_replay_snapshots
            WHERE user_id = :user_id
              AND agent_id = :agent_id
              AND run_id = :run_id
            ORDER BY step_index ASC
            """,
            {
                "user_id": user_id,
                "agent_id": agent_id,
                "run_id": run_id,
            },
        )

        steps = [_row_to_step(r) for r in (rows or [])]

        return {
            "run_id": run_id,
            "agent_id": agent_id,
            "steps": [s.model_dump() for s in steps],
            "total_steps": len(steps),
        }

    except Exception as e:
        logger.error(f"Error fetching replay for run {run_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch run replay")


@router.get(
    "/agents/{agent_id}/runs/{run_id}/replay/summary",
    summary="Get replay summary for a run",
    operation_id="get_run_replay_summary",
)
async def get_run_replay_summary(
    agent_id: str,
    run_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Get an aggregated summary of the replay: step counts by type,
    total timing, total cost, total tokens.
    """
    try:
        # Get aggregate stats
        agg = await execute_one(
            """
            SELECT
                COUNT(*) AS total_steps,
                COALESCE(SUM(tokens_in), 0) AS total_tokens_in,
                COALESCE(SUM(tokens_out), 0) AS total_tokens_out,
                COALESCE(SUM(latency_ms), 0) AS total_latency_ms,
                COALESCE(SUM(cost), 0) AS total_cost,
                MIN(timestamp) AS first_step_at,
                MAX(timestamp) AS last_step_at
            FROM run_replay_snapshots
            WHERE user_id = :user_id
              AND agent_id = :agent_id
              AND run_id = :run_id
            """,
            {
                "user_id": user_id,
                "agent_id": agent_id,
                "run_id": run_id,
            },
        )

        total_steps = int(agg["total_steps"]) if agg and agg["total_steps"] else 0

        if total_steps == 0:
            return ReplaySummaryResponse(
                run_id=run_id,
                agent_id=agent_id,
                total_steps=0,
                step_type_counts={},
                total_tokens_in=0,
                total_tokens_out=0,
                total_latency_ms=0,
                total_cost=0,
                first_step_at=None,
                last_step_at=None,
            ).model_dump()

        # Get step type breakdown
        type_rows = await execute(
            """
            SELECT step_type, COUNT(*) AS cnt
            FROM run_replay_snapshots
            WHERE user_id = :user_id
              AND agent_id = :agent_id
              AND run_id = :run_id
            GROUP BY step_type
            ORDER BY cnt DESC
            """,
            {
                "user_id": user_id,
                "agent_id": agent_id,
                "run_id": run_id,
            },
        )

        step_type_counts = {r["step_type"]: int(r["cnt"]) for r in (type_rows or [])}

        return ReplaySummaryResponse(
            run_id=run_id,
            agent_id=agent_id,
            total_steps=total_steps,
            step_type_counts=step_type_counts,
            total_tokens_in=int(agg["total_tokens_in"]),
            total_tokens_out=int(agg["total_tokens_out"]),
            total_latency_ms=int(agg["total_latency_ms"]),
            total_cost=float(agg["total_cost"]),
            first_step_at=_ts(agg.get("first_step_at")) or None,
            last_step_at=_ts(agg.get("last_step_at")) or None,
        ).model_dump()

    except Exception as e:
        logger.error(f"Error fetching replay summary for run {run_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch replay summary")


@router.post(
    "/agents/{agent_id}/runs/{run_id}/replay/capture",
    summary="Capture a replay step",
    operation_id="capture_replay_step",
)
async def capture_replay_step(
    agent_id: str,
    run_id: str,
    body: CaptureReplayStepRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Record a single replay snapshot step during an agent run.
    Called incrementally as the run progresses.
    """
    valid_types = {"user_input", "llm_call", "tool_call", "tool_result", "assistant_output", "error"}
    if body.step_type not in valid_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid step_type. Must be one of: {', '.join(sorted(valid_types))}",
        )

    try:
        # Resolve thread_id: use provided or look up from run
        thread_id = body.thread_id
        if not thread_id:
            run_row = await execute_one(
                "SELECT thread_id FROM agent_runs WHERE id = :run_id AND user_id = :user_id",
                {"run_id": run_id, "user_id": user_id},
            )
            thread_id = run_row["thread_id"] if run_row else run_id

        row = await execute_one(
            """
            INSERT INTO run_replay_snapshots (
                user_id, run_id, agent_id, thread_id,
                step_index, step_type, content,
                tokens_in, tokens_out, latency_ms, cost
            ) VALUES (
                :user_id, :run_id, :agent_id, :thread_id,
                :step_index, :step_type, :content,
                :tokens_in, :tokens_out, :latency_ms, :cost
            )
            ON CONFLICT (run_id, step_index) DO UPDATE SET
                step_type = EXCLUDED.step_type,
                content = EXCLUDED.content,
                tokens_in = EXCLUDED.tokens_in,
                tokens_out = EXCLUDED.tokens_out,
                latency_ms = EXCLUDED.latency_ms,
                cost = EXCLUDED.cost,
                timestamp = now()
            RETURNING *
            """,
            {
                "user_id": user_id,
                "run_id": run_id,
                "agent_id": agent_id,
                "thread_id": thread_id,
                "step_index": body.step_index,
                "step_type": body.step_type,
                "content": json.dumps(body.content),
                "tokens_in": body.tokens_in,
                "tokens_out": body.tokens_out,
                "latency_ms": body.latency_ms,
                "cost": body.cost,
            },
            commit=True,
        )

        if not row:
            raise HTTPException(status_code=500, detail="Failed to capture replay step")

        return _row_to_step(row).model_dump()

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error capturing replay step for run {run_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to capture replay step")
