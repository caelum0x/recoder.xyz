"""
Smolagents Executor API — exposes the code-first execution loop via REST.

Endpoints:
  POST /v1/agent-executor/run   — start a code-first execution run
  GET  /v1/agent-executor/run/{run_id}  — poll run status (if async)
"""

import logging
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.utils.config import config
from .smolagents_executor import SmolagentsExecutor, ExecutionResult

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/agent-executor", tags=["agent-executor"])


class RunRequest(BaseModel):
    task: str = Field(..., description="Natural language task description")
    sandbox_id: str = Field(..., description="Daytona sandbox ID to execute code in")
    context: str = Field("", description="Additional context or file listings injected into system prompt")
    model: str = Field("anthropic/claude-sonnet-4-20250514", description="LLM model for code generation")
    max_iterations: Optional[int] = Field(None, description="Override default max iterations (10)")


class RunResponse(BaseModel):
    run_id: str
    task: str
    success: bool
    output: str
    total_iterations: int
    steps: list[dict]
    error: Optional[str] = None


@router.post("/run", response_model=RunResponse)
async def run_executor(
    req: RunRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
) -> RunResponse:
    """
    Execute a task using the code-first Smolagents loop.

    The executor:
    1. Sends the task to an LLM which generates Python code
    2. Executes that code in the provided Daytona sandbox
    3. Feeds the output back to the LLM for the next iteration
    4. Repeats until the task is complete or max iterations is reached
    """
    daytona_url = config.DAYTONA_SERVER_URL or "http://localhost:3900/api"
    daytona_api_key = config.DAYTONA_API_KEY or ""
    llm_api_key = config.OPENROUTER_API_KEY or ""

    if not llm_api_key:
        raise HTTPException(status_code=503, detail="OPENROUTER_API_KEY not configured")
    if not daytona_api_key:
        raise HTTPException(status_code=503, detail="DAYTONA_API_KEY not configured")

    executor = SmolagentsExecutor(
        sandbox_id=req.sandbox_id,
        daytona_url=daytona_url,
        daytona_api_key=daytona_api_key,
        llm_api_key=llm_api_key,
        model=req.model,
    )

    # Apply optional max_iterations override via monkey-patch
    if req.max_iterations is not None:
        from . import smolagents_executor as mod
        orig = mod.MAX_ITERATIONS
        mod.MAX_ITERATIONS = req.max_iterations
        try:
            result: ExecutionResult = await executor.run(req.task, req.context)
        finally:
            mod.MAX_ITERATIONS = orig
    else:
        result = await executor.run(req.task, req.context)

    run_id = str(uuid.uuid4())

    logger.info(
        "Executor run %s: success=%s iterations=%d sandbox=%s user=%s",
        run_id, result.success, result.total_iterations, req.sandbox_id, user_id,
    )

    return RunResponse(
        run_id=run_id,
        task=result.task,
        success=result.success,
        output=result.output,
        total_iterations=result.total_iterations,
        steps=[
            {
                "iteration": s.iteration,
                "exit_code": s.exit_code,
                "stdout": s.stdout[:2000],
                "stderr": s.stderr[:500],
                "duration_ms": s.duration_ms,
            }
            for s in result.steps
        ],
        error=result.error,
    )
