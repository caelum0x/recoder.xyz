"""
Agent Dependency Graph API.

Manages relationships between agents: explicit (user-created) and auto-detected
(from clone history, shared KB sources, shared tool configurations).
"""

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate
from core.utils.logger import logger

router = APIRouter(tags=["agent-dependencies"])


# ============================================================================
# Pydantic Models
# ============================================================================

class CreateDependencyRequest(BaseModel):
    source_agent_id: str = Field(..., description="The agent that depends on another")
    target_agent_id: str = Field(..., description="The agent being depended upon")
    dependency_type: str = Field("calls", description="Type: calls, chains_to, shares_kb, shares_tools, cloned_from")
    description: Optional[str] = Field(None, description="Optional description of the relationship")


class DependencyResponse(BaseModel):
    id: str
    user_id: str
    source_agent_id: str
    target_agent_id: str
    dependency_type: str
    description: Optional[str] = None
    is_auto_detected: bool = False
    created_at: str


class GraphNode(BaseModel):
    agent_id: str
    name: str
    health_score: Optional[float] = None


class GraphEdge(BaseModel):
    id: str
    source: str
    target: str
    dependency_type: str
    description: Optional[str] = None
    is_auto_detected: bool = False


class DependencyGraphResponse(BaseModel):
    nodes: List[GraphNode] = []
    edges: List[GraphEdge] = []


class AutoDetectResponse(BaseModel):
    detected: int = 0
    dependencies: List[DependencyResponse] = []


# ============================================================================
# Helpers
# ============================================================================

VALID_TYPES = {"calls", "chains_to", "shares_kb", "shares_tools", "cloned_from"}


def _row_to_response(row: Dict[str, Any]) -> DependencyResponse:
    return DependencyResponse(
        id=str(row["id"]),
        user_id=str(row["user_id"]),
        source_agent_id=row["source_agent_id"],
        target_agent_id=row["target_agent_id"],
        dependency_type=row["dependency_type"],
        description=row.get("description"),
        is_auto_detected=row.get("is_auto_detected", False),
        created_at=str(row["created_at"]),
    )


# ============================================================================
# Endpoints
# ============================================================================

@router.post(
    "/agents/dependencies",
    summary="Create agent dependency",
    operation_id="create_agent_dependency",
)
async def create_dependency(
    body: CreateDependencyRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Create a dependency relationship between two agents."""
    if body.dependency_type not in VALID_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid dependency_type. Must be one of: {', '.join(VALID_TYPES)}")

    if body.source_agent_id == body.target_agent_id:
        raise HTTPException(status_code=400, detail="Source and target agent cannot be the same")

    # Verify both agents belong to this user
    for aid in [body.source_agent_id, body.target_agent_id]:
        agent = await execute_one(
            "SELECT agent_id FROM agents WHERE agent_id = :agent_id AND account_id = :user_id",
            {"agent_id": aid, "user_id": user_id},
        )
        if not agent:
            raise HTTPException(status_code=404, detail=f"Agent {aid} not found")

    try:
        row = await execute_one(
            """
            INSERT INTO agent_dependencies (user_id, source_agent_id, target_agent_id, dependency_type, description)
            VALUES (:user_id, :source_agent_id, :target_agent_id, :dependency_type, :description)
            ON CONFLICT (source_agent_id, target_agent_id, dependency_type) DO UPDATE SET
                description = COALESCE(EXCLUDED.description, agent_dependencies.description)
            RETURNING *
            """,
            {
                "user_id": user_id,
                "source_agent_id": body.source_agent_id,
                "target_agent_id": body.target_agent_id,
                "dependency_type": body.dependency_type,
                "description": body.description,
            },
        )
        return _row_to_response(row)
    except Exception as e:
        logger.error(f"Error creating dependency: {e}")
        raise HTTPException(status_code=500, detail="Failed to create dependency")


@router.get(
    "/agents/dependencies",
    summary="List agent dependencies",
    operation_id="list_agent_dependencies",
)
async def list_dependencies(
    agent_id: Optional[str] = Query(None, description="Filter by source or target agent"),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List all dependencies, optionally filtered by agent_id (as source or target)."""
    try:
        if agent_id:
            rows = await execute(
                """
                SELECT * FROM agent_dependencies
                WHERE user_id = :user_id
                  AND (source_agent_id = :agent_id OR target_agent_id = :agent_id)
                ORDER BY created_at DESC
                """,
                {"user_id": user_id, "agent_id": agent_id},
            )
        else:
            rows = await execute(
                """
                SELECT * FROM agent_dependencies
                WHERE user_id = :user_id
                ORDER BY created_at DESC
                """,
                {"user_id": user_id},
            )

        return [_row_to_response(row) for row in rows]
    except Exception as e:
        logger.error(f"Error listing dependencies: {e}")
        raise HTTPException(status_code=500, detail="Failed to list dependencies")


@router.delete(
    "/agents/dependencies/{dep_id}",
    summary="Delete agent dependency",
    operation_id="delete_agent_dependency",
)
async def delete_dependency(
    dep_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Delete a dependency by ID."""
    try:
        row = await execute_one(
            "DELETE FROM agent_dependencies WHERE id = :dep_id AND user_id = :user_id RETURNING id",
            {"dep_id": dep_id, "user_id": user_id},
        )
        if not row:
            raise HTTPException(status_code=404, detail="Dependency not found")
        return {"deleted": True, "id": str(row["id"])}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting dependency {dep_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete dependency")


@router.get(
    "/agents/dependency-graph",
    summary="Get full agent dependency graph",
    operation_id="get_agent_dependency_graph",
    response_model=DependencyGraphResponse,
)
async def get_dependency_graph(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Return the full dependency graph: nodes (agents) and edges (dependencies).
    Nodes include agent name and latest health score.
    """
    try:
        # Get all agents for this user
        agents = await execute(
            "SELECT agent_id, name FROM agents WHERE account_id = :user_id",
            {"user_id": user_id},
        )

        # Get all dependencies
        deps = await execute(
            "SELECT * FROM agent_dependencies WHERE user_id = :user_id",
            {"user_id": user_id},
        )

        # Batch-fetch latest health scores
        health_map: Dict[str, Optional[float]] = {}
        if agents:
            health_rows = await execute(
                """
                SELECT DISTINCT ON (agent_id) agent_id, overall_score
                FROM agent_health_scores
                WHERE user_id = :user_id
                ORDER BY agent_id, calculated_at DESC
                """,
                {"user_id": user_id},
            )
            for hr in (health_rows or []):
                health_map[hr["agent_id"]] = float(hr["overall_score"]) if hr.get("overall_score") is not None else None

        # Build node set: include all agents that appear in dependencies plus all user agents
        agent_ids_in_graph = set()
        for d in deps:
            agent_ids_in_graph.add(d["source_agent_id"])
            agent_ids_in_graph.add(d["target_agent_id"])

        agent_name_map = {a["agent_id"]: a["name"] for a in agents}

        nodes = []
        for a in agents:
            aid = a["agent_id"]
            if aid in agent_ids_in_graph:
                nodes.append(GraphNode(
                    agent_id=aid,
                    name=a["name"] or aid[:8],
                    health_score=health_map.get(aid),
                ))

        edges = []
        for d in deps:
            edges.append(GraphEdge(
                id=str(d["id"]),
                source=d["source_agent_id"],
                target=d["target_agent_id"],
                dependency_type=d["dependency_type"],
                description=d.get("description"),
                is_auto_detected=d.get("is_auto_detected", False),
            ))

        return DependencyGraphResponse(nodes=nodes, edges=edges)
    except Exception as e:
        logger.error(f"Error building dependency graph: {e}")
        raise HTTPException(status_code=500, detail="Failed to build dependency graph")


@router.post(
    "/agents/dependencies/auto-detect",
    summary="Auto-detect agent dependencies",
    operation_id="auto_detect_agent_dependencies",
    response_model=AutoDetectResponse,
)
async def auto_detect_dependencies(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Auto-detect dependencies by inspecting:
    1. Clone history (cloned_from)
    2. Shared knowledge base sources (shares_kb)
    3. Shared tool configurations (shares_tools)
    """
    detected: List[DependencyResponse] = []

    try:
        # --- 1. Clone history ---
        clone_rows = await execute(
            """
            SELECT source_agent_id, cloned_agent_id
            FROM agent_clone_history
            WHERE user_id = :user_id
            """,
            {"user_id": user_id},
        )
        for cr in (clone_rows or []):
            row = await execute_one(
                """
                INSERT INTO agent_dependencies (user_id, source_agent_id, target_agent_id, dependency_type, is_auto_detected, description)
                VALUES (:user_id, :cloned, :source, 'cloned_from', true, 'Auto-detected from clone history')
                ON CONFLICT (source_agent_id, target_agent_id, dependency_type) DO NOTHING
                RETURNING *
                """,
                {
                    "user_id": user_id,
                    "cloned": cr["cloned_agent_id"],
                    "source": cr["source_agent_id"],
                },
            )
            if row:
                detected.append(_row_to_response(row))

        # --- 2. Shared MCP configs (shares_kb proxy) ---
        # Find agents that share the same configured_mcps entries (same MCP server URLs).
        # This covers both shared KB and shared tool connections.
        mcp_rows = await execute(
            """
            SELECT a.agent_id, v.configured_mcps
            FROM agents a
            JOIN agent_versions v ON a.current_version_id = v.version_id
            WHERE a.account_id = :user_id
              AND v.configured_mcps IS NOT NULL
              AND v.configured_mcps != '[]'::jsonb
              AND v.configured_mcps != 'null'::jsonb
            """,
            {"user_id": user_id},
        )

        # Build mcp_url -> agents mapping to find shared KB servers
        mcp_agents: Dict[str, List[str]] = {}
        for mr in (mcp_rows or []):
            mcps = mr.get("configured_mcps")
            if not mcps or not isinstance(mcps, list):
                continue
            for mcp in mcps:
                mcp_url = None
                if isinstance(mcp, dict):
                    mcp_url = mcp.get("url") or mcp.get("server_url") or mcp.get("name")
                elif isinstance(mcp, str):
                    mcp_url = mcp
                if mcp_url:
                    mcp_agents.setdefault(str(mcp_url), []).append(mr["agent_id"])

        seen_kb_pairs = set()
        for mcp_url, agent_ids in mcp_agents.items():
            if len(agent_ids) < 2:
                continue
            unique_agents = list(set(agent_ids))
            for i in range(len(unique_agents)):
                for j in range(i + 1, len(unique_agents)):
                    pair = tuple(sorted([unique_agents[i], unique_agents[j]]))
                    if pair in seen_kb_pairs:
                        continue
                    seen_kb_pairs.add(pair)
                    row = await execute_one(
                        """
                        INSERT INTO agent_dependencies (user_id, source_agent_id, target_agent_id, dependency_type, is_auto_detected, description)
                        VALUES (:user_id, :a, :b, 'shares_kb', true, :desc)
                        ON CONFLICT (source_agent_id, target_agent_id, dependency_type) DO NOTHING
                        RETURNING *
                        """,
                        {
                            "user_id": user_id,
                            "a": pair[0],
                            "b": pair[1],
                            "desc": f"Auto-detected: both use MCP server '{mcp_url}'",
                        },
                    )
                    if row:
                        detected.append(_row_to_response(row))

        # --- 3. Shared agentpress tools ---
        # Find agents sharing the same enabled agentpress tools
        tool_rows = await execute(
            """
            SELECT a.agent_id, v.agentpress_tools
            FROM agents a
            JOIN agent_versions v ON a.current_version_id = v.version_id
            WHERE a.account_id = :user_id
              AND v.agentpress_tools IS NOT NULL
              AND v.agentpress_tools != '{}'::jsonb
              AND v.agentpress_tools != 'null'::jsonb
            """,
            {"user_id": user_id},
        )

        # Build tool -> agents mapping
        tool_agents: Dict[str, List[str]] = {}
        for tr in (tool_rows or []):
            tools = tr.get("agentpress_tools")
            if not tools or not isinstance(tools, dict):
                continue
            for tool_name, tool_config in tools.items():
                if isinstance(tool_config, dict) and tool_config.get("enabled"):
                    tool_agents.setdefault(tool_name, []).append(tr["agent_id"])

        # Create shares_tools for agents sharing the same tool
        seen_tool_pairs = set()
        for tool_name, agent_ids in tool_agents.items():
            if len(agent_ids) < 2:
                continue
            unique_agents = list(set(agent_ids))
            for i in range(len(unique_agents)):
                for j in range(i + 1, len(unique_agents)):
                    pair = tuple(sorted([unique_agents[i], unique_agents[j]]))
                    if pair in seen_tool_pairs:
                        continue
                    seen_tool_pairs.add(pair)
                    row = await execute_one(
                        """
                        INSERT INTO agent_dependencies (user_id, source_agent_id, target_agent_id, dependency_type, is_auto_detected, description)
                        VALUES (:user_id, :a, :b, 'shares_tools', true, :desc)
                        ON CONFLICT (source_agent_id, target_agent_id, dependency_type) DO NOTHING
                        RETURNING *
                        """,
                        {
                            "user_id": user_id,
                            "a": pair[0],
                            "b": pair[1],
                            "desc": f"Auto-detected: both use tool '{tool_name}'",
                        },
                    )
                    if row:
                        detected.append(_row_to_response(row))

        return AutoDetectResponse(detected=len(detected), dependencies=detected)

    except Exception as e:
        logger.error(f"Error auto-detecting dependencies: {e}")
        raise HTTPException(status_code=500, detail="Failed to auto-detect dependencies")
