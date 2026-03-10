from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one
from core.utils.logger import logger

router = APIRouter(prefix="/teams", tags=["teams"])


class CreateTeamRequest(BaseModel):
    name: str
    description: str | None = None


class UpdateTeamRequest(BaseModel):
    name: str | None = None
    description: str | None = None


class InviteMemberRequest(BaseModel):
    email: str
    role: str = "member"


class UpdateMemberRoleRequest(BaseModel):
    role: str


@router.get("", summary="List user's teams")
async def list_teams(user_id: str = Depends(verify_and_get_user_id_from_jwt)):
    rows = await execute(
        """
        SELECT t.*, tm.role as my_role,
               (SELECT COUNT(*) FROM team_members WHERE team_id = t.id) as member_count
        FROM teams t
        JOIN team_members tm ON tm.team_id = t.id AND tm.user_id = :user_id
        ORDER BY t.created_at DESC
        """,
        {"user_id": user_id},
    )
    return [dict(r) for r in rows]


@router.post("", summary="Create team")
async def create_team(
    body: CreateTeamRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    team = await execute_one(
        """
        INSERT INTO teams (name, description, owner_id)
        VALUES (:name, :description, :owner_id)
        RETURNING *
        """,
        {"name": body.name, "description": body.description, "owner_id": user_id},
    )
    # Add creator as owner member
    await execute(
        """
        INSERT INTO team_members (team_id, user_id, role, accepted_at)
        VALUES (:team_id, :user_id, 'owner', now())
        """,
        {"team_id": team["id"], "user_id": user_id},
    )
    return dict(team)


@router.get("/{team_id}", summary="Get team detail")
async def get_team(
    team_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    # Verify membership
    member = await execute_one(
        "SELECT * FROM team_members WHERE team_id = :team_id AND user_id = :user_id",
        {"team_id": team_id, "user_id": user_id},
    )
    if not member:
        raise HTTPException(status_code=403, detail="Not a team member")

    team = await execute_one("SELECT * FROM teams WHERE id = :id", {"id": team_id})
    members = await execute(
        "SELECT * FROM team_members WHERE team_id = :team_id ORDER BY invited_at",
        {"team_id": team_id},
    )
    result = dict(team)
    result["members"] = [dict(m) for m in members]
    result["my_role"] = member["role"]
    return result


@router.patch("/{team_id}", summary="Update team")
async def update_team(
    team_id: str,
    body: UpdateTeamRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    team = await execute_one(
        "SELECT * FROM teams WHERE id = :id AND owner_id = :owner_id",
        {"id": team_id, "owner_id": user_id},
    )
    if not team:
        raise HTTPException(status_code=403, detail="Only the owner can update the team")

    updates = []
    params: dict = {"id": team_id}
    if body.name is not None:
        updates.append("name = :name")
        params["name"] = body.name
    if body.description is not None:
        updates.append("description = :description")
        params["description"] = body.description
    if not updates:
        return dict(team)

    row = await execute_one(
        f"UPDATE teams SET {', '.join(updates)} WHERE id = :id RETURNING *", params
    )
    return dict(row)


@router.delete("/{team_id}", summary="Delete team")
async def delete_team(
    team_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    team = await execute_one(
        "SELECT * FROM teams WHERE id = :id AND owner_id = :owner_id",
        {"id": team_id, "owner_id": user_id},
    )
    if not team:
        raise HTTPException(status_code=403, detail="Only the owner can delete the team")
    await execute("DELETE FROM teams WHERE id = :id", {"id": team_id})
    return {"status": "ok"}


@router.post("/{team_id}/invite", summary="Invite member")
async def invite_member(
    team_id: str,
    body: InviteMemberRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    # Verify admin/owner
    member = await execute_one(
        "SELECT * FROM team_members WHERE team_id = :team_id AND user_id = :user_id AND role IN ('owner', 'admin')",
        {"team_id": team_id, "user_id": user_id},
    )
    if not member:
        raise HTTPException(status_code=403, detail="Only admins can invite members")

    valid_roles = ("admin", "member", "viewer")
    if body.role not in valid_roles:
        raise HTTPException(status_code=400, detail=f"Role must be one of {valid_roles}")

    try:
        # Look up the user by email to get their real user_id
        existing_user = await execute_one(
            "SELECT id FROM auth.users WHERE LOWER(email) = LOWER(:email)",
            {"email": body.email},
        )

        if existing_user:
            # User exists — use their real user_id so the UNIQUE(team_id, user_id)
            # constraint correctly prevents duplicate invites
            target_user_id = str(existing_user["id"])

            # Check if already a member
            already_member = await execute_one(
                "SELECT id FROM team_members WHERE team_id = :team_id AND user_id = :user_id",
                {"team_id": team_id, "user_id": target_user_id},
            )
            if already_member:
                raise HTTPException(status_code=409, detail="User is already a member or has a pending invite")

            await execute(
                """
                INSERT INTO team_members (team_id, user_id, email, role)
                VALUES (:team_id, :user_id, :email, :role)
                """,
                {"team_id": team_id, "user_id": target_user_id, "email": body.email, "role": body.role},
            )
        else:
            # User doesn't exist yet — check for duplicate invite by email
            existing_invite = await execute_one(
                "SELECT id FROM team_members WHERE team_id = :team_id AND LOWER(email) = LOWER(:email)",
                {"team_id": team_id, "email": body.email},
            )
            if existing_invite:
                raise HTTPException(status_code=409, detail="An invite for this email already exists")

            # Store with a placeholder UUID (user_id is NOT NULL in schema)
            await execute(
                """
                INSERT INTO team_members (team_id, user_id, email, role)
                VALUES (:team_id, gen_random_uuid(), :email, :role)
                """,
                {"team_id": team_id, "email": body.email, "role": body.role},
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"Failed to invite member: {e}")
        raise HTTPException(status_code=400, detail="Failed to invite member")

    return {"status": "invited"}


@router.delete("/{team_id}/members/{member_user_id}", summary="Remove member")
async def remove_member(
    team_id: str,
    member_user_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    # Verify admin/owner
    member = await execute_one(
        "SELECT * FROM team_members WHERE team_id = :team_id AND user_id = :user_id AND role IN ('owner', 'admin')",
        {"team_id": team_id, "user_id": user_id},
    )
    if not member:
        raise HTTPException(status_code=403, detail="Only admins can remove members")

    # Can't remove the owner
    target = await execute_one(
        "SELECT * FROM team_members WHERE team_id = :team_id AND user_id = :member_user_id",
        {"team_id": team_id, "member_user_id": member_user_id},
    )
    if target and target["role"] == "owner":
        raise HTTPException(status_code=400, detail="Cannot remove the team owner")

    await execute(
        "DELETE FROM team_members WHERE team_id = :team_id AND user_id = :member_user_id",
        {"team_id": team_id, "member_user_id": member_user_id},
    )
    return {"status": "ok"}


@router.patch("/{team_id}/members/{member_user_id}", summary="Change member role")
async def update_member_role(
    team_id: str,
    member_user_id: str,
    body: UpdateMemberRoleRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    # Verify admin/owner
    member = await execute_one(
        "SELECT * FROM team_members WHERE team_id = :team_id AND user_id = :user_id AND role IN ('owner', 'admin')",
        {"team_id": team_id, "user_id": user_id},
    )
    if not member:
        raise HTTPException(status_code=403, detail="Only admins can change roles")

    valid_roles = ("admin", "member", "viewer")
    if body.role not in valid_roles:
        raise HTTPException(status_code=400, detail=f"Role must be one of {valid_roles}")

    await execute(
        "UPDATE team_members SET role = :role WHERE team_id = :team_id AND user_id = :member_user_id",
        {"team_id": team_id, "member_user_id": member_user_id, "role": body.role},
    )
    return {"status": "ok"}
