from fastapi import APIRouter, Depends, Query, HTTPException
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one

router = APIRouter(tags=["thread-search"])


@router.get("/threads/{thread_id}/search", summary="Search messages in a thread")
async def search_thread_messages(
    thread_id: str,
    q: str = Query(..., min_length=1),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    # Verify thread ownership
    thread = await execute_one(
        "SELECT thread_id FROM threads WHERE thread_id = :thread_id AND account_id = :user_id",
        {"thread_id": thread_id, "user_id": user_id},
    )
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")

    rows = await execute(
        """
        SELECT id, role, content, created_at
        FROM messages
        WHERE thread_id = :thread_id
          AND content::text ILIKE :search
        ORDER BY created_at ASC
        """,
        {"thread_id": thread_id, "search": f"%{q}%"},
    )

    results = []
    for row in rows:
        # Extract text from content JSON
        content = row.get("content")
        text = ""
        if isinstance(content, list):
            for block in content:
                if isinstance(block, dict) and block.get("type") == "text":
                    text += block.get("text", "")
        elif isinstance(content, str):
            text = content

        if q.lower() in text.lower():
            results.append({
                "message_id": str(row["id"]),
                "role": row["role"],
                "text": text[:200],
                "created_at": row["created_at"].isoformat() if row.get("created_at") else None,
            })

    return {"query": q, "count": len(results), "results": results}
