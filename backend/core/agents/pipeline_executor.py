"""
Pipeline Executor — orchestrates sequential multi-agent pipeline runs.

Executes pipeline steps one at a time:
  1. Start agent via start_agent_run()
  2. Poll agent_runs until completed/failed
  3. Extract last assistant message as step output
  4. Pass output to next step via input_mapping
  5. Evaluate conditions for conditional steps
  6. Update pipeline_runs record after each step
  7. Stream progress via Redis pub/sub for real-time UI

Usage:
    asyncio.create_task(execute_pipeline_run(run_id, pipeline, user_id))
"""

import asyncio
import json
import time
from typing import Any, Dict, List, Optional

from core.services.db import execute_one, execute
from core.utils.logger import logger


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

POLL_INTERVAL_S = 2.0        # How often to check agent run status
MAX_STEP_DURATION_S = 600    # 10 min max per step
MAX_PIPELINE_DURATION_S = 3600  # 1 hour max per pipeline

TERMINAL_STATUSES = {"completed", "failed", "error", "cancelled", "stopped"}


# ---------------------------------------------------------------------------
# Pipeline run state helpers
# ---------------------------------------------------------------------------

async def _update_run(
    run_id: str,
    *,
    status: Optional[str] = None,
    current_step: Optional[int] = None,
    step_results: Optional[list] = None,
    error: Optional[str] = None,
    completed: bool = False,
) -> None:
    """Update pipeline_runs record."""
    sets: list[str] = []
    params: dict[str, Any] = {"run_id": run_id}

    if status is not None:
        sets.append("status = :status")
        params["status"] = status
    if current_step is not None:
        sets.append("current_step = :current_step")
        params["current_step"] = current_step
    if step_results is not None:
        sets.append("step_results = :step_results")
        params["step_results"] = json.dumps(step_results)
    if error is not None:
        sets.append("error = :error")
        params["error"] = error
    if completed:
        sets.append("completed_at = now()")

    if not sets:
        return

    sql = f"UPDATE pipeline_runs SET {', '.join(sets)} WHERE id = :run_id"
    await execute_one(sql, params, commit=True)


async def _publish_progress(run_id: str, data: dict) -> None:
    """Publish pipeline progress to Redis stream for SSE consumers."""
    try:
        from core.services import redis
        stream_key = f"pipeline_run:{run_id}:stream"
        await asyncio.wait_for(
            redis.stream_add(
                stream_key,
                {"data": json.dumps(data, default=str)},
                maxlen=200,
                approximate=True,
            ),
            timeout=2.0,
        )
    except Exception as e:
        logger.debug(f"Redis publish skipped for pipeline {run_id}: {e}")


# ---------------------------------------------------------------------------
# Agent step execution
# ---------------------------------------------------------------------------

async def _wait_for_agent_completion(
    agent_run_id: str,
    timeout_s: float = MAX_STEP_DURATION_S,
) -> Dict[str, Any]:
    """Poll agent_runs table until the run reaches a terminal status."""
    from core.agents.repo import get_agent_run_status

    deadline = time.monotonic() + timeout_s

    while time.monotonic() < deadline:
        result = await get_agent_run_status(agent_run_id)
        if not result:
            return {"status": "error", "error": "Agent run not found"}

        status = result.get("status", "")
        if status in TERMINAL_STATUSES:
            return {
                "status": status,
                "error": result.get("error"),
                "agent_run_id": agent_run_id,
            }

        await asyncio.sleep(POLL_INTERVAL_S)

    return {"status": "failed", "error": f"Step timed out after {timeout_s}s"}


async def _get_step_output(thread_id: str) -> str:
    """Extract the last assistant message from a thread as the step output."""
    from core.threads.repo import get_thread_messages

    messages = await get_thread_messages(
        thread_id=thread_id,
        order="desc",
        optimized=True,
        allowed_types=["assistant"],
    )

    if not messages:
        return ""

    last_msg = messages[0]
    content = last_msg.get("content", {})

    # content is stored as JSON — extract text
    if isinstance(content, dict):
        # Standard format: {"role": "assistant", "content": "..."}
        inner = content.get("content", "")
        if isinstance(inner, str):
            return inner
        if isinstance(inner, list):
            # Multi-part content (text + tool_use blocks)
            parts = []
            for block in inner:
                if isinstance(block, dict) and block.get("type") == "text":
                    parts.append(block.get("text", ""))
            return "\n".join(parts) if parts else json.dumps(inner)
        return json.dumps(content)
    if isinstance(content, str):
        return content
    return str(content)


def _apply_input_mapping(mapping: Optional[str], previous_output: str) -> str:
    """
    Apply input_mapping to produce the prompt for the next step.

    Supports simple template substitution:
      - {{previous_output}} → replaced with previous step's output
      - {{step_N_output}} → replaced with step N's output (from step_results)

    If no mapping is set, the previous output is passed directly.
    """
    if not mapping:
        return previous_output

    result = mapping.replace("{{previous_output}}", previous_output)
    return result


def _apply_input_mapping_with_history(
    mapping: Optional[str],
    previous_output: str,
    step_results: List[dict],
) -> str:
    """Like _apply_input_mapping but also supports {{step_N_output}} placeholders."""
    if not mapping:
        return previous_output

    result = mapping.replace("{{previous_output}}", previous_output)

    for i, sr in enumerate(step_results):
        placeholder = f"{{{{step_{i + 1}_output}}}}"
        output_text = sr.get("output", "")
        result = result.replace(placeholder, output_text)

    return result


def _evaluate_condition(condition: Optional[str], previous_output: str, step_results: list) -> bool:
    """
    Evaluate a step condition to decide if the step should run.

    Supported condition syntax:
      - None / empty → always run
      - "always" → always run
      - "previous_success" → run only if previous step succeeded
      - "previous_failed" → run only if previous step failed
      - "contains:<text>" → run if previous output contains <text>
      - "not_contains:<text>" → run if previous output does NOT contain <text>
    """
    if not condition or condition.strip().lower() == "always":
        return True

    condition = condition.strip().lower()

    if condition == "previous_success":
        if not step_results:
            return True
        return step_results[-1].get("status") == "completed"

    if condition == "previous_failed":
        if not step_results:
            return False
        return step_results[-1].get("status") == "failed"

    if condition.startswith("contains:"):
        needle = condition[len("contains:"):].strip()
        return needle.lower() in previous_output.lower()

    if condition.startswith("not_contains:"):
        needle = condition[len("not_contains:"):].strip()
        return needle.lower() not in previous_output.lower()

    # Unknown condition → run the step (fail-open)
    logger.warning(f"Unknown pipeline condition: {condition!r} — running step anyway")
    return True


async def _run_single_step(
    step: dict,
    step_index: int,
    user_id: str,
    previous_output: str,
    step_results: List[dict],
) -> Dict[str, Any]:
    """Execute a single pipeline step by starting an agent run and waiting for it."""
    from core.agents.api import start_agent_run

    agent_id = step.get("agent_id")
    agent_name = step.get("agent_name", f"Step {step_index + 1}")
    input_mapping = step.get("input_mapping")
    condition = step.get("condition")

    # Evaluate condition
    if not _evaluate_condition(condition, previous_output, step_results):
        logger.info(f"[PIPELINE] Step {step_index + 1} ({agent_name}) skipped — condition not met: {condition}")
        return {
            "step": step_index + 1,
            "agent_id": agent_id,
            "agent_name": agent_name,
            "status": "skipped",
            "output": "",
            "duration_s": 0,
            "skipped_reason": f"Condition not met: {condition}",
        }

    # Build prompt from input mapping
    prompt = _apply_input_mapping_with_history(input_mapping, previous_output, step_results)
    if not prompt:
        prompt = f"Continue the pipeline. You are step {step_index + 1} ({agent_name})."

    step_start = time.monotonic()

    logger.info(f"[PIPELINE] Starting step {step_index + 1} ({agent_name}) with agent {agent_id}")

    try:
        result = await start_agent_run(
            account_id=user_id,
            prompt=prompt,
            agent_id=agent_id,
            skip_limits_check=True,  # Pipeline steps bypass individual limits
            metadata={
                "pipeline_step": step_index + 1,
                "pipeline_agent_name": agent_name,
            },
        )
    except Exception as e:
        duration = round(time.monotonic() - step_start, 2)
        logger.error(f"[PIPELINE] Step {step_index + 1} failed to start: {e}")
        return {
            "step": step_index + 1,
            "agent_id": agent_id,
            "agent_name": agent_name,
            "status": "failed",
            "error": str(e),
            "output": "",
            "duration_s": duration,
        }

    agent_run_id = result["agent_run_id"]
    thread_id = result["thread_id"]

    logger.info(f"[PIPELINE] Step {step_index + 1} running: agent_run={agent_run_id}, thread={thread_id}")

    # Wait for completion
    completion = await _wait_for_agent_completion(agent_run_id)
    duration = round(time.monotonic() - step_start, 2)

    # Extract output
    output = ""
    if completion["status"] == "completed":
        output = await _get_step_output(thread_id)

    return {
        "step": step_index + 1,
        "agent_id": agent_id,
        "agent_name": agent_name,
        "agent_run_id": agent_run_id,
        "thread_id": thread_id,
        "status": completion["status"],
        "error": completion.get("error"),
        "output": output[:10000],  # Cap output size
        "duration_s": duration,
    }


# ---------------------------------------------------------------------------
# Main executor
# ---------------------------------------------------------------------------

async def execute_pipeline_run(
    run_id: str,
    pipeline_id: str,
    steps: List[dict],
    user_id: str,
) -> None:
    """
    Execute a pipeline run — called as a background asyncio task.

    Runs each step sequentially, captures output, passes to next step,
    and updates the pipeline_runs record after each step.
    """
    logger.info(f"[PIPELINE] Starting pipeline execution: run={run_id}, pipeline={pipeline_id}, steps={len(steps)}")

    pipeline_start = time.monotonic()
    step_results: list[dict] = []
    previous_output = ""
    final_status = "completed"
    final_error = None

    try:
        for i, step in enumerate(steps):
            # Check total pipeline timeout
            elapsed = time.monotonic() - pipeline_start
            if elapsed > MAX_PIPELINE_DURATION_S:
                final_status = "failed"
                final_error = f"Pipeline timed out after {int(elapsed)}s"
                logger.error(f"[PIPELINE] {final_error}")
                break

            # Update current step
            await _update_run(
                run_id,
                current_step=i + 1,
                step_results=step_results,
            )

            # Publish progress
            await _publish_progress(run_id, {
                "event": "step_started",
                "run_id": run_id,
                "pipeline_id": pipeline_id,
                "step": i + 1,
                "total_steps": len(steps),
                "agent_id": step.get("agent_id"),
                "agent_name": step.get("agent_name", f"Step {i + 1}"),
            })

            # Run the step
            step_result = await _run_single_step(
                step=step,
                step_index=i,
                user_id=user_id,
                previous_output=previous_output,
                step_results=step_results,
            )

            step_results.append(step_result)

            # Publish step completion
            await _publish_progress(run_id, {
                "event": "step_completed",
                "run_id": run_id,
                "pipeline_id": pipeline_id,
                "step": i + 1,
                "total_steps": len(steps),
                "status": step_result["status"],
                "duration_s": step_result["duration_s"],
                "agent_name": step_result.get("agent_name"),
            })

            # Update DB with step results
            await _update_run(run_id, step_results=step_results)

            # Check for failure
            if step_result["status"] == "failed":
                final_status = "failed"
                final_error = f"Step {i + 1} ({step_result.get('agent_name', '')}) failed: {step_result.get('error', 'unknown')}"
                logger.error(f"[PIPELINE] {final_error}")
                break

            # Carry output forward (skip for skipped steps)
            if step_result["status"] != "skipped":
                previous_output = step_result.get("output", "")

    except asyncio.CancelledError:
        final_status = "cancelled"
        final_error = "Pipeline was cancelled"
        logger.info(f"[PIPELINE] Pipeline run {run_id} was cancelled")
    except Exception as e:
        final_status = "failed"
        final_error = f"Pipeline executor error: {str(e)}"
        logger.error(f"[PIPELINE] Unexpected error in pipeline {run_id}: {e}", exc_info=True)

    # Finalize
    total_duration = round(time.monotonic() - pipeline_start, 2)

    await _update_run(
        run_id,
        status=final_status,
        current_step=len(steps) if final_status == "completed" else None,
        step_results=step_results,
        error=final_error,
        completed=True,
    )

    await _publish_progress(run_id, {
        "event": "pipeline_completed",
        "run_id": run_id,
        "pipeline_id": pipeline_id,
        "status": final_status,
        "error": final_error,
        "total_duration_s": total_duration,
        "steps_completed": sum(1 for r in step_results if r["status"] == "completed"),
        "steps_total": len(steps),
    })

    logger.info(
        f"[PIPELINE] Pipeline run {run_id} finished: status={final_status}, "
        f"steps={len(step_results)}/{len(steps)}, duration={total_duration}s"
    )
