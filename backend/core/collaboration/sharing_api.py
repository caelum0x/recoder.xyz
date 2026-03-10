"""
Team sharing API for threads and agents.

Provides endpoints to share threads with collaborators, share agents with
team members, and view resources shared with the current user.
"""

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one
from core.utils.logger import logger

router = APIRouter(prefix="/collaboration", tags=["collaboration"])


# ============================================================================
# Pydantic Models
# ============================================================================

class ShareThreadRequest(BaseModel):
    email: str = Field(..., description="Email of the user to share with")
    role: str = Field("viewer", description="Role: viewer, editor, or admin")


class ThreadCollaboratorResponse(BaseModel):
    id: str
    thread_id: str
    user_id: str
    email: Optional[str] = None
    role: str
    invited_by: str
    accepted_at: Optional[str] = None
    created_at: str


class ShareAgentRequest(BaseModel):
    email: str = Field(..., description="Email of the user to share with")
    role: str = Field("user", description="Role: user, editor, or admin")


class AgentTeamAccessResponse(BaseModel):
    id: str
    agent_id: str
    user_id: str
    email: Optional[str] = None
    role: str
    granted_by: str
    created_at: str


class SharedWithMeResponse(BaseModel):
    shared_threads: List[ThreadCollaboratorResponse] = []
    shared_agents: List[AgentTeamAccessResponse] = []


# ============================================================================
# Helper: resolve email -> user_id
# ============================================================================

async def _resolve_user_id_from_email(email: str) -> Optional[str]:
    """Look up a user_id by email from the accounts table."""
    try:
        row = await execute_one(
            "SELECT id FROM accounts WHERE email = :email LIMIT 1",
            {"email": email},
        )
        return str(row["id"]) if row else None
    except Exception as e:
        logger.warning(f"Failed to resolve user_id from email: {e}")
        return None


# ============================================================================
# Thread Sharing Endpoints
# ============================================================================

@router.post(
    "/threads/{thread_id}/share",
    response_model=ThreadCollaboratorResponse,
    summary="Share a thread with a collaborator",
)
async def share_thread(
    thread_id: str,
    body: ShareThreadRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Share a thread with another user by email.
    Only the thread owner or existing admin collaborators can share.
    """
    try:
        if body.role not in ("viewer", "editor", "admin"):
            raise HTTPException(status_code=400, detail="role must be one of: viewer, editor, admin")

        # Verify requester owns the thread or is an admin collaborator
        thread_row = await execute_one(
            "SELECT account_id FROM threads WHERE thread_id = :thread_id",
            {"thread_id": thread_id},
        )
        if not thread_row:
            raise HTTPException(status_code=404, detail="Thread not found")

        is_owner = str(thread_row["account_id"]) == user_id
        if not is_owner:
            admin_row = await execute_one(
                "SELECT id FROM thread_collaborators WHERE thread_id = :thread_id AND user_id = :user_id AND role = 'admin'",
                {"thread_id": thread_id, "user_id": user_id},
            )
            if not admin_row:
                raise HTTPException(status_code=403, detail="Only the thread owner or admin collaborators can share")

        # Resolve the target user
        target_user_id = await _resolve_user_id_from_email(body.email)
        if not target_user_id:
            raise HTTPException(status_code=404, detail="No user found with that email")

        if target_user_id == user_id:
            raise HTTPException(status_code=400, detail="Cannot share a thread with yourself")

        # Insert collaborator record
        sql = """
        INSERT INTO thread_collaborators (thread_id, user_id, email, role, invited_by)
        VALUES (:thread_id, :target_user_id, :email, :role, :invited_by)
        ON CONFLICT (thread_id, user_id) DO UPDATE SET role = EXCLUDED.role
        RETURNING id, thread_id, user_id, email, role, invited_by, accepted_at, created_at
        """
        row = await execute_one(sql, {
            "thread_id": thread_id,
            "target_user_id": target_user_id,
            "email": body.email,
            "role": body.role,
            "invited_by": user_id,
        }, commit=True)

        if not row:
            raise HTTPException(status_code=500, detail="Failed to create collaborator record")

        return ThreadCollaboratorResponse(
            id=str(row["id"]),
            thread_id=str(row["thread_id"]),
            user_id=str(row["user_id"]),
            email=row.get("email"),
            role=row["role"],
            invited_by=str(row["invited_by"]),
            accepted_at=row["accepted_at"].isoformat() if row.get("accepted_at") and hasattr(row["accepted_at"], "isoformat") else None,
            created_at=row["created_at"].isoformat() if hasattr(row["created_at"], "isoformat") else str(row["created_at"]),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error sharing thread {thread_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to share thread")


@router.get(
    "/threads/{thread_id}/collaborators",
    response_model=List[ThreadCollaboratorResponse],
    summary="List thread collaborators",
)
async def list_thread_collaborators(
    thread_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    List all collaborators for a thread.
    Only the thread owner or existing collaborators can view.
    """
    try:
        # Verify requester has access
        thread_row = await execute_one(
            "SELECT account_id FROM threads WHERE thread_id = :thread_id",
            {"thread_id": thread_id},
        )
        if not thread_row:
            raise HTTPException(status_code=404, detail="Thread not found")

        is_owner = str(thread_row["account_id"]) == user_id
        if not is_owner:
            collab_row = await execute_one(
                "SELECT id FROM thread_collaborators WHERE thread_id = :thread_id AND user_id = :user_id",
                {"thread_id": thread_id, "user_id": user_id},
            )
            if not collab_row:
                raise HTTPException(status_code=403, detail="Access denied")

        rows = await execute(
            """
            SELECT id, thread_id, user_id, email, role, invited_by, accepted_at, created_at
            FROM thread_collaborators
            WHERE thread_id = :thread_id
            ORDER BY created_at ASC
            """,
            {"thread_id": thread_id},
        )

        return [
            ThreadCollaboratorResponse(
                id=str(row["id"]),
                thread_id=str(row["thread_id"]),
                user_id=str(row["user_id"]),
                email=row.get("email"),
                role=row["role"],
                invited_by=str(row["invited_by"]),
                accepted_at=row["accepted_at"].isoformat() if row.get("accepted_at") and hasattr(row["accepted_at"], "isoformat") else None,
                created_at=row["created_at"].isoformat() if hasattr(row["created_at"], "isoformat") else str(row["created_at"]),
            )
            for row in (rows or [])
        ]

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing thread collaborators for {thread_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to list collaborators")


@router.delete(
    "/threads/{thread_id}/collaborators/{collaborator_id}",
    summary="Remove a thread collaborator",
)
async def remove_thread_collaborator(
    thread_id: str,
    collaborator_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Remove a collaborator from a thread.
    Only the thread owner can remove collaborators.
    """
    try:
        # Verify requester owns the thread
        thread_row = await execute_one(
            "SELECT account_id FROM threads WHERE thread_id = :thread_id",
            {"thread_id": thread_id},
        )
        if not thread_row:
            raise HTTPException(status_code=404, detail="Thread not found")

        if str(thread_row["account_id"]) != user_id:
            raise HTTPException(status_code=403, detail="Only the thread owner can remove collaborators")

        # Delete the collaborator
        row = await execute_one(
            "DELETE FROM thread_collaborators WHERE id = :collaborator_id AND thread_id = :thread_id RETURNING id",
            {"collaborator_id": collaborator_id, "thread_id": thread_id},
            commit=True,
        )

        if not row:
            raise HTTPException(status_code=404, detail="Collaborator not found")

        return {"status": "removed", "id": collaborator_id}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error removing collaborator {collaborator_id} from thread {thread_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to remove collaborator")


# ============================================================================
# Agent Sharing Endpoints
# ============================================================================

@router.post(
    "/agents/{agent_id}/share",
    response_model=AgentTeamAccessResponse,
    summary="Share an agent with a team member",
)
async def share_agent(
    agent_id: str,
    body: ShareAgentRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Share an agent with another user by email.
    Only the agent owner or existing admin team members can share.
    """
    try:
        if body.role not in ("user", "editor", "admin"):
            raise HTTPException(status_code=400, detail="role must be one of: user, editor, admin")

        # Verify requester owns the agent or is an admin team member
        agent_row = await execute_one(
            "SELECT account_id FROM agents WHERE agent_id = :agent_id",
            {"agent_id": agent_id},
        )
        if not agent_row:
            raise HTTPException(status_code=404, detail="Agent not found")

        is_owner = str(agent_row["account_id"]) == user_id
        if not is_owner:
            admin_row = await execute_one(
                "SELECT id FROM agent_team_access WHERE agent_id = :agent_id AND user_id = :user_id AND role = 'admin'",
                {"agent_id": agent_id, "user_id": user_id},
            )
            if not admin_row:
                raise HTTPException(status_code=403, detail="Only the agent owner or admin team members can share")

        # Resolve the target user
        target_user_id = await _resolve_user_id_from_email(body.email)
        if not target_user_id:
            raise HTTPException(status_code=404, detail="No user found with that email")

        if target_user_id == user_id:
            raise HTTPException(status_code=400, detail="Cannot share an agent with yourself")

        # Insert team access record
        sql = """
        INSERT INTO agent_team_access (agent_id, user_id, email, role, granted_by)
        VALUES (:agent_id, :target_user_id, :email, :role, :granted_by)
        ON CONFLICT (agent_id, user_id) DO UPDATE SET role = EXCLUDED.role
        RETURNING id, agent_id, user_id, email, role, granted_by, created_at
        """
        row = await execute_one(sql, {
            "agent_id": agent_id,
            "target_user_id": target_user_id,
            "email": body.email,
            "role": body.role,
            "granted_by": user_id,
        }, commit=True)

        if not row:
            raise HTTPException(status_code=500, detail="Failed to create team access record")

        return AgentTeamAccessResponse(
            id=str(row["id"]),
            agent_id=str(row["agent_id"]),
            user_id=str(row["user_id"]),
            email=row.get("email"),
            role=row["role"],
            granted_by=str(row["granted_by"]),
            created_at=row["created_at"].isoformat() if hasattr(row["created_at"], "isoformat") else str(row["created_at"]),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error sharing agent {agent_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to share agent")


@router.get(
    "/agents/{agent_id}/team",
    response_model=List[AgentTeamAccessResponse],
    summary="List agent team access",
)
async def list_agent_team(
    agent_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    List all team members with access to an agent.
    Only the agent owner or existing team members can view.
    """
    try:
        # Verify requester has access
        agent_row = await execute_one(
            "SELECT account_id FROM agents WHERE agent_id = :agent_id",
            {"agent_id": agent_id},
        )
        if not agent_row:
            raise HTTPException(status_code=404, detail="Agent not found")

        is_owner = str(agent_row["account_id"]) == user_id
        if not is_owner:
            access_row = await execute_one(
                "SELECT id FROM agent_team_access WHERE agent_id = :agent_id AND user_id = :user_id",
                {"agent_id": agent_id, "user_id": user_id},
            )
            if not access_row:
                raise HTTPException(status_code=403, detail="Access denied")

        rows = await execute(
            """
            SELECT id, agent_id, user_id, email, role, granted_by, created_at
            FROM agent_team_access
            WHERE agent_id = :agent_id
            ORDER BY created_at ASC
            """,
            {"agent_id": agent_id},
        )

        return [
            AgentTeamAccessResponse(
                id=str(row["id"]),
                agent_id=str(row["agent_id"]),
                user_id=str(row["user_id"]),
                email=row.get("email"),
                role=row["role"],
                granted_by=str(row["granted_by"]),
                created_at=row["created_at"].isoformat() if hasattr(row["created_at"], "isoformat") else str(row["created_at"]),
            )
            for row in (rows or [])
        ]

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing agent team for {agent_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to list team access")


@router.delete(
    "/agents/{agent_id}/team/{access_id}",
    summary="Remove agent team access",
)
async def remove_agent_team_access(
    agent_id: str,
    access_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Remove a team member's access to an agent.
    Only the agent owner can remove team members.
    """
    try:
        # Verify requester owns the agent
        agent_row = await execute_one(
            "SELECT account_id FROM agents WHERE agent_id = :agent_id",
            {"agent_id": agent_id},
        )
        if not agent_row:
            raise HTTPException(status_code=404, detail="Agent not found")

        if str(agent_row["account_id"]) != user_id:
            raise HTTPException(status_code=403, detail="Only the agent owner can remove team members")

        # Delete the access record
        row = await execute_one(
            "DELETE FROM agent_team_access WHERE id = :access_id AND agent_id = :agent_id RETURNING id",
            {"access_id": access_id, "agent_id": agent_id},
            commit=True,
        )

        if not row:
            raise HTTPException(status_code=404, detail="Team access record not found")

        return {"status": "removed", "id": access_id}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error removing team access {access_id} from agent {agent_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to remove team access")


# ============================================================================
# Shared-With-Me Endpoint
# ============================================================================

@router.get(
    "/shared-with-me",
    response_model=SharedWithMeResponse,
    summary="Get threads and agents shared with me",
)
async def get_shared_with_me(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Returns all threads and agents that have been shared with the current user.
    """
    try:
        # Shared threads
        thread_rows = await execute(
            """
            SELECT id, thread_id, user_id, email, role, invited_by, accepted_at, created_at
            FROM thread_collaborators
            WHERE user_id = :user_id
            ORDER BY created_at DESC
            """,
            {"user_id": user_id},
        )

        shared_threads = [
            ThreadCollaboratorResponse(
                id=str(row["id"]),
                thread_id=str(row["thread_id"]),
                user_id=str(row["user_id"]),
                email=row.get("email"),
                role=row["role"],
                invited_by=str(row["invited_by"]),
                accepted_at=row["accepted_at"].isoformat() if row.get("accepted_at") and hasattr(row["accepted_at"], "isoformat") else None,
                created_at=row["created_at"].isoformat() if hasattr(row["created_at"], "isoformat") else str(row["created_at"]),
            )
            for row in (thread_rows or [])
        ]

        # Shared agents
        agent_rows = await execute(
            """
            SELECT id, agent_id, user_id, email, role, granted_by, created_at
            FROM agent_team_access
            WHERE user_id = :user_id
            ORDER BY created_at DESC
            """,
            {"user_id": user_id},
        )

        shared_agents = [
            AgentTeamAccessResponse(
                id=str(row["id"]),
                agent_id=str(row["agent_id"]),
                user_id=str(row["user_id"]),
                email=row.get("email"),
                role=row["role"],
                granted_by=str(row["granted_by"]),
                created_at=row["created_at"].isoformat() if hasattr(row["created_at"], "isoformat") else str(row["created_at"]),
            )
            for row in (agent_rows or [])
        ]

        return SharedWithMeResponse(
            shared_threads=shared_threads,
            shared_agents=shared_agents,
        )

    except Exception as e:
        logger.error(f"Error fetching shared-with-me for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch shared resources")
