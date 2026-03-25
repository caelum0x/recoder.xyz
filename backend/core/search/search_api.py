"""
Global search API.

Searches across agents, threads, workflows, and knowledge base entries
for the authenticated user.
"""

from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute
from core.utils.logger import logger

router = APIRouter(prefix="/search", tags=["search"])


class SearchResult(BaseModel):
    id: str
    type: str  # "agent" | "thread" | "workflow" | "knowledge"
    title: str
    description: Optional[str] = None
    url: str  # relative URL to navigate to
    score: float = 0.0
    metadata: Optional[dict] = None


class SearchResponse(BaseModel):
    results: list[SearchResult]
    total: int
    query: str


@router.get("", response_model=SearchResponse, summary="Global search across all resources")
async def global_search(
    q: str = Query(..., min_length=1, max_length=200),
    types: Optional[str] = Query(default=None, description="Comma-separated: agents,threads,workflows,knowledge"),
    limit: int = Query(default=20, le=50),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Search across agents, threads, workflows, and knowledge base entries."""
    type_list = types.split(",") if types else ["agents", "threads", "workflows", "knowledge"]
    results: list[SearchResult] = []
    search_term = f"%{q.lower()}%"

    try:
        if "agents" in type_list:
            agents = await execute(
                """SELECT agent_id, name, description FROM agents
                   WHERE account_id::text = :uid AND (lower(name) LIKE :q OR lower(COALESCE(description, '')) LIKE :q)
                   LIMIT 10""",
                {"uid": user_id, "q": search_term},
            )
            for a in agents or []:
                results.append(SearchResult(
                    id=str(a["agent_id"]), type="agent", title=a["name"],
                    description=a.get("description"), url=f"/agents/config/{a['agent_id']}",
                    score=1.0 if q.lower() in (a["name"] or "").lower() else 0.5,
                ))
    except Exception as e:
        logger.warning(f"Search agents failed: {e}")

    try:
        if "threads" in type_list:
            # threads table has no title; join with projects to get the project name
            threads = await execute(
                """SELECT t.thread_id, t.project_id, p.name AS project_name
                   FROM threads t
                   JOIN projects p ON t.project_id::text = p.project_id::text
                   WHERE t.account_id::text = :uid AND lower(COALESCE(p.name, '')) LIKE :q
                   LIMIT 10""",
                {"uid": user_id, "q": search_term},
            )
            for t in threads or []:
                pid = str(t.get("project_id", ""))
                title = t.get("project_name") or "Untitled Thread"
                results.append(SearchResult(
                    id=str(t["thread_id"]), type="thread", title=title,
                    url=f"/projects/{pid}/thread/{t['thread_id']}" if pid else f"/thread/{t['thread_id']}",
                    score=0.8 if q.lower() in title.lower() else 0.4,
                ))
    except Exception as e:
        logger.warning(f"Search threads failed: {e}")

    try:
        if "workflows" in type_list:
            workflows = await execute(
                """SELECT id, name, description FROM workflows
                   WHERE account_id::text = :uid AND (lower(name) LIKE :q OR lower(COALESCE(description, '')) LIKE :q)
                   LIMIT 10""",
                {"uid": user_id, "q": search_term},
            )
            for w in workflows or []:
                results.append(SearchResult(
                    id=str(w["id"]), type="workflow", title=w["name"],
                    description=w.get("description"), url=f"/workflows/{w['id']}",
                    score=0.7,
                ))
    except Exception as e:
        logger.warning(f"Search workflows failed: {e}")

    try:
        if "knowledge" in type_list:
            # knowledge_base_entries uses entry_id, filename, and account_id
            kb = await execute(
                """SELECT entry_id, filename FROM knowledge_base_entries
                   WHERE account_id::text = :uid AND lower(COALESCE(filename, '')) LIKE :q
                   LIMIT 10""",
                {"uid": user_id, "q": search_term},
            )
            for k in kb or []:
                results.append(SearchResult(
                    id=str(k["entry_id"]), type="knowledge",
                    title=k.get("filename") or "Knowledge Entry",
                    url="/knowledge",
                    score=0.6,
                ))
    except Exception as e:
        logger.warning(f"Search knowledge failed: {e}")

    # Sort by score descending
    results.sort(key=lambda r: r.score, reverse=True)
    results = results[:limit]

    return SearchResponse(results=results, total=len(results), query=q)
