from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate
from core.utils.logger import logger

router = APIRouter(tags=["agent-testing"])


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class CreateTestCaseRequest(BaseModel):
    name: str
    input_message: str
    expected_behavior: Optional[str] = None
    expected_contains: Optional[List[str]] = None
    expected_not_contains: Optional[List[str]] = None
    max_latency_ms: Optional[int] = None
    max_cost: Optional[float] = None
    tags: Optional[List[str]] = None


class UpdateTestCaseRequest(BaseModel):
    name: Optional[str] = None
    input_message: Optional[str] = None
    expected_behavior: Optional[str] = None
    expected_contains: Optional[List[str]] = None
    expected_not_contains: Optional[List[str]] = None
    max_latency_ms: Optional[int] = None
    max_cost: Optional[float] = None
    tags: Optional[List[str]] = None
    is_active: Optional[bool] = None


# ---------------------------------------------------------------------------
# Test Cases CRUD
# ---------------------------------------------------------------------------

@router.post(
    "/agents/{agent_id}/test-cases",
    summary="Create test case",
    operation_id="create_test_case",
)
async def create_test_case(
    agent_id: str,
    body: CreateTestCaseRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Create a new test case for an agent."""
    row = await execute_one(
        """
        INSERT INTO agent_test_cases (
            user_id, agent_id, name, input_message,
            expected_behavior, expected_contains, expected_not_contains,
            max_latency_ms, max_cost, tags
        ) VALUES (
            :user_id, :agent_id, :name, :input_message,
            :expected_behavior, :expected_contains, :expected_not_contains,
            :max_latency_ms, :max_cost, :tags
        )
        RETURNING *
        """,
        {
            "user_id": user_id,
            "agent_id": agent_id,
            "name": body.name,
            "input_message": body.input_message,
            "expected_behavior": body.expected_behavior,
            "expected_contains": body.expected_contains or [],
            "expected_not_contains": body.expected_not_contains or [],
            "max_latency_ms": body.max_latency_ms,
            "max_cost": body.max_cost,
            "tags": body.tags or [],
        },
    )
    return dict(row)


@router.get(
    "/agents/{agent_id}/test-cases",
    summary="List test cases",
    operation_id="list_test_cases",
)
async def list_test_cases(
    agent_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List all test cases for an agent."""
    rows = await execute(
        """
        SELECT * FROM agent_test_cases
        WHERE user_id::text = :user_id AND agent_id::text = :agent_id
        ORDER BY created_at DESC
        """,
        {"user_id": user_id, "agent_id": agent_id},
    )
    return {"test_cases": [dict(r) for r in rows]}


@router.patch(
    "/agents/{agent_id}/test-cases/{case_id}",
    summary="Update test case",
    operation_id="update_test_case",
)
async def update_test_case(
    agent_id: str,
    case_id: str,
    body: UpdateTestCaseRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Update an existing test case."""
    # Build dynamic SET clause from non-None fields
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    set_clauses = []
    params = {"user_id": user_id, "agent_id": agent_id, "case_id": case_id}

    for field, value in updates.items():
        set_clauses.append(f"{field} = :{field}")
        params[field] = value

    set_clauses.append("updated_at = now()")
    set_sql = ", ".join(set_clauses)

    row = await execute_one(
        f"""
        UPDATE agent_test_cases
        SET {set_sql}
        WHERE id = :case_id AND user_id::text = :user_id AND agent_id::text = :agent_id
        RETURNING *
        """,
        params,
    )

    if not row:
        raise HTTPException(status_code=404, detail="Test case not found")

    return dict(row)


@router.delete(
    "/agents/{agent_id}/test-cases/{case_id}",
    summary="Delete test case",
    operation_id="delete_test_case",
)
async def delete_test_case(
    agent_id: str,
    case_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Delete a test case."""
    await execute_mutate(
        """
        DELETE FROM agent_test_cases
        WHERE id = :case_id AND user_id::text = :user_id AND agent_id::text = :agent_id
        """,
        {"case_id": case_id, "user_id": user_id, "agent_id": agent_id},
    )
    return {"deleted": True, "case_id": case_id}


# ---------------------------------------------------------------------------
# Test Runs
# ---------------------------------------------------------------------------

@router.post(
    "/agents/{agent_id}/test-runs",
    summary="Start test run",
    operation_id="start_test_run",
)
async def start_test_run(
    agent_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Start a test run for all active test cases.
    Creates the run record and placeholder results for each case.
    Actual evaluation happens when integrated with the agent runtime.
    """
    # Get all active test cases
    cases = await execute(
        """
        SELECT * FROM agent_test_cases
        WHERE user_id::text = :user_id AND agent_id::text = :agent_id AND is_active = true
        ORDER BY created_at ASC
        """,
        {"user_id": user_id, "agent_id": agent_id},
    )

    if not cases:
        raise HTTPException(status_code=404, detail="No active test cases found")

    total = len(cases)

    # Create the test run
    run = await execute_one(
        """
        INSERT INTO agent_test_runs (
            user_id, agent_id, suite_name, status, total_cases,
            passed, failed, skipped
        ) VALUES (
            :user_id, :agent_id, 'default', 'completed', :total,
            0, 0, :total
        )
        RETURNING *
        """,
        {
            "user_id": user_id,
            "agent_id": agent_id,
            "total": total,
        },
    )

    run_id = run["id"]

    # Create placeholder results for each case (skipped state)
    for case in cases:
        await execute_mutate(
            """
            INSERT INTO agent_test_results (
                test_run_id, test_case_id, passed, failure_reason
            ) VALUES (
                :test_run_id, :test_case_id, NULL, 'Awaiting agent runtime integration'
            )
            """,
            {
                "test_run_id": run_id,
                "test_case_id": case["id"],
            },
        )

    # Update completed_at
    await execute_mutate(
        """
        UPDATE agent_test_runs
        SET completed_at = now()
        WHERE id = :run_id
        """,
        {"run_id": run_id},
    )

    return dict(run)


@router.get(
    "/agents/{agent_id}/test-runs",
    summary="List test runs",
    operation_id="list_test_runs",
)
async def list_test_runs(
    agent_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """List test runs for an agent."""
    rows = await execute(
        """
        SELECT * FROM agent_test_runs
        WHERE user_id::text = :user_id AND agent_id::text = :agent_id
        ORDER BY started_at DESC
        LIMIT :limit OFFSET :offset
        """,
        {
            "user_id": user_id,
            "agent_id": agent_id,
            "limit": limit,
            "offset": offset,
        },
    )

    count_row = await execute_one(
        """
        SELECT COUNT(*) FROM agent_test_runs
        WHERE user_id::text = :user_id AND agent_id::text = :agent_id
        """,
        {"user_id": user_id, "agent_id": agent_id},
    )
    total = int(count_row["count"]) if count_row else 0

    return {
        "test_runs": [dict(r) for r in rows],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get(
    "/agents/{agent_id}/test-runs/{run_id}",
    summary="Get test run detail",
    operation_id="get_test_run_detail",
)
async def get_test_run_detail(
    agent_id: str,
    run_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get test run detail with all results."""
    run = await execute_one(
        """
        SELECT * FROM agent_test_runs
        WHERE id = :run_id AND user_id::text = :user_id AND agent_id::text = :agent_id
        """,
        {"run_id": run_id, "user_id": user_id, "agent_id": agent_id},
    )

    if not run:
        raise HTTPException(status_code=404, detail="Test run not found")

    results = await execute(
        """
        SELECT r.*, tc.name AS test_case_name, tc.input_message, tc.expected_behavior
        FROM agent_test_results r
        JOIN agent_test_cases tc ON tc.id::text = r.test_case_id::text
        WHERE r.test_run_id::text = :run_id
        ORDER BY r.created_at ASC
        """,
        {"run_id": run_id},
    )

    return {
        **dict(run),
        "results": [dict(r) for r in results],
    }
