from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate, serialize_rows, serialize_row
from core.utils.logger import logger

router = APIRouter(tags=["knowledge-graph"])


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class CreateNodeRequest(BaseModel):
    node_type: str
    node_id: str
    label: str
    metadata: Optional[dict] = None


class CreateEdgeRequest(BaseModel):
    source_node_id: str
    target_node_id: str
    edge_type: str
    weight: Optional[float] = 1.0


# ---------------------------------------------------------------------------
# Node endpoints
# ---------------------------------------------------------------------------

@router.post("/knowledge-graph/nodes", summary="Upsert a knowledge graph node")
async def upsert_node(
    body: CreateNodeRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    valid_types = ('agent', 'thread', 'tool', 'knowledge_base', 'prompt', 'workflow', 'tag', 'data_source')
    if body.node_type not in valid_types:
        raise HTTPException(status_code=400, detail=f"Invalid node_type. Must be one of: {', '.join(valid_types)}")

    if not body.label or not body.label.strip():
        raise HTTPException(status_code=400, detail="Label is required")

    try:
        row = await execute_one(
            """
            INSERT INTO knowledge_graph_nodes (user_id, node_type, node_id, label, metadata)
            VALUES (:user_id, :node_type, :node_id, :label, :metadata::jsonb)
            ON CONFLICT (user_id, node_type, node_id) DO UPDATE SET
                label = EXCLUDED.label,
                metadata = EXCLUDED.metadata
            RETURNING *
            """,
            {
                "user_id": user_id,
                "node_type": body.node_type,
                "node_id": body.node_id,
                "label": body.label.strip(),
                "metadata": body.metadata or {},
            },
            commit=True,
        )
        return serialize_row(dict(row)) if row else {"status": "ok"}
    except Exception as e:
        logger.error(f"Failed to upsert knowledge graph node: {e}")
        raise HTTPException(status_code=500, detail="Failed to upsert node")


@router.delete("/knowledge-graph/nodes/{node_id}", summary="Delete a knowledge graph node (cascades edges)")
async def delete_node(
    node_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    existing = await execute_one(
        "SELECT id FROM knowledge_graph_nodes WHERE id = :id AND user_id::text = :user_id",
        {"id": node_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Node not found")

    await execute_mutate(
        "DELETE FROM knowledge_graph_nodes WHERE id = :id AND user_id::text = :user_id",
        {"id": node_id, "user_id": user_id},
    )
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Edge endpoints
# ---------------------------------------------------------------------------

@router.post("/knowledge-graph/edges", summary="Add an edge between two nodes")
async def add_edge(
    body: CreateEdgeRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    valid_types = ('uses', 'produces', 'depends_on', 'related_to', 'contains', 'triggers', 'references')
    if body.edge_type not in valid_types:
        raise HTTPException(status_code=400, detail=f"Invalid edge_type. Must be one of: {', '.join(valid_types)}")

    # Verify both nodes belong to the user
    source = await execute_one(
        "SELECT id FROM knowledge_graph_nodes WHERE id = :id AND user_id::text = :user_id",
        {"id": body.source_node_id, "user_id": user_id},
    )
    if not source:
        raise HTTPException(status_code=404, detail="Source node not found")

    target = await execute_one(
        "SELECT id FROM knowledge_graph_nodes WHERE id = :id AND user_id::text = :user_id",
        {"id": body.target_node_id, "user_id": user_id},
    )
    if not target:
        raise HTTPException(status_code=404, detail="Target node not found")

    try:
        row = await execute_one(
            """
            INSERT INTO knowledge_graph_edges (user_id, source_node_id, target_node_id, edge_type, weight)
            VALUES (:user_id, :source_node_id, :target_node_id, :edge_type, :weight)
            ON CONFLICT (source_node_id, target_node_id, edge_type) DO UPDATE SET
                weight = EXCLUDED.weight
            RETURNING *
            """,
            {
                "user_id": user_id,
                "source_node_id": body.source_node_id,
                "target_node_id": body.target_node_id,
                "edge_type": body.edge_type,
                "weight": body.weight or 1.0,
            },
            commit=True,
        )
        return serialize_row(dict(row)) if row else {"status": "ok"}
    except Exception as e:
        logger.error(f"Failed to add knowledge graph edge: {e}")
        raise HTTPException(status_code=500, detail="Failed to add edge")


@router.delete("/knowledge-graph/edges/{edge_id}", summary="Delete an edge")
async def delete_edge(
    edge_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    existing = await execute_one(
        "SELECT id FROM knowledge_graph_edges WHERE id = :id AND user_id::text = :user_id",
        {"id": edge_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Edge not found")

    await execute_mutate(
        "DELETE FROM knowledge_graph_edges WHERE id = :id AND user_id::text = :user_id",
        {"id": edge_id, "user_id": user_id},
    )
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Query endpoints
# ---------------------------------------------------------------------------

@router.get("/knowledge-graph", summary="Get the full knowledge graph")
async def get_graph(
    node_type: Optional[str] = Query(None, description="Filter by node type"),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    if node_type:
        valid_types = ('agent', 'thread', 'tool', 'knowledge_base', 'prompt', 'workflow', 'tag', 'data_source')
        if node_type not in valid_types:
            raise HTTPException(status_code=400, detail=f"Invalid node_type filter")

        nodes = await execute(
            "SELECT * FROM knowledge_graph_nodes WHERE user_id::text = :user_id AND node_type = :node_type ORDER BY created_at DESC",
            {"user_id": user_id, "node_type": node_type},
        )
    else:
        nodes = await execute(
            "SELECT * FROM knowledge_graph_nodes WHERE user_id::text = :user_id ORDER BY created_at DESC",
            {"user_id": user_id},
        )

    node_ids = [str(n["id"]) for n in nodes]

    if node_ids:
        # Fetch edges where both source and target are in the visible node set
        edges = await execute(
            """
            SELECT * FROM knowledge_graph_edges
            WHERE user_id::text = :user_id
              AND source_node_id IN (SELECT id FROM knowledge_graph_nodes WHERE user_id::text = :user_id)
              AND target_node_id IN (SELECT id FROM knowledge_graph_nodes WHERE user_id::text = :user_id)
            ORDER BY created_at DESC
            """,
            {"user_id": user_id},
        )
    else:
        edges = []

    return {
        "nodes": serialize_rows([dict(n) for n in nodes]),
        "edges": serialize_rows([dict(e) for e in edges]),
    }


@router.get("/knowledge-graph/node/{node_id}/connections", summary="Get a node and its direct connections")
async def get_node_connections(
    node_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    node = await execute_one(
        "SELECT * FROM knowledge_graph_nodes WHERE id = :id AND user_id::text = :user_id",
        {"id": node_id, "user_id": user_id},
    )
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    edges = await execute(
        """
        SELECT * FROM knowledge_graph_edges
        WHERE user_id::text = :user_id
          AND (source_node_id::text = :node_id OR target_node_id::text = :node_id)
        ORDER BY created_at DESC
        """,
        {"user_id": user_id, "node_id": node_id},
    )

    # Collect connected node IDs
    connected_ids = set()
    for e in edges:
        connected_ids.add(str(e["source_node_id"]))
        connected_ids.add(str(e["target_node_id"]))
    connected_ids.discard(node_id)

    connected_nodes = []
    if connected_ids:
        for cid in connected_ids:
            cn = await execute_one(
                "SELECT * FROM knowledge_graph_nodes WHERE id = :id AND user_id::text = :user_id",
                {"id": cid, "user_id": user_id},
            )
            if cn:
                connected_nodes.append(dict(cn))

    return {
        "node": serialize_row(dict(node)),
        "edges": serialize_rows([dict(e) for e in edges]),
        "connected_nodes": serialize_rows(connected_nodes),
    }


@router.get("/knowledge-graph/stats", summary="Get knowledge graph statistics")
async def get_stats(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    node_counts = await execute(
        """
        SELECT node_type, COUNT(*) as count
        FROM knowledge_graph_nodes
        WHERE user_id::text = :user_id
        GROUP BY node_type
        ORDER BY count DESC
        """,
        {"user_id": user_id},
    )

    edge_counts = await execute(
        """
        SELECT edge_type, COUNT(*) as count
        FROM knowledge_graph_edges
        WHERE user_id::text = :user_id
        GROUP BY edge_type
        ORDER BY count DESC
        """,
        {"user_id": user_id},
    )

    total_nodes = sum(r["count"] for r in node_counts)
    total_edges = sum(r["count"] for r in edge_counts)

    return {
        "total_nodes": total_nodes,
        "total_edges": total_edges,
        "nodes_by_type": {r["node_type"]: int(r["count"]) for r in node_counts},
        "edges_by_type": {r["edge_type"]: int(r["count"]) for r in edge_counts},
    }


# ---------------------------------------------------------------------------
# Auto-discover endpoint
# ---------------------------------------------------------------------------

@router.post("/knowledge-graph/auto-discover", summary="Auto-discover and populate nodes from agents")
async def auto_discover(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    discovered = 0

    try:
        # Discover agents
        agents = await execute(
            "SELECT agent_id, name FROM agents WHERE account_id::text = :user_id",
            {"user_id": user_id},
        )
        for agent in agents:
            await execute_one(
                """
                INSERT INTO knowledge_graph_nodes (user_id, node_type, node_id, label, metadata)
                VALUES (:user_id, 'agent', :node_id, :label, '{}'::jsonb)
                ON CONFLICT (user_id, node_type, node_id) DO UPDATE SET label = EXCLUDED.label
                RETURNING id
                """,
                {
                    "user_id": user_id,
                    "node_id": str(agent["agent_id"]),
                    "label": agent["name"] or f"Agent {str(agent['agent_id'])[:8]}",
                },
                commit=True,
            )
            discovered += 1

        # Discover threads
        threads = await execute(
            """
            SELECT thread_id, COALESCE(
                (metadata->>'title'),
                'Thread ' || LEFT(thread_id::text, 8)
            ) as label
            FROM threads
            WHERE account_id::text = :user_id
            ORDER BY created_at DESC
            LIMIT 100
            """,
            {"user_id": user_id},
        )
        for thread in threads:
            await execute_one(
                """
                INSERT INTO knowledge_graph_nodes (user_id, node_type, node_id, label, metadata)
                VALUES (:user_id, 'thread', :node_id, :label, '{}'::jsonb)
                ON CONFLICT (user_id, node_type, node_id) DO UPDATE SET label = EXCLUDED.label
                RETURNING id
                """,
                {
                    "user_id": user_id,
                    "node_id": str(thread["thread_id"]),
                    "label": thread["label"],
                },
                commit=True,
            )
            discovered += 1

        # Discover agent->thread edges from agent_runs
        agent_thread_links = await execute(
            """
            SELECT DISTINCT ar.agent_id, ar.thread_id
            FROM agent_runs ar
            JOIN agents a ON a.agent_id::text = ar.agent_id::text AND a.account_id::text = :user_id
            WHERE ar.thread_id IS NOT NULL
            LIMIT 200
            """,
            {"user_id": user_id},
        )
        edges_created = 0
        for link in agent_thread_links:
            source = await execute_one(
                "SELECT id FROM knowledge_graph_nodes WHERE user_id::text = :user_id AND node_type = 'agent' AND node_id::text = :node_id",
                {"user_id": user_id, "node_id": str(link["agent_id"])},
            )
            target = await execute_one(
                "SELECT id FROM knowledge_graph_nodes WHERE user_id::text = :user_id AND node_type = 'thread' AND node_id::text = :node_id",
                {"user_id": user_id, "node_id": str(link["thread_id"])},
            )
            if source and target:
                await execute_one(
                    """
                    INSERT INTO knowledge_graph_edges (user_id, source_node_id, target_node_id, edge_type, weight)
                    VALUES (:user_id, :source_id, :target_id, 'produces', 1.0)
                    ON CONFLICT (source_node_id, target_node_id, edge_type) DO NOTHING
                    RETURNING id
                    """,
                    {
                        "user_id": user_id,
                        "source_id": str(source["id"]),
                        "target_id": str(target["id"]),
                    },
                    commit=True,
                )
                edges_created += 1

    except Exception as e:
        logger.error(f"Auto-discover error: {e}")
        raise HTTPException(status_code=500, detail=f"Auto-discover failed: {str(e)}")

    return {
        "status": "ok",
        "nodes_discovered": discovered,
        "edges_created": edges_created,
    }
