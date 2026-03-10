from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Optional, List
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate
from core.utils.logger import logger

router = APIRouter(prefix="/kb", tags=["kb-relationships"])


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class RelationshipCreate(BaseModel):
    source_entry_id: str
    target_entry_id: str
    relationship_type: str = Field(
        default="related",
        pattern=r"^(related|depends_on|references|contradicts|extends)$",
    )
    strength: float = Field(default=0.5, ge=0.0, le=1.0)


class RelationshipOut(BaseModel):
    id: str
    user_id: str
    source_entry_id: str
    target_entry_id: str
    relationship_type: str
    strength: float
    auto_detected: bool
    created_at: str


class GraphNode(BaseModel):
    id: str
    title: str
    content_type: Optional[str] = None
    file_type: Optional[str] = None
    created_at: Optional[str] = None


class GraphEdge(BaseModel):
    id: str
    source: str
    target: str
    relationship_type: str
    strength: float
    auto_detected: bool


class GraphResponse(BaseModel):
    nodes: List[GraphNode]
    edges: List[GraphEdge]


class SuggestionOut(BaseModel):
    source_id: str
    target_id: str
    target_title: str
    reason: str
    confidence: float


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/relationships", summary="Create KB Relationship", operation_id="create_kb_relationship")
async def create_kb_relationship(
    body: RelationshipCreate,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Create a relationship between two knowledge base entries."""
    if body.source_entry_id == body.target_entry_id:
        raise HTTPException(status_code=400, detail="Cannot create a relationship between an entry and itself")

    try:
        row = await execute_one(
            """
            INSERT INTO kb_entry_relationships (user_id, source_entry_id, target_entry_id, relationship_type, strength, auto_detected)
            VALUES (:user_id, :source_entry_id, :target_entry_id, :relationship_type, :strength, false)
            RETURNING id, user_id, source_entry_id, target_entry_id, relationship_type,
                      strength, auto_detected, created_at::text
            """,
            {
                "user_id": user_id,
                "source_entry_id": body.source_entry_id,
                "target_entry_id": body.target_entry_id,
                "relationship_type": body.relationship_type,
                "strength": body.strength,
            },
        )
        return dict(row)
    except Exception as e:
        error_str = str(e)
        if "unique" in error_str.lower() or "duplicate" in error_str.lower():
            raise HTTPException(status_code=409, detail="Relationship already exists between these entries")
        raise HTTPException(status_code=500, detail=f"Failed to create relationship: {error_str}")


@router.get("/relationships", summary="List KB Relationships", operation_id="list_kb_relationships")
async def list_kb_relationships(
    entry_id: Optional[str] = Query(None, description="Filter by specific entry (as source or target)"),
    relationship_type: Optional[str] = Query(None, description="Filter by relationship type"),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List relationships, optionally filtered by entry or type."""
    conditions = ["user_id = :user_id"]
    params: dict = {"user_id": user_id}

    if entry_id:
        conditions.append("(source_entry_id = :entry_id OR target_entry_id = :entry_id)")
        params["entry_id"] = entry_id

    if relationship_type:
        conditions.append("relationship_type = :relationship_type")
        params["relationship_type"] = relationship_type

    where_clause = " AND ".join(conditions)
    query = f"""
        SELECT id, user_id, source_entry_id, target_entry_id, relationship_type,
               strength, auto_detected, created_at::text
        FROM kb_entry_relationships
        WHERE {where_clause}
        ORDER BY created_at DESC
    """
    rows = await execute(query, params)
    return [dict(r) for r in rows]


@router.delete("/relationships/{relationship_id}", summary="Delete KB Relationship", operation_id="delete_kb_relationship")
async def delete_kb_relationship(
    relationship_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Delete a relationship."""
    result = await execute_mutate(
        "DELETE FROM kb_entry_relationships WHERE id = :relationship_id AND user_id = :user_id",
        {"relationship_id": relationship_id, "user_id": user_id},
    )
    return {"status": "deleted", "id": relationship_id}


@router.get("/graph", summary="Get KB Graph", operation_id="get_kb_graph")
async def get_kb_graph(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get full graph: nodes from KB entries, edges from relationships."""
    # Get all KB entries for this user as nodes
    node_rows = await execute(
        """
        SELECT id, filename AS title, file_type AS content_type, file_type, created_at::text
        FROM knowledge_base_entries
        WHERE account_id = :user_id AND is_active = true
        ORDER BY filename ASC
        """,
        {"user_id": user_id},
    )
    nodes = [
        {
            "id": str(r["id"]),
            "title": r["title"] or "Untitled",
            "content_type": r.get("content_type"),
            "file_type": r.get("file_type"),
            "created_at": r.get("created_at"),
        }
        for r in node_rows
    ]

    # Get all relationships for this user as edges
    edge_rows = await execute(
        """
        SELECT id, source_entry_id AS source, target_entry_id AS target,
               relationship_type, strength, auto_detected
        FROM kb_entry_relationships
        WHERE user_id = :user_id
        """,
        {"user_id": user_id},
    )
    edges = [
        {
            "id": str(r["id"]),
            "source": str(r["source"]),
            "target": str(r["target"]),
            "relationship_type": r["relationship_type"],
            "strength": float(r["strength"]),
            "auto_detected": bool(r["auto_detected"]),
        }
        for r in edge_rows
    ]

    return {"nodes": nodes, "edges": edges}


@router.get("/relationships/suggestions", summary="Suggest KB Relationships", operation_id="suggest_kb_relationships")
async def suggest_kb_relationships(
    entry_id: str = Query(..., description="Entry ID to suggest relationships for"),
    limit: int = Query(5, ge=1, le=20),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Suggest relationships based on filename/title similarity (simple word overlap)."""
    # Get the source entry
    source = await execute_one(
        "SELECT id, filename FROM knowledge_base_entries WHERE id = :entry_id AND account_id = :user_id AND is_active = true",
        {"entry_id": entry_id, "user_id": user_id},
    )
    if not source:
        raise HTTPException(status_code=404, detail="Entry not found")

    source_title = (source["filename"] or "").lower()

    # Get all other entries (excluding already-related ones)
    candidates = await execute(
        """
        SELECT e.id, e.filename
        FROM knowledge_base_entries e
        WHERE e.account_id = :user_id
          AND e.is_active = true
          AND e.id != :entry_id
          AND e.id NOT IN (
            SELECT target_entry_id FROM kb_entry_relationships
            WHERE source_entry_id = :entry_id AND user_id = :user_id
          )
          AND e.id NOT IN (
            SELECT source_entry_id FROM kb_entry_relationships
            WHERE target_entry_id = :entry_id AND user_id = :user_id
          )
        ORDER BY e.filename ASC
        """,
        {"user_id": user_id, "entry_id": entry_id},
    )

    # Simple word-overlap similarity
    source_words = set(source_title.replace(".", " ").replace("-", " ").replace("_", " ").split())

    scored = []
    for c in candidates:
        candidate_title = (c["filename"] or "").lower()
        candidate_words = set(candidate_title.replace(".", " ").replace("-", " ").replace("_", " ").split())
        if not source_words or not candidate_words:
            continue
        overlap = source_words & candidate_words
        # Remove common stop words from overlap count
        stop_words = {"the", "a", "an", "and", "or", "of", "to", "in", "for", "is", "it", "on"}
        meaningful_overlap = overlap - stop_words
        if not meaningful_overlap:
            continue
        # Jaccard-like score
        union = source_words | candidate_words
        confidence = len(meaningful_overlap) / max(len(union), 1)
        if confidence > 0.05:
            scored.append({
                "source_id": str(source["id"]),
                "target_id": str(c["id"]),
                "target_title": c["filename"],
                "reason": f"Shared terms: {', '.join(sorted(meaningful_overlap)[:5])}",
                "confidence": round(confidence, 3),
            })

    scored.sort(key=lambda x: x["confidence"], reverse=True)
    return scored[:limit]
