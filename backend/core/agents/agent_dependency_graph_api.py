"""
Agent Dependency Graph API (Sprint 59 Phase 4).

Extends the existing agent dependency system with:
- Per-agent dependency CRUD on /agents/{agent_id}/dependencies
- Full dependency graph for all user agents
- Impact analysis (reverse dependency walk)
- Dependency stats (most depended-on, orphans, circular detection)
"""

from collections import defaultdict, deque
from typing import Any, Dict, List, Optional, Set

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate
from core.utils.logger import logger

router = APIRouter(tags=["agent-dependency-graph"])


# ============================================================================
# Pydantic Models
# ============================================================================

class AddDependencyRequest(BaseModel):
    depends_on_agent_id: str = Field(..., description="The agent that this agent depends on")
    dependency_type: str = Field("calls", description="Type: calls, triggers, shares_data, requires, extends")
    description: Optional[str] = Field(None, description="Optional description")


class DependencyRecord(BaseModel):
    id: str
    agent_id: str
    depends_on_agent_id: str
    dependency_type: str
    description: Optional[str] = None
    is_active: bool = True
    created_at: str


class GraphNode(BaseModel):
    id: str
    name: str


class GraphEdge(BaseModel):
    source: str
    target: str
    type: str


class DependencyGraphResponse(BaseModel):
    nodes: List[GraphNode] = []
    edges: List[GraphEdge] = []


class ImpactNode(BaseModel):
    agent_id: str
    name: str
    depth: int
    dependency_type: str


class ImpactAnalysisResponse(BaseModel):
    agent_id: str
    affected_agents: List[ImpactNode] = []
    total_affected: int = 0


class TopDependedAgent(BaseModel):
    agent_id: str
    name: str
    dependent_count: int


class OrphanAgent(BaseModel):
    agent_id: str
    name: str


class CircularChain(BaseModel):
    cycle: List[str]


class DependencyStatsResponse(BaseModel):
    most_depended_on: List[TopDependedAgent] = []
    orphan_agents: List[OrphanAgent] = []
    circular_dependencies: List[CircularChain] = []


# ============================================================================
# Valid dependency types
# ============================================================================

VALID_TYPES = {"calls", "triggers", "shares_data", "requires", "extends"}


# ============================================================================
# Helpers
# ============================================================================

def _row_to_record(row: Dict[str, Any]) -> DependencyRecord:
    return DependencyRecord(
        id=str(row["id"]),
        agent_id=row.get("agent_id") or row.get("source_agent_id", ""),
        depends_on_agent_id=row.get("depends_on_agent_id") or row.get("target_agent_id", ""),
        dependency_type=row["dependency_type"],
        description=row.get("description"),
        is_active=row.get("is_active", True),
        created_at=str(row["created_at"]),
    )


def _detect_cycles(adj: Dict[str, List[str]]) -> List[List[str]]:
    """Detect cycles in directed graph using DFS. Returns list of cycles."""
    WHITE, GRAY, BLACK = 0, 1, 2
    color: Dict[str, int] = {node: WHITE for node in adj}
    path: List[str] = []
    cycles: List[List[str]] = []

    def dfs(u: str):
        color[u] = GRAY
        path.append(u)
        for v in adj.get(u, []):
            if v not in color:
                color[v] = WHITE
            if color[v] == GRAY:
                # Found a cycle — extract it
                cycle_start = path.index(v)
                cycle = path[cycle_start:] + [v]
                cycles.append(cycle)
            elif color[v] == WHITE:
                dfs(v)
        path.pop()
        color[u] = BLACK

    for node in list(adj.keys()):
        if color.get(node, WHITE) == WHITE:
            dfs(node)

    return cycles


# ============================================================================
# Endpoints
# ============================================================================

@router.post(
    "/agents/{agent_id}/dependencies",
    summary="Add a dependency for an agent",
    operation_id="add_agent_dependency_v2",
)
async def add_dependency(
    agent_id: str,
    body: AddDependencyRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Add a dependency: agent_id depends on body.depends_on_agent_id."""
    if body.dependency_type not in VALID_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid dependency_type. Must be one of: {', '.join(VALID_TYPES)}",
        )

    if agent_id == body.depends_on_agent_id:
        raise HTTPException(status_code=400, detail="An agent cannot depend on itself")

    # Verify both agents belong to the user
    for aid in [agent_id, body.depends_on_agent_id]:
        agent = await execute_one(
            "SELECT agent_id FROM agents WHERE agent_id::text = :aid AND account_id::text = :user_id",
            {"aid": aid, "user_id": user_id},
        )
        if not agent:
            raise HTTPException(status_code=404, detail=f"Agent {aid} not found")

    try:
        row = await execute_one(
            """
            INSERT INTO agent_dependencies
                (user_id, source_agent_id, target_agent_id, dependency_type, description)
            VALUES
                (:user_id, :agent_id, :depends_on, :dep_type, :description)
            ON CONFLICT (source_agent_id, target_agent_id, dependency_type) DO UPDATE SET
                description = COALESCE(EXCLUDED.description, agent_dependencies.description)
            RETURNING *
            """,
            {
                "user_id": user_id,
                "agent_id": agent_id,
                "depends_on": body.depends_on_agent_id,
                "dep_type": body.dependency_type,
                "description": body.description,
            },
            commit=True,
        )

        return DependencyRecord(
            id=str(row["id"]),
            agent_id=row["source_agent_id"],
            depends_on_agent_id=row["target_agent_id"],
            dependency_type=row["dependency_type"],
            description=row.get("description"),
            is_active=row.get("is_active", True),
            created_at=str(row["created_at"]),
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error adding dependency for agent {agent_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to add dependency")


@router.get(
    "/agents/{agent_id}/dependencies",
    summary="List direct dependencies for an agent",
    operation_id="list_agent_dependencies_v2",
)
async def list_agent_dependencies(
    agent_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List all dependencies where agent_id is the source (i.e., what it depends on)."""
    rows = await execute(
        """
        SELECT * FROM agent_dependencies
        WHERE user_id::text = :user_id AND source_agent_id::text = :agent_id
        ORDER BY created_at DESC
        """,
        {"user_id": user_id, "agent_id": agent_id},
    )

    return [
        DependencyRecord(
            id=str(r["id"]),
            agent_id=r["source_agent_id"],
            depends_on_agent_id=r["target_agent_id"],
            dependency_type=r["dependency_type"],
            description=r.get("description"),
            is_active=r.get("is_active", True),
            created_at=str(r["created_at"]),
        )
        for r in rows
    ]


@router.delete(
    "/agents/{agent_id}/dependencies/{dep_id}",
    summary="Remove a dependency",
    operation_id="remove_agent_dependency_v2",
)
async def remove_dependency(
    agent_id: str,
    dep_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Remove a dependency by ID, scoped to the authenticated user."""
    try:
        row = await execute_one(
            """
            DELETE FROM agent_dependencies
            WHERE id = :dep_id AND user_id::text = :user_id AND source_agent_id::text = :agent_id
            RETURNING id
            """,
            {"dep_id": dep_id, "user_id": user_id, "agent_id": agent_id},
            commit=True,
        )
        if not row:
            raise HTTPException(status_code=404, detail="Dependency not found")
        return {"deleted": True, "id": str(row["id"])}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error removing dependency {dep_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to remove dependency")


@router.get(
    "/agents/dependency-graph",
    summary="Full dependency graph for all user agents",
    operation_id="get_full_dependency_graph",
    response_model=DependencyGraphResponse,
)
async def get_full_dependency_graph(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Return the full dependency graph: nodes (agents) and edges (dependencies).
    Only includes agents that participate in at least one dependency.
    """
    try:
        # Get all agents
        agents = await execute(
            "SELECT agent_id, name FROM agents WHERE account_id::text = :user_id",
            {"user_id": user_id},
        )
        agent_name_map = {a["agent_id"]: a["name"] or a["agent_id"][:8] for a in agents}

        # Get all dependencies
        deps = await execute(
            "SELECT * FROM agent_dependencies WHERE user_id::text = :user_id",
            {"user_id": user_id},
        )

        # Find agents that appear in dependencies
        participating_ids: Set[str] = set()
        for d in deps:
            participating_ids.add(d["source_agent_id"])
            participating_ids.add(d["target_agent_id"])

        # Also include agents with no deps so graph shows orphans
        for a in agents:
            participating_ids.add(a["agent_id"])

        nodes = [
            GraphNode(
                id=aid,
                name=agent_name_map.get(aid, aid[:8]),
            )
            for aid in participating_ids
            if aid in agent_name_map
        ]

        edges = [
            GraphEdge(
                source=d["source_agent_id"],
                target=d["target_agent_id"],
                type=d["dependency_type"],
            )
            for d in deps
        ]

        return DependencyGraphResponse(nodes=nodes, edges=edges)
    except Exception as e:
        logger.error(f"Error building dependency graph: {e}")
        raise HTTPException(status_code=500, detail="Failed to build dependency graph")


@router.get(
    "/agents/{agent_id}/impact",
    summary="Impact analysis for an agent",
    operation_id="get_agent_impact_analysis",
)
async def get_agent_impact(
    agent_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Impact analysis: which agents are affected if this agent changes.
    Walks reverse dependencies (agents that depend on agent_id) recursively.
    """
    try:
        # Get all agents for name lookup
        agents = await execute(
            "SELECT agent_id, name FROM agents WHERE account_id::text = :user_id",
            {"user_id": user_id},
        )
        agent_name_map = {a["agent_id"]: a["name"] or a["agent_id"][:8] for a in agents}

        # Get all dependencies for this user
        deps = await execute(
            "SELECT source_agent_id, target_agent_id, dependency_type FROM agent_dependencies WHERE user_id::text = :user_id",
            {"user_id": user_id},
        )

        # Build reverse adjacency: target -> [sources that depend on it]
        reverse_adj: Dict[str, List[Dict[str, str]]] = defaultdict(list)
        for d in deps:
            reverse_adj[d["target_agent_id"]].append({
                "source": d["source_agent_id"],
                "type": d["dependency_type"],
            })

        # BFS from agent_id through reverse edges
        visited: Set[str] = set()
        affected: List[ImpactNode] = []
        queue: deque = deque()

        # Start with all agents that directly depend on agent_id
        for dep in reverse_adj.get(agent_id, []):
            src = dep["source"]
            if src not in visited:
                visited.add(src)
                queue.append((src, dep["type"], 1))

        while queue:
            current, dep_type, depth = queue.popleft()
            affected.append(ImpactNode(
                agent_id=current,
                name=agent_name_map.get(current, current[:8]),
                depth=depth,
                dependency_type=dep_type,
            ))

            # Follow reverse edges from current
            for dep in reverse_adj.get(current, []):
                src = dep["source"]
                if src not in visited:
                    visited.add(src)
                    queue.append((src, dep["type"], depth + 1))

        return ImpactAnalysisResponse(
            agent_id=agent_id,
            affected_agents=affected,
            total_affected=len(affected),
        )
    except Exception as e:
        logger.error(f"Error in impact analysis for agent {agent_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to run impact analysis")


@router.get(
    "/agents/dependency-stats",
    summary="Dependency statistics",
    operation_id="get_dependency_stats",
    response_model=DependencyStatsResponse,
)
async def get_dependency_stats(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Stats: most depended-on agents (top 5), orphan agents (no deps in or out),
    and circular dependency detection.
    """
    try:
        # Get all agents
        agents = await execute(
            "SELECT agent_id, name FROM agents WHERE account_id::text = :user_id",
            {"user_id": user_id},
        )
        agent_name_map = {a["agent_id"]: a["name"] or a["agent_id"][:8] for a in agents}
        all_agent_ids = set(agent_name_map.keys())

        # Get all dependencies
        deps = await execute(
            "SELECT source_agent_id, target_agent_id, dependency_type FROM agent_dependencies WHERE user_id::text = :user_id",
            {"user_id": user_id},
        )

        # Most depended-on (most incoming edges)
        incoming_count: Dict[str, int] = defaultdict(int)
        agents_with_outgoing: Set[str] = set()
        agents_with_incoming: Set[str] = set()
        adj: Dict[str, List[str]] = defaultdict(list)

        for d in deps:
            src = d["source_agent_id"]
            tgt = d["target_agent_id"]
            incoming_count[tgt] += 1
            agents_with_outgoing.add(src)
            agents_with_incoming.add(tgt)
            adj[src].append(tgt)

        # Top 5 most depended on
        sorted_incoming = sorted(incoming_count.items(), key=lambda x: x[1], reverse=True)[:5]
        most_depended_on = [
            TopDependedAgent(
                agent_id=aid,
                name=agent_name_map.get(aid, aid[:8]),
                dependent_count=cnt,
            )
            for aid, cnt in sorted_incoming
        ]

        # Orphan agents: not in any dependency (neither source nor target)
        agents_in_deps = agents_with_outgoing | agents_with_incoming
        orphan_ids = all_agent_ids - agents_in_deps
        orphan_agents = [
            OrphanAgent(
                agent_id=aid,
                name=agent_name_map.get(aid, aid[:8]),
            )
            for aid in sorted(orphan_ids)
        ]

        # Circular dependency detection
        cycles = _detect_cycles(adj)
        circular_dependencies = [
            CircularChain(cycle=cycle)
            for cycle in cycles[:10]  # Limit to 10 cycles
        ]

        return DependencyStatsResponse(
            most_depended_on=most_depended_on,
            orphan_agents=orphan_agents,
            circular_dependencies=circular_dependencies,
        )
    except Exception as e:
        logger.error(f"Error computing dependency stats: {e}")
        raise HTTPException(status_code=500, detail="Failed to compute dependency stats")
