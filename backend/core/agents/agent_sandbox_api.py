"""
Agent Playground Sandbox API endpoints.

Provides sandbox sessions for testing agents interactively,
plus test case management with pass/fail tracking.
"""

from datetime import datetime, timezone, timedelta
from typing import Optional, List
import json
import uuid

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate
from core.utils.logger import logger

router = APIRouter(tags=["agent-sandbox"])


# ============================================================================
# Pydantic Models
# ============================================================================

class CreateSandboxRequest(BaseModel):
    sandbox_config: dict = Field(default_factory=dict)
    expires_minutes: int = Field(default=60, ge=5, le=1440)


class SendMessageRequest(BaseModel):
    content: str
    role: str = "user"


class CreateTestCaseRequest(BaseModel):
    name: str
    input_message: str
    expected_behavior: Optional[str] = None


# ============================================================================
# Helpers
# ============================================================================

def _serialize_session(row: dict) -> dict:
    return {
        "id": str(row["id"]),
        "user_id": str(row["user_id"]),
        "agent_id": row["agent_id"],
        "sandbox_config": row.get("sandbox_config") or {},
        "messages": row.get("messages") or [],
        "status": row["status"],
        "expires_at": row["expires_at"].isoformat() if hasattr(row["expires_at"], "isoformat") else str(row["expires_at"]),
        "created_at": row["created_at"].isoformat() if hasattr(row["created_at"], "isoformat") else str(row["created_at"]),
    }


def _serialize_test_case(row: dict) -> dict:
    return {
        "id": str(row["id"]),
        "user_id": str(row["user_id"]),
        "agent_id": row["agent_id"],
        "name": row["name"],
        "input_message": row["input_message"],
        "expected_behavior": row.get("expected_behavior"),
        "last_result": row.get("last_result"),
        "pass_count": row["pass_count"],
        "fail_count": row["fail_count"],
        "created_at": row["created_at"].isoformat() if hasattr(row["created_at"], "isoformat") else str(row["created_at"]),
    }


def _generate_simulated_response(agent_id: str, user_message: str) -> str:
    """Generate a simulated agent response for sandbox testing."""
    return (
        f"[Sandbox] Simulated response for agent {agent_id}. "
        f"Received: \"{user_message[:100]}{'...' if len(user_message) > 100 else ''}\". "
        "This is a sandbox environment -- connect to the agent runtime for real responses."
    )


# ============================================================================
# Sandbox Session Endpoints
# ============================================================================

@router.post(
    "/agents/{agent_id}/sandbox",
    summary="Create Sandbox Session",
    operation_id="create_sandbox_session",
)
async def create_sandbox_session(
    agent_id: str,
    body: CreateSandboxRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Create a new sandbox session for testing an agent."""
    try:
        row = await execute_one(
            """
            INSERT INTO agent_sandbox_sessions
                (user_id, agent_id, sandbox_config, messages, status, expires_at)
            VALUES
                (:user_id, :agent_id, :config, '[]'::jsonb, 'active',
                 now() + make_interval(mins => :expires_minutes))
            RETURNING *
            """,
            {
                "user_id": user_id,
                "agent_id": agent_id,
                "config": json.dumps(body.sandbox_config),
                "expires_minutes": body.expires_minutes,
            },
        )

        if not row:
            raise HTTPException(status_code=500, detail="Failed to create sandbox session")

        return _serialize_session(row)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating sandbox session: {e}")
        raise HTTPException(status_code=500, detail="Failed to create sandbox session")


@router.post(
    "/agents/{agent_id}/sandbox/{session_id}/message",
    summary="Send Sandbox Message",
    operation_id="send_sandbox_message",
)
async def send_sandbox_message(
    agent_id: str,
    session_id: str,
    body: SendMessageRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Send a message to a sandbox session, receive a simulated response."""
    try:
        # Verify session exists, is active, and not expired
        session = await execute_one(
            """
            SELECT * FROM agent_sandbox_sessions
            WHERE id = :session_id AND user_id::text = :user_id AND agent_id::text = :agent_id
            """,
            {"session_id": session_id, "user_id": user_id, "agent_id": agent_id},
        )

        if not session:
            raise HTTPException(status_code=404, detail="Sandbox session not found")

        if session["status"] != "active":
            raise HTTPException(status_code=400, detail="Sandbox session is not active")

        if session["expires_at"] < datetime.now(timezone.utc):
            # Auto-expire
            await execute_mutate(
                """
                UPDATE agent_sandbox_sessions SET status = 'expired', updated_at = now()
                WHERE id = :session_id
                """,
                {"session_id": session_id},
            )
            raise HTTPException(status_code=400, detail="Sandbox session has expired")

        # Build new messages
        now_iso = datetime.now(timezone.utc).isoformat()
        user_msg = {
            "role": body.role,
            "content": body.content,
            "timestamp": now_iso,
        }

        assistant_response = _generate_simulated_response(agent_id, body.content)
        assistant_msg = {
            "role": "assistant",
            "content": assistant_response,
            "timestamp": now_iso,
        }

        # Append messages to JSONB array
        updated = await execute_one(
            """
            UPDATE agent_sandbox_sessions
            SET messages = messages || :new_messages::jsonb,
                updated_at = now()
            WHERE id = :session_id AND user_id::text = :user_id
            RETURNING *
            """,
            {
                "session_id": session_id,
                "user_id": user_id,
                "new_messages": json.dumps([user_msg, assistant_msg]),
            },
        )

        if not updated:
            raise HTTPException(status_code=500, detail="Failed to send message")

        return {
            "user_message": user_msg,
            "assistant_message": assistant_msg,
            "session": _serialize_session(updated),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error sending sandbox message: {e}")
        raise HTTPException(status_code=500, detail="Failed to send sandbox message")


@router.get(
    "/agents/{agent_id}/sandbox/{session_id}",
    summary="Get Sandbox Session",
    operation_id="get_sandbox_session",
)
async def get_sandbox_session(
    agent_id: str,
    session_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get a sandbox session with all messages."""
    try:
        row = await execute_one(
            """
            SELECT * FROM agent_sandbox_sessions
            WHERE id = :session_id AND user_id::text = :user_id AND agent_id::text = :agent_id
            """,
            {"session_id": session_id, "user_id": user_id, "agent_id": agent_id},
        )

        if not row:
            raise HTTPException(status_code=404, detail="Sandbox session not found")

        return _serialize_session(row)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching sandbox session: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch sandbox session")


@router.delete(
    "/agents/{agent_id}/sandbox/{session_id}",
    summary="End Sandbox Session",
    operation_id="end_sandbox_session",
)
async def end_sandbox_session(
    agent_id: str,
    session_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """End (complete) a sandbox session."""
    try:
        rows = await execute_mutate(
            """
            UPDATE agent_sandbox_sessions
            SET status = 'completed', updated_at = now()
            WHERE id = :session_id AND user_id::text = :user_id AND agent_id::text = :agent_id
            RETURNING id
            """,
            {"session_id": session_id, "user_id": user_id, "agent_id": agent_id},
        )

        if not rows:
            raise HTTPException(status_code=404, detail="Sandbox session not found")

        return {"deleted": True, "session_id": session_id}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error ending sandbox session: {e}")
        raise HTTPException(status_code=500, detail="Failed to end sandbox session")


# ============================================================================
# Test Case Endpoints
# ============================================================================

@router.post(
    "/agents/{agent_id}/test-cases",
    summary="Create Sandbox Test Case",
    operation_id="create_sandbox_test_case",
)
async def create_test_case(
    agent_id: str,
    body: CreateTestCaseRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Create a test case for an agent sandbox."""
    try:
        row = await execute_one(
            """
            INSERT INTO sandbox_test_cases
                (user_id, agent_id, name, input_message, expected_behavior)
            VALUES
                (:user_id, :agent_id, :name, :input_message, :expected_behavior)
            RETURNING *
            """,
            {
                "user_id": user_id,
                "agent_id": agent_id,
                "name": body.name,
                "input_message": body.input_message,
                "expected_behavior": body.expected_behavior,
            },
        )

        if not row:
            raise HTTPException(status_code=500, detail="Failed to create test case")

        return _serialize_test_case(row)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating test case: {e}")
        raise HTTPException(status_code=500, detail="Failed to create test case")


@router.get(
    "/agents/{agent_id}/test-cases",
    summary="List Sandbox Test Cases",
    operation_id="list_sandbox_test_cases",
)
async def list_test_cases(
    agent_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List all test cases for an agent."""
    try:
        rows = await execute(
            """
            SELECT * FROM sandbox_test_cases
            WHERE user_id::text = :user_id AND agent_id::text = :agent_id
            ORDER BY created_at DESC
            """,
            {"user_id": user_id, "agent_id": agent_id},
        )

        return {"test_cases": [_serialize_test_case(r) for r in rows]}

    except Exception as e:
        logger.error(f"Error listing test cases: {e}")
        raise HTTPException(status_code=500, detail="Failed to list test cases")


@router.post(
    "/agents/{agent_id}/test-cases/{case_id}/run",
    summary="Run Sandbox Test Case",
    operation_id="run_sandbox_test_case",
)
async def run_test_case(
    agent_id: str,
    case_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Run a test case: create a temporary sandbox, send the input, record the result."""
    try:
        # Fetch the test case
        test_case = await execute_one(
            """
            SELECT * FROM sandbox_test_cases
            WHERE id = :case_id AND user_id::text = :user_id AND agent_id::text = :agent_id
            """,
            {"case_id": case_id, "user_id": user_id, "agent_id": agent_id},
        )

        if not test_case:
            raise HTTPException(status_code=404, detail="Test case not found")

        # Create a temporary sandbox session
        sandbox = await execute_one(
            """
            INSERT INTO agent_sandbox_sessions
                (user_id, agent_id, sandbox_config, messages, status, expires_at)
            VALUES
                (:user_id, :agent_id, '{"test_run": true}'::jsonb, '[]'::jsonb, 'active',
                 now() + interval '5 minutes')
            RETURNING *
            """,
            {"user_id": user_id, "agent_id": agent_id},
        )

        # Generate simulated response
        response_text = _generate_simulated_response(agent_id, test_case["input_message"])

        now_iso = datetime.now(timezone.utc).isoformat()
        messages = [
            {"role": "user", "content": test_case["input_message"], "timestamp": now_iso},
            {"role": "assistant", "content": response_text, "timestamp": now_iso},
        ]

        # Mark sandbox as completed
        await execute_mutate(
            """
            UPDATE agent_sandbox_sessions
            SET messages = :messages::jsonb, status = 'completed', updated_at = now()
            WHERE id = :session_id
            """,
            {"session_id": sandbox["id"], "messages": json.dumps(messages)},
        )

        # Determine pass/fail (simple heuristic: response exists = pass in sandbox mode)
        passed = bool(response_text and len(response_text) > 0)

        result = {
            "passed": passed,
            "response": response_text,
            "sandbox_session_id": str(sandbox["id"]),
            "timestamp": now_iso,
        }

        # Update test case with result
        if passed:
            await execute_mutate(
                """
                UPDATE sandbox_test_cases
                SET last_result = :result::jsonb,
                    pass_count = pass_count + 1,
                    updated_at = now()
                WHERE id = :case_id
                """,
                {"case_id": case_id, "result": json.dumps(result)},
            )
        else:
            await execute_mutate(
                """
                UPDATE sandbox_test_cases
                SET last_result = :result::jsonb,
                    fail_count = fail_count + 1,
                    updated_at = now()
                WHERE id = :case_id
                """,
                {"case_id": case_id, "result": json.dumps(result)},
            )

        return {
            "test_case_id": str(test_case["id"]),
            "passed": passed,
            "result": result,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error running test case {case_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to run test case")


@router.delete(
    "/agents/{agent_id}/test-cases/{case_id}",
    summary="Delete Sandbox Test Case",
    operation_id="delete_sandbox_test_case",
)
async def delete_test_case(
    agent_id: str,
    case_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Delete a test case."""
    try:
        await execute_mutate(
            """
            DELETE FROM sandbox_test_cases
            WHERE id = :case_id AND user_id::text = :user_id AND agent_id::text = :agent_id
            """,
            {"case_id": case_id, "user_id": user_id, "agent_id": agent_id},
        )

        return {"deleted": True, "case_id": case_id}

    except Exception as e:
        logger.error(f"Error deleting test case {case_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete test case")
